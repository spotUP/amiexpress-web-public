/**
 * ncurses-pong - Port of vicentebolea/Pong-curses
 *
 * Original: https://github.com/vicentebolea/Pong-curses
 * Author: Vicente Adolfo Bolea Sanchez <vicente.bolea@gmail.com>
 *
 * This is a direct port to validate the ncurses compatibility layer.
 *
 * The door took no input on any surface until 2026-09-03: `onStart` used to
 * `await pong.onStart(context)` - the C game loop - while `onInput` sat
 * registered below. `Door.execute()` only reaches the SDK input loop, the one
 * thing that installs `bbsSession.doorInputHandler` (sdk/src/core/Door.ts:250),
 * after every start handler has RESOLVED (sdk/src/core/Door.ts:118-131), and
 * both live routers read exactly that property (web:
 * web/backend/src/server/socket-handlers.ts:779; telnet:
 * web/backend/src/index.ts:1241). The loop was never reached, the handler was
 * never installed, and every keystroke fell through to the `door:input`
 * dead-drop at socket-handlers.ts:783.
 *
 * Report: .superpowers/sdd/2026-09-03-ncurses-pong-input/progress.md
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
