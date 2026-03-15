import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';
import { signToken } from '../lib/jwt.js';
import { Conflict, Unauthorized } from '../lib/errors.js';
import type { RegisterInput, LoginInput } from '../schemas/auth.js';

const SALT_ROUNDS = 12;

// Pre-hashed dummy value for constant-time login (prevents timing-based user enumeration)
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', SALT_ROUNDS);

async function issueToken(user: { id: string; email: string }) {
  const token = await signToken({ sub: user.id, email: user.email });
  return { token };
}

export async function register(input: RegisterInput) {
  const hash = await bcrypt.hash(input.password, SALT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: { email: input.email, password: hash },
    });
    return await issueToken(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new Conflict('Email already registered');
    }
    throw err;
  }
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Always run bcrypt.compare to prevent timing-based user enumeration
  const hash = user?.password ?? DUMMY_HASH;
  const valid = await bcrypt.compare(input.password, hash);

  if (!user || !valid) {
    throw new Unauthorized('Invalid credentials');
  }

  return issueToken(user);
}
