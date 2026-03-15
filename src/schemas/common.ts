import { z } from 'zod';

export const errorResponseSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
});

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number(),
});
