import type { LightMyRequestResponse } from 'fastify';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

import { buildApp } from '../app.js';
import { prisma } from '../db/client.js';
import {
  _resetBatchRegistryForTests,
  registerBatchResource,
} from '../batch/registry.js';
import { z } from 'zod';

const TOKEN = 'test-batch-token-of-sufficient-length-for-timing-safe-eq';

interface BatchAcceptedItem {
  idempotencyKey: string;
  id: string;
}
interface BatchRejectedItem {
  idempotencyKey: string;
  reason: 'duplicate' | 'validation_error' | 'internal_error';
  detail?: string;
}
interface BatchResponse {
  accepted: BatchAcceptedItem[];
  rejected: BatchRejectedItem[];
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
    console.warn('Skipping batch tests: PostgreSQL not available at DATABASE_URL');
  }
});

beforeEach(async (ctx) => {
  if (!dbAvailable) ctx.skip();

  await prisma.sample.deleteMany();

  // Reset and re-register `sample` with our test-only schema and token.
  // Resetting isolates each test from accidental cross-registrations and
  // avoids depending on the runtime env-var value during test runs.
  _resetBatchRegistryForTests();
  registerBatchResource('sample', {
    prismaModel: 'sample',
    itemSchema: z.object({ payload: z.record(z.string(), z.unknown()) }),
    serviceTokenEnv: 'BATCH_TOKEN_SAMPLE_TEST',
  });
  process.env.BATCH_TOKEN_SAMPLE_TEST = TOKEN;

  app = await buildApp();
});

afterEach(async () => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- app may be unset when beforeEach skips via ctx.skip()
  if (app) await app.close();
});

function post(
  payload: object,
  headers: Record<string, string> = {},
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url: '/sample/batch',
    headers: { authorization: `Bearer ${TOKEN}`, ...headers },
    payload,
  });
}

describe('POST /:resource/batch — happy path', () => {
  it('accepts a mixed batch and returns one accepted per item', async () => {
    const response = await post({
      items: [
        { idempotencyKey: 'k1', data: { payload: { x: 1 } } },
        { idempotencyKey: 'k2', data: { payload: { x: 2 } } },
      ],
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<BatchResponse>();
    expect(body.rejected).toEqual([]);
    expect(body.accepted).toHaveLength(2);
    expect(body.accepted.map((a) => a.idempotencyKey).sort()).toEqual(['k1', 'k2']);
    expect(body.accepted.every((a) => typeof a.id === 'string' && a.id.length > 0)).toBe(true);

    const rows = await prisma.sample.findMany({ orderBy: { idempotencyKey: 'asc' } });
    expect(rows).toHaveLength(2);
  });
});

describe('POST /:resource/batch — idempotency', () => {
  it('rejects a re-sent key as duplicate (first write wins)', async () => {
    const first = await post({
      items: [{ idempotencyKey: 'dup1', data: { payload: { v: 'original' } } }],
    });
    expect(first.statusCode).toBe(200);
    expect(first.json<BatchResponse>().accepted).toHaveLength(1);

    const second = await post({
      items: [{ idempotencyKey: 'dup1', data: { payload: { v: 'changed' } } }],
    });
    expect(second.statusCode).toBe(200);
    const body = second.json<BatchResponse>();
    expect(body.accepted).toEqual([]);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0]).toMatchObject({
      idempotencyKey: 'dup1',
      reason: 'duplicate',
    });

    // First write wins — no mutation.
    const row = await prisma.sample.findUnique({ where: { idempotencyKey: 'dup1' } });
    expect(row?.payload).toEqual({ v: 'original' });
  });

  it('detects duplicates within the same batch', async () => {
    const response = await post({
      items: [
        { idempotencyKey: 'samebatch', data: { payload: { x: 1 } } },
        { idempotencyKey: 'samebatch', data: { payload: { x: 2 } } },
      ],
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<BatchResponse>();
    expect(body.accepted).toHaveLength(1);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0]?.reason).toBe('duplicate');
  });
});

describe('POST /:resource/batch — per-item failures', () => {
  it('classifies a Zod failure as validation_error', async () => {
    const response = await post({
      items: [{ idempotencyKey: 'bad1', data: { payload: 'not-an-object' } }],
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<BatchResponse>();
    expect(body.accepted).toEqual([]);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0]?.reason).toBe('validation_error');
    expect(body.rejected[0]?.detail).toBeTypeOf('string');
  });

  it('continues processing other items when one fails validation', async () => {
    const response = await post({
      items: [
        { idempotencyKey: 'ok1', data: { payload: { x: 1 } } },
        { idempotencyKey: 'bad2', data: { payload: 'not-an-object' } },
        { idempotencyKey: 'ok2', data: { payload: { x: 2 } } },
      ],
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<BatchResponse>();
    expect(body.accepted.map((a) => a.idempotencyKey).sort()).toEqual(['ok1', 'ok2']);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0]?.idempotencyKey).toBe('bad2');
  });
});

describe('POST /:resource/batch — envelope failures', () => {
  it('returns 400 for a malformed envelope (no items)', async () => {
    const response = await post({ nope: true });
    expect(response.statusCode).toBe(400);
    const body = response.json<ErrorResponse>();
    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('Bad Request');
  });

  it('returns 400 when items exceeds the batch cap', async () => {
    const items = Array.from({ length: 201 }, (_, i) => ({
      idempotencyKey: `k${String(i)}`,
      data: { payload: { i } },
    }));
    const response = await post({ items });
    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when items is empty', async () => {
    const response = await post({ items: [] });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /:resource/batch — auth and routing', () => {
  it('returns 401 without a bearer token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/sample/batch',
      payload: { items: [{ idempotencyKey: 'noauth', data: { payload: {} } }] },
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 401 with an invalid bearer token', async () => {
    const response = await post(
      { items: [{ idempotencyKey: 'wrongauth', data: { payload: {} } }] },
      { authorization: 'Bearer wrong-token-of-the-correct-length-for-cmp-safe' },
    );
    expect(response.statusCode).toBe(401);
  });

  it('returns 404 for an unregistered resource', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/nonexistent/batch',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { items: [{ idempotencyKey: 'x', data: {} }] },
    });
    expect(response.statusCode).toBe(404);
  });
});
