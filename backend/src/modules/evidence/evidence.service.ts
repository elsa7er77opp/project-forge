import { prisma } from '../../lib/prisma';
import { HttpError } from '../../utils/http-error';
import { publicUser } from '../../utils/serializers';
import { assertProjectAccess, assertWritableProject } from '../../utils/project-access';
import type { AuthUser } from '../../middleware/auth';
import { logActivity } from '../activity/activity.service';
import {
  buildStorageKey,
  isAllowedMime,
  openStream,
  putStream,
  removeFile,
  MAX_FILE_BYTES,
} from '../../utils/storage';
import type { Readable } from 'node:stream';
import type {
  CreateEvidenceInput,
  ListEvidenceQuery,
  UpdateEvidenceInput,
} from './evidence.schemas';

export function serializeEvidence(e: any) {
  return {
    id: e.id,
    projectId: e.projectId,
    title: e.title,
    type: e.type,
    source: e.source ?? 'LINK',
    url: e.url,
    description: e.description,
    // File metadata is exposed; the storage key is not. The key is an internal
    // address, and a client that never sees it cannot attempt to fetch by it.
    originalName: e.originalName ?? null,
    mimeType: e.mimeType ?? null,
    sizeBytes: e.sizeBytes ?? null,
    uploader: e.uploader ? publicUser(e.uploader) : null,
    createdAt: e.createdAt,
  };
}

/** Maps a content type onto the existing evidence type vocabulary. */
function typeForMime(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType === 'text/csv' || mimeType.includes('spreadsheet') || mimeType.includes('ms-excel'))
    return 'TESTING';
  return 'DOCUMENT';
}

async function findEvidence(user: AuthUser, id: string) {
  const evidence = await prisma.evidence.findFirst({
    where: { id, project: { workspaceId: user.workspaceId } },
    include: { uploader: true, project: { select: { id: true, name: true, archived: true } } },
  });
  if (!evidence) {
    throw new HttpError(404, 'Evidence not found');
  }
  await assertProjectAccess(user, evidence.projectId);
  return evidence;
}

export async function listEvidence(user: AuthUser, projectId: string, query: ListEvidenceQuery) {
  await assertProjectAccess(user, projectId);
  const where: any = { projectId };
  if (query.type) where.type = query.type;

  const evidence = await prisma.evidence.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { uploader: true },
  });
  return evidence.map(serializeEvidence);
}

export async function createEvidence(
  user: AuthUser,
  projectId: string,
  input: CreateEvidenceInput,
) {
  const project = await assertWritableProject(user, projectId);

  const evidence = await prisma.evidence.create({
    data: {
      projectId,
      title: input.title,
      type: input.type ?? 'LINK',
      url: input.url,
      description: input.description ?? '',
      uploaderId: user.id,
    },
    include: { uploader: true },
  });

  await logActivity({
    workspaceId: user.workspaceId,
    projectId,
    userId: user.id,
    action: 'EVIDENCE_ADDED',
    entityType: 'Evidence',
    entityId: evidence.id,
    meta: { title: evidence.title, project: project.name },
  });

  return serializeEvidence(evidence);
}

export async function updateEvidence(user: AuthUser, id: string, input: UpdateEvidenceInput) {
  const existing = await findEvidence(user, id);
  if (existing.project.archived) {
    throw new HttpError(409, 'Project is archived and cannot be modified');
  }
  if (user.role !== 'ADMIN' && existing.uploaderId !== user.id) {
    throw new HttpError(403, 'Only the uploader or an administrator can edit this evidence');
  }

  const evidence = await prisma.evidence.update({
    where: { id },
    data: input,
    include: { uploader: true },
  });
  return serializeEvidence(evidence);
}

