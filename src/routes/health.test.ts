import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../app.js';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('returns status ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ status: string; uptime: number }>();
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeTypeOf('number');
  });
});
