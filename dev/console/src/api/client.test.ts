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
  getAdminPermissions,
  setAdminPermissions,
  createConference,
  deleteConference,
  getOrphanConferenceDirs,
  removeOrphanConferenceDir,
  getLogs,
  getDoorLogFiles,
  clearLogs,
  getSessionLog,
  saveSessionLog,
  getSessionStats,
  getScreenRevisions,
  getScreenRevision,
  restoreScreenRevision,
  repairAllScreens,
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

test('getAdminPermissions GETs /api/admin-permissions, not /api/config/admin-permissions', async () => {
  stubFetch({ perms: { users: 255 }, sections: [{ key: 'users', label: 'Users', defaultMinLevel: 255 }] });
  await getAdminPermissions();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE_URL}/api/admin-permissions`);
  assert.equal(calls[0].method, undefined);
});

test('setAdminPermissions PUTs { perms } to /api/admin-permissions', async () => {
  stubFetch({ perms: { users: 100 }, sections: [] });
  await setAdminPermissions({ users: 100 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE_URL}/api/admin-permissions`);
  assert.equal(calls[0].method, 'PUT');
  assert.deepEqual(calls[0].body, { perms: { users: 100 } });
});

test('createConference POSTs to /api/config/conferences', async () => {
  stubFetch({ success: true, data: { id: 1, conference_id: 4, name: 'New', ndirs: 1 } });
  await createConference({ conference_id: 4, name: 'New' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE_URL}/api/config/conferences`);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { conference_id: 4, name: 'New' });
});

test('deleteConference DELETEs /api/config/conferences/:id with removeFiles as a query flag', async () => {
  stubFetch({ success: true, message: 'Conference removed' });
  await deleteConference(4, true);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE_URL}/api/config/conferences/4?removeFiles=true`);
  assert.equal(calls[0].method, 'DELETE');
});

test('deleteConference omits the query flag when removeFiles is not requested', async () => {
  stubFetch({ success: true });
  await deleteConference(4);

  assert.equal(calls[0].url, `${BASE_URL}/api/config/conferences/4`);
});

test('getOrphanConferenceDirs GETs the orphan-directories route, before /:conferenceId can shadow it', async () => {
  stubFetch({ success: true, data: { orphans: [{ dir: 'Conf9', files: 3, bytes: 1024 }], bytes: 1024 } });
  const result = await getOrphanConferenceDirs();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE_URL}/api/config/conferences/orphan-directories`);
  assert.deepEqual(result.orphans, [{ dir: 'Conf9', files: 3, bytes: 1024 }]);
});

test('removeOrphanConferenceDir DELETEs the named directory, URL-encoded', async () => {
  stubFetch({ success: true, message: 'Conf 9 removed' });
  await removeOrphanConferenceDir('Conf 9');

  assert.equal(calls[0].url, `${BASE_URL}/api/config/conferences/orphan-directories/${encodeURIComponent('Conf 9')}`);
  assert.equal(calls[0].method, 'DELETE');
});

test('getLogs unwraps the {success,data} envelope and sends a server-side search term', async () => {
  stubFetch({ success: true, data: { lines: ['a', 'b'], totalLines: 2 } });
  const result = await getLogs('backend', 500, 'timeout', undefined);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE_URL}/api/config/logs?type=backend&lines=500&search=timeout`);
  assert.deepEqual(result.lines, ['a', 'b']);
  assert.equal(result.totalLines, 2);
});

test('getLogs falls back to an empty array when data is missing, rather than undefined', async () => {
  stubFetch({ success: true, data: { totalLines: 0 } });
  const result = await getLogs('backend');
  assert.deepEqual(result.lines, []);
});

test('getDoorLogFiles GETs /api/config/logs/door-68k and unwraps data.files', async () => {
  stubFetch({ success: true, data: { files: [{ file: 'door-68k-trivia.log', label: 'trivia', size: 10, modifiedAt: null }] } });
  const files = await getDoorLogFiles();

  assert.equal(calls[0].url, `${BASE_URL}/api/config/logs/door-68k`);
  assert.equal(files.length, 1);
  assert.equal(files[0].file, 'door-68k-trivia.log');
});

