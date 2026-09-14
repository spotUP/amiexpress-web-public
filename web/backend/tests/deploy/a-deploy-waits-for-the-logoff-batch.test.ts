/**
 * A deploy does not recreate the container on top of a running logoff batch.
 *
 * The batch is seven 68K doors, run one at a time, and it is what rebuilds
 * every bulletin on the board. It deliberately outlives the caller who
 * triggered it - the G logoff waits 3 s and drops the line - so it is normally
 * running with NOBODY on the board, which is precisely when the caller gate
 * says deploying is safe.
 *
 * On 2026-09-14 that is what happened. The batch ran for the first time (the
 * dispatch and case fixes had just landed), got as far as MultiTop, and a
 * deploy recreated the container mid-door:
 *
 *   [runner:mtop] [LibraryTraps] AEDoor.library vectors: TRAP MODE
 *   ... container recreated ...
 *   bull1..bull6 unchanged, still 18:35-18:40
 *
 * So the board answers the question on the endpoint the deploy already reads
 * for `revision` and `callers`, and the deploy waits. Same mechanism as the
 * caller guard, for the same reason: the pipeline cannot know what it is about
 * to throw away, so the board tells it.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

import * as fs from 'fs';
import * as path from 'path';

import { sessions } from '../../src/server/session-manager';
import { resetFtpPresence } from '../../src/ftp/ftp-presence';

const DEPLOY_SH = path.join(__dirname, '..', '..', '..', '..', 'deploy', 'deploy.sh');

async function health(): Promise<{ callers: number; batch: number }> {
  const request = require('supertest');
  const { app } = require('../../src/server/app');
  const response = await request(app).get('/health');
  expect(response.status).toBe(200);
  return response.body;
}

beforeEach(() => {
  sessions.clear();
  resetFtpPresence();
  jest.resetModules();
});

describe('/health reports the batch', () => {
  test('is zero when nothing is queued or running - a recreate costs nothing', async () => {
    expect((await health()).batch).toBe(0);
  });

  test('counts a batch that is running, so the deploy can see it', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { enqueueBatch } = require('../../src/services/batch-scheduler');
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });

    const run = enqueueBatch('batch2#2', 'batch2 node 2', () => gate);
    await Promise.resolve();
    await Promise.resolve();

    expect((await health()).batch).toBeGreaterThan(0);

    release();
    await run;
    expect((await health()).batch).toBe(0);
  });

  test('is reported even with nobody on the board - which is the whole point', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { enqueueBatch } = require('../../src/services/batch-scheduler');
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const run = enqueueBatch('batch2#2', 'batch2 node 2', () => gate);
    await Promise.resolve();
    await Promise.resolve();

    const answer = await health();
    // The caller gate would say "nobody is on the board; deploying".
    expect(answer.callers).toBe(0);
    expect(answer.batch).toBeGreaterThan(0);

    release();
    await run;
  });
});

/**
 * The script half. Read as TEXT rather than executed: running it would build
 * an image and recreate containers. What matters is that the wait exists,
 * reads the field the board publishes, is bounded, and can be overridden -
 * the same shape the caller guard has.
 */
describe('deploy.sh', () => {
  const script = fs.readFileSync(DEPLOY_SH, 'utf8');

  test('waits on the batch field the board publishes', () => {
    expect(script).toMatch(/"batch":/);
    expect(script).toContain('BATCH_WAIT_SECONDS');
  });

  test('waits BEFORE the restart notice, not after the container is gone', () => {
    expect(script.indexOf('BATCH_WAIT_SECONDS')).toBeLessThan(script.indexOf('restart notice'));
  });

  test('is bounded - a wedged batch must not block deploys for ever', () => {
    // The cap is a number with a default, and the loop ends at it.
    expect(script).toMatch(/BATCH_WAIT_SECONDS:-\d+/);
    expect(script).toMatch(/deploying anyway/);
  });

  test('force=true skips the wait, as it skips the caller gate', () => {
    const wait = script.slice(script.indexOf('BATCH_WAIT_SECONDS'), script.indexOf('NOTICE_SECONDS=60'));
    expect(wait).toContain('FORCE_DEPLOY');
  });

  test('a board that does not answer is not a board to wait for', () => {
    // An older image has no `batch` in /health; an empty answer must break
    // the loop rather than spin to the cap on every deploy.
    const wait = script.slice(script.indexOf('BATCH_WAIT_SECONDS'), script.indexOf('NOTICE_SECONDS=60'));
    expect(wait).toMatch(/\[ -n "\$BATCH" \] \|\| break/);
  });
});
