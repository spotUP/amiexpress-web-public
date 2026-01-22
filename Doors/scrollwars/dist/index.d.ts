/**
 * Scrollwars - Realtime multiuser line chat
 *
 * Each user owns a line. Text scrolls left when it reaches the edge.
 * Enter clears the user's line; Backspace deletes; ESC exits.
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
declare const door: ServerDoor;
export default door;