export async function deleteEvidence(user: AuthUser, id: string) {
  const existing = await findEvidence(user, id);
  if (user.role !== 'ADMIN') {
    throw new HttpError(403, 'Administrator privileges required');
  }
  await prisma.evidence.delete({ where: { id } });

  // The row goes first. If the file removal then fails, the result is an
  // unreferenced file rather than a record pointing at nothing — the less
  // harmful of the two failures, and the only one that is recoverable.
  if (existing.source === 'FILE' && existing.storageKey) {
    await removeFile(existing.storageKey);
  }

  await logActivity({
    workspaceId: user.workspaceId,
    projectId: existing.projectId,
    userId: user.id,
    action: 'EVIDENCE_DELETED',
    entityType: 'Evidence',
    entityId: id,
    meta: { title: existing.title },
  });
}

/* ------------------------------------------------------------------ *
 * Uploaded files
 * ------------------------------------------------------------------ */

interface UploadInput {
  originalName: string;
  mimeType: string;
  title?: string;
  description?: string;
  stream: Readable;
}

/**
 * Stores an uploaded file and records it against a project.
 *
 * The order matters. Access is checked before a byte is written, the content
 * type is checked before the file is accepted, and the database row is only
 * created once the write has succeeded. If the write fails there is no row
 * pointing at a file that does not exist; if the row fails to insert, the
 * orphaned file is removed.
 */
export async function uploadEvidenceFile(
  user: AuthUser,
  projectId: string,
  input: UploadInput,
) {
  // 1. Authorisation first. An unauthorised caller must not be able to write
  //    anything to disk, even temporarily.
  const project = await assertWritableProject(user, projectId);

  // 2. Content type, against an allowlist.
  if (!isAllowedMime(input.mimeType)) {
    throw new HttpError(415, `Files of type ${input.mimeType} are not accepted`, {
      code: 'UNSUPPORTED_FILE_TYPE',
    });
  }

  // 3. The key is built entirely from server-side values.
  const storageKey = buildStorageKey(user.workspaceId, projectId, input.mimeType);

  // 4. Write, enforcing the size cap as the bytes arrive.
  const sizeBytes = await putStream(storageKey, input.stream);
  if (sizeBytes === 0) {
    await removeFile(storageKey);
    throw new HttpError(400, 'The uploaded file is empty');
  }

  // 5. Record it. Clean up the file if this fails, so no file is left with
  //    nothing referring to it — it would be invisible and unreclaimable.
  try {
    const evidence = await prisma.evidence.create({
      data: {
        projectId,
        title: (input.title ?? '').trim() || input.originalName,
        type: typeForMime(input.mimeType),
        source: 'FILE',
        url: '',
        description: (input.description ?? '').trim(),
        storageKey,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes,
        uploaderId: user.id,
      },
      include: { uploader: true },
    });

    await logActivity({
      workspaceId: user.workspaceId,
      projectId,
      userId: user.id,
      action: 'EVIDENCE_UPLOADED',
      entityType: 'Evidence',
      entityId: evidence.id,
      meta: { title: evidence.title, project: project.name, sizeBytes },
    });

    return serializeEvidence(evidence);
  } catch (err) {
    await removeFile(storageKey);
    throw err;
  }
}

/**
 * Opens a stored file for download.
 *
 * findEvidence applies the workspace scope and the project access check, so
 * this is authorised by exactly the same rule as reading the record itself. A
 * caller who cannot see the evidence row cannot fetch its bytes, and evidence
 * belonging to another workspace returns 404 rather than 403.
 */
export async function downloadEvidenceFile(user: AuthUser, id: string) {
  const evidence = await findEvidence(user, id);

  if (evidence.source !== 'FILE' || !evidence.storageKey) {
    throw new HttpError(404, 'This evidence has no stored file');
  }

  return {
    stream: openStream(evidence.storageKey),
    filename: evidence.originalName ?? 'download',
    mimeType: evidence.mimeType ?? 'application/octet-stream',
    sizeBytes: evidence.sizeBytes ?? undefined,
  };
}

export { MAX_FILE_BYTES };
