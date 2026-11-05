type View = 'events' | 'detail' | 'delivery' | 'help';
interface DoorSession {
    bbs: any;
    user?: {
        username?: string;
        email?: string;
    };
    bbsSession?: any;
}
export interface Notify {
    /** The list as the caller sees it, tags and all. */
    rows(): string[];
    view(): View;
    note(): string;
    stop(): void;
    /** Resolves when the caller leaves. */
    done: Promise<void>;
}
export declare function startNotify(session: DoorSession): Promise<Notify>;
export declare function createApp(session: DoorSession): Promise<void>;
export declare function runDoor(bbs: any, session?: DoorSession): Promise<void>;
export default runDoor;
//# sourceMappingURL=app.d.ts.map