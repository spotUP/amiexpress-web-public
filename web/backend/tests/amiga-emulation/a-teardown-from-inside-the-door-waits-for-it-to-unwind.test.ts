/**
 * A TEARDOWN ASKED FOR FROM INSIDE THE DOOR HAPPENS AFTER THE DOOR UNWINDS.
 *
 * Under DOOR_ASYNC_WAIT=1 a door waiting for a keystroke pumps the Node event
 * loop from inside a trap handler, so a socket disconnect is delivered
 * re-entrantly - inside the door's own execution. Tearing the session down at
 * that moment deletes the CPU the handler is standing in.
 *
 * `requestTermination()` is the safe half: it stops the loop and nothing
 * else. `terminate()` - the exit hook, the socket status, the timers - runs
 * once the loop has ended, from the lifecycle's own context. This pins that
 * split, on the manager's own methods, with the collaborators it never
 * touches on this path stubbed out.
 */
import { DoorLifecycleManager } from '../../src/amiga-emulation/session/DoorLifecycleManager';

function aManager() {
  const permissive = () => new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : () => undefined) });
  const emitted: string[] = [];
  const socket: any = { emit: (_e: string, d: any) => { emitted.push(d?.status ?? String(_e)); }, on: () => undefined };
  const manager: any = new DoorLifecycleManager(
    permissive() as any, socket, { executablePath: '/x/door' } as any,
    permissive() as any, permissive() as any, null, undefined,
  );
  // The state a running door is in.
  manager.executionState.isRunning = true;
  let exits = 0;
  manager.setOnExit(() => { exits += 1; });
  return { manager, exits: () => exits, emitted };
}

describe('a teardown asked for from inside the door', () => {
  it('requestTermination stops the loop and does nothing destructive', () => {
    const t = aManager();

    t.manager.requestTermination();

    expect(t.manager.isRunning()).toBe(false);   // the while-condition ends the run
    expect(t.exits()).toBe(0);                    // the exit hook has NOT fired
    expect(t.emitted).not.toContain('terminated');
  });

  it('the deferred terminate still gets through the guard, exactly once', () => {
    const t = aManager();
    t.manager.requestTermination();

    // What the lifecycle's `finally` does once the loop has ended.
    t.manager.deferral.settle(() => t.manager.terminate());

    expect(t.exits()).toBe(1);
    expect(t.emitted).toContain('terminated');

    // And it is one-shot: nothing left to settle, nothing fires twice.
    t.manager.deferral.settle(() => t.manager.terminate());
    t.manager.terminate();
    expect(t.exits()).toBe(1);
  });

  it('a plain terminate on a running door is unchanged', () => {
    const t = aManager();
    t.manager.terminate();
    expect(t.exits()).toBe(1);
    expect(t.manager.isRunning()).toBe(false);
  });

  it('a terminate on a door that already stopped stays a no-op', () => {
    const t = aManager();
    t.manager.executionState.isRunning = false;   // stopped normally, nothing requested
    t.manager.terminate();
    expect(t.exits()).toBe(0);
  });
});
