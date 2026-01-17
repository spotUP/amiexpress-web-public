"use strict";
/**
 * Event emitter implementation for blessed elements
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventEmitter = void 0;
class EventEmitter {
    constructor() {
        this.events = new Map();
    }
    on(event, handler) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push(handler);
        return this;
    }
    once(event, handler) {
        const wrapper = (...args) => {
            this.removeListener(event, wrapper);
            handler(...args);
        };
        return this.on(event, wrapper);
    }
    removeListener(event, handler) {
        const handlers = this.events.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        }
        return this;
    }
    removeAllListeners(event) {
        if (event) {
            this.events.delete(event);
        }
        else {
            this.events.clear();
        }
        return this;
    }
    emit(event, ...args) {
        const handlers = this.events.get(event);
        if (!handlers || handlers.length === 0) {
            return false;
        }
        for (const handler of handlers.slice()) {
            try {
                handler(...args);
            }
            catch (err) {
                console.error(`Error in event handler for "${event}":`, err);
            }
        }
        return true;
    }
    listeners(event) {
        return this.events.get(event) || [];
    }
    listenerCount(event) {
        return this.listeners(event).length;
    }
    eventNames() {
        return Array.from(this.events.keys());
    }
}
exports.EventEmitter = EventEmitter;
