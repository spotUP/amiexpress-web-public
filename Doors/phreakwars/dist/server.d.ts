/**
 * Phreak Wars SDK Door Server
 *
 * Fully refactored to use proper SDK patterns:
 * - No BBSSession internals access
 * - Game state stored locally in door
 * - Socket.IO input handling
 * - Portable and self-contained
 */
import { ServerDoor } from '@amiexpress/bbs-door-sdk';
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
