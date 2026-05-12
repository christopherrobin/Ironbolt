/**
 * Database seed script — runs via `npx prisma db seed` or auto-runs
 * after `npx prisma migrate dev` / `migrate reset`.
 *
 * Configured in `prisma.config.ts` under `migrations.seed`.
 *
 * NOTE: Prisma 7 requires the PrismaClient constructor to receive an
 * adapter (driver-adapter pattern). The same pattern is used in
 * `src/db/client.ts` — kept in sync here.
 *
 * Replace the no-op below with real seed data for your project.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // TODO: add seed data for your project. Examples:
  //
  //   await prisma.user.upsert({
  //     where: { email: "admin@example.com" },
  //     update: {},
  //     create: { email: "admin@example.com", password: "<bcrypt-hash>" },
  //   });
  //
  // Leave as a no-op if seeds aren't needed; Prisma will report
  // "🌱 The seed command has been executed."
  console.log("seed: no-op (template default)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
