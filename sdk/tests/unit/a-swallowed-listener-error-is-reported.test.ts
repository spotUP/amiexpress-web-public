/**
 * Swallowing a listener's error must not mean losing the failure.
 *
 * emit() catches what a listener throws on purpose: one bad handler must not
 * take the rest of the chain, or the door, down with it. That is right. What
 * was wrong is that the catch ended at console.error - which no test reads,
 * no exit code reflects, and no deploy checks. Two real door bugs shipped
 * behind it:
 *
 *   - ANSIEditor's draw canvas called `program.setMouse`, blessed's API,
 *     which this engine has never had. It threw on every focus. The sprite
 *     editor died opening a sprite.
 *   - The sprite editor drew its requester with an undefined theme and threw
 *     on `theme.rail`.
 *
 * Both printed. Both exited 0. Both reached the sysop's board.
 *
 * So the engine now REPORTS as well as prints, and the door-suite runner
 * (dev/scripts/run-door-suites.ts) fails any door whose output carries the
 * marker even when its suite exits 0.
 */

import {
  EventEmitter,
  onListenerError,
  listenerErrorCount,
  resetListenerErrorCount,
  LISTENER_ERROR_MARKER,
  type ListenerErrorReport,
} from '../../engines/ui/blessed/core/events';

describe('a swallowed listener error is reported', () => {
  let spy: jest.SpyInstance;

  beforeEach(() => {
    resetListenerErrorCount();
    spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => spy.mockRestore());

  it('still swallows: the chain continues and emit does not throw', () => {
    const emitter = new EventEmitter();
    const ran: string[] = [];
    emitter.on('focus', () => { ran.push('first'); throw new TypeError('boom'); });
    emitter.on('focus', () => { ran.push('second'); });

    expect(() => emitter.emit('focus')).not.toThrow();
    // The point of the swallow: the listener AFTER the broken one still ran.
    expect(ran).toEqual(['first', 'second']);
  });

  it('hands the error to whoever is listening, with the event and the emitter', () => {
    const seen: ListenerErrorReport[] = [];
    const stop = onListenerError((report) => seen.push(report));
    try {
      const emitter = new EventEmitter();
      emitter.on('focus', () => { throw new TypeError('setMouse is not a function'); });
      emitter.emit('focus');
    } finally {
      stop();
    }

    expect(seen).toHaveLength(1);
    expect(seen[0].event).toBe('focus');
    expect(String((seen[0].error as Error).message)).toContain('setMouse');
  });

  it('counts them, so a runner can ask "did anything throw at all"', () => {
    const emitter = new EventEmitter();
    emitter.on('x', () => { throw new Error('one'); });
    emitter.on('y', () => { throw new Error('two'); });

    expect(listenerErrorCount()).toBe(0);
    emitter.emit('x');
    emitter.emit('y');
    expect(listenerErrorCount()).toBe(2);
  });

  it('prints the marker the door-suite runner greps for', () => {
    const emitter = new EventEmitter();
    emitter.on('focus', () => { throw new Error('boom'); });
    emitter.emit('focus');

    const printed = spy.mock.calls.map((args) => args.join(' ')).join('\n');
    // Machine-readable on purpose: a reworded sentence must not silently
    // switch the runner's check off.
    expect(printed).toContain(LISTENER_ERROR_MARKER);
  });

  it('unsubscribes, and a reporter that throws does not resurrect the problem', () => {
    const seen: string[] = [];
    const stop = onListenerError(() => { throw new Error('the reporter is broken too'); });
    const stopGood = onListenerError((r) => seen.push(r.event));
    try {
      const emitter = new EventEmitter();
      emitter.on('focus', () => { throw new Error('boom'); });
      // A broken reporter must not break emit, nor the other reporters.
      expect(() => emitter.emit('focus')).not.toThrow();
      expect(seen).toEqual(['focus']);
    } finally {
      stop();
      stopGood();
    }

    const after: string[] = [];
    const stopAfter = onListenerError((r) => after.push(r.event));
    stopAfter();
    const emitter = new EventEmitter();
    emitter.on('blur', () => { throw new Error('boom'); });
    emitter.emit('blur');
    expect(after).toEqual([]);
  });
});
