/**
 * A door is killed for being stuck, not for being used.
 *
 * DoorLifecycleManager armed a plain setTimeout for the configured timeout
 * the moment a door started and fired it whatever the door was doing, so a
 * door a caller was READING died on the same schedule as a door that had
 * wedged: TEXTTV went down at +310s with the sysop mid-page (2026-09-13).
 */
import { createInactivityFuse } from '../../src/amiga-emulation/session/inactivity-fuse';

/** A clock and a timer queue we drive by hand. */
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeoutFn: (fn: () => void, ms: number) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeoutFn: (id: number) => { pending.delete(id); },
    /** Advance the clock, firing whatever falls due on the way. */
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        let due: { id: number; at: number; fn: () => void } | null = null;
        for (const [id, entry] of pending) {
          if (entry.at <= target && (due === null || entry.at < due.at)) {
            due = { id, ...entry };
          }
        }
        if (!due) break;
        pending.delete(due.id);
        now = due.at;
        due.fn();
      }
      now = target;
    },
    get count() { return pending.size; },
  };
}

describe('the door inactivity fuse', () => {
  it('fires after the timeout when the door says nothing', () => {
    const timers = fakeTimers();
    let expired = 0;
    createInactivityFuse({ seconds: 300, onExpire: () => { expired += 1; }, ...timers });

    timers.advance(299_000);
    expect(expired).toBe(0);
    timers.advance(2_000);
    expect(expired).toBe(1);
  });

  it('does NOT fire while the door keeps working - the TEXTTV case', () => {
    const timers = fakeTimers();
    let expired = 0;
    const fuse = createInactivityFuse({ seconds: 300, onExpire: () => { expired += 1; }, ...timers });

    // Ten minutes of reading: a keypress every half minute.
    for (let i = 0; i < 20; i += 1) {
      timers.advance(30_000);
      fuse.touch();
    }
    expect(expired).toBe(0);
    expect(fuse.armed()).toBe(true);

    // Then the door wedges, and the fuse burns down from the LAST touch.
    timers.advance(301_000);
    expect(expired).toBe(1);
    expect(fuse.armed()).toBe(false);
  });

  it('still gives the node back when a door is abandoned mid-animation', () => {
    // The SDK doors slide their rail ~5 times a second while waiting for a
    // key, so "activity" alone would keep a walked-away caller's door alive
    // for ever. The ceiling does not move.
    const timers = fakeTimers();
    let expired = 0;
    const fuse = createInactivityFuse({
      seconds: 300, maxSeconds: 3600, onExpire: () => { expired += 1; }, ...timers,
    });

    for (let i = 0; i < 60 * 60 * 5; i += 1) {   // five "frames" a second, one hour
      timers.advance(200);
      fuse.touch();
    }
    expect(expired).toBe(1);
    expect(fuse.armed()).toBe(false);
  });

  it('leaves no timer behind when it is cleared, or after it fires', () => {
    const timers = fakeTimers();
    const fuse = createInactivityFuse({ seconds: 300, maxSeconds: 3600, onExpire: () => {}, ...timers });
    expect(timers.count).toBe(2);
    fuse.clear();
    expect(timers.count).toBe(0);
    expect(fuse.armed()).toBe(false);
    fuse.clear();                                  // twice is safe
    fuse.touch();                                  // and a touch after clearing does nothing
    expect(timers.count).toBe(0);

    const timers2 = fakeTimers();
    let expired = 0;
    createInactivityFuse({ seconds: 10, maxSeconds: 3600, onExpire: () => { expired += 1; }, ...timers2 });
    timers2.advance(11_000);
    expect(expired).toBe(1);
    expect(timers2.count).toBe(0);                 // the ceiling was cancelled with it
  });

  it('a timeout of zero is a door that is never timed out', () => {
    const timers = fakeTimers();
    let expired = 0;
    const fuse = createInactivityFuse({ seconds: 0, onExpire: () => { expired += 1; }, ...timers });
    timers.advance(24 * 60 * 60 * 1000);
    expect(expired).toBe(0);
    expect(fuse.armed()).toBe(false);
    expect(timers.count).toBe(0);
  });

  it('reports how long it has been idle, and how long it has been lit', () => {
    const timers = fakeTimers();
    const fuse = createInactivityFuse({ seconds: 300, onExpire: () => {}, ...timers });
    timers.advance(120_000);
    expect(fuse.idleMs()).toBe(120_000);
    fuse.touch();
    timers.advance(45_000);
    expect(fuse.idleMs()).toBe(45_000);
    expect(fuse.aliveMs()).toBe(165_000);
  });
});

/**
 * The wiring, driven on the manager itself. DoorLifecycleManager IS
 * constructible with its collaborators stubbed - the technique
 * tests/amiga-emulation/a-teardown-from-inside-the-door-waits-for-it-to-unwind
 * uses - so what is held here runs: startLifecycle arms the door's timeout AS
 * the fuse, door traffic (an XIM message, a library call) pushes it back, and
 * the fuse dies with the door. jest's clock stands in for the wall clock the
 * manager hands the fuse; setImmediate stays real because the execution loop
 * yields through it.
 */
import { DoorLifecycleManager } from '../../src/amiga-emulation/session/DoorLifecycleManager';

