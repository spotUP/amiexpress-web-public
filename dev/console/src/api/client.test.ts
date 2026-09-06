/**
 * dev/console had no test harness at all before this file - every fix in
 * this wave was verified by `tsc --noEmit` plus manual trace, which proves
 * the TYPES line up but nothing about which URL, method or body a client
 * function actually sends. Access Levels is exactly the flow that most
 * needs this: every OTHER wrong endpoint in this app errors loudly (a 404,
 * a validation failure) - the old security mirror returned 200 and did
 * nothing, silently. A contract test is the only thing that would have
 * caught that class of bug before a sysop did.
 *
 * No ink renderer, no DOM, no backend: `globalThis.fetch` is stubbed and
 * each test asserts the recorded URL, method and parsed body.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  saveAcsLevelFlags,
  createUser,
  updateUser,
  deleteDoor,
  reserveNode,
} from './client.js';

const BASE_URL = process.env['AMIEXPRESS_URL'] ?? 'http://localhost:3001';

interface RecordedCall {
  url: string;
  method: string | undefined;
  body: unknown;
}

let calls: RecordedCall[] = [];
let originalFetch: typeof fetch;

function stubFetch(body: unknown = { success: true }, ok = true, status = 200): void {
  calls = [];
  (globalThis as { fetch: typeof fetch }).fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    calls.push({
      url: String(input),
      method: init?.method,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    return {
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      text: async () => JSON.stringify(body),
      json: async () => body,
    } as Response;
  }) as typeof fetch;
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('saveAcsLevelFlags PUTs to the file-backed levels endpoint with a flags body', async () => {
  stubFetch({ success: true, data: { level: 30, file: 'ACS.30.info', backupPath: 'ACS.30.info.backup' } });
  await saveAcsLevelFlags(30, { 'ACS.DOWNLOAD': true, 'ACS.CENSORED': false });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE_URL}/api/config/security/levels/30`);
  assert.equal(calls[0].method, 'PUT');
  assert.deepEqual(calls[0].body, { flags: { 'ACS.DOWNLOAD': true, 'ACS.CENSORED': false } });
});

test('createUser POSTs to /api/config/users with username and password in the body', async () => {
  stubFetch({ success: true, data: { username: 'newguy' }, message: 'User created successfully' });
  await createUser({ username: 'newguy', password: 'hunter2', secLevel: 10 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE_URL}/api/config/users`);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { username: 'newguy', password: 'hunter2', secLevel: 10 });
});

test('updateUser PUTs to /api/config/users/:id and carries an optional password', async () => {
  stubFetch({ success: true });
  await updateUser('user-7', { password: 'newpass1' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE_URL}/api/config/users/user-7`);
  assert.equal(calls[0].method, 'PUT');
  assert.deepEqual(calls[0].body, { password: 'newpass1' });
});

test('deleteDoor DELETEs /api/config/doors/:command, not a list-position id', async () => {
  stubFetch({ success: true, message: 'Door deleted' });
  await deleteDoor('TRIVIA');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE_URL}/api/config/doors/TRIVIA`);
  assert.equal(calls[0].method, 'DELETE');
});

test('deleteDoor URL-encodes a command with special characters', async () => {
  stubFetch({ success: true });
  await deleteDoor('FOO BAR');

  assert.equal(calls[0].url, `${BASE_URL}/api/config/doors/${encodeURIComponent('FOO BAR')}`);
});

test('reserveNode POSTs { username } when reserving', async () => {
  stubFetch({ success: true, reservedFor: 'newguy' });
  await reserveNode(3, 'newguy');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE_URL}/api/nodes/3/reserve`);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { username: 'newguy' });
});

test('reserveNode POSTs an empty body to clear, when called with no username', async () => {
  stubFetch({ success: true, reservedFor: null });
  await reserveNode(3);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE_URL}/api/nodes/3/reserve`);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, {});
});

test('a 400 with a JSON {message} body surfaces just the message, not raw JSON', async () => {
  stubFetch({ success: false, message: 'Security level must be a multiple of 5' }, false, 400);
  await assert.rejects(
    () => saveAcsLevelFlags(31, {}),
    (err: Error) => {
      assert.equal(err.message, 'HTTP 400: Security level must be a multiple of 5');
      return true;
    },
  );
});

// The incident this whole page exists to fix: the OLD Security page wrote
// `security_level_access` through `/config/security/:level` - a database
// table express.e never reads, so every edit silently did nothing. A
// regression back to that path from client.ts would fail every test above
// on request shape alone, but only by accident (whichever test happens to
// hit the same URL shape) - this asserts the dead path is gone from the
// source directly, the same guard web/config-app/src/test/
// security-endpoints.test.ts uses for its own client.
test('the client source never reaches the dead security_level_access mirror', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(path.join(here, 'client.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  // `/config/security/${level}` and `/config/security/${id}` are the dead
  // mirror; `/config/security/levels/${level}` is not - "levels" is what
  // separates them.
  const mirrorCalls = [...code.matchAll(/\/config\/security\/\$\{[^}]+\}/g)]
    .map(match => match[0])
    .filter(call => !call.includes('levels'));
  assert.deepEqual(mirrorCalls, []);

  assert.ok(!code.includes('`${BASE_URL}/api/config/security`'));
  assert.ok(!code.includes("'/api/config/security'"));
});
