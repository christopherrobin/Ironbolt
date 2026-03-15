import { FastifyInstance } from 'fastify';
import { registerSchema, loginSchema, tokenResponseSchema } from '../schemas/auth.js';
import { errorResponseSchema } from '../schemas/common.js';
import { toJsonSchema } from '../lib/zod-to-json.js';
import * as authService from '../services/auth.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', {
    schema: {
      body: toJsonSchema(registerSchema),
      response: {
        201: toJsonSchema(tokenResponseSchema),
        409: toJsonSchema(errorResponseSchema),
      },
    },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const body = registerSchema.parse(request.body);
      const result = await authService.register(body);
      return reply.code(201).send(result);
    },
  });

  app.post('/auth/login', {
    schema: {
      body: toJsonSchema(loginSchema),
      response: {
        200: toJsonSchema(tokenResponseSchema),
        401: toJsonSchema(errorResponseSchema),
      },
    },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: async (request) => {
      const body = loginSchema.parse(request.body);
      return authService.login(body);
    },
  });
}
