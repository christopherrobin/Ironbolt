import { FastifyRequest } from 'fastify';
import { verifyToken, type JwtPayload } from '../lib/jwt.js';
import { Unauthorized } from '../lib/errors.js';

export async function authenticate(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new Unauthorized('Missing token');
  }

  try {
    const token = header.slice(7);
    request.user = await verifyToken(token);
  } catch {
    throw new Unauthorized('Invalid token');
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}
