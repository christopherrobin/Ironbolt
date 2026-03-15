# Ironbolt ⚡

Fast, type-safe API in a box. Clone it, connect a database, add your endpoints, ship it.

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?style=for-the-badge&logo=fastify&logoColor=white)](https://fastify.dev/)
[![Zod](https://img.shields.io/badge/Zod-4-3E67B1?style=for-the-badge)](https://zod.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0-6BA539?style=for-the-badge&logo=openapiinitiative&logoColor=white)](https://swagger.io/specification/)

## Why Ironbolt?

Every time you need an API for a client project, a side project, or a prototype, you either start from scratch or wrestle with a bloated boilerplate. Ironbolt is the middle ground: opinionated enough to be useful, minimal enough to understand in an afternoon.

- **Type-safe end-to-end.** Zod schemas are the single source of truth for validation, TypeScript types, and OpenAPI spec generation. Consumers generate fully typed clients from your running API with a single command.
- **Auth out of the box.** JWT registration and login with bcrypt hashing, timing-safe comparisons, rate limiting, and centralized error handling.
- **OpenAPI for free.** Every endpoint you add automatically appears in the generated spec and Swagger UI.
- **Production-ready defaults.** Global error handler that hides internals in production, env validation at startup, graceful shutdown, and Swagger UI disabled in production.

## Stack

**Core:** Fastify 5, TypeScript (strict), Zod 4, Prisma 7, PostgreSQL

**Auth:** jose (JWT), bcryptjs (password hashing), @fastify/rate-limit

**API docs:** @fastify/swagger + Swagger UI, auto-generated OpenAPI 3.0 spec

**Quality:** Vitest, ESLint (strictTypeChecked), Prettier

**Infra:** @t3-oss/env-core (env validation), @fastify/error (typed errors), Pino (logging), Railway (deployment, no Docker)

## Quick Start

```bash
git clone https://github.com/christopherrobin/Ironbolt.git
cd Ironbolt
npm install

cp .env.example .env
# Edit .env with your database URL and JWT secret

npm run db:generate
npm run db:push
npm run dev
```

The API starts at `http://localhost:3000`. Swagger UI is at `http://localhost:3000/docs`.

## Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/auth/register` | Create account, returns JWT | No |
| `POST` | `/auth/login` | Login, returns JWT | No |
| `GET` | `/health` | Health check | No |
| `GET` | `/docs` | Swagger UI (dev only) | No |
| `GET` | `/docs/json` | OpenAPI JSON spec | No |

Protected routes use the `Authorization: Bearer <token>` header with the `authenticate` middleware.

## Adding a New Endpoint

```
1. Define your Zod schema       →  src/schemas/
2. Write your service            →  src/services/
3. Create the route              →  src/routes/     (use toJsonSchema() for OpenAPI)
4. Register the route            →  src/app.ts
```

The OpenAPI spec updates automatically. Frontend consumers generate types with:

```bash
npx openapi-typescript http://localhost:3000/docs/json -o ./types/api.ts
```

## Project Structure

```
src/
  app.ts                # Fastify setup, plugins, error handler, routes
  index.ts              # Entry point, graceful shutdown
  env.ts                # Zod-validated environment variables
  db/client.ts          # Prisma client
  lib/
    jwt.ts              # JWT sign/verify (jose)
    errors.ts           # Centralized error types (@fastify/error)
    zod-to-json.ts      # Zod → OpenAPI JSON Schema
  middleware/auth.ts     # Bearer token authentication
  routes/               # Route handlers
  schemas/              # Zod schemas (source of truth)
  services/             # Business logic
prisma/
  schema.prisma         # Database schema
```

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled output |
| `npm test` | Run tests (Vitest) |
| `npm run lint` | Lint with ESLint (`strictTypeChecked`) |
| `npm run format` | Format with Prettier |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to database |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:studio` | Open Prisma Studio |

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | Secret for signing JWTs (min 32 chars) | Yes |
| `PORT` | Server port (default: `3000`) | No |
| `CORS_ORIGIN` | Allowed origin(s) for CORS: single URL, comma-separated, or `*` (default: `http://localhost:5173`) | No |
| `NODE_ENV` | `development`, `production`, or `test` (default: `development`) | No |

All env vars are validated at startup with Zod via `@t3-oss/env-core`. If anything is missing or invalid, the app fails fast with a clear error.

## Security

- **Passwords.** bcrypt with 12 salt rounds, capped at 72 characters.
- **JWTs.** 1 hour expiration, HS256 signing. Implement a refresh token mechanism for production.
- **Rate limiting.** 100 req/min global, 10 req/min on auth endpoints.
- **Timing attacks.** Constant-time bcrypt comparison prevents user enumeration.
- **Error handling.** Global error handler hides internal details in production.
- **Env validation.** Rejects the default placeholder JWT secret at startup.

## Deployment

Designed for Railway. Deploy both the API and PostgreSQL database. No Docker required. Set the environment variables in the Railway dashboard and it runs.

## License

[MIT](LICENSE)
