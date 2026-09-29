interface DoorSession {
    bbs: any;
    /** The board session; `doorCommand` is the command this door was run as. */
    bbsSession?: {
        doorCommand?: string;
    };
    storage: {
        load<T>(key: string): Promise<T | null>;
        save(key: string, data: any): Promise<void>;
    };
}
export declare function createApp(session: DoorSession): Promise<void>;
export {};
//# sourceMappingURL=app.d.ts.map