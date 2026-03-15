import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    JWT_SECRET: z
      .string()
      .min(32, 'JWT_SECRET must be at least 32 characters')
      .refine((s) => s !== 'change-me-to-a-random-secret-that-is-at-least-32-chars', 'You must set a real JWT_SECRET'),
    PORT: z.coerce.number().default(3000),
    CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  },
  runtimeEnv: process.env,
});
