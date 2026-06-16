#!/usr/bin/env tsx
/**
 * Boot the Fastify app, dump its generated OpenAPI spec to
 * `openapi.snapshot.json` at the repo root, exit. Used both by the
 * `yarn openapi:dump` developer command and the `yarn openapi:check`
 * CI step (which diffs the result against the committed file).
 *
 * Sets safe defaults for any env vars required to boot the app so the
 * dump works on a fresh clone before the developer has configured a
 * real `.env`. The spec content does not depend on env values — only
 * on the registered routes and schemas.
 *
 * Stripped from the snapshot:
 *   - `servers[]` block (dev URLs leak between machines)
 *   - any field that would otherwise change run-to-run
 *
 * Resources registered dynamically via `registerBatchResource()` are
 * already present in the spec because `src/batch/register.ts` runs as
 * a side-effect import from `src/app.ts`.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Defaults so booting the app doesn't fail env validation on a fresh
// checkout. None of these influence the OpenAPI output.
process.env.DATABASE_URL ??= 'postgresql://dump:dump@localhost:5432/dump';
process.env.JWT_SECRET ??=
  'openapi-dump-secret-that-is-at-least-32-characters-long';
process.env.NODE_ENV ??= 'development';
process.env.BATCH_TOKEN_SAMPLE ??= 'openapi-dump-sample-token';

const { buildApp } = await import('../src/app.js');

const app = await buildApp();
await app.ready();

const spec = app.swagger() as Record<string, unknown> & {
  servers?: unknown;
};

// Drop volatile fields so the snapshot diff stays stable across
// machines and CI runs.
delete spec.servers;

const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'openapi.snapshot.json',
);

writeFileSync(out, JSON.stringify(spec, null, 2) + '\n', 'utf8');

await app.close();

console.log(`Wrote ${out}`);
