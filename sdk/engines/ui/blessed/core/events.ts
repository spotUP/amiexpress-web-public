/**
 * Event emitter implementation for blessed elements
 */

export type EventHandler = (...args: any[]) => void;

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
      handler(...args);
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

    for (const handler of handlers.slice()) {
      try {
        handler(...args);
      } catch (err) {
        console.error(`Error in event handler for "${event}":`, err);
      }
    }

    return true;
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
