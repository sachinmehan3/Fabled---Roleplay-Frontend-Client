// Authentication: one password, many devices.
//
// The password is stored as a scrypt hash. Sessions are random tokens held in
// an HttpOnly cookie, and the server keeps only a SHA-256 of each one, so a
// copy of the data folder is not enough to sign in with.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { DATA_DIR } from './store.ts';

const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

export const SESSION_COOKIE = 'fabled_session';
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60; // 30 days
export const MIN_PASSWORD_LENGTH = 8;

// ~64 MiB and a noticeable fraction of a second per attempt: cheap for one
// person signing in, expensive for anyone guessing.
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64 };

type ScryptParams = typeof SCRYPT;
const scryptAsync = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

interface PasswordRecord extends ScryptParams {
  salt: string;
  hash: string;
}

interface SessionRecord {
  /** SHA-256 of the token, never the token itself. */
  id: string;
  created: number;
  expires: number;
}

// ---------- files ----------

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Atomic, and readable only by the account running the server where the OS allows it. */
function writeSecret(file: string, value: unknown) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// ---------- passwords ----------

function derive(password: string, salt: Buffer, params: ScryptParams) {
  // NFKC so the same password typed on two keyboards produces the same bytes.
  return scryptAsync(password.normalize('NFKC'), salt, params.keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 256 * 1024 * 1024,
  });
}

export async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = crypto.randomBytes(16);
  const hash = await derive(password, salt, SCRYPT);
  return { ...SCRYPT, salt: salt.toString('base64'), hash: hash.toString('base64') };
}

export async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  const expected = Buffer.from(record.hash, 'base64');
  const actual = await derive(password, Buffer.from(record.salt, 'base64'), record);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string') return 'A password is required.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 1024) return 'That password is too long.';
  return null;
}

export function isConfigured(): boolean {
  const record = readJson<Partial<PasswordRecord> | null>(AUTH_FILE, null);
  return !!record?.hash && !!record.salt;
}

export async function setPassword(password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  writeSecret(AUTH_FILE, await hashPassword(password));
}

export async function checkPassword(password: unknown): Promise<boolean> {
  if (typeof password !== 'string') return false;
  const record = readJson<PasswordRecord | null>(AUTH_FILE, null);
  if (!record) return false;
  return verifyPassword(password, record);
}

// ---------- sessions ----------

const digest = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

function liveSessions(now: number): SessionRecord[] {
  return readJson<SessionRecord[]>(SESSIONS_FILE, []).filter((s) => s.expires > now);
}

/** A new session. The token is returned once and kept nowhere on the server. */
export function createSession(now = Date.now()): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const sessions = liveSessions(now);
  sessions.push({ id: digest(token), created: now, expires: now + SESSION_MAX_AGE_S * 1000 });
  writeSecret(SESSIONS_FILE, sessions);
  return token;
}

export function validSession(token: string | undefined, now = Date.now()): boolean {
  if (!token || token.length > 256) return false;
  const id = Buffer.from(digest(token), 'hex');
  // Compare against every live session in constant time, rather than stopping at a match.
  let found = false;
  for (const s of liveSessions(now)) {
    const candidate = Buffer.from(s.id, 'hex');
    if (candidate.length === id.length && crypto.timingSafeEqual(candidate, id)) found = true;
  }
  return found;
}

export function revokeSession(token: string | undefined, now = Date.now()) {
  if (!token) return;
  const id = digest(token);
  writeSecret(
    SESSIONS_FILE,
    liveSessions(now).filter((s) => s.id !== id),
  );
}

/** Sign every device out, optionally keeping one. */
export function revokeAllSessions(except?: string, now = Date.now()) {
  const keep = except ? digest(except) : null;
  writeSecret(
    SESSIONS_FILE,
    liveSessions(now).filter((s) => s.id === keep),
  );
}

// ---------- first run ----------

let setupCode: string | null = null;

/**
 * Before a password exists, claiming the server needs a code that only the
 * person who can see its console has. Otherwise whoever reached an exposed
 * server first could make it theirs.
 */
export function issueSetupCode(): string {
  setupCode = crypto.randomBytes(6).toString('hex').toUpperCase();
  return setupCode;
}

export function setupCodeMatches(code: unknown): boolean {
  if (!setupCode || typeof code !== 'string') return false;
  const a = Buffer.from(code.trim().toUpperCase());
  const b = Buffer.from(setupCode);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function consumeSetupCode() {
  setupCode = null;
}

// ---------- slowing down guessing ----------

/** Failed attempts per address, forgiven after a quiet window. */
export class RateLimiter {
  private attempts = new Map<string, { count: number; resetAt: number }>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit = 5, windowMs = 15 * 60 * 1000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  blocked(key: string, now = Date.now()): boolean {
    const entry = this.attempts.get(key);
    if (!entry) return false;
    if (entry.resetAt <= now) {
      this.attempts.delete(key);
      return false;
    }
    return entry.count >= this.limit;
  }

  fail(key: string, now = Date.now()) {
    const entry = this.attempts.get(key);
    if (!entry || entry.resetAt <= now) this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
    else entry.count += 1;
  }

  forgive(key: string) {
    this.attempts.delete(key);
  }

  /** Seconds until the address may try again. */
  retryAfter(key: string, now = Date.now()): number {
    const entry = this.attempts.get(key);
    return entry ? Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) : 0;
  }
}

// ---------- cookies ----------

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at === -1) continue;
    if (part.slice(0, at).trim() === name) return decodeURIComponent(part.slice(at + 1).trim());
  }
  return undefined;
}

export function sessionCookie(token: string, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${SESSION_MAX_AGE_S}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function clearedCookie(secure: boolean): string {
  return [`${SESSION_COOKIE}=`, 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=0', ...(secure ? ['Secure'] : [])].join(
    '; ',
  );
}
