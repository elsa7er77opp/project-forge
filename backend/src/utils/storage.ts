import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import type { Readable } from 'node:stream';
import { env } from '../config/env';
import { HttpError } from './http-error';

/**
 * File storage for evidence documents.
 *
 * Files are written to a persistent volume mounted into the container rather
 * than into the database or the image. The volume survives redeployment, which
 * the container filesystem does not.
 *
 * This module is deliberately the only place that touches the filesystem, and
 * it is written against a small interface — put, open, remove — so that moving
 * to S3-compatible object storage later means replacing this file and nothing
 * else. That is the main reason it exists as a separate module rather than
 * living inside the evidence service.
 */

/** 10 MB. The brief is light files; a large cap invites abuse. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Allowed content types, as an allowlist rather than a blocklist.
 *
 * A blocklist is the wrong shape for this problem: it fails open, because
 * anything not thought of is permitted. This list fails closed.
 *
 * Note the absence of text/html and image/svg+xml. Both can carry script, and
 * a file served from the application's own origin runs with the application's
 * privileges. They are excluded even though they are otherwise harmless
 * document formats.
 */
export const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/zip': '.zip',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
};

/** Root of the mounted volume. Configurable so local development needs no volume. */
const ROOT = path.resolve(env.storageDir);

/**
 * Builds the key under which a file is stored.
 *
 * Every component is server-controlled: the workspace and project come from the
 * authenticated request, and the filename is random. Nothing the caller sends
 * reaches the path, which is what makes directory traversal impossible rather
 * than merely difficult. The original filename is kept in the database for
 * display and is never used on disk.
 */
export function buildStorageKey(workspaceId: string, projectId: string, mimeType: string): string {
  const ext = ALLOWED_MIME[mimeType] ?? '';
  const name = `${Date.now().toString(36)}-${randomBytes(12).toString('hex')}${ext}`;
  return path.posix.join(workspaceId, projectId, name);
}

/**
 * Resolves a key to an absolute path and refuses anything outside the root.
 *
 * Keys are generated server-side, so this should be unreachable. It is here
 * because "should be unreachable" is an assumption, and this is the single
 * chokepoint where that assumption can be cheaply enforced for every operation.
 */
function resolveWithinRoot(key: string): string {
  const full = path.resolve(ROOT, key);
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (full !== ROOT && !full.startsWith(rootWithSep)) {
    throw new HttpError(400, 'Invalid storage key');
  }
  return full;
}

export function isAllowedMime(mimeType: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_MIME, mimeType);
}

/**
 * Streams an upload to disk, enforcing the size cap as the bytes arrive.
 *
 * The cap is applied to the stream rather than to a declared Content-Length,
 * because a client controls the header it sends. Exceeding the cap aborts the
 * write and removes the partial file, so a rejected upload leaves nothing
 * behind.
 */
export async function putStream(key: string, input: Readable): Promise<number> {
  const full = resolveWithinRoot(key);
  await mkdir(path.dirname(full), { recursive: true });

  let written = 0;
  let tooLarge = false;

  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      written += chunk.length;
      if (written > MAX_FILE_BYTES) {
        tooLarge = true;
        cb(new Error('FILE_TOO_LARGE'));
        return;
      }
      this.push(chunk);
      cb();
    },
  });

  try {
    await pipeline(input, counter, createWriteStream(full));
  } catch (err) {
    await unlink(full).catch(() => undefined);
    if (tooLarge) {
      throw new HttpError(413, 'File exceeds the 10 MB limit', { code: 'FILE_TOO_LARGE' });
    }
    throw err;
  }

  return written;
}

/** Opens a stored file for reading. */
export function openStream(key: string) {
  return createReadStream(resolveWithinRoot(key));
}

export async function fileSize(key: string): Promise<number> {
  const info = await stat(resolveWithinRoot(key));
  return info.size;
}

/**
 * Removes a stored file.
 *
 * A missing file is not an error. Deletion is called when an evidence record is
 * removed, and a record whose file has already gone should still be deletable —
 * otherwise a partial failure would leave a row that can never be cleaned up.
 */
export async function removeFile(key: string): Promise<void> {
  await unlink(resolveWithinRoot(key)).catch(() => undefined);
}

/** Ensures the storage root exists at boot, so the first upload is not the test. */
export async function ensureStorageReady(): Promise<void> {
  await mkdir(ROOT, { recursive: true });
}

export const storageRoot = ROOT;
