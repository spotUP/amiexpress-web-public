interface DoorSession {
    bbs: any;
    user?: {
        username?: string;
    };
}
export declare function createApp(session: DoorSession): Promise<void>;
export declare function runDoor(bbs: any, session?: DoorSession): Promise<void>;
export default runDoor;
//# sourceMappingURL=app.d.ts.map