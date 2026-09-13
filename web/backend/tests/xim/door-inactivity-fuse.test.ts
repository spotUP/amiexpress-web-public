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
 * The wiring, pinned at the source. DoorLifecycleManager is not
 * unit-constructible (it wants an emulator, a socket and a loaded binary), so
 * what is held here is that the door's timeout is BUILT from the fuse and
 * TOUCHED by door traffic - the two edits that turn the behaviour above into
 * behaviour on the board.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('DoorLifecycleManager arms the fuse rather than a wall clock', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../src/amiga-emulation/session/DoorLifecycleManager.ts'),
    'utf8',
  );

  it('builds the execution timeout through createInactivityFuse', () => {
    expect(src).toContain('createInactivityFuse({');
    expect(src).toContain('seconds: this.lifecycleConfig.timeout,');
    expect(src).toContain('maxSeconds: DOOR_ABSOLUTE_TIMEOUT_SECONDS,');
    // The shape it replaced: a timer armed once, for the whole timeout.
    expect(src).not.toContain('}, this.lifecycleConfig.timeout * 1000);');
  });

  it('touches it on every XIM message the door handles', () => {
    const block = src.slice(
      src.indexOf('incrementMessagesHandled:'),
      src.indexOf('incrementMessagesHandled:') + 240,
    );
    expect(block).toContain('this.inactivityFuse?.touch()');
  });

  it('clears it when the door ends', () => {
    expect(src).toContain('this.inactivityFuse.clear();');
  });
});
