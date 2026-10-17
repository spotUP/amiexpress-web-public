/**
 * A deploy must not throw REAL callers off the board - and the sysop testing
 * his own fix is not one of them.
 *
 * Counting him cost an evening on 2026-09-08: every push-triggered run refused
 * ("REFUSING TO DEPLOY", exit 78) because `sysop` was logged on, the image was
 * rebuilt each time and the container never recreated, and the fix he was
 * waiting for sat unshipped while he asked "deployed?" four times. Forcing by
 * hand did not help either - only ONE run may wait per concurrency group, so
 * each new push cancelled the queued dispatch. His answer: "its always ok to
 * force when spot or the sysop is online."
 *
 * The rule lives in `deploy/caller-guard.sh` so this file can drive it with
 * real `/health` payloads, rather than it being twenty lines of shell buried
 * in a 500-line workflow that nothing can execute.
 */
import { execFileSync } from 'child_process';
import * as path from 'path';

const guard = path.join(__dirname, '..', '..', '..', '..', 'deploy', 'caller-guard.sh');

/** What the guard says: how many callers a deploy would be rude to. */
function toProtect(health: unknown, names = 'spot sysop discord-bridge'): number {
  const json = typeof health === 'string' ? health : JSON.stringify(health);
  const out = execFileSync('sh', [
    '-c',
    `. "${guard}"; callers_to_protect "$1" "$2"`,
    'sh', json, names,
  ], { encoding: 'utf8' });
  return Number(out.trim());
}

const online = (...users: Array<{ username: string; nodeId?: number }>) => ({
  status: 'ok',
  callers: users.length,
  online: users.map((u, i) => ({ username: u.username, nodeId: u.nodeId ?? i + 1, transport: 'web' })),
});

describe('who stops a deploy', () => {
  it('nobody on the board', () => {
    expect(toProtect({ status: 'ok', callers: 0, online: [] })).toBe(0);
  });

  it('the sysop alone does not - this is the whole fix', () => {
    expect(toProtect(online({ username: 'sysop' }))).toBe(0);
    expect(toProtect(online({ username: 'spot' }))).toBe(0);
    // However he capitalised it when he logged on.
    expect(toProtect(online({ username: 'Spot' }))).toBe(0);
    expect(toProtect(online({ username: 'sysop' }, { username: 'spot' }))).toBe(0);
  });

  it('a real caller does', () => {
    expect(toProtect(online({ username: 'tango' }))).toBe(1);
    expect(toProtect(online({ username: 'sysop' }, { username: 'tango' }))).toBe(1);
    expect(toProtect(online({ username: 'jucke' }, { username: 'tango' }))).toBe(2);
  });

  it('the discord bridge never stops a deploy', () => {
    expect(toProtect(online({ username: 'discord-bridge' }))).toBe(0);
    expect(toProtect(online({ username: 'sysop' }, { username: 'discord-bridge' }))).toBe(0);
    expect(toProtect(online({ username: 'Discord-Bridge' }))).toBe(0);
    expect(toProtect(online({ username: 'discord-bridge' }, { username: 'tango' }))).toBe(1);
  });

  it('an FTP caller does, even though /health does not name them', () => {
    // FTP holds a node with no session: `callers` counts them, `online` does
    // not. The guard has to fail safe.
    expect(toProtect({ status: 'ok', callers: 1, online: [] })).toBe(1);
    expect(toProtect({ status: 'ok', callers: 2, online: [{ username: 'sysop', nodeId: 1 }] })).toBe(1);
  });

  it('a board that answers nothing is a cold start, not a refusal', () => {
    expect(toProtect('')).toBe(0);
    expect(toProtect('not json at all')).toBe(0);
  });

  it('a parked caller does not - nobody is attached to him (plan Decision 22)', () => {
    // /health lists a parked web session in `online` with detached:true and
    // leaves it out of `callers`; he resumes after the deploy like after any drop.
    const health = {
      status: 'ok',
      callers: 1,
      detached: 1,
      online: [
        { username: 'sysop', nodeId: 1, transport: 'web', since: null, detached: false },
        { username: 'tango', nodeId: 2, transport: 'web', since: null, detached: true },
      ],
    };
    expect(toProtect(health)).toBe(0);
    // An attached real caller beside him still does.
    health.callers = 2;
    health.online.push({ username: 'jucke', nodeId: 3, transport: 'web', since: null, detached: false });
    expect(toProtect(health)).toBe(1);
  });

  it('the names it ignores can be changed without touching the workflow', () => {
    expect(toProtect(online({ username: 'ansiguy' }), 'ansiguy')).toBe(0);
    expect(toProtect(online({ username: 'sysop' }), 'ansiguy')).toBe(1);
  });
});
