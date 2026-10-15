/**
 * BEEB - a BBC Micro on the board.
 *
 * The emulator is jsbeeb, vendored at vendor/jsbeeb and served by the board
 * at /beeb/ as its own program (it is GPL-3; see vendor/jsbeeb/NOTICE.md).
 * The board supplies it with the sysop's ROMs and the sysop's software -
 * there is no open-source BBC ROM, so nothing here ships one.
 *
 * This door is CLIENT_ONLY: a BBC Micro is a bitmap machine and a caller
 * without a browser cannot be shown one. The board turns those callers away
 * before the door runs.
 */
import { ServerDoor } from '@amiexpress/bbs-door-sdk';
export declare const metadata: {
    name: string;
    version: string;
    description: string;
    author: string;
    command: string;
};
declare const door: ServerDoor;
export default door;
