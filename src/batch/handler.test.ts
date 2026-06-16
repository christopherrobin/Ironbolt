import { Prisma } from '@prisma/client';
import { describe, it, expect } from 'vitest';

import { isDuplicateKeyError } from './handler.js';

// Helper to build a Prisma KnownRequestError without going through a
// live DB call. Mirrors Prisma's runtime shape; the constructor is
// public and stable.
function buildP2002(target: string | string[] | undefined): unknown {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: target === undefined ? undefined : { target },
  });
}

describe('isDuplicateKeyError', () => {
  it('returns false for non-Prisma errors', () => {
    expect(isDuplicateKeyError(new Error('boom'))).toBe(false);
    expect(isDuplicateKeyError('boom')).toBe(false);
    expect(isDuplicateKeyError(undefined)).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
  });

  it('returns false for Prisma errors with a non-P2002 code', () => {
    const err = new Prisma.PrismaClientKnownRequestError('foreign key', {
      code: 'P2003',
      clientVersion: 'test',
      meta: { target: 'idempotency_key' },
    });
    expect(isDuplicateKeyError(err)).toBe(false);
  });

  it('matches snake_case column name (Postgres convention)', () => {
    expect(isDuplicateKeyError(buildP2002('idempotency_key'))).toBe(true);
    expect(isDuplicateKeyError(buildP2002(['idempotency_key']))).toBe(true);
  });

  it('matches camelCase field name (some DB providers report this)', () => {
    expect(isDuplicateKeyError(buildP2002('idempotencyKey'))).toBe(true);
    expect(isDuplicateKeyError(buildP2002(['idempotencyKey']))).toBe(true);
  });

  it('does NOT match a composite unique that happens to include idempotencyKey', () => {
    // A future model with @@unique([idempotencyKey, tenantId]) would
    // report both columns. That's not a pure idempotency collision —
    // operator needs to see it as internal_error.
    expect(
      isDuplicateKeyError(buildP2002(['idempotency_key', 'tenant_id'])),
    ).toBe(false);
  });

  it('does NOT match a different unique column', () => {
    expect(isDuplicateKeyError(buildP2002('email'))).toBe(false);
    expect(isDuplicateKeyError(buildP2002(['email']))).toBe(false);
  });

  it('does NOT match when target is a substring (no fuzzy matching)', () => {
    // Guards against the prior implementation's `.includes()` substring
    // bug. A column named e.g. `idempotency_key_history` would have
    // matched under substring, but must NOT here.
    expect(isDuplicateKeyError(buildP2002('idempotency_key_history'))).toBe(
      false,
    );
    expect(isDuplicateKeyError(buildP2002(['my_idempotency_key']))).toBe(false);
  });

  it('returns false when meta.target is missing entirely', () => {
    expect(isDuplicateKeyError(buildP2002(undefined))).toBe(false);
  });
});
