/**
 * Address verification: six digits, fifteen minutes, five attempts.
 */
import { confirmEmail, startEmailVerification, CODE_MAX_ATTEMPTS, CODE_TTL_SECONDS, CODE_RESEND_SECONDS } from '../../src/notify/verify';
import type { VerifyDeps } from '../../src/notify/verify';
import { getSettings } from '../../src/notify/repository';
import { putUser, waitForTestDb } from './helpers';

let db: any;
let clock = 1_800_000_000;
const sent: { to: string; text: string }[] = [];
const verifyDeps = (over: Partial<VerifyDeps> = {}): VerifyDeps => ({
  send: async (to, _s, text) => { sent.push({ to, text }); return { ok: true }; },
  now: () => clock, makeCode: () => '123456', bbsName: async () => 'Test BBS', ...over,
});

beforeAll(async () => { db = (await waitForTestDb()).db; }, 30000);
beforeEach(() => {
  db.exec('DELETE FROM notify_email_codes; DELETE FROM notify_settings');
  clock = 1_800_000_000; sent.length = 0;
  putUser(db, 'u1', 'sven@example.com');
});

test('a right code verifies the account address and is single use', async () => {
  const s = await startEmailVerification(db, 'u1', verifyDeps());
  expect(s).toMatchObject({ ok: true, email: 'sven@example.com' });
  expect(sent[0].to).toBe('sven@example.com');
  expect(sent[0].text).toContain('123456');
  expect(confirmEmail(db, 'u1', ' 123456 ', clock + 5)).toEqual({ ok: true, email: 'sven@example.com' });
  expect(getSettings(db, 'u1')).toMatchObject({ emailVerified: 'sven@example.com', emailVerifiedAt: clock + 5 });
  expect(confirmEmail(db, 'u1', '123456', clock + 6)).toEqual({ ok: false, reason: 'none' });
});

test('the code is stored hashed, never as typed', async () => {
  await startEmailVerification(db, 'u1', verifyDeps());
  const row = db.prepare('SELECT code_hash FROM notify_email_codes').get();
  expect(row.code_hash).not.toContain('123456');
  expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
});

test('a code is refused after fifteen minutes', async () => {
  await startEmailVerification(db, 'u1', verifyDeps());
  expect(confirmEmail(db, 'u1', '123456', clock + CODE_TTL_SECONDS - 1).ok).toBe(true);
  await startEmailVerification(db, 'u1', verifyDeps());
  db.exec('DELETE FROM notify_settings');
  expect(confirmEmail(db, 'u1', '123456', clock + CODE_TTL_SECONDS)).toEqual({ ok: false, reason: 'expired' });
  expect(getSettings(db, 'u1').emailVerified).toBeNull();
});

test('five wrong guesses burn the code, even if the sixth is right', async () => {
  await startEmailVerification(db, 'u1', verifyDeps());
  for (let i = 1; i < CODE_MAX_ATTEMPTS; i++) {
    expect(confirmEmail(db, 'u1', '000000', clock + 1)).toEqual({ ok: false, reason: 'wrong', attemptsLeft: CODE_MAX_ATTEMPTS - i });
  }
  expect(confirmEmail(db, 'u1', '000000', clock + 1)).toEqual({ ok: false, reason: 'locked' });
  expect(confirmEmail(db, 'u1', '123456', clock + 1)).toEqual({ ok: false, reason: 'none' });
  expect(getSettings(db, 'u1').emailVerified).toBeNull();
});

test('a code mailed to the old address cannot verify a changed address', async () => {
  await startEmailVerification(db, 'u1', verifyDeps());
  db.prepare("UPDATE users SET email = 'new@example.com' WHERE id = 'u1'").run();
  expect(confirmEmail(db, 'u1', '123456', clock + 1)).toEqual({ ok: false, reason: 'changed' });
});

test('a caller with no address cannot start, and a request inside a minute of the last is refused', async () => {
  putUser(db, 'u2', null);
  expect(await startEmailVerification(db, 'u2', verifyDeps())).toEqual({ ok: false, reason: 'no-address' });
  await startEmailVerification(db, 'u1', verifyDeps());
  clock += CODE_RESEND_SECONDS - 1;
  expect(await startEmailVerification(db, 'u1', verifyDeps())).toEqual({ ok: false, reason: 'too-soon' });
  clock += 1;
  expect((await startEmailVerification(db, 'u1', verifyDeps())).ok).toBe(true);
  expect(sent).toHaveLength(2);
});

test('a failed send leaves no pending code behind', async () => {
  const r = await startEmailVerification(db, 'u1', verifyDeps({ send: async () => ({ ok: false, error: 'smtp down' }) }));
  expect(r).toEqual({ ok: false, reason: 'send-failed', error: 'smtp down' });
  expect(db.prepare('SELECT COUNT(*) AS n FROM notify_email_codes').get().n).toBe(0);
});
