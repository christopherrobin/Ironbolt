import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import { prisma } from '../db/client.js';
import type { BatchResourceConfig } from './registry.js';
import {
  batchRequestSchema,
  type BatchAcceptedItem,
  type BatchRejectedItem,
  type BatchResponse,
} from './schemas.js';

/**
 * Per-row concurrency cap. Each batch item runs an independent Prisma
 * `create()`; the cap keeps DB pool pressure bounded when a 200-item
 * batch lands. Override via `BATCH_CONCURRENCY` env var.
 *
 * Resolved once at module load — the value can't meaningfully change
 * mid-process and per-request `Number.parseInt` calls are wasted work.
 */
const DEFAULT_CONCURRENCY = 8;
const CONCURRENCY: number = (() => {
  const raw = process.env.BATCH_CONCURRENCY;
  if (!raw) return DEFAULT_CONCURRENCY;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_CONCURRENCY;
  return parsed;
})();

/**
 * Max length of the `detail` string included in `internal_error`
 * responses. Surfaces enough to debug while avoiding leaking long SQL
 * or stack snippets back to the scraper.
 */
const DETAIL_MAX_LENGTH = 200;

/**
 * Names of the idempotency column / field that count as "this row was
 * already accepted" for the duplicate-detection path. Both forms are
 * accepted because Prisma reports `target` differently across
 * databases — Postgres uses the snake-cased column name from `@map`,
 * SQLite/MySQL sometimes report the Prisma field name.
 *
 * Exact match only — a future model that adds a second unique column
 * (e.g. composite unique with `tenant_id`) will NOT be silently
 * classified as duplicate. That row will land in `internal_error`
 * with `detail`, which is the right signal to the operator.
 */
const IDEMPOTENCY_TARGETS = new Set(['idempotency_key', 'idempotencyKey']);

function truncateDetail(message: string): string {
  if (message.length <= DETAIL_MAX_LENGTH) return message;
  return message.slice(0, DETAIL_MAX_LENGTH - 1) + '…';
}

/**
 * Extract the list of columns/fields that produced a P2002 collision,
 * normalised to a string array. Returns `null` if the error doesn't
 * carry constraint info.
 *
 * Prisma 7 reports unique-constraint violations in two different
 * shapes depending on driver:
 *   1. Legacy / native client: `meta.target` is `string | string[]`.
 *   2. Driver-adapter (e.g. `@prisma/adapter-pg`, which this template
 *      uses):
 *        `meta.driverAdapterError.cause.constraint.fields: string[]`
 *
 * Both are supported so the kit works regardless of whether a fork
 * sticks with the adapter pattern or swaps to the native client.
 */
function extractP2002Fields(meta: unknown): string[] | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;

  // Driver-adapter shape (Prisma 7 + @prisma/adapter-pg).
  const adapterErr = m.driverAdapterError;
  if (adapterErr && typeof adapterErr === 'object') {
    const cause = (adapterErr as { cause?: unknown }).cause;
    if (cause && typeof cause === 'object') {
      const constraint = (cause as { constraint?: unknown }).constraint;
      if (constraint && typeof constraint === 'object') {
        const fields = (constraint as { fields?: unknown }).fields;
        if (Array.isArray(fields) && fields.every((f) => typeof f === 'string')) {
          return fields;
        }
      }
    }
  }

  // Legacy `meta.target` shape.
  const target = m.target;
  if (typeof target === 'string') return [target];
  if (Array.isArray(target) && target.every((t) => typeof t === 'string')) {
    return target;
  }

  return null;
}

/**
 * True iff the error is a Prisma unique-constraint violation on the
 * `idempotencyKey` column (or its snake-cased `@map`) — i.e. the row
 * was already accepted by an earlier (possibly concurrent) request.
 *
 * Exact match against {@link IDEMPOTENCY_TARGETS} only — a collision
 * on any other unique column in a fork's model is intentionally
 * classified as `internal_error` so the operator sees it instead of
 * silently treating it as a successful re-send. A composite-unique
 * collision (>1 field) is also intentionally NOT treated as duplicate.
 */
export function isDuplicateKeyError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== 'P2002') return false;
  const fields = extractP2002Fields(err.meta);
  if (!fields) return false;
  const first = fields[0];
  return fields.length === 1 && first !== undefined && IDEMPOTENCY_TARGETS.has(first);
}

