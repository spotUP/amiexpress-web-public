type EventHandler = (...args: any[]) => void;
/** Simple event emitter for chat events */
export declare class EventService {
    private handlers;
    /** Subscribe to event */
    on(event: string, handler: EventHandler): void;
    /** Unsubscribe from event */
    off(event: string, handler: EventHandler): void;
    /** Emit event to all handlers */
    emit(event: string, ...args: any[]): void;
    /** Remove all handlers */
    clear(): void;
}
/** Global events instance */
export declare const events: EventService;
export {};
