import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

/**
 * These are integration tests, not unit tests.
 *
 * The behaviour worth protecting here is authorisation, and authorisation in
 * this application is a property of the request path as a whole: a token is
 * decoded by middleware, a workspace scope is applied inside a query, and a
 * role is checked on a route. A unit test of any one of those passes while the
 * combination is broken, which is exactly the failure this suite exists to
 * catch. Each test therefore drives the real Express app against a real
 * database.
 *
 * The cost is that a database is required to run them. That is the right trade:
 * a test that cannot observe a cross-workspace leak is not worth the seconds it
 * saves.
 */

export const app: Express = createApp();

export const PASSWORD = 'correct-horse-battery-staple';

export interface Actor {
  token: string;
  userId: string;
  workspaceId: string;
  email: string;
}

let counter = 0;

/** A unique address per call, so tests never collide on the unique email index. */
export function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}@test.local`;
}

export function bearer(actor: Actor): string {
  return `Bearer ${actor.token}`;
}

/**
 * Registers a user, which also creates a workspace with that user as its first
 * Administrator. Registration is the only way to obtain a workspace, so it is
 * also how a test obtains an isolated tenant of its own.
 */
export async function registerAdmin(prefix = 'admin'): Promise<Actor> {
  const email = uniqueEmail(prefix);
  counter += 1;
  const res = await request(app).post('/api/v1/auth/register').send({
    name: 'Test Administrator',
    email,
    password: PASSWORD,
    workspaceName: `Workspace ${counter}`,
  });

  if (res.status !== 201) {
    throw new Error(`registerAdmin failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    token: res.body.accessToken,
    userId: res.body.user.id,
    workspaceId: res.body.user.workspaceId,
    email,
  };
}

/**
 * Adds a second person to an existing workspace.
 *
 * This mirrors the real flow rather than inserting a membership directly: the
 * administrator invites an address, and the invited person then registers with
 * it and is joined automatically. Driving the same path the application uses is
 * the point — a fixture that reached around it would not notice if that path
 * broke.
 */
export async function addMember(
  admin: Actor,
  role: 'ADMIN' | 'MEMBER' = 'MEMBER',
): Promise<Actor> {
  const email = uniqueEmail('member');

  const invite = await request(app)
    .post('/api/v1/users')
    .set('Authorization', bearer(admin))
    .send({ name: 'Team Member', email, role });

  if (invite.status !== 201) {
    throw new Error(`addMember invite failed: ${invite.status} ${JSON.stringify(invite.body)}`);
  }

  const res = await request(app).post('/api/v1/auth/register').send({
    name: 'Team Member',
    email,
    password: PASSWORD,
    workspaceName: 'Ignored — the invitation wins',
  });

  if (res.status !== 201) {
    throw new Error(`addMember register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return {
    token: res.body.accessToken,
    userId: res.body.user.id,
    workspaceId: res.body.user.workspaceId,
    email,
  };
}

export async function createProject(actor: Actor, name = 'Test Project'): Promise<string> {
  const res = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', bearer(actor))
    .send({ name, description: 'Created by the test suite' });

  if (res.status !== 201) {
    throw new Error(`createProject failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.project.id;
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
