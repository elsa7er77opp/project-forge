# Public project visibility — implementation notes

Sponsor request, 9 August 2026:

> the target is for any visitor to be able to access FORGE and read the projects
> that have been marked as public, without needing an account. Editing,
> uploading, and administrative functions must remain restricted to authorized
> users.

Also in the same message: display the platform name as **FORGE**. Done — four
files (`auth-layout`, `directory-profile`, `directory-search`, `index.html`).
The sidebar already read FORGE.

---

## The rule

A project is readable by an unauthenticated visitor **only** when all three hold:

1. the project itself is published (`Project.isPublic`)
2. its workspace is published (`Workspace.isPublic`)
3. the project is not archived

Requiring the workspace as well as the project is deliberate. Without it an
administrator could publish a project while believing their organisation was
still hidden. The two switches are independent in the interface and the stricter
one always wins.

Archived projects cannot be published — archiving is how a project is retired,
and a retired project on a public page misrepresents the organisation.
Unpublishing is always allowed, so a project can be withdrawn in one action
whatever state it is in.

## What a visitor can see

| Field | Visible |
|---|---|
| Name, description, status, progress | Yes |
| Tags, start date, end date | Yes |
| Organisation name and slug | Yes |
| Milestones — title, status, due date, progress | Yes |
| **Client name** | **No** — commercially sensitive |
| **Design reviews and decisions** | **No** — internal record |
| **Clarifications** | **No** — internal Q&A |
| **Evidence links** | **No** — may reach private documents |
| **Team members** | **No** |
| **Milestone assignee** | **No** |
| Priority, archived flag, manager | No |

The exposed set is defined once, in `publicProjectSelect` in
`directory.service.ts`. Adding a field there makes it world-readable. The
comment above it says so.

## Endpoints

**Public — no authentication**

| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/organisations/projects` | published projects across all published organisations |
| GET | `/api/v1/organisations/projects/:id` | one published project |
| GET | `/api/v1/organisations/:slug/projects` | published projects of one organisation |

`/projects` and `/projects/:id` are declared **before** `/:slug` so the literal
segment is not captured as an organisation slug.

**Admin only**

| Method | Path | Notes |
|---|---|---|
| PATCH | `/api/v1/projects/:id/visibility` | body `{ isPublic: boolean }`; 409 `PROJECT_ARCHIVED` when publishing an archived project |

Publication has its own endpoint rather than being an optional field on the edit
form. A visitor gaining access should never be the side effect of saving an
unrelated change.

A project that is private, archived, or in an unpublished workspace returns
**404, not 403** — the same as one that does not exist. "Forbidden" would
confirm the record is real.

## Screens

- `/projects/public` — browse grid with a client-side filter across project
  name, organisation and tags. Skeleton loaders while fetching.
- `/projects/public/:id` — read-only project view with milestones, and a note
  stating plainly what is *not* shown.
- Both routes are declared before the authenticated shell so `/projects/public`
  is not captured as a project id.
- Project detail gains a **Publish / Unpublish** button for administrators, a
  `Public` badge, and an explicit confirmation listing exactly what will become
  readable.
- The directory landing page and organisation profile link through to the public
  projects.

## Database

`backend/prisma/migrations/20260809100000_public_projects/migration.sql`

```sql
ALTER TABLE "Project" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Project_isPublic_idx" ON "Project"("isPublic");
```

Default `false`, so **nothing becomes visible as a result of deploying this**.
Every project must be published deliberately. The index matters because the
public listing filters on the flag first; without it, publishing one project
would mean scanning every project on the platform on each anonymous request.

## Verification performed

An embedded PostgreSQL was used, not a mock.

1. **Migration chain** — all four migrations applied to an empty database. 13
   tables, `isPublic` column and `Project_isPublic_idx` both present.
2. **Visibility predicate** — four projects covering every combination:

   | Case | Result |
   |---|---|
   | public project, published org | **visible** — correct |
   | private project, published org | hidden |
   | archived but published project | hidden |
   | published project, unpublished org | hidden |

3. **Field exposure audit** — the select and the returned shape were parsed and
   checked against a list of sensitive fields. None present.
4. **Frontend** — production build, zero errors.
5. **Backend** — `tsc --noEmit` returns only the nine known `TS7006` errors
   caused by the Prisma client not being generated in the sandbox. No new
   errors. Run `npx prisma generate` first and it is clean.

Not verified here: a running API. Prisma's engine download is blocked in the
build environment, so the endpoints have not been exercised over HTTP. **Test
`/api/v1/organisations/projects` after deploying.**

## API surface

45 endpoints before, **49** now.

## Still outstanding

- Cloud storage proof of concept — the third item in the sponsor's message. Not
  started.
- This work is committed locally only. It needs a push, and the migration will
  apply automatically on the next Railway release.
