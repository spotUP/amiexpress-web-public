interface DoorSession {
    bbs: any;
    bbsSession?: any;
}
export interface WebTerminal {
    rows(): string[]; /** The lines the caller can see now. */
    visible(): string[];
    note(): string;
    stop(): void;
    done: Promise<void>;
}
export declare function startWebTerminal(session: DoorSession): Promise<WebTerminal>;
export declare function createApp(session: DoorSession): Promise<void>;
export declare function runDoor(bbs: any, session?: DoorSession): Promise<void>;
export default runDoor;
//# sourceMappingURL=app.d.ts.map