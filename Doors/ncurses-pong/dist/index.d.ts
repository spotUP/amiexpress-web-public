/**
 * ncurses-pong - Port of vicentebolea/Pong-curses
 *
 * Original: https://github.com/vicentebolea/Pong-curses
 * Author: Vicente Adolfo Bolea Sanchez <vicente.bolea@gmail.com>
 *
 * This is a direct port to validate the ncurses compatibility layer.
 */
import { ServerDoor } from '@amiexpress/bbs-door-sdk';
/** Door metadata */
export declare const metadata: {
    name: string;
    version: string;
    description: string;
    author: string;
    command: string;
};
/**
 * Main door class
 */
declare const door: ServerDoor;
export default door;
