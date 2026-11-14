# Evidence file storage — implementation notes

Sponsor's brief, 9 August 2026: a limited practical feature or proof of concept
demonstrating understanding of

1. how files are uploaded from the platform
2. how they are stored using a cloud-storage service
3. how file information is recorded and linked to the relevant project
4. how authorised users access or delete uploaded files
5. the basic security and access considerations involved

Not required to be production-ready. Sponsor subsequently confirmed: keep it
simple, light files only.

---

## An honest statement about "cloud storage"

Files are written to a **persistent Railway volume** — network-attached storage
mounted into the API container at `/data`. It survives redeployment, which the
container filesystem does not.

It is **not** an object-storage service such as S3 or Cloudflare R2. The
differences that matter:

| | Railway volume | S3 / R2 |
|---|---|---|
| Survives redeploy | Yes | Yes |
| Attaches to | one service | any number |
| Scales past one instance | **No** | Yes |
| Presigned URLs | No — bytes stream through the API | Yes |
| Bandwidth cost | none | per GB |

This was a deliberate trade for simplicity, chosen with the sponsor's agreement.
The consequence to be aware of: **the API cannot be scaled to more than one
instance** while files live on its volume, because a second instance would have
its own empty disk.

The storage layer was written behind a four-function interface —
`buildStorageKey`, `putStream`, `openStream`, `removeFile` — in a single file,
`backend/src/utils/storage.ts`. Moving to S3 means replacing that file and
nothing else. That is the main reason it is a separate module rather than code
living inside the evidence service.

---

## 1. How files are uploaded

`POST /api/v1/projects/:projectId/evidence/upload` — multipart form data, field
name `file`, optional `title` and `description`.

The browser sends the file through Angular's `HttpClient` with
`reportProgress: true`, so the interface shows a real progress bar rather than a
spinner that says nothing.

Uploads are buffered **in memory**, not to a temporary directory. The 10 MB cap
makes that safe and it removes a class of problem: there is no temp file to
leak, to clean up, or to leave behind when a request fails halfway.

## 2. How they are stored

Under `STORAGE_DIR` (`/data/uploads` in the container), keyed as:

```
<workspaceId>/<projectId>/<timestamp36>-<24 hex chars><ext>
```

Every component is server-generated. The original filename is kept in the
database for display and is **never used on disk**.

The Dockerfile creates `/data` and chowns it to the unprivileged `forge` user
*before* dropping privileges — the same class of mistake that caused the Prisma
engine failure during the first release, avoided deliberately this time.

## 3. How file information is recorded

Migration `20260809140000_evidence_files` adds to `Evidence`:

| Column | Purpose |
|---|---|
| `source` | `LINK` or `FILE`. A row is one or the other, never both. |
| `storageKey` | Path relative to the storage root. **Never sent to a client.** |
| `originalName` | The name the user's file had, for display and download |
| `mimeType` | Validated content type |
| `sizeBytes` | Actual bytes written, measured — not the declared length |

`source` exists because "url is empty" is not a reliable way to tell a link from
a file. Existing rows default to `LINK`; every file column is nullable, so the
migration is safe on live data and nothing changes for existing evidence.

The row is linked to the project by the existing `projectId` foreign key, with
`onDelete: Cascade` — deleting a project removes its evidence rows.

**Ordering during upload matters, and is deliberate:**

1. authorisation checked — an unauthorised caller must not write bytes, even
   temporarily
2. content type checked against the allowlist
3. storage key built from server-side values only
4. bytes written, size enforced as they arrive
5. database row created

If the write fails there is no row pointing at a missing file. If the insert
fails, the orphaned file is removed.

## 4. How authorised users access or delete files

**Download** — `GET /api/v1/evidence/:id/download`

Authorised by exactly the same rule as reading the evidence record: the lookup
is workspace-scoped and runs the project access check. A caller who cannot see
the record cannot fetch its bytes, and evidence in another workspace returns
**404, not 403**.

The client fetches it as a blob through `HttpClient` rather than linking
directly, because the endpoint requires the `Authorization` header and a plain
anchor cannot send one.

**Delete** — `DELETE /api/v1/evidence/:id`, Admin only (unchanged).

The database row is removed **first**, then the file. If the file removal then
fails the result is an unreferenced file rather than a record pointing at
nothing — the less harmful failure, and the only one that is recoverable.
Deleting a file that is already gone is not treated as an error, so a partial
failure can never leave a row that refuses to be cleaned up.

