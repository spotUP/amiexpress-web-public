/**
 * Event emitter implementation for blessed elements
 */

export type EventHandler = (...args: any[]) => boolean | void;

/**
 * The marker a swallowed listener error carries, on every line it prints.
 *
 * Grepping for this string is how a TEST RUNNER finds out that a door threw
 * while still exiting 0 - see dev/scripts/run-door-suites.ts. It is a stable
 * token rather than prose because something machine-readable has to survive
 * a wording change.
 */
export const LISTENER_ERROR_MARKER = '[LISTENER-ERROR]';

/** What a listener threw, and where. */
export interface ListenerErrorReport {
  event: string;
  emitter: string;
  error: unknown;
}

const listenerErrorHandlers: Array<(report: ListenerErrorReport) => void> = [];
let listenerErrorCounter = 0;

/**
 * Watch for listener errors that emit() swallows.
 *
 * The swallow protects the door - one bad listener must not take the rest of
 * the chain down - but it also means NOTHING FAILS when a door is broken.
 * Two real door bugs lived behind it: the ANSI editor calling a
 * `program.setMouse` this engine never had, which threw on every focus of
 * the draw canvas, and the sprite editor drawing its requester with an
 * undefined theme. Both printed to console.error, both exited 0, and both
 * shipped. A test that wants to be honest about this registers here and
 * asserts nothing arrived.
 *
 * Returns the unsubscribe.
 */
export function onListenerError(handler: (report: ListenerErrorReport) => void): () => void {
  listenerErrorHandlers.push(handler);
  return () => {
    const i = listenerErrorHandlers.indexOf(handler);
    if (i !== -1) listenerErrorHandlers.splice(i, 1);
  };
}

/** How many listener errors have been swallowed since the last reset. */
export function listenerErrorCount(): number {
  return listenerErrorCounter;
}

/** Forget the count, for a test that wants a clean slate per case. */
export function resetListenerErrorCount(): void {
  listenerErrorCounter = 0;
}

export class EventEmitter {
  private events: Map<string, EventHandler[]> = new Map();

  on(event: string, handler: EventHandler): this {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(handler);
    return this;
  }

  once(event: string, handler: EventHandler): this {
    const wrapper = (...args: any[]) => {
      this.removeListener(event, wrapper);
      return handler(...args);
    };
    return this.on(event, wrapper);
  }

  removeListener(event: string, handler: EventHandler): this {
    const handlers = this.events.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
    return this;
  }

  // Alias for removeListener (Node.js EventEmitter compatibility)
  off(event: string, handler: EventHandler): this {
    return this.removeListener(event, handler);
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const handlers = this.events.get(event);
    if (!handlers || handlers.length === 0) {
      return false;
    }

    let handled = false;
    for (const handler of handlers.slice()) {
      try {
        if (handler(...args) === true) {
          handled = true;
        }
      } catch (err) {
        // Swallowing is deliberate: one door listener throwing must not take
        // the rest of the chain - or the door - down with it. LOSING the
        // error was not. A plain TypeError in GRANDMASTER's menu handler
        // reached the sysop's board as a black screen with no log line
        // anywhere and sat two days marked "not investigated"; every door on
        // the board is emitted into through this loop. Control flow is
        // unchanged - we only stop discarding the evidence.
        const stack = (err as { stack?: unknown } | null)?.stack;
        const detail = typeof stack === 'string' ? stack : String(err);
        const emitter = this.describeEmitter();
        console.error(
          `[EventEmitter]${LISTENER_ERROR_MARKER} listener for '${event}' on ${emitter} threw: ${detail}`
        );
        // Logging is not failing. console.error keeps a door running and
        // keeps the evidence, but nothing reads it: a suite still exits 0
        // and a deploy still goes out. Anyone who wants this to COUNT -
        // a test runner, the board's door host - listens here.
        listenerErrorCounter++;
        for (const report of listenerErrorHandlers.slice()) {
          try {
            report({ event, emitter, error: err });
          } catch {
            // A reporter that throws must not resurrect the problem it
            // exists to report, nor stop the other reporters.
          }
        }
      }
    }

    return handled;
  }

  /**
   * Best-effort identity of whatever is emitting, for the error line above.
   * A door name is not reachable from here - this class is the base of
   * Element/Program and knows nothing of Door - so the widget kind and the
   * element's own name are the closest thing to "which door" the line can
   * carry without a new dependency.
   */
  private describeEmitter(): string {
    const self = this as unknown as { type?: unknown; options?: { name?: unknown } };
    const kind = typeof self.type === 'string' ? self.type : this.constructor.name;
    const name = self.options && typeof self.options.name === 'string' ? self.options.name : '';
    return name ? `${kind} '${name}'` : kind;
  }

  listeners(event: string): EventHandler[] {
    return this.events.get(event) || [];
  }

  listenerCount(event: string): number {
    return this.listeners(event).length;
  }

  eventNames(): string[] {
    return Array.from(this.events.keys());
  }
}
