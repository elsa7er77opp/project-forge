import { prisma } from '../../lib/prisma';
import { HttpError } from '../../utils/http-error';
import type { AuthUser } from '../../middleware/auth';
import type {
  SearchDirectoryQuery,
  UpdateVisibilityInput,
} from './directory.schemas';

/** Hard ceiling on results, so a broad term cannot be used to walk the directory. */
const MAX_RESULTS = 10;

/** Ceiling on public projects returned for one organisation. */
const MAX_PUBLIC_PROJECTS = 50;

/**
 * The public shape of a workspace.
 *
 * This is the complete set of fields any unauthenticated caller can ever see.
 * It carries no project names, no client names, no member names and no member
 * emails — only what an organisation would put on a public profile. Counts are
 * aggregates, so they reveal size without revealing content.
 */
function publicProfile(w: any) {
  return {
    slug: w.slug,
    name: w.name,
    tagline: w.tagline,
    createdAt: w.createdAt,
    projectCount: w._count?.projects ?? 0,
    memberCount: w._count?.memberships ?? 0,
  };
}

const publicSelect = {
  slug: true,
  name: true,
  tagline: true,
  createdAt: true,
  _count: { select: { projects: true, memberships: true } },
};

/**
 * Finds published workspaces by name. Only workspaces whose administrator has
 * explicitly opted in are searchable; every workspace is private on creation.
 */
export async function searchDirectory(query: SearchDirectoryQuery) {
  const workspaces = await prisma.workspace.findMany({
    where: {
      isPublic: true,
      name: { contains: query.q, mode: 'insensitive' },
    },
    select: publicSelect,
    orderBy: { name: 'asc' },
    take: MAX_RESULTS,
  });
  return workspaces.map(publicProfile);
}

export async function getPublicProfile(slug: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { slug, isPublic: true },
    select: { ...publicSelect, id: true },
  });
  // A private workspace and a non-existent one are indistinguishable from
  // outside, so opting out cannot be detected.
  if (!workspace) {
    throw new HttpError(404, 'No public profile found for this organisation');
  }
  // projectCount on the profile is the total the organisation holds. A visitor
  // also needs to know how many they can actually open, which is a different
  // and usually smaller number.
  const publicProjectCount = await prisma.project.count({
    where: { workspaceId: workspace.id, isPublic: true, archived: false },
  });
  return { ...publicProfile(workspace), publicProjectCount };
}

/** The administrator's own view, including whether the profile is published. */
export async function getOwnVisibility(user: AuthUser) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: user.workspaceId },
    select: { ...publicSelect, isPublic: true },
  });
  if (!workspace) {
    throw new HttpError(404, 'Workspace not found');
  }
  return { ...publicProfile(workspace), isPublic: workspace.isPublic };
}

export async function updateVisibility(user: AuthUser, input: UpdateVisibilityInput) {
  const workspace = await prisma.workspace.update({
    where: { id: user.workspaceId },
    data: {
      ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
      ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
    },
    select: { ...publicSelect, isPublic: true },
  });
  return { ...publicProfile(workspace), isPublic: workspace.isPublic };
}

/* ------------------------------------------------------------------ *
 * Public projects
 *
 * The three conditions below are deliberately combined and are applied on
 * every public read. A project is visible to an unauthenticated visitor only
 * when:
 *
 *   1. the project itself has been published,
 *   2. its workspace has been published, and
 *   3. it is not archived.
 *
 * Requiring the workspace as well as the project means an administrator cannot
 * expose a project while believing their organisation is still hidden. The two
 * switches are independent in the interface but the stricter of the two always
 * wins.
 * ------------------------------------------------------------------ */

const publicProjectWhere = {
  isPublic: true,
  archived: false,
  workspace: { isPublic: true },
};

/**
 * The complete set of project fields an unauthenticated caller can ever see.
 *
 * What is deliberately absent matters more than what is present. There is no
 * client name, because who an organisation works for is commercially
 * sensitive. There are no design reviews, no clarifications and no evidence,
 * because those are the internal record of how the work was argued and
 * decided. There are no member names or emails. Milestones are included but
 * carry only title, status, due date and progress — never the assignee.
 *
 * Adding a field here makes it world-readable. Nothing should be added without
 * asking whether an organisation would print it in a brochure.
 */
const publicProjectSelect = {
  id: true,
  name: true,
  description: true,
  status: true,
  progress: true,
  tags: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  workspace: { select: { name: true, slug: true } },
  milestones: {
    select: { id: true, title: true, status: true, dueDate: true, progress: true },
    orderBy: { dueDate: 'asc' as const },
  },
};

/**
 * Progress shown to a visitor, derived the same way as for a signed-in member.
 *
 * The stored `progress` column is a manual override that is only meaningful
 * before any milestone exists. Once milestones are present the authenticated
 * view derives the figure from their completion, and reading the column here
 * instead produced the visible defect this replaces: a public project showing
 * 0% while its only milestone showed 100%. Two views of the same project must
 * not disagree, so the derivation is shared rather than repeated.
 */
function publicProgress(p: any): number {
  const milestones = p.milestones ?? [];
  if (milestones.length === 0) return p.progress ?? 0;
  const total = milestones.reduce((sum: number, m: any) => sum + (m.progress ?? 0), 0);
  return Math.round(total / milestones.length);
}

function publicProject(p: any) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    progress: publicProgress(p),
    tags: safeTags(p.tags),
    startDate: p.startDate,
    endDate: p.endDate,
    createdAt: p.createdAt,
    organisation: { name: p.workspace.name, slug: p.workspace.slug },
    milestones: (p.milestones ?? []).map((m: any) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      dueDate: m.dueDate,
      progress: m.progress,
    })),
  };
}

/** Tags are stored as a JSON-encoded string; a malformed value must not 500. */
function safeTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

/** Published projects belonging to one published organisation. */
export async function listPublicProjectsBySlug(slug: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { slug, isPublic: true },
    select: { id: true },
  });
  if (!workspace) {
    throw new HttpError(404, 'No public profile found for this organisation');
  }
  const projects = await prisma.project.findMany({
    where: { ...publicProjectWhere, workspaceId: workspace.id },
    select: publicProjectSelect,
    orderBy: { updatedAt: 'desc' },
    take: MAX_PUBLIC_PROJECTS,
  });
  return projects.map(publicProject);
}

/**
 * A single published project.
 *
 * A project that is private, archived, or belongs to an unpublished workspace
 * returns 404 rather than 403, exactly as the authenticated API does for a
 * project in another workspace. "Forbidden" would confirm the record exists.
 */
export async function getPublicProject(id: string) {
  const project = await prisma.project.findFirst({
    where: { ...publicProjectWhere, id },
    select: publicProjectSelect,
  });
  if (!project) {
    throw new HttpError(404, 'No public project found');
  }
  return publicProject(project);
}

/** Published projects across every published organisation, newest first. */
export async function browsePublicProjects() {
  const projects = await prisma.project.findMany({
    where: publicProjectWhere,
    select: publicProjectSelect,
    orderBy: { updatedAt: 'desc' },
    take: MAX_PUBLIC_PROJECTS,
  });
  return projects.map(publicProject);
}
