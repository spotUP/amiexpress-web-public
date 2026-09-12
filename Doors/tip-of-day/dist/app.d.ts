interface DoorSession {
    bbs: any;
    storage: {
        load<T>(key: string): Promise<T | null>;
        save(key: string, data: any): Promise<void>;
    };
}
export declare function createApp(session: DoorSession): Promise<void>;
export {};
//# sourceMappingURL=app.d.ts.map