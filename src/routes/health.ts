import { FastifyInstance } from 'fastify';
import { healthResponseSchema } from '../schemas/common.js';
import { toJsonSchema } from '../lib/zod-to-json.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', {
    schema: {
      response: { 200: toJsonSchema(healthResponseSchema) },
    },
    handler: async () => {
      return { status: 'ok' as const, uptime: process.uptime() };
    },
  });
}
