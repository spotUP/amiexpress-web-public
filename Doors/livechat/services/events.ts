type EventHandler = (...args: any[]) => void;

/** Simple event emitter for chat events */
export class EventService {
  private handlers = new Map<string, Set<EventHandler>>();

  /** Subscribe to event */
  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  /** Unsubscribe from event */
  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  /** Emit event to all handlers */
  emit(event: string, ...args: any[]): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const h of handlers) {
        try { h(...args); } catch (e) { /* ignore */ }
      }
    }
  }

  /** Remove all handlers */
  clear(): void {
    this.handlers.clear();
  }
}

/** Global events instance */
export const events = new EventService();