type ItemOutcome =
  | { kind: 'accepted'; entry: BatchAcceptedItem }
  | { kind: 'rejected'; entry: BatchRejectedItem };

interface RawItem {
  idempotencyKey: string;
  data: unknown;
}

async function processItem(
  item: RawItem,
  config: BatchResourceConfig,
): Promise<ItemOutcome> {
  let parsedData: Record<string, unknown>;
  try {
    parsedData = config.itemSchema.parse(item.data) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        kind: 'rejected',
        entry: {
          idempotencyKey: item.idempotencyKey,
          reason: 'validation_error',
          detail: truncateDetail(
            err.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`).join('; '),
          ),
        },
      };
    }
    return {
      kind: 'rejected',
      entry: {
        idempotencyKey: item.idempotencyKey,
        reason: 'internal_error',
        detail: truncateDetail(err instanceof Error ? err.message : String(err)),
      },
    };
  }

  // Dynamic dispatch onto the Prisma client. The registry constrains
  // `prismaModel` to `keyof PrismaClient`, but the per-model delegate
  // types differ — we narrow via an interface that only requires what
  // we use (`create`). This is the documented dynamic-model escape
  // hatch when a registry table can't preserve specific model types.
  // Membership of the key on `keyof PrismaClient` is enforced at
  // registration time, so a runtime miss here is a programmer error.
  const delegate = (
    prisma as unknown as Record<
      string,
      { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }> }
    >
  )[config.prismaModel as string];

  // Defensive guard for a registry / generated-client mismatch — the
  // `keyof PrismaClient` constraint should make this unreachable, but
  // if a fork hand-edits the generated client or skips `prisma
  // generate`, we want a clear error instead of "Cannot read
  // properties of undefined".
  if (!delegate || typeof delegate.create !== 'function') {
    return {
      kind: 'rejected',
      entry: {
        idempotencyKey: item.idempotencyKey,
        reason: 'internal_error',
        detail: `Prisma model not found on client: ${String(config.prismaModel)}`,
      },
    };
  }

  try {
    const row = await delegate.create({
      data: { idempotencyKey: item.idempotencyKey, ...parsedData },
    });
    return {
      kind: 'accepted',
      entry: { idempotencyKey: item.idempotencyKey, id: row.id },
    };
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return {
        kind: 'rejected',
        entry: { idempotencyKey: item.idempotencyKey, reason: 'duplicate' },
      };
    }
    return {
      kind: 'rejected',
      entry: {
        idempotencyKey: item.idempotencyKey,
        reason: 'internal_error',
        detail: truncateDetail(err instanceof Error ? err.message : String(err)),
      },
    };
  }
}

/**
 * Run an async iterator of jobs with a fixed concurrency cap.
 *
 * Stays in-tree (no `p-limit` dep) — the implementation is small and
 * the only thing we need from a worker-pool helper is a fixed in-flight
 * count. Preserves input order in the output array.
 */
async function mapWithConcurrency<I, O>(
  items: readonly I[],
  limit: number,
  worker: (item: I, index: number) => Promise<O>,
): Promise<O[]> {
  const results = new Array<O>(items.length);
  let next = 0;

  async function run(): Promise<void> {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await worker(items[i] as I, i);
    }
  }

  const pool = Array.from({ length: Math.min(limit, items.length) }, () =>
    run(),
  );
  await Promise.all(pool);
  return results;
}

/**
 * Pure handler — validates the envelope, classifies each item, returns
 * the `{accepted, rejected}` response. Throws (caught by Fastify's
 * error handler) only for malformed envelopes (Zod 400) or whole-batch
 * infra failures bubbled up from outside (DB unreachable before any
 * row attempt). Per-item failures never throw.
 */
export async function processBatch(
  body: unknown,
  config: BatchResourceConfig,
): Promise<BatchResponse> {
  // Envelope-level validation: throws ZodError → Fastify error handler
  // turns it into a 400. Per the contract, 400 = malformed envelope
  // (programmer error, never retried by clients, never falls back).
  const parsed = batchRequestSchema.parse(body);

  const outcomes = await mapWithConcurrency(
    parsed.items,
    CONCURRENCY,
    (item) => processItem(item, config),
  );

  const accepted: BatchAcceptedItem[] = [];
  const rejected: BatchRejectedItem[] = [];
  for (const outcome of outcomes) {
    if (outcome.kind === 'accepted') accepted.push(outcome.entry);
    else rejected.push(outcome.entry);
  }

  return { accepted, rejected };
}
