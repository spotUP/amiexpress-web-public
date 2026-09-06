/**
 * Event emitter implementation for blessed elements
 */

export type EventHandler = (...args: any[]) => boolean | void;

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
        console.error(
          `[EventEmitter] listener for '${event}' on ${this.describeEmitter()} threw: ${detail}`
        );
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
