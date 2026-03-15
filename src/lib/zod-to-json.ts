import { toJSONSchema, type ZodType } from 'zod';

export function toJsonSchema(schema: ZodType) {
  return toJSONSchema(schema, { target: 'openapi-3.0' });
}