## 5. Security and access considerations

| Consideration | How it is handled |
|---|---|
| **Directory traversal** | Nothing the caller sends reaches the path. The key is built from the authenticated workspace and project plus random bytes. `resolveWithinRoot()` additionally refuses any resolved path outside the root — a chokepoint every operation passes through. |
| **Dangerous file types** | An **allowlist**, not a blocklist. A blocklist fails open: anything unforeseen is permitted. `text/html` and `image/svg+xml` are excluded because both can carry script, and a file served from the application's own origin would run with the application's privileges. |
| **Size limits** | Enforced on the **stream** as bytes arrive, not against a declared `Content-Length` — a client controls the header it sends. Exceeding the cap aborts the write and deletes the partial file. Declared twice: at the route (rejects early) and in the storage layer (the authority). |
| **Authorisation** | Checked server-side before any write, and again on every read. The client `accept` attribute is a convenience, not a control. |
| **Content sniffing** | Downloads set `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`, so a file cannot be coaxed into being interpreted as a document on the application's origin. |
| **Key disclosure** | `storageKey` is never serialised to any client. It appears only inside the service. A client that never sees the key cannot attempt to fetch by it. |
| **Public projects** | Evidence is **not** in `publicProjectSelect`. An unauthenticated visitor to a published project sees no evidence at all, and no storage key. Verified programmatically. |
| **Empty uploads** | A zero-byte file is rejected and removed rather than recorded. |

---

## Files changed

**Backend**
- `prisma/schema.prisma` — five columns on `Evidence`
- `prisma/migrations/20260809140000_evidence_files/migration.sql`
- `src/utils/storage.ts` — **new**, the whole storage layer
- `src/config/env.ts` — `storageDir`
- `src/server.ts` — creates the storage root at boot so a bad mount shows in the
  deploy log rather than as a failed upload later
- `src/modules/evidence/{service,controller,routes}.ts`
- `.env.example`, `docker/api.Dockerfile`

**Frontend**
- `core/models.ts`, `core/api/evidence.service.ts`
- `features/projects/project-detail.component.{ts,html,scss}`
- `shared/icon.component.ts` — upload and download icons

New dependency: `multer` (+ `@types/multer`).

---

## Verification performed

**Storage layer — 16 automated checks, all passing.** Run against the real
filesystem, not mocks:

- round trip returns the correct size and byte-identical content
- keys namespaced by workspace and project, unique per upload, and containing no
  part of the original filename
- allowlist: PDF accepted; **SVG, HTML and executables rejected**
- oversized upload rejected with `FILE_TOO_LARGE` and **no partial file left**
- directory traversal blocked for `../../etc/passwd`, `/etc/passwd` and
  `ws1/../../../secret`
- delete removes the file; deleting a missing file is not an error

**Migrations** — all five replayed on a real PostgreSQL from empty. All new
columns nullable with `source` defaulting to `'LINK'`.

**Public exposure audit** — `evidence`, `storageKey`, `mimeType`,
`originalName`, `client`, `reviews`, `clarifications` and `members` all confirmed
absent from the public project shape.

**Builds** — frontend production build clean; backend `tsc --noEmit` shows only
the nine known `TS7006` errors caused by the Prisma client not being generated in
the sandbox.

**Not verified here:** the endpoints over HTTP, because Prisma's engine download
is blocked in the build environment. **Test after deploying.**

---

## Deploying this

1. **Create the volume.** Railway → service `project-forge` → Settings → Volumes
   → add a volume mounted at **`/data`**.
2. Push. The migration applies automatically on start.
3. Look for `Evidence storage ready at /data/uploads` in the deploy log. If it
   instead says the storage is not writable, the mount path is wrong.
4. Test: open a project → Evidence tab → **Upload file** → then **Download**.
5. Confirm a published project still shows no evidence to a signed-out visitor.

`STORAGE_DIR` is set in the Dockerfile, so no new Railway variable is needed
unless the mount path differs.

## Known limitations

- Single instance only — files live on one service's volume.
- No virus scanning. Out of scope for a proof of concept; would be the first
  addition before accepting files from outside a trusted team.
- No deduplication, no thumbnails, no preview.
- Bytes stream through the API rather than being served directly, so a large
  download occupies an API worker. Fine at this scale; presigned URLs against
  object storage would be the answer at any real volume.
