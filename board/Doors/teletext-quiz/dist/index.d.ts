/**
 * TTQUIZ - a teletext quiz on pages composed as you play.
 *
 * Bamboozle, the quiz this is shaped after, was not a program. A television
 * had no processor and no return path, so every question and every outcome
 * was drawn in advance and broadcast as its own page, and the game was the
 * graph of page numbers between them. A BBS has the processor and the
 * return path, so the page can be built for this question, this score, this
 * caller - while still being an ordinary teletext page, concealed answer
 * and all.
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
