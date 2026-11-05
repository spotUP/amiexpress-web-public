/**
 * TELETEXT - browse the teletext service packs installed on this board.
 *
 * Ceefax, Oracle and 4-Tel pages survive because people recovered them off
 * home VHS tapes; a pack is one of those recoveries plus a manifest. The
 * door replays them the way they went out: page numbers, subpage carousels,
 * the four coloured fastext keys, and reveal for a concealed answer. The
 * interactive pages of the era - Bamboozle, the quizzes, the unearthed
 * pages of Worms for Teletext - were never programs, only page graphs, so
 * following the links IS playing them.
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
