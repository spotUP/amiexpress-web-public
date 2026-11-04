/**
 * CTOP - Conference Top Uploaders, ported from Conftop-II.
 *
 * The Amiga door is `Doors/Conftop/ctop`, a 68K binary by REbEL/QTX whose
 * source is in `~/Code/Reference/AmiExpressEDoorSources/
 * Conftop-II/ctop.e`. It was served to a C64 caller through the board's frame
 * adapter, which takes an eighty-column screen apart row by row - and a table
 * IS its columns, so what a C64 got was not a table. The sysop asked for the
 * same treatment GL got: "so it should be fixed like we did with the others
 * add a proper c64 view to conftop" (2026-09-22).
 *
 * THREE SCREENS, as every door on this board owes:
 *   80 columns - byte for byte what the 68K painted, pinned to a capture of
 *                the real binary (`tests/doors/ctop`)
 *   wider      - the same table with the surplus spent on the two fields the
 *                Amiga was cutting off, the handle and the location
 *   40 columns - its own layout: rank, handle, files, bytes, and a footer
 *                that keeps both record holders
 *
 * AND THE PERIOD STILL ROLLS. The 68K door is the only thing on this board
 * that ends a week and names its winner, so the port carries that too - see
 * `src/reset.ts`, which is why this is a port and not a viewer.
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
//# sourceMappingURL=index.d.ts.map