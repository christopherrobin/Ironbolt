import type { ZodType } from 'zod';
import type { PrismaClient } from '@prisma/client';

import { prisma } from '../db/client.js';

/**
 * Configuration for a resource accepted by the generic
 * `POST /:resource/batch` endpoint.
 *
 * Forks add their own models to `prisma/schema.prisma` and call
 * {@link registerBatchResource} from `src/batch/register.ts` to make
 * them reachable. The kit itself ships only the `sample` demo so the
 * template is runnable out of the box.
 */
export interface BatchResourceConfig {
  /**
   * Property name on `PrismaClient` for the model — i.e. the lower-camel
   * model name. Example: `'sample'` for `model Sample {}`.
   *
   * Typed as `keyof PrismaClient` so the registry rejects names that
   * don't exist on the generated client.
   */
  prismaModel: keyof PrismaClient;

  /**
   * Per-item Zod schema for the `data` field of each batch entry.
   * The handler runs `itemSchema.parse(item.data)` on each row; failures
   * are classified as `validation_error` in the response.
   *
   * The shape returned by `parse` is spread into the Prisma `create()`
   * call, so the schema's output type must match the model's columns
   * (minus `id`, `idempotencyKey`, `createdAt`, `updatedAt`).
   */
  itemSchema: ZodType;

  /**
   * Name of the env var holding the service-to-service bearer token
   * for this resource. Convention: `BATCH_TOKEN_<UPPER_RESOURCE>`.
   *
   * The route's preHandler reads `process.env[serviceTokenEnv]` at
   * request time and compares against the presented Bearer in
   * timing-safe fashion (see `requireServiceToken`).
   *
   * If the env var is unset at request time the handler responds 500
   * — fail loud rather than silently accept unauthenticated writes.
   */
  serviceTokenEnv: string;
}

// In-process registry. Resource names are case-sensitive and must match
// the URL segment used in `POST /:resource/batch` (e.g. `sample`).
const registry = new Map<string, BatchResourceConfig>();

/**
 * Register a Prisma model as a batch-upsert target. Called from
 * `src/batch/register.ts` at module-load time (side-effect import from
 * `src/app.ts`). Throws if the same resource name is registered twice
 * — duplicate registration is a programmer error, not a runtime
 * scenario worth recovering from.
 */
export function registerBatchResource(
  resource: string,
  config: BatchResourceConfig,
): void {
  if (registry.has(resource)) {
    throw new Error(`Batch resource "${resource}" is already registered`);
  }
  registry.set(resource, config);
}

/**
 * Returns the config for a resource, or `undefined` if no such resource
 * is registered. The route uses `undefined` to drive a 404 response.
 */
export function getBatchResource(
  resource: string,
): BatchResourceConfig | undefined {
  return registry.get(resource);
}

/**
 * Names of every registered resource. Used by the OpenAPI dump script
 * to enumerate the dynamic `/:resource/batch` paths into concrete
 * static paths in the snapshot (so client codegen knows the surface).
 */
export function listBatchResources(): string[] {
  return [...registry.keys()];
}

/**
 * Test/dev helper: wipe the registry. Production code never calls this.
 * Exported so the route tests can isolate registrations per test.
 */
export function _resetBatchRegistryForTests(): void {
  registry.clear();
}

// Re-exported so consumers in `register.ts` don't have to import from
// two places. Same singleton used by the handler.
export { prisma };
