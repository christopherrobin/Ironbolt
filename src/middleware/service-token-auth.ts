import { timingSafeEqual } from 'node:crypto';
import { FastifyRequest } from 'fastify';
import { Unauthorized } from '../lib/errors.js';

/**
 * Factory that returns a Fastify preHandler gating a route to a service
 * presenting a shared secret as a Bearer token.
 *
 * Use for any service-to-service auth scenario: webhook receivers,
 * cron-triggered internal services, harvesters POSTing scraped data,
 * admin tools with a shared secret, etc.
 *
 * Comparison uses crypto.timingSafeEqual so the auth check itself
 * doesn't leak token length or contents via timing.
 *
 * Does NOT decorate request.user — services aren't users (that pattern
 * lives in src/middleware/auth.ts for end-user JWT auth).
 *
 * Usage:
 *   import { requireServiceToken } from '../middleware/service-token-auth.js'
 *   import { env } from '../env.js'
 *
 *   app.post('/items/batch', {
 *     preHandler: requireServiceToken(env.MY_SERVICE_TOKEN),
 *     schema: { ... },
 *     handler: async (request) => { ... }
 *   })
 *
 * The factory takes the expected token as a parameter so consumers
 * configure their own env var name; this file does not reference any
 * specific env var.
 */
export function requireServiceToken(
  expectedToken: string,
): (request: FastifyRequest) => Promise<void> {
  const expected = Buffer.from(expectedToken);

  return async (request: FastifyRequest): Promise<void> => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new Unauthorized('Missing token');
    }

    const presented = Buffer.from(header.slice(7));

    // timingSafeEqual throws on length mismatch; bail early so the
    // mismatch path stays constant-time relative to itself.
    if (presented.length !== expected.length) {
      throw new Unauthorized('Invalid token');
    }

    if (!timingSafeEqual(presented, expected)) {
      throw new Unauthorized('Invalid token');
    }
  };
}
