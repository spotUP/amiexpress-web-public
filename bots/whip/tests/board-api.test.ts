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
