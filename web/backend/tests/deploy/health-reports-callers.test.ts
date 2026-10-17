/**
 * `/health` says whether anybody is on the board.
 *
 * A deploy recreates the container, which ends every session - "we are
 * throwing users out of the live bbs" (sysop, 2026-09-07), after an evening
 * where iterating on FTP meant kicking callers off repeatedly. The deploy
 * cannot know whether that costs somebody a half-typed message, so the board
 * answers the question on the endpoint the deploy already reads for the
 * revision, and `.github/workflows/deploy-hetzner.yml` refuses when the answer
 * is not zero.
 *
 * What is pinned here is the COUNTING RULE, because that is what makes the
 * guard trustworthy: count a caller who is logged on, over any transport,
 * including FTP - and do NOT count a connection that has not logged in, or a
 * deploy would be blocked for ever by a port scanner sitting on the telnet
 * prompt.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

import { BBSState } from '../../src/constants/bbs-states';
import { sessions } from '../../src/server/session-manager';
import { registerFtpCaller, resetFtpPresence } from '../../src/ftp/ftp-presence';

/** The health handler, reached the way the deploy reaches it. */
async function health(): Promise<{ callers: number; online: Array<{ username: string; transport: string }> }> {
  const request = require('supertest');
  const { app } = require('../../src/server/app');
  const response = await request(app).get('/health');
  expect(response.status).toBe(200);
  return response.body;
}

function addSession(nodeId: number, state: BBSState, username?: string): void {
  sessions.set(String(nodeId), {
    nodeId,
    state,
    user: username ? { username } : undefined,
    connectionType: 'telnet',
    connectionStart: Date.UTC(2026, 9, 5, 17, 33, 0),
  } as never);
}

beforeEach(() => {
  sessions.clear();
  resetFtpPresence();
});

afterAll(() => {
  sessions.clear();
  resetFtpPresence();
});

describe('what /health says about the board', () => {
  it('counts a parked caller as detached, not as a caller, until he resumes', async () => {
    addSession(2, BBSState.LOGGEDON, 'randy');
    (sessions.get('2') as { detachedAt?: number }).detachedAt = Date.now();

    let body = (await health()) as { callers: number; detached?: number; online: Array<{ detached?: boolean }> };
    expect(body.callers).toBe(0);
    expect(body.detached).toBe(1);
    // Each row says so too: the deploy guard reads the rows, not the count.
    expect(body.online[0].detached).toBe(true);

    (sessions.get('2') as { detachedAt?: number }).detachedAt = undefined;
    body = (await health()) as { callers: number; detached?: number; online: Array<{ detached?: boolean }> };
    expect(body.callers).toBe(1);
    expect(body.detached).toBe(0);
    expect(body.online[0].detached).toBe(false);
  });

  it('reports nobody when the board is empty', async () => {
    const body = await health();

    expect(body.callers).toBe(0);
    expect(body.online).toEqual([]);
  });

  it('counts a caller who has logged on', async () => {
    addSession(3, BBSState.LOGGEDON, 'sysop');

    const body = await health();

    expect(body.callers).toBe(1);
    expect(body.online[0]).toMatchObject({ username: 'sysop', transport: 'telnet' });
  });

  it('says when each caller connected, so a session left behind shows its age', async () => {
    addSession(3, BBSState.LOGGEDON, 'regress');

    const body: any = await health();

    expect(body.online[0].since).toBe('2026-10-05T17:33:00.000Z');
  });

  it('does NOT count a connection that has not logged in', async () => {
    // A telnet port scanner sits at the login prompt indefinitely. Counting
    // it would block every deploy for ever, which is worse than the problem.
    addSession(4, BBSState.AWAIT);

    expect((await health()).callers).toBe(0);
  });

  it('counts an FTP caller, who holds a node but has no session', async () => {
    // The reason WHO needed ftp-presence at all: an FTP caller is invisible
    // to the session map, and a deploy that ignored him would cut a transfer
    // in half.
    registerFtpCaller('ftp-1', { nodeId: 7, username: 'krakken', location: '' });

    const body = await health();

    expect(body.callers).toBe(1);
    expect(body.online[0]).toMatchObject({ username: 'krakken', transport: 'ftp' });
  });

  it('adds both kinds together, and names them', async () => {
    addSession(3, BBSState.LOGGEDON, 'sysop');
    registerFtpCaller('ftp-1', { nodeId: 7, username: 'krakken', location: '' });

    const body = await health();

    expect(body.callers).toBe(2);
    expect(body.online.map((caller) => caller.username).sort()).toEqual(['krakken', 'sysop']);
  });

  it('still carries the revision the deploy checks', async () => {
    // The guard reads `callers` from the same call that proves which build is
    // live; losing the revision would break the deploy's other check.
    const body = (await health()) as unknown as { revision?: string; status?: string };

    expect(body.status).toBe('ok');
    expect(typeof body.revision).toBe('string');
  });
});
