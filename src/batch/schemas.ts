import { z } from 'zod';

/**
 * Upper bound on the number of items in a single batch request. Keeps
 * payload sizes <2 MB and bounds per-request DB load. Forks that need
 * more should raise this with care — `Promise.allSettled` over N rows
 * runs N upserts against the DB.
 */
export const BATCH_MAX_ITEMS = 200;

/**
 * Per-item envelope. The `data` field is validated against each
 * resource's `itemSchema` inside the handler (not here) — at envelope
 * level we only care that `data` is an object.
 */
const batchItemEnvelopeSchema = z.object({
  idempotencyKey: z.string().min(1).max(255),
  data: z.unknown(),
});

/**
 * Request envelope for `POST /:resource/batch`.
 */
export const batchRequestSchema = z.object({
  items: z
    .array(batchItemEnvelopeSchema)
    .min(1, 'items must contain at least 1 entry')
    .max(
      BATCH_MAX_ITEMS,
      `items must contain at most ${String(BATCH_MAX_ITEMS)} entries`,
    ),
});

export type BatchRequest = z.infer<typeof batchRequestSchema>;

/**
 * Response shape — matches verbatim the contract validated by
 * Harvester-Kit's `batchResponseSchema` at
 * `~/Code/Harvester-Kit/src/sinks/batch-api-sink.ts:12-26`.
 *
 * `accepted[]`: items that produced a new row.
 * `rejected[]`: items that did NOT produce a new row, with a `reason`
 * Harvester-Kit's parser understands:
 *   - `'duplicate'`         — idempotencyKey already exists; counted as
 *                             success client-side (first write wins,
 *                             second write drops).
 *   - `'validation_error'`  — Zod parse failed on the per-item schema.
 *   - `'internal_error'`    — anything else (Prisma error, DB outage
 *                             at the row level, programmer error).
 */
export const batchAcceptedItemSchema = z.object({
  idempotencyKey: z.string(),
  id: z.string(),
});

export const batchRejectedItemSchema = z.object({
  idempotencyKey: z.string(),
  reason: z.enum(['duplicate', 'validation_error', 'internal_error']),
  detail: z.string().optional(),
});

export const batchResponseSchema = z.object({
  accepted: z.array(batchAcceptedItemSchema),
  rejected: z.array(batchRejectedItemSchema),
});

export type BatchAcceptedItem = z.infer<typeof batchAcceptedItemSchema>;
export type BatchRejectedItem = z.infer<typeof batchRejectedItemSchema>;
export type BatchResponse = z.infer<typeof batchResponseSchema>;
