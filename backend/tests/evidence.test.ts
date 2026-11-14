import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app, registerAdmin, addMember, createProject, bearer, disconnect } from './helpers';

/**
 * Uploads are written to a temporary directory for the duration of the run, so
 * the suite never touches the real storage volume. STORAGE_DIR is read once, at
 * module load, which is why this is set in the vitest setup file rather than
 * here — see tests/setup.ts.
 */
beforeAll(() => {
  process.env.STORAGE_DIR ??= mkdtempSync(path.join(tmpdir(), 'forge-test-'));
});

afterAll(disconnect);

const TXT = Buffer.from('Calibration certificate, revision B.\n');

async function upload(actor: any, projectId: string, name = 'certificate.txt') {
  return request(app)
    .post(`/api/v1/projects/${projectId}/evidence/upload`)
    .set('Authorization', bearer(actor))
    .field('title', 'Calibration certificate')
    .attach('file', TXT, { filename: name, contentType: 'text/plain' });
}

describe('Evidence file upload', () => {
  it('stores a file and records its metadata', async () => {
    const admin = await registerAdmin();
    const projectId = await createProject(admin);

    const res = await upload(admin, projectId);

    expect(res.status).toBe(201);
    expect(res.body.evidence.source).toBe('FILE');
    expect(res.body.evidence.originalName).toBe('certificate.txt');
    expect(res.body.evidence.sizeBytes).toBe(TXT.length);
  });

  /**
   * The storage key is the internal address of the file on disk. A client that
   * has never seen one cannot attempt to fetch by it, which is why its absence
   * from every response is worth asserting rather than assuming.
   */
  it('never returns the storage key', async () => {
    const admin = await registerAdmin();
    const projectId = await createProject(admin);
    await upload(admin, projectId);

    const detail = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', bearer(admin));

    expect(JSON.stringify(detail.body)).not.toContain('storageKey');
  });

  /**
   * The same record must describe itself the same way however it is fetched.
   * A duplicated serialiser that omitted these fields is what made an uploaded
   * file appear on upload and vanish on the next read.
   */
  it('describes an uploaded file identically in the project detail response', async () => {
    const admin = await registerAdmin();
    const projectId = await createProject(admin);
    const created = await upload(admin, projectId);

    const detail = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', bearer(admin));

    const row = detail.body.project.evidence.find(
      (e: any) => e.id === created.body.evidence.id,
    );

    expect(row.source).toBe('FILE');
    expect(row.originalName).toBe('certificate.txt');
    expect(row.sizeBytes).toBe(TXT.length);
  });

  it('rejects a content type outside the allowlist', async () => {
    const admin = await registerAdmin();
    const projectId = await createProject(admin);

    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/evidence/upload`)
      .set('Authorization', bearer(admin))
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'payload.html',
        contentType: 'text/html',
      });

    expect(res.status).toBe(415);
  });

  it('rejects a request with no file', async () => {
    const admin = await registerAdmin();
    const projectId = await createProject(admin);

    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/evidence/upload`)
      .set('Authorization', bearer(admin))
      .field('title', 'Nothing attached');

    expect(res.status).toBe(400);
  });
});

describe('Evidence file access control', () => {
  it('refuses an upload with no token, before anything is written', async () => {
    const admin = await registerAdmin();
    const projectId = await createProject(admin);

    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/evidence/upload`)
      .attach('file', TXT, { filename: 'anon.txt', contentType: 'text/plain' });

    expect(res.status).toBe(401);
  });

  it('refuses an upload to another workspace’s project', async () => {
    const alice = await registerAdmin('alice');
    const bob = await registerAdmin('bob');
    const projectId = await createProject(alice);

    const res = await upload(bob, projectId, 'intruder.txt');
    expect(res.status).toBe(404);
  });

  it('serves a download to a member of the owning workspace', async () => {
    const admin = await registerAdmin();
    const member = await addMember(admin);
    const projectId = await createProject(admin);
    const created = await upload(admin, projectId);

    const res = await request(app)
      .get(`/api/v1/evidence/${created.body.evidence.id}/download`)
      .set('Authorization', bearer(member))
      // The endpoint returns a file, not a document. Without these two the
      // client parses the response as JSON and the bytes are lost, so the
      // assertion below would be checking the status code and nothing else.
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.body.toString()).toContain('Calibration certificate');
  });

  it('refuses a download with no token', async () => {
    const admin = await registerAdmin();
    const projectId = await createProject(admin);
    const created = await upload(admin, projectId);

    const res = await request(app).get(`/api/v1/evidence/${created.body.evidence.id}/download`);
    expect(res.status).toBe(401);
  });

  it('returns 404, not 403, for a download from another workspace', async () => {
    const alice = await registerAdmin('alice');
    const bob = await registerAdmin('bob');
    const projectId = await createProject(alice);
    const created = await upload(alice, projectId);

    const res = await request(app)
      .get(`/api/v1/evidence/${created.body.evidence.id}/download`)
      .set('Authorization', bearer(bob));

    expect(res.status).toBe(404);
  });

  it('restricts deletion to administrators', async () => {
    const admin = await registerAdmin();
    const member = await addMember(admin);
    const projectId = await createProject(admin);
    const created = await upload(admin, projectId);
    const id = created.body.evidence.id;

    const byMember = await request(app)
      .delete(`/api/v1/evidence/${id}`)
      .set('Authorization', bearer(member));
    expect(byMember.status).toBe(403);

    const byAdmin = await request(app)
      .delete(`/api/v1/evidence/${id}`)
      .set('Authorization', bearer(admin));
    expect(byAdmin.status).toBe(204);

    const gone = await request(app)
      .get(`/api/v1/evidence/${id}/download`)
      .set('Authorization', bearer(admin));
    expect(gone.status).toBe(404);
  });
});
