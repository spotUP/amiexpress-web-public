/**
 * Task id resolution: exact id wins, a unique prefix resolves, anything
 * else explains itself. Live 2026-09-11: `/whip task id:8f358f41` 404'd
 * while 8f358f41-3417-… existed — the door shows short ids, the API wants
 * full ones.
 */
import assert from 'assert';
import { resolveTaskId } from '../src/index';
import { WhipApiClient, WhipApiError } from '../src/whip-api';

const TASKS = [
  { id: '8f358f41-3417-4c6f-a820-b6b362540123', title: 'Post news bulletins', status: 'done' },
  { id: 'aaaaaaaa-1111-2222-3333-444455556666', title: 'Other work', status: 'todo' },
];

function api() {
  return new WhipApiClient('http://bbs:3001', 'svc', async (config) => {
    if (config.url === '/api/whip/tasks/all') {
      return { status: 200, data: { success: true, data: TASKS } };
    }
    throw new Error(`unexpected ${config.url}`);
  });
}

export async function exactIdPassesThrough(): Promise<void> {
  assert.strictEqual(
    await resolveTaskId(api(), '8f358f41-3417-4c6f-a820-b6b362540123'),
    '8f358f41-3417-4c6f-a820-b6b362540123'
  );
}

export async function uniquePrefixResolves(): Promise<void> {
  assert.strictEqual(
    await resolveTaskId(api(), '8f358f41'),
    '8f358f41-3417-4c6f-a820-b6b362540123'
  );
}

export async function unknownPrefixNamesItself(): Promise<void> {
  await assert.rejects(() => resolveTaskId(api(), 'zzzzzzzz'), (err: unknown) => {
    assert.ok(err instanceof WhipApiError);
    assert.strictEqual((err as WhipApiError).status, 404);
    assert.match((err as WhipApiError).message, /Unknown task "zzzzzzzz"/);
    return true;
  });
}

export async function ambiguousPrefixListsCandidates(): Promise<void> {
  const both = new WhipApiClient('http://bbs:3001', 'svc', async () => ({
    status: 200,
    data: {
      success: true,
      data: [
        { id: 'ab111111-0000-0000-0000-000000000001', title: 'First', status: 'todo' },
        { id: 'ab222222-0000-0000-0000-000000000002', title: 'Second', status: 'todo' },
      ],
    },
  }));
  await assert.rejects(() => resolveTaskId(both, 'ab'), (err: unknown) => {
    assert.ok(err instanceof WhipApiError);
    assert.strictEqual((err as WhipApiError).status, 400);
    assert.match((err as WhipApiError).message, /matches 2 tasks/);
    return true;
  });
}
