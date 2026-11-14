# Project FORGE

A cloud-based **Engineering Project Management** SaaS platform — centralising engineering
projects, milestones, design reviews, clarification requests and technical evidence into a
single workspace.

---

## Tech stack

| Layer      | Technology                                                            |
| ---------- | --------------------------------------------------------------------- |
| Frontend   | Angular 20 (standalone components, signals, new control flow), SCSS    |
| Backend    | Node + Express (TypeScript), modular controller/service architecture   |
| Database   | PostgreSQL via **Prisma** ORM with versioned migrations                |
| Auth       | JWT access tokens + rotating, hashed refresh tokens (httpOnly cookie)  |
| Validation | Zod schemas on every write endpoint                                    |
| Packaging  | Docker — separate web and API images, managed PostgreSQL               |

```
project-forge/
├── backend/     Express + Prisma API   (http://localhost:4000/api/v1)
├── frontend/    Angular application     (http://localhost:4200)
└── docker/      Container definitions
```

---

## Quick start with Docker

```bash
cp .env.example .env        # then fill in the values
docker compose up --build
```

| Service | URL |
|---|---|
| Web | http://localhost:4200 |
| API | http://localhost:4000/api/v1 |
| Health | http://localhost:4000/api/v1/health |
| PostgreSQL | localhost:5432 |

## Local development without Docker

Requires Node 20 and a running PostgreSQL instance.

### 1. Backend

```bash
cd backend
cp .env.example .env        # set DATABASE_URL and both JWT secrets
npm install
npm run setup               # prisma generate + migrate + seed demo data
npm run dev                 # API on http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
npm install
npm start                   # app on http://localhost:4200
```

### Running the tests

```bash
cd backend
npm test
```

The suite is integration-level: it drives the real Express app against a real database,
because the behaviour it protects — authorisation — is a property of the whole request
path rather than of any single function. Point `DATABASE_URL` at a scratch database
before running it; `docker compose up db` provides one. The tests create their own
workspaces and never read the seeded data, and uploads are written to a temporary
directory rather than to the storage volume.

Five files, covering authentication, roles and permissions, workspace isolation, the
clarification state machine, and evidence upload and access control.

### Demo accounts

| Role   | Email             |
| ------ | ----------------- |
| Admin  | `admin@forge.dev` |
| Member | `liam@forge.dev`  |

**No password appears in this repository, and none should be added.** The seed reads
`DEMO_PASSWORD` from the environment and refuses to run without it:

```bash
DEMO_PASSWORD="$(openssl rand -base64 18)" npm run db:seed
```

A password committed here would stay in the history after it was changed, so the only
way to remove one is never to add it. The login screen offers the demo *address* on
localhost only, and never the password.

---

## Environment variables

`.env` is git-ignored; no secret is ever committed. Generate secrets with
`openssl rand -hex 32`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string used by Prisma |
| `JWT_ACCESS_SECRET` | Signs the short-lived access token |
| `JWT_REFRESH_SECRET` | Signs the refresh token |
| `ACCESS_TOKEN_TTL` | Access token lifetime, default 15m |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh token lifetime in days, default 7 |
| `CLIENT_URL` | Allowed browser origin for CORS |
| `PORT` | API port, default 4000 |

## Database and migrations

Prisma is the source of truth for the schema. The production database is never edited
by hand.

```bash
npm run db:migrate          # create and apply a migration locally
npm run db:deploy           # apply migrations on release
npm run db:seed             # rebuild the demonstration dataset
npm run db:reset            # drop, re-migrate and re-seed
```

---

## API surface

All routes are served under `/api/v1`.

### Authentication
| Method | Endpoint | Access |
|---|---|---|
| POST | `/auth/register` | Public |
| POST | `/auth/login` | Public |
| POST | `/auth/refresh` | Refresh cookie |
| POST | `/auth/logout` | Public |
| GET | `/auth/me` | Authenticated |

### Projects
| Method | Endpoint | Access |
|---|---|---|
| GET | `/projects` | Member |
| GET | `/projects/:id` | Member |
| POST | `/projects` | Admin |
| PATCH | `/projects/:id` | Admin |
| POST | `/projects/:id/archive` | Admin |
| POST | `/projects/:id/restore` | Admin |
| DELETE | `/projects/:id` | Admin |

### Milestones
| Method | Endpoint | Access |
|---|---|---|
| GET | `/projects/:projectId/milestones` | Member |
| POST | `/projects/:projectId/milestones` | Member |
| PATCH | `/milestones/:id` | Member |
| DELETE | `/milestones/:id` | Admin |

