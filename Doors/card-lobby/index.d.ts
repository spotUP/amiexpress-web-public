/**
 * Card Lobby - Neo-Blessed Desktop UI
 *
 * Full-featured multi-window lobby for card games with PokerEngine support.
 */
interface DoorSession {
    socket: any;
    user: any;
    bbsSession: any;
    bbs: any;
    params: string[];
}
export declare const metadata: {
    name: string;
    version: string;
    description: string;
    author: string;
    command: string;
};
export declare function runDoor(session: DoorSession): Promise<void>;
declare const _default: {
    runDoor: typeof runDoor;
    metadata: {
        name: string;
        version: string;
        description: string;
        author: string;
        command: string;
    };
};
export default _default;
//# sourceMappingURL=index.d.ts.map