import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { processBatch } from '../batch/handler.js';
import { getBatchResource } from '../batch/registry.js';
import {
  batchRequestSchema,
  batchResponseSchema,
} from '../batch/schemas.js';
import { errorResponseSchema } from '../schemas/common.js';
import { toJsonSchema } from '../lib/zod-to-json.js';
import { requireServiceToken } from '../middleware/service-token-auth.js';
import { NotFound, Unauthorized } from '../lib/errors.js';

// OpenAPI param schema. Resource validity is enforced in the preHandler
// so 404 is raised before we attempt auth — `z.string()` here just
// documents the path parameter for client codegen.
const paramsSchema = z.object({ resource: z.string() });

interface BatchParams {
  resource: string;
}

export async function batchRoutes(app: FastifyInstance) {
  app.post<{ Params: BatchParams }>('/:resource/batch', {
    schema: {
      params: toJsonSchema(paramsSchema),
      body: toJsonSchema(batchRequestSchema),
      response: {
        200: toJsonSchema(batchResponseSchema),
        400: toJsonSchema(errorResponseSchema),
        401: toJsonSchema(errorResponseSchema),
        404: toJsonSchema(errorResponseSchema),
      },
    },
    // Rate limit: scrapers can burst high; per-IP cap keeps a runaway
    // client from saturating the API. Forks can override per-resource.
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    preHandler: async (request: FastifyRequest<{ Params: BatchParams }>) => {
      const { resource } = request.params;
      const config = getBatchResource(resource);
      if (!config) {
        throw new NotFound(`Unknown batch resource: ${resource}`);
      }
      // Per-request env read is intentional — lets operators rotate
      // BATCH_TOKEN_* values via a process-level secret update without
      // restarting the API. The cost is negligible against the Prisma
      // round-trips that follow.
      const token = process.env[config.serviceTokenEnv];
      if (!token) {
        // Fail loud — never accept a request against an unconfigured
        // resource. Returning 401 (not 500) means a misconfigured fork
        // looks the same to clients as a missing token.
        throw new Unauthorized(
          `Batch resource "${resource}" is not configured (set ${config.serviceTokenEnv})`,
        );
      }
      await requireServiceToken(token)(request);
    },
    handler: async (request) => {
      const { resource } = request.params;
      const config = getBatchResource(resource);
      // preHandler already 404'd unknown resources, so this is a
      // defensive guard against future re-ordering rather than a real
      // runtime path.
      if (!config) throw new NotFound(`Unknown batch resource: ${resource}`);
      return processBatch(request.body, config);
    },
  });
}
