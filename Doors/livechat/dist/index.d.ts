import { metadata } from './config';
export { metadata };
/** Door session from BBS handler */
interface DoorSession {
    socket: any;
    user: any;
    bbsSession: any;
    bbs: any;
    params: string[];
}
/** Main door entry point */
export declare function runDoor(session: DoorSession): Promise<void>;
declare const _default: {
    runDoor: typeof runDoor;
    metadata: import("./config").DoorMetadata;
};
export default _default;
