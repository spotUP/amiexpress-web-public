"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.events = exports.EventService = void 0;
/** Simple event emitter for chat events */
class EventService {
    constructor() {
        this.handlers = new Map();
    }
    /** Subscribe to event */
    on(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event).add(handler);
    }
    /** Unsubscribe from event */
    off(event, handler) {
        this.handlers.get(event)?.delete(handler);
    }
    /** Emit event to all handlers */
    emit(event, ...args) {
        const handlers = this.handlers.get(event);
        if (handlers) {
            for (const h of handlers) {
                try {
                    h(...args);
                }
                catch (e) { /* ignore */ }
            }
        }
    }
    /** Remove all handlers */
    clear() {
        this.handlers.clear();
    }
}
exports.EventService = EventService;
/** Global events instance */
exports.events = new EventService();