test('clearLogs DELETEs /api/config/logs with type and an optional doorLog', async () => {
  stubFetch({ success: true, message: 'backend log cleared' });
  await clearLogs('door68k', 'door-68k-trivia.log');

  assert.equal(calls[0].url, `${BASE_URL}/api/config/logs?type=door68k&doorLog=door-68k-trivia.log`);
  assert.equal(calls[0].method, 'DELETE');
});

test('getSessionLog reads the bare {log} response, not {success,data}', async () => {
  stubFetch({ log: { sessionId: 's1', username: 'newguy', output: ['hello\r\n'] } });
  const log = await getSessionLog('s1');

  assert.equal(calls[0].url, `${BASE_URL}/api/sessions/s1/log`);
  assert.deepEqual(log?.output, ['hello\r\n']);
});

test('getSessionLog returns null when the backend answers no log', async () => {
  stubFetch({});
  const log = await getSessionLog('missing');
  assert.equal(log, null);
});

test('saveSessionLog POSTs /api/sessions/:id/save and returns the bare filePath', async () => {
  stubFetch({ filePath: '/var/logs/sessions/s1.log' });
  const res = await saveSessionLog('s1');

  assert.equal(calls[0].url, `${BASE_URL}/api/sessions/s1/save`);
  assert.equal(calls[0].method, 'POST');
  assert.equal(res.filePath, '/var/logs/sessions/s1.log');
});

test('getSessionStats reads the bare {stats} response', async () => {
  stubFetch({ stats: { totalSessions: 3, totalLines: 500 } });
  const stats = await getSessionStats();

  assert.equal(calls[0].url, `${BASE_URL}/api/sessions/stats`);
  assert.equal(stats.totalSessions, 3);
});

test('getScreenRevisions GETs /api/screens/revisions with the path URL-encoded', async () => {
  stubFetch({ success: true, data: { revisions: [{ ts: '2026-09-06T00:00:00Z', file: 'a.bin', bytes: 10, sha256: 'x', source: 'Node1/BULL1.TXT' }] } });
  const revs = await getScreenRevisions('Node1/BULL1.TXT');

  assert.equal(calls[0].url, `${BASE_URL}/api/screens/revisions?path=${encodeURIComponent('Node1/BULL1.TXT')}`);
  assert.equal(revs.length, 1);
});

test('getScreenRevision GETs /api/screens/revision with path and file', async () => {
  stubFetch({ success: true, data: { content: 'aGVsbG8=', bytes: 5 } });
  const rev = await getScreenRevision('Node1/BULL1.TXT', 'a.bin');

  assert.equal(
    calls[0].url,
    `${BASE_URL}/api/screens/revision?path=${encodeURIComponent('Node1/BULL1.TXT')}&file=${encodeURIComponent('a.bin')}`
  );
  assert.equal(rev?.bytes, 5);
});

test('restoreScreenRevision POSTs { path, file } to /api/screens/restore', async () => {
  stubFetch({ success: true, message: 'Restored Node1/BULL1.TXT from a.bin' });
  await restoreScreenRevision('Node1/BULL1.TXT', 'a.bin');

  assert.equal(calls[0].url, `${BASE_URL}/api/screens/restore`);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { path: 'Node1/BULL1.TXT', file: 'a.bin' });
});

test('repairAllScreens POSTs { dryRun } to /api/screens/repair-all', async () => {
  stubFetch({ success: true, data: { dryRun: true, damaged: ['a.txt', 'b.txt'] } });
  const res = await repairAllScreens(true);

  assert.equal(calls[0].url, `${BASE_URL}/api/screens/repair-all`);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { dryRun: true });
  assert.deepEqual(res.damaged, ['a.txt', 'b.txt']);
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
