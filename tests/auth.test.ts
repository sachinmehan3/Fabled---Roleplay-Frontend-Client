import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// auth.ts writes beside the rest of the data, so point it somewhere disposable.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabled-auth-'));
process.env.RP_DATA_DIR = dir;
const auth = await import('../server/auth.ts');

after(() => fs.rmSync(dir, { recursive: true, force: true }));

// ---------- passwords ----------

test('a password verifies, and a wrong one does not', async () => {
  const record = await auth.hashPassword('correct horse battery');
  assert.equal(await auth.verifyPassword('correct horse battery', record), true);
  assert.equal(await auth.verifyPassword('correct horse batterx', record), false);
  assert.equal(await auth.verifyPassword('', record), false);
});

test('the same password hashes differently each time', async () => {
  const a = await auth.hashPassword('same password');
  const b = await auth.hashPassword('same password');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});

test('the stored record never contains the password', async () => {
  const record = await auth.hashPassword('hunter2hunter2');
  assert.ok(!JSON.stringify(record).includes('hunter2'));
});

test('differently composed accents count as the same password', async () => {
  const record = await auth.hashPassword('café-password'); // é as one code point
  assert.equal(await auth.verifyPassword('café-password', record), true); // e + combining accent
});

test('weak and oversized passwords are refused', () => {
  assert.ok(auth.passwordProblem('short'));
  assert.ok(auth.passwordProblem(undefined));
  assert.ok(auth.passwordProblem('x'.repeat(2000)));
  assert.equal(auth.passwordProblem('long enough'), null);
});

test('setting a password configures the server', async () => {
  assert.equal(auth.isConfigured(), false);
  assert.equal(await auth.checkPassword('anything at all'), false, 'nothing can match before one exists');

  await auth.setPassword('my real password');
  assert.equal(auth.isConfigured(), true);
  assert.equal(await auth.checkPassword('my real password'), true);
  assert.equal(await auth.checkPassword('not my password'), false);
  assert.equal(await auth.checkPassword(12345), false);
});

test('setPassword refuses a weak password rather than storing it', async () => {
  await assert.rejects(() => auth.setPassword('tiny'), /at least/);
  assert.equal(await auth.checkPassword('my real password'), true, 'the old one still stands');
});

// ---------- sessions ----------

test('a new session is valid, and a made-up one is not', () => {
  const token = auth.createSession();
  assert.equal(auth.validSession(token), true);
  assert.equal(auth.validSession('not-a-real-token'), false);
  assert.equal(auth.validSession(undefined), false);
  assert.equal(auth.validSession(''), false);
});

test('session tokens are never written to disk', () => {
  const token = auth.createSession();
  const stored = fs.readFileSync(path.join(dir, 'sessions.json'), 'utf8');
  assert.ok(!stored.includes(token), 'only a hash of the token may be stored');
});

test('a session expires', () => {
  const now = Date.now();
  const token = auth.createSession(now);
  const later = now + auth.SESSION_MAX_AGE_S * 1000 + 1;
  assert.equal(auth.validSession(token, now + 1000), true);
  assert.equal(auth.validSession(token, later), false);
});

test('signing out ends only that session', () => {
  const mine = auth.createSession();
  const other = auth.createSession();
  auth.revokeSession(mine);
  assert.equal(auth.validSession(mine), false);
  assert.equal(auth.validSession(other), true);
});

test('signing out everywhere can keep the current device', () => {
  const here = auth.createSession();
  const phone = auth.createSession();
  const laptop = auth.createSession();
  auth.revokeAllSessions(here);
  assert.equal(auth.validSession(here), true);
  assert.equal(auth.validSession(phone), false);
  assert.equal(auth.validSession(laptop), false);
});

test('an absurdly long token is rejected without work', () => {
  assert.equal(auth.validSession('x'.repeat(10_000)), false);
});

// ---------- first run ----------

test('the setup code must match exactly, and only while issued', () => {
  assert.equal(auth.setupCodeMatches('ANYTHING'), false, 'no code has been issued');
  const code = auth.issueSetupCode();
  assert.equal(auth.setupCodeMatches(code), true);
  assert.equal(auth.setupCodeMatches(code.toLowerCase()), true, 'case does not matter');
  assert.equal(auth.setupCodeMatches(` ${code} `), true, 'stray spaces do not matter');
  assert.equal(auth.setupCodeMatches('000000000000'), false);
  assert.equal(auth.setupCodeMatches(''), false);
  assert.equal(auth.setupCodeMatches(null), false);

  auth.consumeSetupCode();
  assert.equal(auth.setupCodeMatches(code), false, 'a used code cannot be used again');
});

// ---------- guessing ----------

test('an address is blocked after too many failures, then forgiven', () => {
  const limiter = new auth.RateLimiter(3, 60_000);
  const t = 1_000_000;
  for (let i = 0; i < 3; i++) {
    assert.equal(limiter.blocked('1.2.3.4', t), false);
    limiter.fail('1.2.3.4', t);
  }
  assert.equal(limiter.blocked('1.2.3.4', t), true);
  assert.ok(limiter.retryAfter('1.2.3.4', t) > 0);
  assert.equal(limiter.blocked('5.6.7.8', t), false, 'other addresses are unaffected');
  assert.equal(limiter.blocked('1.2.3.4', t + 60_001), false, 'the window passes');
});

test('a successful sign-in clears the slate', () => {
  const limiter = new auth.RateLimiter(3, 60_000);
  limiter.fail('ip');
  limiter.fail('ip');
  limiter.forgive('ip');
  limiter.fail('ip');
  limiter.fail('ip');
  assert.equal(limiter.blocked('ip'), false);
});

// ---------- cookies ----------

test('the session cookie is locked down', () => {
  const cookie = auth.sessionCookie('abc', false);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  assert.ok(!cookie.includes('Secure'), 'plain http cannot use a Secure cookie');
  assert.match(auth.sessionCookie('abc', true), /Secure/);
});

test('a cleared cookie expires at once', () => {
  assert.match(auth.clearedCookie(false), /Max-Age=0/);
});

test('cookies are read out of a real header', () => {
  const header = 'theme=dark; fabled_session=tok%2Ben; other=1';
  assert.equal(auth.readCookie(header, 'fabled_session'), 'tok+en');
  assert.equal(auth.readCookie(header, 'missing'), undefined);
  assert.equal(auth.readCookie(undefined, 'fabled_session'), undefined);
  assert.equal(auth.readCookie('fabled_session_old=x', 'fabled_session'), undefined, 'a longer name is not a match');
});
