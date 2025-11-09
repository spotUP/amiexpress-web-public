/**
 * Simple EventEmitter for Browser
 * Compatible subset of Node.js EventEmitter API
 */

export class EventEmitter {
  private events: Map<string, Function[]> = new Map();

  /**
   * Register event listener
   */
  public on(event: string, listener: Function): this {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(listener);
    return this;
  }

  /**
   * Register one-time event listener
   */
  public once(event: string, listener: Function): this {
    const wrapper = (...args: any[]) => {
      listener(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  /**
   * Remove event listener
   */
  public off(event: string, listener: Function): this {
    const listeners = this.events.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }

  /**
   * Emit event
   */
  public emit(event: string, ...args: any[]): boolean {
    const listeners = this.events.get(event);
    if (!listeners || listeners.length === 0) {
      return false;
    }

    for (const listener of listeners) {
      try {
        listener(...args);
      } catch (err) {
        console.error(`Error in event listener for ${event}:`, err);
      }
    }

    return true;
  }

  /**
   * Remove all listeners for event, or all events
   */
  public removeAllListeners(event?: string): this {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
    return this;
  }

  /**
   * Get listener count for event
   */
  public listenerCount(event: string): number {
    const listeners = this.events.get(event);
    return listeners ? listeners.length : 0;
  }
}
