import { hash, verify } from '@node-rs/argon2';
import type { DbOrTx } from '../../db/client.js';
import type { UserRow } from '../../db/schema.js';
import { AppError } from '../../lib/errors.js';
import * as repo from './repository.js';

/** OWASP-recommended argon2id parameters (19 MiB, 2 iterations). Argon2id is the library default. */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/** Verified against when the email is unknown, so response time does not reveal registered emails. */
const DUMMY_HASH = await hash('timing-equaliser-password', ARGON2_OPTIONS);

export interface UserDto {
  id: string;
  email: string;
  name: string;
  timezone: string;
  isDemo: boolean;
  createdAt: string;
}

export function toUserDto(user: UserRow): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    isDemo: user.isDemo,
    createdAt: user.createdAt.toISOString(),
  };
}

export const normaliseEmail = (email: string) => email.trim().toLowerCase();

export const hashPassword = (password: string) => hash(password, ARGON2_OPTIONS);

export async function register(
  db: DbOrTx,
  input: { email: string; name: string; password: string; timezone?: string },
): Promise<UserRow> {
  const user = await repo.insertUser(db, {
    email: normaliseEmail(input.email),
    name: input.name.trim(),
    passwordHash: await hashPassword(input.password),
    timezone: input.timezone,
  });
  if (!user) throw new AppError('email_taken', 'An account with this email already exists');
  return user;
}

export async function login(
  db: DbOrTx,
  input: { email: string; password: string },
): Promise<UserRow> {
  const user = await repo.findUserByEmail(db, normaliseEmail(input.email));
  const valid = await verify(user?.passwordHash ?? DUMMY_HASH, input.password).catch(() => false);
  if (!user || !valid) throw new AppError('invalid_credentials', 'Email or password is incorrect');
  return user;
}

export async function getUser(db: DbOrTx, userId: string): Promise<UserRow> {
  const user = await repo.findUserById(db, userId);
  if (!user) throw new AppError('unauthorized', 'Account no longer exists');
  return user;
}

export async function updateProfile(
  db: DbOrTx,
  userId: string,
  patch: { name?: string; timezone?: string },
): Promise<UserRow> {
  const user = await repo.updateUser(db, userId, {
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
  });
  if (!user) throw new AppError('unauthorized', 'Account no longer exists');
  return user;
}

export async function setResume(db: DbOrTx, userId: string, text: string): Promise<string | null> {
  const trimmed = text.trim();
  const user = await repo.updateUser(db, userId, { resumeText: trimmed === '' ? null : trimmed });
  if (!user) throw new AppError('unauthorized', 'Account no longer exists');
  return user.resumeText;
}
