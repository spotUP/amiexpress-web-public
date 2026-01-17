/**
 * Door Manager - SysOp Door Management Tool
 *
 * Manage installed BBS doors with neo-blessed UI.
 * Features:
 * - View installed doors with details (type, size, access level)
 * - Browse door archives (LZX, LHA, ZIP, etc.)
 * - Edit door .info files
 * - Upload new doors
 */
interface DoorSession {
    socket: any;
    user: any;
    bbsSession: any;
    bbs: any;
    params: string[];
}
/**
 * Main application entry point
 */
export declare function createApp(session: DoorSession): Promise<void>;
export {};
//# sourceMappingURL=app.d.ts.map