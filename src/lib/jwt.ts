import * as jose from 'jose';
import { z } from 'zod';
import { env } from '../env.js';

const jwtPayloadSchema = z.object({
  sub: z.string(),
  email: z.email(),
});

export type JwtPayload = z.infer<typeof jwtPayloadSchema>;

const secret = new TextEncoder().encode(env.JWT_SECRET);

export async function signToken(payload: JwtPayload): Promise<string> {
  return new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jose.jwtVerify(token, secret);
  return jwtPayloadSchema.parse(payload);
}
