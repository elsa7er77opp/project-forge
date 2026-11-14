import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, registerAdmin, addMember, createProject, bearer, disconnect } from './helpers';

afterAll(disconnect);

/**
 * Roles govern what may be written, not what may be read.
 *
 * Inside a workspace every member can see every project; creating, editing,
 * archiving and deleting are Administrator-only. That distinction is easy to
 * state and easy to break, because hiding a button in the interface looks like
 * it has enforced something. These tests call the endpoints directly, which is
 * the only place the rule actually exists.
 */
describe('Roles and permissions', () => {
  it('lets a member read a project an administrator created', async () => {
    const admin = await registerAdmin();
    const member = await addMember(admin);
    const projectId = await createProject(admin);

    const res = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', bearer(member));

    expect(res.status).toBe(200);
    expect(res.body.project.id).toBe(projectId);
  });

  it('refuses project creation by a member with 403', async () => {
    const admin = await registerAdmin();
    const member = await addMember(admin);

    const res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', bearer(member))
      .send({ name: 'Member Project' });

    expect(res.status).toBe(403);
  });

  it('refuses project deletion and archiving by a member', async () => {
    const admin = await registerAdmin();
    const member = await addMember(admin);
    const projectId = await createProject(admin);

    const del = await request(app)
      .delete(`/api/v1/projects/${projectId}`)
      .set('Authorization', bearer(member));
    const archive = await request(app)
      .post(`/api/v1/projects/${projectId}/archive`)
      .set('Authorization', bearer(member));

    expect(del.status).toBe(403);
    expect([403, 404]).toContain(archive.status);

    // The project must still be there.
    const still = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', bearer(admin));
    expect(still.status).toBe(200);
  });

  it('refuses member management by a member', async () => {
    const admin = await registerAdmin();
    const member = await addMember(admin);

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', bearer(member))
      .send({ name: 'Someone Else', email: 'someone-else@test.local', role: 'MEMBER' });

    expect(res.status).toBe(403);
  });

  it('lets a member read the workspace roster, which assignment dropdowns need', async () => {
    const admin = await registerAdmin();
    const member = await addMember(admin);

    const res = await request(app).get('/api/v1/users').set('Authorization', bearer(member));
    expect(res.status).toBe(200);
    expect(res.body.members.length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * The workspace is the tenant boundary. A leak across it is the most serious
 * defect this application could have, and the least visible: everything looks
 * correct from inside a single workspace.
 *
 * Note the expected status. A project in another workspace returns 404, not
 * 403, because 403 would confirm that the record exists.
 */
describe('Workspace isolation', () => {
  it('does not list another workspace’s projects', async () => {
    const alice = await registerAdmin('alice');
    const bob = await registerAdmin('bob');
    await createProject(alice, 'Alice Confidential');

    const res = await request(app).get('/api/v1/projects').set('Authorization', bearer(bob));

    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(0);
  });

  it('returns 404 rather than 403 for another workspace’s project', async () => {
    const alice = await registerAdmin('alice');
    const bob = await registerAdmin('bob');
    const projectId = await createProject(alice);

    const res = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', bearer(bob));

    expect(res.status).toBe(404);
  });

  it('refuses writes to another workspace’s project', async () => {
    const alice = await registerAdmin('alice');
    const bob = await registerAdmin('bob');
    const projectId = await createProject(alice);

    const patch = await request(app)
      .patch(`/api/v1/projects/${projectId}`)
      .set('Authorization', bearer(bob))
      .send({ name: 'Renamed by an outsider' });

    const evidence = await request(app)
      .post(`/api/v1/projects/${projectId}/evidence`)
      .set('Authorization', bearer(bob))
      .send({ title: 'Injected', type: 'DOCUMENT', url: 'https://example.com' });

    expect(patch.status).toBe(404);
    expect(evidence.status).toBe(404);
  });

  it('keeps each workspace’s dashboard figures to its own data', async () => {
    const alice = await registerAdmin('alice');
    const bob = await registerAdmin('bob');
    await createProject(alice);
    await createProject(alice);

    const res = await request(app).get('/api/v1/dashboard').set('Authorization', bearer(bob));

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('Test Project');
  });
});
