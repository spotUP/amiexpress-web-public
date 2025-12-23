/**
 * Event emitter implementation for blessed elements
 */
export type EventHandler = (...args: any[]) => void;
export declare class EventEmitter {
    private events;
    on(event: string, handler: EventHandler): this;
    once(event: string, handler: EventHandler): this;
    removeListener(event: string, handler: EventHandler): this;
    removeAllListeners(event?: string): this;
    emit(event: string, ...args: any[]): boolean;
    listeners(event: string): EventHandler[];
    listenerCount(event: string): number;
    eventNames(): string[];
}
