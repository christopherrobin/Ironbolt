import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Fastify, { FastifyError } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { env } from './env.js';
import { prisma } from './db/client.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { batchRoutes } from './routes/batch.js';
// Side-effect import: registers the demo `sample` resource so the
// template is runnable out of the box. Forks add their own
// `registerBatchResource()` calls in src/batch/register.ts.
import './batch/register.js';

// Read project metadata so OpenAPI title/description/version stay in sync
// with package.json — no fork has to remember to edit hardcoded strings.
const pkg: { name: string; version: string; description?: string } = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf-8'),
);

function parseCorsOrigin(value: string): boolean | string | string[] {
  if (value === '*') return true;
  if (value.includes(',')) return value.split(',').map((s) => s.trim());
  return value;
}

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.setErrorHandler((error: FastifyError | ZodError, request, reply) => {
    request.log.error(error);

    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: error.issues.map((e) => e.message).join(', '),
      });
    }

    const statusCode = error.statusCode ?? 500;
    const errorLabel = http.STATUS_CODES[statusCode] ?? 'Internal Server Error';

    const message = statusCode >= 500 && env.NODE_ENV === 'production' ? 'Internal Server Error' : error.message;

    return reply.status(statusCode).send({
      statusCode,
      error: errorLabel,
      message,
    });
  });

  // Graceful shutdown: disconnect Prisma when the server closes
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  await app.register(cors, {
    origin: parseCorsOrigin(env.CORS_ORIGIN),
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: pkg.name,
        description: pkg.description ?? '',
        version: pkg.version,
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  if (env.NODE_ENV !== 'production') {
    await app.register(swaggerUi, {
      routePrefix: '/docs',
    });
  }

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(batchRoutes);

  return app;
}
