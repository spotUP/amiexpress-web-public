export interface DoorSession {
    socket: {
        emit(event: string, data?: unknown): void;
        on(event: string, handler: (...args: unknown[]) => void): void;
        off?(event: string, handler: (...args: unknown[]) => void): void;
    };
    bbsSession: Record<string, unknown>;
    user?: {
        username?: string;
    };
    close(): void;
}
export declare class BeebApp {
    private readonly session;
    private readonly keys;
    private readonly startDir;
    private titles;
    private roms;
    private at;
    private top;
    private running;
    private closed;
    private readonly onEmulatorClosed;
    constructor(session: DoorSession, startDir?: string);
    start(): void;
    stop(): void;
    handleInput(data: string): void;
    private onArrow;
    private handleKey;
    private launchSelected;
    private launchBare;
    private launch;
    private onReturn;
    private quit;
    private paint;
    private write;
}
