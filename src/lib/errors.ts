import createError from '@fastify/error';

export const Unauthorized = createError('APP_UNAUTHORIZED', '%s', 401);
export const Conflict = createError('APP_CONFLICT', '%s', 409);
export const NotFound = createError('APP_NOT_FOUND', '%s', 404);
export const BadRequest = createError('APP_BAD_REQUEST', '%s', 400);
export const Forbidden = createError('APP_FORBIDDEN', '%s', 403);
