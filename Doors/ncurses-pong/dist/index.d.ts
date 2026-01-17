/**
 * ncurses-pong - Port of vicentebolea/Pong-curses
 *
 * Original: https://github.com/vicentebolea/Pong-curses
 * Author: Vicente Adolfo Bolea Sanchez <vicente.bolea@gmail.com>
 *
 * This is a direct port to validate the ncurses compatibility layer.
 */
/** Door metadata */
export declare const metadata: {
    name: string;
    version: string;
    description: string;
    author: string;
    command: string;
};
/** Door session from BBS handler */
interface DoorSession {
    socket: any;
    user: any;
    bbsSession: any;
    bbs: any;
    params: string[];
    doorInputHandler?: (data: string) => void;
}
/** Main door entry point - required by BBS */
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
