/**
 * WhipApiClient against a stubbed transport: envelope handling, typed 404
 * errors, and the service-token auth header. No live backend involved.
 */
import assert from 'assert';
import {
  WhipApiClient,
  WhipApiError,
  type RequestConfig,
  type RequestResponse,
} from '../src/whip-api';

function stubClient(
  handler: (config: RequestConfig) => RequestResponse,
  seen: RequestConfig[] = []
): { client: WhipApiClient; seen: RequestConfig[] } {
  const client = new WhipApiClient('http://bbs:3001', 'svc-token', async (config) => {
    seen.push(config);
    return handler(config);
  });
  return { client, seen };
}

function ok<T>(data: T): RequestResponse {
  return { status: 200, data: { success: true, data } };
}

function notFound(message: string): RequestResponse {
  return { status: 404, data: { success: false, message } };
}

export async function linkSuccessReturnsUser(): Promise<void> {
  const { client, seen } = stubClient(() => ok({ userId: 'u1', username: 'sysop' }));
  const result = await client.link('A1B2C3D4', 'discord-9');
  assert.strictEqual(result.userId, 'u1');
  assert.strictEqual(result.username, 'sysop');
  assert.strictEqual(seen[0].method, 'post');
  assert.strictEqual(seen[0].url, '/api/whip/link');
  assert.deepStrictEqual(seen[0].data, { code: 'A1B2C3D4', discordId: 'discord-9' });
}

export async function link404ThrowsTypedError(): Promise<void> {
  const { client } = stubClient(() => notFound('Unknown, expired, or already-used code.'));
  await assert.rejects(() => client.link('DEADBEEF', 'discord-9'), (err: unknown) => {
    assert.ok(err instanceof WhipApiError);
    assert.strictEqual((err as WhipApiError).status, 404);
    assert.match((err as WhipApiError).message, /already-used/);
    return true;
  });
}

export async function linkStatusSuccess(): Promise<void> {
  const { client, seen } = stubClient(() => ok({ userId: 'u1' }));
  const result = await client.linkStatus('discord-9');
  assert.strictEqual(result.userId, 'u1');
  assert.strictEqual(seen[0].url, '/api/whip/link-status');
  assert.deepStrictEqual(seen[0].params, { discordId: 'discord-9' });
}

export async function linkStatus404ThrowsTypedError(): Promise<void> {
  const { client } = stubClient(() => notFound('Not linked'));
  await assert.rejects(() => client.linkStatus('nobody'), (err: unknown) => {
    assert.ok(err instanceof WhipApiError);
    assert.strictEqual((err as WhipApiError).status, 404);
    return true;
  });
}

export async function authHeaderPresentOnEveryCall(): Promise<void> {
  const { client, seen } = stubClient((config) => {
    if (config.url === '/api/whip/projects') return ok([]);
    if (config.url === '/api/whip/leaderboard') return ok([]);
    if (config.url === '/api/whip/parties') return ok([]);
    throw new Error(`unexpected ${config.url}`);
  });
  await client.listProjects();
  await client.leaderboard();
  await client.listParties();
  assert.strictEqual(seen.length, 3);
  for (const config of seen) {
    assert.strictEqual(config.headers.Authorization, 'Bearer svc-token');
  }
}

export async function readEndpointsUnwrapEnvelope(): Promise<void> {
  const { client } = stubClient((config) => {
    switch (config.url) {
      case '/api/whip/projects':
        return ok([{ id: 'p1', name: 'Demo', type: 'demo', status: 'active', taskCounts: { total: 2, done: 1 } }]);
      case '/api/whip/tasks':
        return ok([{ id: 't1', projectId: 'p1', title: 'Raymarcher', status: 'todo' }]);
      case '/api/whip/my-tasks':
        return ok([{ id: 't2', projectId: 'p1', title: 'Mine', status: 'in-progress' }]);
      case '/api/whip/leaderboard':
        return ok([{ userId: 'u1', handle: 'sysop', points: 125, level: 'scener', rank: 1, tasksCompleted: 9 }]);
      case '/api/whip/achievements/u1':
        return ok({ unlocked: [{ id: 'a1', name: 'First', points: 10 }], locked: [], totalPoints: 10 });
      case '/api/whip/parties':
        return ok([{ id: 'pt1', name: 'Revision', date: '2025-04-18', location: 'Saarbrücken' }]);
      default:
        throw new Error(`unexpected ${config.url}`);
    }
  });
  const projects = await client.listProjects();
  assert.strictEqual(projects[0].name, 'Demo');
  assert.deepStrictEqual(projects[0].taskCounts, { total: 2, done: 1 });
  const tasks = await client.listTasks('p1');
  assert.strictEqual(tasks[0].title, 'Raymarcher');
  const mine = await client.listUserTasks('u1');
  assert.strictEqual(mine[0].title, 'Mine');
  const board = await client.leaderboard();
  assert.strictEqual(board[0].handle, 'sysop');
  const ach = await client.achievements('u1');
  assert.strictEqual(ach.totalPoints, 10);
  assert.strictEqual(ach.unlocked[0].name, 'First');
  const parties = await client.listParties();
  assert.strictEqual(parties[0].name, 'Revision');
}
