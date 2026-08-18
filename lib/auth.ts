import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDatabase } from "@/lib/db";
import type { Database } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { seedDefaultRoutinesInTransaction } from "@/lib/routine-service";
import { getServerTodayDate } from "@/lib/server-date";
import type { AuthUser } from "@/lib/types";

const SESSION_COOKIE = "routine_session";
const SESSION_DAYS = 30;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 256;

type DatabaseWriter = Pick<Database, "insert">;

export class AuthError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "AuthError";
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function validateCredentials(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new AuthError("有効なメールアドレスを入力してください。", 400);
  if (normalizedEmail.length > MAX_EMAIL_LENGTH) throw new AuthError("メールアドレスが長すぎます。", 400);
  if (password.length < 12) throw new AuthError("パスワードは12文字以上で入力してください。", 400);
  if (password.length > MAX_PASSWORD_LENGTH) throw new AuthError("パスワードが長すぎます。", 400);
  return normalizedEmail;
}

function deriveKey(password: string, salt: string, keyLength: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, { N: 32768, maxmem: 128 * 1024 * 1024, p: 1, r: 8 }, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey as Buffer);
    });
  });
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await deriveKey(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, storedHash: string) {
  const [, salt, expectedHex] = storedHash.split("$");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = await deriveKey(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

async function createSessionRecord(writer: DatabaseWriter, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await writer.insert(sessions).values({ id: randomUUID(), tokenHash: hashSessionToken(token), userId, expiresAt });
  return token;
}

async function createSession(userId: string) {
  const token = await createSessionRecord(getDatabase(), userId);
  await setSessionCookie(token);
}

export async function registerUser(email: string, password: string): Promise<AuthUser> {
  const normalizedEmail = validateCredentials(email, password);
  const db = getDatabase();
  const userId = randomUUID();
  const passwordHash = await hashPassword(password);
  const timestamp = new Date().toISOString();
  try {
    const sessionToken = await db.transaction(async (tx) => {
      await tx.insert(users).values({ id: userId, email: normalizedEmail, passwordHash, createdAt: timestamp });
      await seedDefaultRoutinesInTransaction(tx, userId, getServerTodayDate(), timestamp);
      return createSessionRecord(tx, userId);
    });
    await setSessionCookie(sessionToken);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") throw new AuthError("このメールアドレスはすでに登録されています。", 409);
    throw error;
  }
  return { id: userId, email: normalizedEmail };
}

export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const normalizedEmail = validateCredentials(email, password);
  const db = getDatabase();
  const [user] = await db.select({ id: users.id, email: users.email, passwordHash: users.passwordHash }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw new AuthError("メールアドレスまたはパスワードが正しくありません。", 401);
  await createSession(user.id);
  return { id: user.id, email: user.email };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDatabase();
  const [session] = await db
    .select({ userId: sessions.userId, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, new Date().toISOString())))
    .limit(1);
  if (!session) return null;
  return { id: session.userId, email: session.email };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("ログインが必要です。", 401);
  return user;
}

export async function logoutUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await getDatabase().delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
  cookieStore.delete(SESSION_COOKIE);
}

export async function removeExpiredSessions() {
  await getDatabase().delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString()));
}
