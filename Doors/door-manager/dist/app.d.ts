/**
 * DOORMAN v2 — SysOp Door Management Tool
 * Spot / Up Rough
 */
interface DoorSession {
    socket: any;
    user: any;
    bbsSession: any;
    bbs: any;
    params: string[];
}
export declare function createApp(session: DoorSession): Promise<void>;
export {};
//# sourceMappingURL=app.d.ts.map