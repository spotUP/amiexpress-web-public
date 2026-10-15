/**
 * A door listener that throws must not vanish.
 *
 * `EventEmitter.emit` catches every exception a listener throws and carries
 * on, which is correct - one bad handler must not take the rest of the chain
 * or the door down with it. The catch block was also EMPTY, which is not: a
 * plain TypeError thrown from GRANDMASTER's menu handler reached the sysop's
 * board as a black screen with no log line anywhere, and sat two days marked
 * "not investigated". Every door on the board emits through this loop.
 *
 * Both halves are pinned here. The first is the fix (the error is logged,
 * naming the event); the second is the guarantee that the fix cannot break a
 * door (the throw still does not propagate, and the surviving listeners still
 * run and can still return `true`).
 */

import { EventEmitter } from '../../engines/ui/blessed/core/events';

describe('EventEmitter.emit: a throwing listener', () => {
  let errors: string[];
  let spy: jest.SpyInstance;

  beforeEach(() => {
    errors = [];
    spy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map((a) => String(a)).join(' '));
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('is logged, with the event name and the error', () => {
    const emitter = new EventEmitter();
    emitter.on('keypress', () => {
      throw new TypeError('Cannot read properties of undefined (reading \'board\')');
    });

    emitter.emit('keypress', 'x');

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('keypress');
    expect(errors[0]).toContain('TypeError');
    expect(errors[0]).toContain('Cannot read properties of undefined');
  });

  it('names the emitter, so the log line says which widget threw', () => {
    class Menu extends EventEmitter {
      get type(): string {
        return 'list';
      }
      options = { name: 'grandmaster-menu' };
    }
    const menu = new Menu();
    menu.on('select', () => {
      throw new Error('boom');
    });

    menu.emit('select');

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('list');
    expect(errors[0]).toContain('grandmaster-menu');
  });

  it('logs a thrown non-Error too, rather than losing it', () => {
    const emitter = new EventEmitter();
    emitter.on('data', () => {
      throw 'not an error object';
    });

    emitter.emit('data');

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('not an error object');
  });

  // The other half: logging must not change what emit() DOES.
  it('still does not propagate out of emit(), and the chain carries on', () => {
    const emitter = new EventEmitter();
    const ran: string[] = [];

    emitter.on('resize', () => {
      ran.push('first');
      throw new Error('boom');
    });
    emitter.on('resize', () => {
      ran.push('second');
      return true;
    });

    let handled: boolean | undefined;
    expect(() => {
      handled = emitter.emit('resize', 80, 25);
    }).not.toThrow();

    expect(ran).toEqual(['first', 'second']);
    expect(handled).toBe(true);
  });

  it('reports handled=false when the only listener threw', () => {
    const emitter = new EventEmitter();
    emitter.on('click', () => {
      throw new Error('boom');
    });

    expect(emitter.emit('click')).toBe(false);
  });
});
