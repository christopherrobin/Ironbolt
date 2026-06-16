import { z } from 'zod';

import { registerBatchResource } from './registry.js';

/**
 * Demo registration for the `Sample` model defined in
 * `prisma/schema.prisma`. Forks should add their own
 * `registerBatchResource(...)` calls here for each domain model.
 *
 * Keep this file pure side-effects — import it once from `app.ts`
 * before any route is registered.
 */

const sampleItemSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
});

registerBatchResource('sample', {
  prismaModel: 'sample',
  itemSchema: sampleItemSchema,
  serviceTokenEnv: 'BATCH_TOKEN_SAMPLE',
});
