import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../db/client.js';

interface TokenResponse {
  token: string;
}

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
}

let app: Awaited<ReturnType<typeof buildApp>>;
let dbAvailable = false;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('Skipping auth tests: PostgreSQL not available at DATABASE_URL');
  }
});

beforeEach(async (ctx) => {
  if (!dbAvailable) ctx.skip();
  await prisma.user.deleteMany();
  app = await buildApp();
});

afterEach(async () => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- app may be unset when beforeEach skips via ctx.skip()
  if (app) await app.close();
});

describe('POST /auth/register', () => {
  it('returns 201 with token on success', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'test@example.com', password: 'password123' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<TokenResponse>();
    expect(body.token).toBeTypeOf('string');
  });

  it('returns 409 when email already registered', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'dupe@example.com', password: 'password123' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'dupe@example.com', password: 'password456' },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json<ErrorResponse>();
    expect(body.message).toBe('Email already registered');
  });

  it('returns 400 when password is too short', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'test@example.com', password: 'short' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    if (!dbAvailable) return;
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'user@example.com', password: 'password123' },
    });
  });

  it('returns 200 with token on valid credentials', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@example.com', password: 'password123' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<TokenResponse>();
    expect(body.token).toBeTypeOf('string');
  });

  it('returns 401 on wrong password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@example.com', password: 'wrongpassword' },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json<ErrorResponse>();
    expect(body.message).toBe('Invalid credentials');
  });

  it('returns 401 on non-existent email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: 'password123' },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json<ErrorResponse>();
    expect(body.message).toBe('Invalid credentials');
  });

  it('returns 400 when password is empty', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@example.com', password: '' },
    });

    expect(response.statusCode).toBe(400);
  });
});
