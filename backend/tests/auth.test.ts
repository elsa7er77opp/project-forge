import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app, registerAdmin, uniqueEmail, PASSWORD, bearer, disconnect } from './helpers';

afterAll(disconnect);

describe('Authentication', () => {
  it('registers a user and returns an access token', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'New Person',
      email: uniqueEmail('new'),
      password: PASSWORD,
      workspaceName: 'A New Workspace',
    });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.id).toBeTruthy();
  });

  it('never returns the password hash', async () => {
    const actor = await registerAdmin();
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', bearer(actor));

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects a duplicate email with 409 rather than creating a second account', async () => {
    const email = uniqueEmail('dupe');
    const body = {
      name: 'First',
      email,
      password: PASSWORD,
      workspaceName: 'First Workspace',
    };

    expect((await request(app).post('/api/v1/auth/register').send(body)).status).toBe(201);
    expect((await request(app).post('/api/v1/auth/register').send(body)).status).toBe(409);
  });

  /**
   * 422 rather than 400, and the distinction is deliberate in the application:
   * the request body parsed correctly and then failed a validation rule, which
   * is a different thing from a body the server could not read at all.
   */
  it('rejects a password below the minimum length', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Short',
      email: uniqueEmail('short'),
      password: 'short',
      workspaceName: 'Workspace',
    });

    expect(res.status).toBe(422);
  });

  it('signs in with the correct password', async () => {
    const actor = await registerAdmin();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: actor.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  /**
   * The two failures return the same status and the same message on purpose.
   * Distinguishing them would turn the login form into a way of discovering
   * which addresses hold accounts.
   */
  it('gives an identical response for a wrong password and an unknown address', async () => {
    const actor = await registerAdmin();

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: actor.email, password: 'not-the-password' });

    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail('ghost'), password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error).toBe(unknownEmail.body.error);
  });

  it('refuses a protected route with no token, a malformed token and a forged token', async () => {
    const none = await request(app).get('/api/v1/auth/me');
    const malformed = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer abc');
    const forged = await request(app)
      .get('/api/v1/auth/me')
      .set(
        'Authorization',
        'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIiwicm9sZSI6IkFETUlOIn0.notarealsignature',
      );

    expect(none.status).toBe(401);
    expect(malformed.status).toBe(401);
    expect(forged.status).toBe(401);
  });

  it('sets the refresh token as an httpOnly cookie rather than in the response body', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Cookie Person',
      email: uniqueEmail('cookie'),
      password: PASSWORD,
      workspaceName: 'Cookie Workspace',
    });

    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('forge_rt=') && /HttpOnly/i.test(c))).toBe(true);
    expect(res.body.refreshToken).toBeUndefined();
  });
});
