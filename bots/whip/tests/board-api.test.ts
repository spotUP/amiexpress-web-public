/**
 * BoardApiClient against a stubbed transport: envelope handling, typed
 * errors (401 unconfigured, 403 out-of-scope domain), and the per-bot
 * Bearer secret. No live backend involved.
 */
import assert from 'assert';
import {
  BoardApiClient,
  BoardApiError,
} from '../src/board-api';
import type { RequestConfig, RequestResponse } from '../src/whip-api';

function stubClient(
  handler: (config: RequestConfig) => RequestResponse,
  seen: RequestConfig[] = []
): { client: BoardApiClient; seen: RequestConfig[] } {
  const client = new BoardApiClient('http://bbs:3001', 'bot-secret', async (config) => {
    seen.push(config);
    return handler(config);
  });
  return { client, seen };
}

function okText(text: string, truncated = false): RequestResponse {
  return { status: 200, data: { success: true, data: { text, truncated } } };
}

export async function boardInfoRelaysText(): Promise<void> {
  const { client, seen } = stubClient(() => okText('AmiExpress BBS, run by Sysop.'));
  const result = await client.boardInfo();
  assert.strictEqual(result.text, 'AmiExpress BBS, run by Sysop.');
  assert.strictEqual(result.truncated, false);
  assert.strictEqual(seen[0].method, 'get');
  assert.strictEqual(seen[0].url, '/api/bot/v1/board-info');
  assert.deepStrictEqual(seen[0].headers, { Authorization: 'Bearer bot-secret' });
}

export async function whoOnlineHitsActivity(): Promise<void> {
  const { client, seen } = stubClient(() => okText('Nobody online.'));
  await client.whoOnline();
  assert.strictEqual(seen[0].url, '/api/bot/v1/activity/online');
}

export async function recentMessagesPassesConfAndLimit(): Promise<void> {
  const { client, seen } = stubClient(() => okText('msg1'));
  await client.recentMessages(2, 5);
  assert.strictEqual(seen[0].url, '/api/bot/v1/messages/recent');
  assert.deepStrictEqual(seen[0].params, { conf: '2', limit: '5' });
}

export async function userLookupPassesHandle(): Promise<void> {
  const { client, seen } = stubClient(() => okText('sysop, level 255'));
  await client.userLookup('sysop');
  assert.strictEqual(seen[0].url, '/api/bot/v1/users/lookup');
  assert.deepStrictEqual(seen[0].params, { handle: 'sysop' });
}

export async function userSearchPassesQuery(): Promise<void> {
  const { client, seen } = stubClient(() => okText('sysop'));
  await client.userSearch('sys', 5);
  assert.strictEqual(seen[0].url, '/api/bot/v1/users/search');
  assert.deepStrictEqual(seen[0].params, { q: 'sys', limit: '5' });
}

export async function topCallersDefaultsLimit(): Promise<void> {
  const { client, seen } = stubClient(() => okText('1. sysop'));
  await client.topCallers();
  assert.strictEqual(seen[0].url, '/api/bot/v1/users/top');
  assert.deepStrictEqual(seen[0].params, { limit: '5' });
}

export async function error401ThrowsTypedError(): Promise<void> {
  const { client } = stubClient(() => ({ status: 401, data: { success: false, message: 'Invalid bot token' } }));
  await assert.rejects(() => client.boardInfo(), (err: unknown) => {
    assert.ok(err instanceof BoardApiError);
    assert.strictEqual((err as BoardApiError).status, 401);
    assert.match((err as BoardApiError).message, /Invalid bot token/);
    return true;
  });
}

export async function error403OutOfScopeThrowsTypedError(): Promise<void> {
  const { client } = stubClient(() => ({ status: 403, data: { success: false, message: 'Token has no users scope' } }));
  await assert.rejects(() => client.topCallers(), (err: unknown) => {
    assert.ok(err instanceof BoardApiError);
    assert.strictEqual((err as BoardApiError).status, 403);
    return true;
  });
}

export async function fileStatsPassesTheConference(): Promise<void> {
  const { client, seen } = stubClient(() => okText('Conference 2: 41 files, 8.1 MB.'));
  const result = await client.fileStats(2);
  assert.strictEqual(result.text, 'Conference 2: 41 files, 8.1 MB.');
  assert.strictEqual(seen[0].url, '/api/bot/v1/files/stats');
  assert.deepStrictEqual(seen[0].params, { conf: '2' });
}

export async function fileSearchPassesTermConfAndLimit(): Promise<void> {
  const { client, seen } = stubClient(() => okText('DEMO.LHA (12 KB): a demo'));
  await client.fileSearch('demo', 3, 7);
  assert.strictEqual(seen[0].url, '/api/bot/v1/files/search');
  assert.deepStrictEqual(seen[0].params, { conf: '3', q: 'demo', limit: '7' });
}

export async function fileSearchDefaultsToConferenceOne(): Promise<void> {
  const { client, seen } = stubClient(() => okText('nothing'));
  await client.fileSearch('demo');
  assert.strictEqual(seen[0].params?.conf, '1');
}

export async function conferencesHitsTheConferenceList(): Promise<void> {
  const { client, seen } = stubClient(() => okText('1: Amiga Chat\n2: Staff'));
  const result = await client.conferences();
  assert.ok(result.text.includes('Amiga Chat'));
  assert.strictEqual(seen[0].url, '/api/bot/v1/conferences');
}

export async function doorsHitsThePublicDoorList(): Promise<void> {
  const { client, seen } = stubClient(() => okText('SUBS, DOORMAN, WHIP'));
  await client.doors();
  assert.strictEqual(seen[0].url, '/api/bot/v1/doors');
}

export async function theBotCannotReachPrivilegedDoorEndpoints(): Promise<void> {
  // doors/keys and doors/data are privileged: the plan puts them out of scope
  // and nothing on this client may address them. A method that appears here
  // later is a review failure, so this asserts on the client's own surface.
  const names = Object.getOwnPropertyNames(BoardApiClient.prototype);
  assert.ok(!names.some((n) => /key|secret|doorData/i.test(n)), 'no privileged door reader');
}

export async function anOutOfScopeDomainStillRaises(): Promise<void> {
  // A token without the `files` domain must surface as an error, not as an
  // empty card that reads like an empty conference.
  const { client } = stubClient(() => ({ status: 403, data: { success: false, message: 'domain not allowed' } }));
  await assert.rejects(() => client.fileStats(1), (err: unknown) => {
    assert.ok(err instanceof BoardApiError);
    assert.strictEqual((err as BoardApiError).status, 403);
    return true;
  });
}
