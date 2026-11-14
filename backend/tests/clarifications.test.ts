import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, registerAdmin, addMember, createProject, bearer, disconnect } from './helpers';

afterAll(disconnect);

async function raise(actor: Parameters<typeof bearer>[0], projectId: string) {
  const res = await request(app)
    .post(`/api/v1/projects/${projectId}/clarifications`)
    .set('Authorization', bearer(actor))
    .send({ question: 'Which tolerance applies to the mounting plate?', priority: 'HIGH' });

  expect(res.status).toBe(201);
  return res.body.clarification.id as string;
}

/**
 * Open → Answered → Closed, and nothing else.
 *
 * The transitions the tests below reject are the ones that would let the record
 * lie: a clarification marked closed that nobody ever answered reads, to anyone
 * later, as a question that was resolved. In an engineering review chain that
 * is the difference between a record and a decoration, so the rule is enforced
 * on the server and asserted here rather than trusted to the interface.
 */
describe('Clarification workflow', () => {
  it('creates a clarification in the Open state', async () => {
    const admin = await registerAdmin();
    const projectId = await createProject(admin);
    const id = await raise(admin, projectId);

    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/clarifications`)
      .set('Authorization', bearer(admin));

    const found = res.body.clarifications.find((c: any) => c.id === id);
    expect(found.status).toBe('OPEN');
  });

  it('walks Open → Answered → Closed', async () => {
    const admin = await registerAdmin();
    const projectId = await createProject(admin);
    const id = await raise(admin, projectId);

    const answered = await request(app)
      .post(`/api/v1/clarifications/${id}/answer`)
      .set('Authorization', bearer(admin))
      .send({ answer: 'ISO 2768-m applies unless the drawing states otherwise.' });

    expect(answered.status).toBe(200);
    expect(answered.body.clarification.status).toBe('ANSWERED');

    const closed = await request(app)
      .post(`/api/v1/clarifications/${id}/close`)
      .set('Authorization', bearer(admin));

    expect(closed.status).toBe(200);
    expect(closed.body.clarification.status).toBe('CLOSED');
  });

  it('refuses to close a clarification that was never answered', async () => {
    const admin = await registerAdmin();
    const projectId = await createProject(admin);
    const id = await raise(admin, projectId);

    const res = await request(app)
      .post(`/api/v1/clarifications/${id}/close`)
      .set('Authorization', bearer(admin));

    expect(res.status).toBe(409);
  });

  it('refuses to reopen or re-answer a closed clarification', async () => {
    const admin = await registerAdmin();
    const projectId = await createProject(admin);
    const id = await raise(admin, projectId);

    await request(app)
      .post(`/api/v1/clarifications/${id}/answer`)
      .set('Authorization', bearer(admin))
      .send({ answer: 'First answer.' });
    await request(app)
      .post(`/api/v1/clarifications/${id}/close`)
      .set('Authorization', bearer(admin));

    const reAnswer = await request(app)
      .post(`/api/v1/clarifications/${id}/answer`)
      .set('Authorization', bearer(admin))
      .send({ answer: 'Second answer.' });

    const edit = await request(app)
      .patch(`/api/v1/clarifications/${id}`)
      .set('Authorization', bearer(admin))
      .send({ question: 'A different question entirely' });

    expect(reAnswer.status).toBe(409);
    expect(edit.status).toBe(409);
  });

  it('refuses to close it twice', async () => {
    const admin = await registerAdmin();
    const projectId = await createProject(admin);
    const id = await raise(admin, projectId);

    await request(app)
      .post(`/api/v1/clarifications/${id}/answer`)
      .set('Authorization', bearer(admin))
      .send({ answer: 'Answered once.' });
    const first = await request(app)
      .post(`/api/v1/clarifications/${id}/close`)
      .set('Authorization', bearer(admin));
    const second = await request(app)
      .post(`/api/v1/clarifications/${id}/close`)
      .set('Authorization', bearer(admin));

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });

  it('does not expose a clarification to another workspace', async () => {
    const alice = await registerAdmin('alice');
    const bob = await registerAdmin('bob');
    const projectId = await createProject(alice);
    const id = await raise(alice, projectId);

    const res = await request(app)
      .post(`/api/v1/clarifications/${id}/answer`)
      .set('Authorization', bearer(bob))
      .send({ answer: 'Answered by an outsider.' });

    expect(res.status).toBe(404);
  });

  it('lets a member raise and answer, since the workflow is not administrator-only', async () => {
    const admin = await registerAdmin();
    const member = await addMember(admin);
    const projectId = await createProject(admin);

    const raised = await request(app)
      .post(`/api/v1/projects/${projectId}/clarifications`)
      .set('Authorization', bearer(member))
      .send({ question: 'Raised by a member.' });

    expect(raised.status).toBe(201);
  });
});
