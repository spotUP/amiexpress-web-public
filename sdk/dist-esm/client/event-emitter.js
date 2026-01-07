/**
 * Simple EventEmitter for Browser
 * Compatible subset of Node.js EventEmitter API
 */
export class EventEmitter {
    constructor() {
        this.events = new Map();
    }
    /**
     * Register event listener
     */
    on(event, listener) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push(listener);
        return this;
    }
    /**
     * Register one-time event listener
     */
    once(event, listener) {
        const wrapper = (...args) => {
            listener(...args);
            this.off(event, wrapper);
        };
        return this.on(event, wrapper);
    }
    /**
     * Remove event listener
     */
    off(event, listener) {
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
    emit(event, ...args) {
        const listeners = this.events.get(event);
        if (!listeners || listeners.length === 0) {
            return false;
        }
        for (const listener of listeners) {
            try {
                listener(...args);
            }
            catch (err) {
                console.error(`Error in event listener for ${event}:`, err);
            }
        }
        return true;
    }
    /**
     * Remove all listeners for event, or all events
     */
    removeAllListeners(event) {
        if (event) {
            this.events.delete(event);
        }
        else {
            this.events.clear();
        }
        return this;
    }
    /**
     * Get listener count for event
     */
    listenerCount(event) {
        const listeners = this.events.get(event);
        return listeners ? listeners.length : 0;
    }
}