### Design reviews
| Method | Endpoint | Access |
|---|---|---|
| GET | `/projects/:projectId/reviews` | Member |
| POST | `/projects/:projectId/reviews` | Member |
| PATCH | `/reviews/:id` | Member |
| DELETE | `/reviews/:id` | Admin |

### Clarifications
| Method | Endpoint | Access |
|---|---|---|
| GET | `/projects/:projectId/clarifications` | Member |
| POST | `/projects/:projectId/clarifications` | Member |
| PATCH | `/clarifications/:id` | Member |
| POST | `/clarifications/:id/answer` | Member |
| POST | `/clarifications/:id/close` | Member |
| DELETE | `/clarifications/:id` | Admin |

Clarifications follow a strict state machine: `OPEN → ANSWERED → CLOSED`. Any other
transition is rejected with `409` and the code `CLARIFICATION_INVALID_TRANSITION`.

### Evidence
| Method | Endpoint | Access |
|---|---|---|
| GET | `/projects/:projectId/evidence` | Member |
| POST | `/projects/:projectId/evidence` | Member |
| PATCH | `/evidence/:id` | Uploader or Admin |
| DELETE | `/evidence/:id` | Admin |

### Dashboard, users and notifications
| Method | Endpoint | Access |
|---|---|---|
| GET | `/dashboard` | Member |
| GET | `/users` | Member |
| POST | `/users` | Admin |
| PATCH | `/users/:id` | Admin |
| POST | `/users/:id/reset-password` | Admin |
| DELETE | `/users/:id` | Admin |
| GET | `/notifications` | Authenticated |
| PATCH | `/notifications/:id/read` | Owner |
| POST | `/notifications/read-all` | Authenticated |
| GET | `/health` | Public |

---

## Authorisation model

Authorisation is enforced on the server for every request. The Angular route guard is a
navigation convenience and is never treated as a security control.

- `requireAuth` establishes identity from the Bearer access token.
- Workspace isolation is applied by resolving the workspace from the authenticated user,
  never from a client-supplied parameter.
- `requireAdmin` restricts Admin-only operations.
- Non-admins can only reach projects they manage or belong to.
- Records belonging to an archived project are readable but reject writes with `409`.

## Known limitations

- Evidence may be an external link or an uploaded file. **Uploaded files are held on a
  persistent volume mounted into the API container — this is not object storage such as
  S3 or R2, and it is not a production-grade storage service.** The files are lost with
  the volume, there is no replication and no lifecycle policy. The filesystem is touched
  in exactly one module, behind a four-function interface, so migrating to object storage
  means replacing that one file. See `EVIDENCE_STORAGE.md`.
- Notifications are in-app only; email delivery is out of scope.
- There is no password reset or email verification flow.
- No rate limiting or account lockout.
- The test suite covers authentication, roles, workspace isolation, the clarification
  workflow and evidence access control. It is deliberately focused rather than complete;
  the remaining verification is manual.

---

## Deployment

The application is deployed as two containers plus a managed PostgreSQL instance.

| Service | Image | Notes |
|---|---|---|
| `web` | nginx serving the Angular bundle | Also proxies `/api` to the API |
| `api` | Node running the compiled Express server | Runs migrations on start |
| database | Managed PostgreSQL | Provided by the hosting platform |

### Same-origin by design

nginx proxies `/api` to the API container, so the browser only ever talks to one
origin. This removes CORS entirely and lets the refresh cookie stay `SameSite=Lax`,
which is both simpler and safer than a split-domain setup.

The frontend therefore calls the relative path `/api/v1` in production and
`http://localhost:4000/api/v1` when running on the Angular dev server. Nothing is
hardcoded to a deployed hostname.

### Environment variables in production

| Variable | Service | Value |
|---|---|---|
| `DATABASE_URL` | api | Connection string from the database provider |
| `JWT_ACCESS_SECRET` | api | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | api | A different `openssl rand -hex 32` |
| `NODE_ENV` | api | `production` — enables the Secure cookie flag |
| `CLIENT_URL` | api | The public application URL |
| `COOKIE_SAMESITE` | api | `lax` behind the proxy; `none` only for split domains |
| `PORT` | web | Injected by most platforms; defaults to 80 |
| `API_UPSTREAM` | web | Internal address of the API, e.g. `http://api:4000` |

### Notes

- The API binds to `0.0.0.0`, not localhost, so the container accepts external connections.
- `trust proxy` is enabled so the Secure cookie flag is set correctly behind a load balancer.
- Migrations run automatically on container start via `prisma migrate deploy`.
- Google Fonts inlining is disabled at build time so the image can build without
  outbound network access; the browser still loads the font from the `<link>` tag.
