/**
 * TTWORMS - Worms, in teletext, on a board that can actually compute.
 *
 * Team17 built Worms for teletext in 1996 and it was broadcast for six
 * weeks. It worked by precomputing every screen the game could ever reach
 * and transmitting them as hidden pages, because a television had no
 * processor and no way to send anything back. It was shelved because a
 * day's broadcast could not hold enough pages.
 *
 * Neither limit applies here. The board works out the shot and composes
 * the page for it, and the caller's keys arrive over a socket. The result
 * is still an ordinary teletext page - 40 columns, block graphics at 2x3
 * pixels a cell, an 80 by 60 battlefield - just one that could not have
 * been sent down a vertical blanking interval.
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