/** What installMessageCallbacks was handed, so a test can deliver an XIM message. */
const messageDeps: { incrementMessagesHandled?: () => void } = {};
jest.mock('../../src/amiga-emulation/session/lifecycle/door-message-callbacks', () => {
  const actual = jest.requireActual('../../src/amiga-emulation/session/lifecycle/door-message-callbacks');
  return {
    ...actual,
    installMessageCallbacks: (deps: { incrementMessagesHandled: () => void }) => {
      messageDeps.incrementMessagesHandled = deps.incrementMessagesHandled;
    },
  };
});

describe('DoorLifecycleManager arms the fuse rather than a wall clock', () => {
  const SECOND = 1000;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
    delete messageDeps.incrementMessagesHandled;
  });

  /**
   * Anything asked of it answers: every property is another of these, and
   * calling one returns 0 - a stand-in for the emulator and the libraries,
   * none of which this timeout ever consults.
   */
  const permissive = (): any =>
    new Proxy(function stub() { return 0; }, {
      get: (_t, k) => (k === 'then' ? undefined : permissive()),
      apply: () => 0,
    });

  /**
   * A manager for a door whose registration carries `timeout` (or none), with
   * the event loop left out unless `realLoop` - the timeout is what is under
   * test, not the 68K loop.
   */
  async function aRunningDoor(timeout: number | undefined, opts: { realLoop?: boolean } = {}) {
    const events: string[] = [];
    const socket: any = {
      emit: (event: string, data: any) => { events.push(event === 'door:status' ? data.status : event); },
      on: () => undefined,
    };
    const manager: any = new DoorLifecycleManager(
      permissive(), socket, { executablePath: '/x/door', timeout } as any,
      permissive(), permissive(), null, undefined,
    );
    if (!opts.realLoop) manager.runExecutionLoop = async () => undefined;
    return { manager, events, started: manager.startLifecycle() as Promise<void> };
  }

  const killedForSilence = (events: string[]) => events.includes('door:error');

  it('kills a silent door after its configured timeout, not before', async () => {
    const door = await aRunningDoor(120);
    await door.started;

    jest.advanceTimersByTime(119 * SECOND);
    expect(killedForSilence(door.events)).toBe(false);
    jest.advanceTimersByTime(2 * SECOND);
    expect(killedForSilence(door.events)).toBe(true);
    expect(door.events).toContain('terminated');
  });

  it('arms it even for a door whose registration names no timeout', async () => {
    // It used to be `if (this.lifecycleConfig.timeout)`, so a door with none -
    // GWall is one - had nothing watching it at all. When its server stopped
    // answering, its error path spun at pc 0x8184 and held the node until the
    // container was restarted: "fix gwall first i cant log in" (sysop,
    // 2026-09-19).
    const door = await aRunningDoor(undefined);
    await door.started;

    jest.advanceTimersByTime(299 * SECOND);
    expect(killedForSilence(door.events)).toBe(false);
    jest.advanceTimersByTime(2 * SECOND);
    expect(killedForSilence(door.events)).toBe(true);
  });

  it('is pushed back by every XIM message the door handles', async () => {
    const door = await aRunningDoor(120);
    await door.started;
    expect(messageDeps.incrementMessagesHandled).toBeDefined();

    // Ten minutes of a caller reading: a message every half minute.
    for (let i = 0; i < 20; i += 1) {
      jest.advanceTimersByTime(30 * SECOND);
      messageDeps.incrementMessagesHandled!();
    }
    expect(killedForSilence(door.events)).toBe(false);
  });

  it('still has a ceiling a busy door cannot push past', async () => {
    // One hour, however much the door talks: an abandoned animated door must
    // give the node back.
    const door = await aRunningDoor(120);
    await door.started;

    for (let i = 0; i < 61; i += 1) {
      jest.advanceTimersByTime(60 * SECOND);
      messageDeps.incrementMessagesHandled!();
    }
    expect(killedForSilence(door.events)).toBe(true);
  });

  it('is pushed back by every library call, not only by XIM messages', async () => {
    /*
     * A door doing a long stretch of ordinary library work - reading files,
     * drawing through dos.library - was burning the fuse down while working
     * perfectly. The other half of the same rule is what catches GWall: a door
     * that has stopped calling the board entirely.
     *
     * The REAL execution loop runs here, over a PC that is always a trap
     * address; each library call takes a minute of the clock, and the door
     * makes five of them against a two-minute timeout.
     */
    let calls = 0;
    const door = await aRunningDoor(120, { realLoop: true });
    door.manager.setLibraryTraps({ isTrapAddress: () => true } as any);
    door.manager.trapDispatcher = {
      checkAndHandleLibraryTrap: () => {
        calls += 1;
        jest.advanceTimersByTime(60 * SECOND);
        if (calls >= 5) door.manager.executionState.isRunning = false;
        return true;
      },
      handleTrapExecution: () => undefined,
    };
    await door.started;

    expect(calls).toBe(5);
    expect(killedForSilence(door.events)).toBe(false);
  });

  it('dies with the door', async () => {
    const door = await aRunningDoor(120);
    await door.started;

    door.manager.terminate();
    jest.advanceTimersByTime(7200 * SECOND);

    expect(killedForSilence(door.events)).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });
});
