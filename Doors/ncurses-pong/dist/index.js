"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const app_js_1 = require("./app.js");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
/** Door metadata */
exports.metadata = {
    name: 'ncurses-pong',
    version: '1.0.0',
    description: 'Classic Pong game (ncurses port)',
    author: 'Vicente Bolea (original), AmiExpress (port)',
    command: 'PONG',
};
/**
 * Main door class
 */
const door = new bbs_door_sdk_1.ServerDoor(exports.metadata);
/**
 * The live game for each node.
 *
 * The old code stashed the key handler on the door context behind an `any`
 * cast; the node id is the key the BBS itself uses, and it is the one
 * `Door.execute()` hands every handler (`ctx.nodeId`).
 */
const games = new Map();
// Parse escape sequences into key names
function parseKeyData(data) {
    const sequence = data;
    // Arrow keys and special keys via escape sequences
    if (sequence.startsWith('\x1b[') || sequence.startsWith('\x1bO')) {
        // CSI sequences (ESC [ ...)
        if (sequence === '\x1b[A' || sequence === '\x1bOA')
            return { key: { name: 'up', sequence } };
        if (sequence === '\x1b[B' || sequence === '\x1bOB')
            return { key: { name: 'down', sequence } };
        if (sequence === '\x1b[C' || sequence === '\x1bOC')
            return { key: { name: 'right', sequence } };
        if (sequence === '\x1b[D' || sequence === '\x1bOD')
            return { key: { name: 'left', sequence } };
        if (sequence === '\x1b[H' || sequence === '\x1bOH')
            return { key: { name: 'home', sequence } };
        if (sequence === '\x1b[F' || sequence === '\x1bOF')
            return { key: { name: 'end', sequence } };
        if (sequence === '\x1b[5~')
            return { key: { name: 'pageup', sequence } };
        if (sequence === '\x1b[6~')
            return { key: { name: 'pagedown', sequence } };
        if (sequence === '\x1b[2~')
            return { key: { name: 'insert', sequence } };
        if (sequence === '\x1b[3~')
            return { key: { name: 'delete', sequence } };
        // F1-F4 (SS3)
        if (sequence === '\x1bOP')
            return { key: { name: 'f1', sequence } };
        if (sequence === '\x1bOQ')
            return { key: { name: 'f2', sequence } };
        if (sequence === '\x1bOR')
            return { key: { name: 'f3', sequence } };
        if (sequence === '\x1bOS')
            return { key: { name: 'f4', sequence } };
    }
    // ESC alone
    if (sequence === '\x1b')
        return { key: { name: 'escape', sequence } };
    // Backspace
    if (sequence === '\x7f' || sequence === '\x08')
        return { key: { name: 'backspace', sequence } };
    // Enter
    if (sequence === '\r' || sequence === '\n')
        return { key: { name: 'enter', sequence } };
    // Tab
    if (sequence === '\t')
        return { key: { name: 'tab', sequence } };
    // Regular character
    return { key: { name: data, sequence } };
}
/** ncurses `initscr()` takes any object that can put bytes on the wire. */
function ncursesContext(socket) {
    return {
        emit: (event, data) => {
            if (event === 'ansi-output') {
                socket.emit('ansi-output', data);
            }
        },
        write: (data) => socket.emit('ansi-output', data),
    };
}
door.onStart(async (ctx) => {
    const { socket, bbs } = ctx;
    const pong = new app_js_1.PongDoor();
    games.set(ctx.nodeId, pong);
    // Game mode is what makes the client send key events at all, so it comes
    // first: `session.gameModeEnabled` is set and `game-mode true` goes to the
    // browser (BBSApi.ts:444-447 -> services/game-mode.service.ts:20-30).
    bbs?.enableGameMode?.();
    // ...and then the real key EDGES, which is the half that was missing. A
    // key-down alone reaches the door through `doorInputHandler`, but holding a
    // key only re-sends key-down after the client's 400 ms repeat delay
    // (packages/terminal/src/components/BBSTerminal.tsx:1342), so the paddle
    // hesitated and then stuttered. key-up never reaches `doorInputHandler` at
    // all - `socket-handlers.ts:551-570` gives releases only to
    // `doorKeyStateHandler`, which is exactly what these two install.
    //
    // This is the mechanism the twelve arcade doors use; they reach it through
    // `DoorInputManager({ enableGameMode: true, trackHeldKeys: true })`, which
    // calls these same two methods (door-input-manager.ts:257-279). PONG cannot
    // use that wrapper: it requires a blessed `Screen` and its `enable()` would
    // call `setupInputHandler` (door-input-manager.ts:209), replacing the
    // `doorInputHandler` this door's SDK input loop owns. Same mechanism,
    // without the blessed layer an ncurses door does not have.
    //
    // Registration order matters: onKeyUp WRAPS the handler onKeyDown installed
    // (BBSApi.ts:604-615), so down must be registered first.
    const keys = bbs;
    keys?.onKeyDown?.((key) => pong.holdKey(key));
    keys?.onKeyUp?.((key) => pong.releaseKey(key));
    pong.hold = (0, blessed_helpers_1.honourDoorHold)(ctx);
    pong.start(ncursesContext(socket), () => {
        // ESC. `ctx.close()` (sdk/src/core/Door.ts:227) only drops this node's
        // running-session entry; the SDK input loop then resolves on the NEXT
        // keystroke (sdk/src/core/Door.ts:212-217), which is what the line below
        // is asking for.
        socket.emit('ansi-output', '\r\nThanks for playing PONG. Press any key to exit...\r\n');
        ctx.close();
    });
    // onStart RETURNS here, and that is the whole point - see the header.
    // The SDK's input loop is this door's stay-alive: it holds `execute()` open
    // until the socket disconnects, the BBS sends `door:close`, or the door
    // itself says it is finished via the quit path above.
});
door.onInput(async (ctx, key) => {
    const pong = games.get(ctx.nodeId);
    if (!pong)
        return;
    const { key: keyData } = parseKeyData(key.raw);
    pong.handleKey(keyData.name ?? key.raw);
});
door.onClose(async (ctx) => {
    const pong = games.get(ctx.nodeId);
    if (pong) {
        pong.stop();
        games.delete(ctx.nodeId);
    }
    ctx.bbs?.disableGameMode?.();
    // The key-edge callbacks close over the PongDoor above, and neither the TS
    // door teardown (handlers/door.handler.ts:2374, which deletes
    // doorInputHandler only) nor DoorInputManager.disable() clears this one.
    // Leaving it pointed at a stopped game is a leak this door introduced, so
    // this door drops it.
    if (ctx.bbsSession) {
        delete ctx.bbsSession.doorKeyStateHandler;
    }
});
exports.default = door;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBb0JHOzs7QUFFSCwyREFBNkU7QUFDN0UscUNBQW9DO0FBQ3BDLG9GQUFnRjtBQUVoRixvQkFBb0I7QUFDUCxRQUFBLFFBQVEsR0FBRztJQUN0QixJQUFJLEVBQUUsY0FBYztJQUNwQixPQUFPLEVBQUUsT0FBTztJQUNoQixXQUFXLEVBQUUsa0NBQWtDO0lBQy9DLE1BQU0sRUFBRSw2Q0FBNkM7SUFDckQsT0FBTyxFQUFFLE1BQU07Q0FDaEIsQ0FBQztBQUVGOztHQUVHO0FBQ0gsTUFBTSxJQUFJLEdBQUcsSUFBSSx5QkFBVSxDQUFDLGdCQUFRLENBQUMsQ0FBQztBQUV0Qzs7Ozs7O0dBTUc7QUFDSCxNQUFNLEtBQUssR0FBRyxJQUFJLEdBQUcsRUFBb0IsQ0FBQztBQUUxQyx3Q0FBd0M7QUFDeEMsU0FBUyxZQUFZLENBQUMsSUFBWTtJQUNoQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUM7SUFFdEIsbURBQW1EO0lBQ25ELElBQUksUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxRQUFRLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDakUsNEJBQTRCO1FBQzVCLElBQUksUUFBUSxLQUFLLFFBQVEsSUFBSSxRQUFRLEtBQUssUUFBUTtZQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxFQUFFLENBQUM7UUFDN0YsSUFBSSxRQUFRLEtBQUssUUFBUSxJQUFJLFFBQVEsS0FBSyxRQUFRO1lBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztRQUMvRixJQUFJLFFBQVEsS0FBSyxRQUFRLElBQUksUUFBUSxLQUFLLFFBQVE7WUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDO1FBQ2hHLElBQUksUUFBUSxLQUFLLFFBQVEsSUFBSSxRQUFRLEtBQUssUUFBUTtZQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxFQUFFLENBQUM7UUFDL0YsSUFBSSxRQUFRLEtBQUssUUFBUSxJQUFJLFFBQVEsS0FBSyxRQUFRO1lBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztRQUMvRixJQUFJLFFBQVEsS0FBSyxRQUFRLElBQUksUUFBUSxLQUFLLFFBQVE7WUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDO1FBQzlGLElBQUksUUFBUSxLQUFLLFNBQVM7WUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDO1FBQ3pFLElBQUksUUFBUSxLQUFLLFNBQVM7WUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDO1FBQzNFLElBQUksUUFBUSxLQUFLLFNBQVM7WUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDO1FBQ3pFLElBQUksUUFBUSxLQUFLLFNBQVM7WUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDO1FBQ3pFLGNBQWM7UUFDZCxJQUFJLFFBQVEsS0FBSyxRQUFRO1lBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztRQUNwRSxJQUFJLFFBQVEsS0FBSyxRQUFRO1lBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztRQUNwRSxJQUFJLFFBQVEsS0FBSyxRQUFRO1lBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztRQUNwRSxJQUFJLFFBQVEsS0FBSyxRQUFRO1lBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztJQUN0RSxDQUFDO0lBRUQsWUFBWTtJQUNaLElBQUksUUFBUSxLQUFLLE1BQU07UUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDO0lBRXRFLFlBQVk7SUFDWixJQUFJLFFBQVEsS0FBSyxNQUFNLElBQUksUUFBUSxLQUFLLE1BQU07UUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDO0lBRWhHLFFBQVE7SUFDUixJQUFJLFFBQVEsS0FBSyxJQUFJLElBQUksUUFBUSxLQUFLLElBQUk7UUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDO0lBRXhGLE1BQU07SUFDTixJQUFJLFFBQVEsS0FBSyxJQUFJO1FBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztJQUVqRSxvQkFBb0I7SUFDcEIsT0FBTyxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztBQUMzQyxDQUFDO0FBY0QsMkVBQTJFO0FBQzNFLFNBQVMsY0FBYyxDQUFDLE1BQXVEO0lBSTdFLE9BQU87UUFDTCxJQUFJLEVBQUUsQ0FBQyxLQUFhLEVBQUUsSUFBWSxFQUFFLEVBQUU7WUFDcEMsSUFBSSxLQUFLLEtBQUssYUFBYSxFQUFFLENBQUM7Z0JBQzVCLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ25DLENBQUM7UUFDSCxDQUFDO1FBQ0QsS0FBSyxFQUFFLENBQUMsSUFBWSxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUM7S0FDMUQsQ0FBQztBQUNKLENBQUM7QUFFRCxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFnQixFQUFFLEVBQUU7SUFDdEMsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsR0FBRyxHQUFHLENBQUM7SUFDNUIsTUFBTSxJQUFJLEdBQUcsSUFBSSxpQkFBUSxFQUFFLENBQUM7SUFDNUIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBRTVCLHlFQUF5RTtJQUN6RSwyRUFBMkU7SUFDM0Usc0VBQXNFO0lBQ3RFLEdBQUcsRUFBRSxjQUFjLEVBQUUsRUFBRSxDQUFDO0lBRXhCLHdFQUF3RTtJQUN4RSw0RUFBNEU7SUFDNUUsb0VBQW9FO0lBQ3BFLHlFQUF5RTtJQUN6RSwyRUFBMkU7SUFDM0UsNERBQTREO0lBQzVELGtFQUFrRTtJQUNsRSxFQUFFO0lBQ0YsMkVBQTJFO0lBQzNFLDJFQUEyRTtJQUMzRSw0RUFBNEU7SUFDNUUsNEVBQTRFO0lBQzVFLHNFQUFzRTtJQUN0RSxzRUFBc0U7SUFDdEUsMkRBQTJEO0lBQzNELEVBQUU7SUFDRiw0RUFBNEU7SUFDNUUseURBQXlEO0lBQ3pELE1BQU0sSUFBSSxHQUFHLEdBQTRDLENBQUM7SUFDMUQsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUMsR0FBVyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDdEQsSUFBSSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsR0FBVyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFFdkQsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFBLGdDQUFjLEVBQUMsR0FBRyxDQUFDLENBQUM7SUFDaEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLEVBQUUsR0FBRyxFQUFFO1FBQ3RDLHVFQUF1RTtRQUN2RSxzRUFBc0U7UUFDdEUseUVBQXlFO1FBQ3pFLGlCQUFpQjtRQUNqQixNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSwyREFBMkQsQ0FBQyxDQUFDO1FBQ3hGLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNkLENBQUMsQ0FBQyxDQUFDO0lBRUgsc0VBQXNFO0lBQ3RFLDRFQUE0RTtJQUM1RSx3RUFBd0U7SUFDeEUsc0RBQXNEO0FBQ3hELENBQUMsQ0FBQyxDQUFDO0FBRUgsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBZ0IsRUFBRSxHQUFhLEVBQUUsRUFBRTtJQUNyRCxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNuQyxJQUFJLENBQUMsSUFBSTtRQUFFLE9BQU87SUFFbEIsTUFBTSxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsR0FBRyxZQUFZLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQy9DLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLElBQUksSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7QUFDMUMsQ0FBQyxDQUFDLENBQUM7QUFFSCxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFnQixFQUFFLEVBQUU7SUFDdEMsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDbkMsSUFBSSxJQUFJLEVBQUUsQ0FBQztRQUNULElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNaLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFDRCxHQUFHLENBQUMsR0FBRyxFQUFFLGVBQWUsRUFBRSxFQUFFLENBQUM7SUFFN0IsMkVBQTJFO0lBQzNFLDhEQUE4RDtJQUM5RCx5RUFBeUU7SUFDekUsMEVBQTBFO0lBQzFFLHNCQUFzQjtJQUN0QixJQUFJLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNuQixPQUFPLEdBQUcsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUM7SUFDNUMsQ0FBQztBQUNILENBQUMsQ0FBQyxDQUFDO0FBRUgsa0JBQWUsSUFBSSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBuY3Vyc2VzLXBvbmcgLSBQb3J0IG9mIHZpY2VudGVib2xlYS9Qb25nLWN1cnNlc1xuICpcbiAqIE9yaWdpbmFsOiBodHRwczovL2dpdGh1Yi5jb20vdmljZW50ZWJvbGVhL1BvbmctY3Vyc2VzXG4gKiBBdXRob3I6IFZpY2VudGUgQWRvbGZvIEJvbGVhIFNhbmNoZXogPHZpY2VudGUuYm9sZWFAZ21haWwuY29tPlxuICpcbiAqIFRoaXMgaXMgYSBkaXJlY3QgcG9ydCB0byB2YWxpZGF0ZSB0aGUgbmN1cnNlcyBjb21wYXRpYmlsaXR5IGxheWVyLlxuICpcbiAqIFRoZSBkb29yIHRvb2sgbm8gaW5wdXQgb24gYW55IHN1cmZhY2UgdW50aWwgMjAyNi0wOS0wMzogYG9uU3RhcnRgIHVzZWQgdG9cbiAqIGBhd2FpdCBwb25nLm9uU3RhcnQoY29udGV4dClgIC0gdGhlIEMgZ2FtZSBsb29wIC0gd2hpbGUgYG9uSW5wdXRgIHNhdFxuICogcmVnaXN0ZXJlZCBiZWxvdy4gYERvb3IuZXhlY3V0ZSgpYCBvbmx5IHJlYWNoZXMgdGhlIFNESyBpbnB1dCBsb29wLCB0aGUgb25lXG4gKiB0aGluZyB0aGF0IGluc3RhbGxzIGBiYnNTZXNzaW9uLmRvb3JJbnB1dEhhbmRsZXJgIChzZGsvc3JjL2NvcmUvRG9vci50czoyNTApLFxuICogYWZ0ZXIgZXZlcnkgc3RhcnQgaGFuZGxlciBoYXMgUkVTT0xWRUQgKHNkay9zcmMvY29yZS9Eb29yLnRzOjExOC0xMzEpLCBhbmRcbiAqIGJvdGggbGl2ZSByb3V0ZXJzIHJlYWQgZXhhY3RseSB0aGF0IHByb3BlcnR5ICh3ZWI6XG4gKiB3ZWIvYmFja2VuZC9zcmMvc2VydmVyL3NvY2tldC1oYW5kbGVycy50czo3Nzk7IHRlbG5ldDpcbiAqIHdlYi9iYWNrZW5kL3NyYy9pbmRleC50czoxMjQxKS4gVGhlIGxvb3Agd2FzIG5ldmVyIHJlYWNoZWQsIHRoZSBoYW5kbGVyIHdhc1xuICogbmV2ZXIgaW5zdGFsbGVkLCBhbmQgZXZlcnkga2V5c3Ryb2tlIGZlbGwgdGhyb3VnaCB0byB0aGUgYGRvb3I6aW5wdXRgXG4gKiBkZWFkLWRyb3AgYXQgc29ja2V0LWhhbmRsZXJzLnRzOjc4My5cbiAqXG4gKiBSZXBvcnQ6IC5zdXBlcnBvd2Vycy9zZGQvMjAyNi0wOS0wMy1uY3Vyc2VzLXBvbmctaW5wdXQvcHJvZ3Jlc3MubWRcbiAqL1xuXG5pbXBvcnQgeyBTZXJ2ZXJEb29yLCBEb29yQ29udGV4dCwgS2V5UHJlc3MgfSBmcm9tICdAYW1pZXhwcmVzcy9iYnMtZG9vci1zZGsnO1xuaW1wb3J0IHsgUG9uZ0Rvb3IgfSBmcm9tICcuL2FwcC5qcyc7XG5pbXBvcnQgeyBob25vdXJEb29ySG9sZCB9IGZyb20gJ0BhbWlleHByZXNzL2Jicy1kb29yLXNkay91dGlscy9ibGVzc2VkLWhlbHBlcnMnO1xuXG4vKiogRG9vciBtZXRhZGF0YSAqL1xuZXhwb3J0IGNvbnN0IG1ldGFkYXRhID0ge1xuICBuYW1lOiAnbmN1cnNlcy1wb25nJyxcbiAgdmVyc2lvbjogJzEuMC4wJyxcbiAgZGVzY3JpcHRpb246ICdDbGFzc2ljIFBvbmcgZ2FtZSAobmN1cnNlcyBwb3J0KScsXG4gIGF1dGhvcjogJ1ZpY2VudGUgQm9sZWEgKG9yaWdpbmFsKSwgQW1pRXhwcmVzcyAocG9ydCknLFxuICBjb21tYW5kOiAnUE9ORycsXG59O1xuXG4vKipcbiAqIE1haW4gZG9vciBjbGFzc1xuICovXG5jb25zdCBkb29yID0gbmV3IFNlcnZlckRvb3IobWV0YWRhdGEpO1xuXG4vKipcbiAqIFRoZSBsaXZlIGdhbWUgZm9yIGVhY2ggbm9kZS5cbiAqXG4gKiBUaGUgb2xkIGNvZGUgc3Rhc2hlZCB0aGUga2V5IGhhbmRsZXIgb24gdGhlIGRvb3IgY29udGV4dCBiZWhpbmQgYW4gYGFueWBcbiAqIGNhc3Q7IHRoZSBub2RlIGlkIGlzIHRoZSBrZXkgdGhlIEJCUyBpdHNlbGYgdXNlcywgYW5kIGl0IGlzIHRoZSBvbmVcbiAqIGBEb29yLmV4ZWN1dGUoKWAgaGFuZHMgZXZlcnkgaGFuZGxlciAoYGN0eC5ub2RlSWRgKS5cbiAqL1xuY29uc3QgZ2FtZXMgPSBuZXcgTWFwPG51bWJlciwgUG9uZ0Rvb3I+KCk7XG5cbi8vIFBhcnNlIGVzY2FwZSBzZXF1ZW5jZXMgaW50byBrZXkgbmFtZXNcbmZ1bmN0aW9uIHBhcnNlS2V5RGF0YShkYXRhOiBzdHJpbmcpOiB7IGtleTogeyBuYW1lPzogc3RyaW5nOyBzZXF1ZW5jZTogc3RyaW5nIH0gfSB7XG4gIGNvbnN0IHNlcXVlbmNlID0gZGF0YTtcblxuICAvLyBBcnJvdyBrZXlzIGFuZCBzcGVjaWFsIGtleXMgdmlhIGVzY2FwZSBzZXF1ZW5jZXNcbiAgaWYgKHNlcXVlbmNlLnN0YXJ0c1dpdGgoJ1xceDFiWycpIHx8IHNlcXVlbmNlLnN0YXJ0c1dpdGgoJ1xceDFiTycpKSB7XG4gICAgLy8gQ1NJIHNlcXVlbmNlcyAoRVNDIFsgLi4uKVxuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiW0EnIHx8IHNlcXVlbmNlID09PSAnXFx4MWJPQScpIHJldHVybiB7IGtleTogeyBuYW1lOiAndXAnLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbQicgfHwgc2VxdWVuY2UgPT09ICdcXHgxYk9CJykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICdkb3duJywgc2VxdWVuY2UgfSB9O1xuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiW0MnIHx8IHNlcXVlbmNlID09PSAnXFx4MWJPQycpIHJldHVybiB7IGtleTogeyBuYW1lOiAncmlnaHQnLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbRCcgfHwgc2VxdWVuY2UgPT09ICdcXHgxYk9EJykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICdsZWZ0Jywgc2VxdWVuY2UgfSB9O1xuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiW0gnIHx8IHNlcXVlbmNlID09PSAnXFx4MWJPSCcpIHJldHVybiB7IGtleTogeyBuYW1lOiAnaG9tZScsIHNlcXVlbmNlIH0gfTtcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYltGJyB8fCBzZXF1ZW5jZSA9PT0gJ1xceDFiT0YnKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ2VuZCcsIHNlcXVlbmNlIH0gfTtcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYls1ficpIHJldHVybiB7IGtleTogeyBuYW1lOiAncGFnZXVwJywgc2VxdWVuY2UgfSB9O1xuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiWzZ+JykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICdwYWdlZG93bicsIHNlcXVlbmNlIH0gfTtcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYlsyficpIHJldHVybiB7IGtleTogeyBuYW1lOiAnaW5zZXJ0Jywgc2VxdWVuY2UgfSB9O1xuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiWzN+JykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICdkZWxldGUnLCBzZXF1ZW5jZSB9IH07XG4gICAgLy8gRjEtRjQgKFNTMylcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYk9QJykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICdmMScsIHNlcXVlbmNlIH0gfTtcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYk9RJykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICdmMicsIHNlcXVlbmNlIH0gfTtcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYk9SJykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICdmMycsIHNlcXVlbmNlIH0gfTtcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYk9TJykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICdmNCcsIHNlcXVlbmNlIH0gfTtcbiAgfVxuXG4gIC8vIEVTQyBhbG9uZVxuICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYicpIHJldHVybiB7IGtleTogeyBuYW1lOiAnZXNjYXBlJywgc2VxdWVuY2UgfSB9O1xuXG4gIC8vIEJhY2tzcGFjZVxuICBpZiAoc2VxdWVuY2UgPT09ICdcXHg3ZicgfHwgc2VxdWVuY2UgPT09ICdcXHgwOCcpIHJldHVybiB7IGtleTogeyBuYW1lOiAnYmFja3NwYWNlJywgc2VxdWVuY2UgfSB9O1xuXG4gIC8vIEVudGVyXG4gIGlmIChzZXF1ZW5jZSA9PT0gJ1xccicgfHwgc2VxdWVuY2UgPT09ICdcXG4nKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ2VudGVyJywgc2VxdWVuY2UgfSB9O1xuXG4gIC8vIFRhYlxuICBpZiAoc2VxdWVuY2UgPT09ICdcXHQnKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ3RhYicsIHNlcXVlbmNlIH0gfTtcblxuICAvLyBSZWd1bGFyIGNoYXJhY3RlclxuICByZXR1cm4geyBrZXk6IHsgbmFtZTogZGF0YSwgc2VxdWVuY2UgfSB9O1xufVxuXG4vKipcbiAqIFRoZSB0d28gQkJTQXBpIGtleS1lZGdlIG1ldGhvZHMgdGhlIFNESydzIG93biBoZWxkLWtleSB0cmFja2luZyB1c2VzXG4gKiAoYHNkay91dGlscy9kb29yLWlucHV0LW1hbmFnZXIudHM6MjU3LTI3OWApLiBUaGV5IGV4aXN0IG9uIHRoZSBiYWNrZW5kJ3NcbiAqIEJCU0FwaSAoYHdlYi9iYWNrZW5kL3NyYy9kb29ycy9CQlNBcGkudHM6NTkxLTYxNmAsIHdoZXJlIHRoZXkgaW5zdGFsbFxuICogYHNlc3Npb24uZG9vcktleVN0YXRlSGFuZGxlcmApIGJ1dCBhcmUgbm90IG9uIHRoZSBTREsncyBgQkJTQXBpYCB0eXBlIHlldCxcbiAqIHNvIHRoZSBkb29yIG5hbWVzIHRoZSBzaGFwZSBpdCBuZWVkcyByYXRoZXIgdGhhbiBjYXN0aW5nIHRvIGBhbnlgLlxuICovXG5pbnRlcmZhY2UgS2V5RWRnZUFwaSB7XG4gIG9uS2V5RG93bj8oY2FsbGJhY2s6IChrZXk6IHN0cmluZywga2V5U3RhdGU6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+KSA9PiB2b2lkKTogdm9pZDtcbiAgb25LZXlVcD8oY2FsbGJhY2s6IChrZXk6IHN0cmluZywga2V5U3RhdGU6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+KSA9PiB2b2lkKTogdm9pZDtcbn1cblxuLyoqIG5jdXJzZXMgYGluaXRzY3IoKWAgdGFrZXMgYW55IG9iamVjdCB0aGF0IGNhbiBwdXQgYnl0ZXMgb24gdGhlIHdpcmUuICovXG5mdW5jdGlvbiBuY3Vyc2VzQ29udGV4dChzb2NrZXQ6IHsgZW1pdDogKGV2ZW50OiBzdHJpbmcsIGRhdGE6IHN0cmluZykgPT4gdm9pZCB9KToge1xuICBlbWl0OiAoZXZlbnQ6IHN0cmluZywgZGF0YTogc3RyaW5nKSA9PiB2b2lkO1xuICB3cml0ZTogKGRhdGE6IHN0cmluZykgPT4gdm9pZDtcbn0ge1xuICByZXR1cm4ge1xuICAgIGVtaXQ6IChldmVudDogc3RyaW5nLCBkYXRhOiBzdHJpbmcpID0+IHtcbiAgICAgIGlmIChldmVudCA9PT0gJ2Fuc2ktb3V0cHV0Jykge1xuICAgICAgICBzb2NrZXQuZW1pdCgnYW5zaS1vdXRwdXQnLCBkYXRhKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIHdyaXRlOiAoZGF0YTogc3RyaW5nKSA9PiBzb2NrZXQuZW1pdCgnYW5zaS1vdXRwdXQnLCBkYXRhKSxcbiAgfTtcbn1cblxuZG9vci5vblN0YXJ0KGFzeW5jIChjdHg6IERvb3JDb250ZXh0KSA9PiB7XG4gIGNvbnN0IHsgc29ja2V0LCBiYnMgfSA9IGN0eDtcbiAgY29uc3QgcG9uZyA9IG5ldyBQb25nRG9vcigpO1xuICBnYW1lcy5zZXQoY3R4Lm5vZGVJZCwgcG9uZyk7XG5cbiAgLy8gR2FtZSBtb2RlIGlzIHdoYXQgbWFrZXMgdGhlIGNsaWVudCBzZW5kIGtleSBldmVudHMgYXQgYWxsLCBzbyBpdCBjb21lc1xuICAvLyBmaXJzdDogYHNlc3Npb24uZ2FtZU1vZGVFbmFibGVkYCBpcyBzZXQgYW5kIGBnYW1lLW1vZGUgdHJ1ZWAgZ29lcyB0byB0aGVcbiAgLy8gYnJvd3NlciAoQkJTQXBpLnRzOjQ0NC00NDcgLT4gc2VydmljZXMvZ2FtZS1tb2RlLnNlcnZpY2UudHM6MjAtMzApLlxuICBiYnM/LmVuYWJsZUdhbWVNb2RlPy4oKTtcblxuICAvLyAuLi5hbmQgdGhlbiB0aGUgcmVhbCBrZXkgRURHRVMsIHdoaWNoIGlzIHRoZSBoYWxmIHRoYXQgd2FzIG1pc3NpbmcuIEFcbiAgLy8ga2V5LWRvd24gYWxvbmUgcmVhY2hlcyB0aGUgZG9vciB0aHJvdWdoIGBkb29ySW5wdXRIYW5kbGVyYCwgYnV0IGhvbGRpbmcgYVxuICAvLyBrZXkgb25seSByZS1zZW5kcyBrZXktZG93biBhZnRlciB0aGUgY2xpZW50J3MgNDAwIG1zIHJlcGVhdCBkZWxheVxuICAvLyAocGFja2FnZXMvdGVybWluYWwvc3JjL2NvbXBvbmVudHMvQkJTVGVybWluYWwudHN4OjEzNDIpLCBzbyB0aGUgcGFkZGxlXG4gIC8vIGhlc2l0YXRlZCBhbmQgdGhlbiBzdHV0dGVyZWQuIGtleS11cCBuZXZlciByZWFjaGVzIGBkb29ySW5wdXRIYW5kbGVyYCBhdFxuICAvLyBhbGwgLSBgc29ja2V0LWhhbmRsZXJzLnRzOjU1MS01NzBgIGdpdmVzIHJlbGVhc2VzIG9ubHkgdG9cbiAgLy8gYGRvb3JLZXlTdGF0ZUhhbmRsZXJgLCB3aGljaCBpcyBleGFjdGx5IHdoYXQgdGhlc2UgdHdvIGluc3RhbGwuXG4gIC8vXG4gIC8vIFRoaXMgaXMgdGhlIG1lY2hhbmlzbSB0aGUgdHdlbHZlIGFyY2FkZSBkb29ycyB1c2U7IHRoZXkgcmVhY2ggaXQgdGhyb3VnaFxuICAvLyBgRG9vcklucHV0TWFuYWdlcih7IGVuYWJsZUdhbWVNb2RlOiB0cnVlLCB0cmFja0hlbGRLZXlzOiB0cnVlIH0pYCwgd2hpY2hcbiAgLy8gY2FsbHMgdGhlc2Ugc2FtZSB0d28gbWV0aG9kcyAoZG9vci1pbnB1dC1tYW5hZ2VyLnRzOjI1Ny0yNzkpLiBQT05HIGNhbm5vdFxuICAvLyB1c2UgdGhhdCB3cmFwcGVyOiBpdCByZXF1aXJlcyBhIGJsZXNzZWQgYFNjcmVlbmAgYW5kIGl0cyBgZW5hYmxlKClgIHdvdWxkXG4gIC8vIGNhbGwgYHNldHVwSW5wdXRIYW5kbGVyYCAoZG9vci1pbnB1dC1tYW5hZ2VyLnRzOjIwOSksIHJlcGxhY2luZyB0aGVcbiAgLy8gYGRvb3JJbnB1dEhhbmRsZXJgIHRoaXMgZG9vcidzIFNESyBpbnB1dCBsb29wIG93bnMuIFNhbWUgbWVjaGFuaXNtLFxuICAvLyB3aXRob3V0IHRoZSBibGVzc2VkIGxheWVyIGFuIG5jdXJzZXMgZG9vciBkb2VzIG5vdCBoYXZlLlxuICAvL1xuICAvLyBSZWdpc3RyYXRpb24gb3JkZXIgbWF0dGVyczogb25LZXlVcCBXUkFQUyB0aGUgaGFuZGxlciBvbktleURvd24gaW5zdGFsbGVkXG4gIC8vIChCQlNBcGkudHM6NjA0LTYxNSksIHNvIGRvd24gbXVzdCBiZSByZWdpc3RlcmVkIGZpcnN0LlxuICBjb25zdCBrZXlzID0gYmJzIGFzICh0eXBlb2YgYmJzICYgS2V5RWRnZUFwaSkgfCB1bmRlZmluZWQ7XG4gIGtleXM/Lm9uS2V5RG93bj8uKChrZXk6IHN0cmluZykgPT4gcG9uZy5ob2xkS2V5KGtleSkpO1xuICBrZXlzPy5vbktleVVwPy4oKGtleTogc3RyaW5nKSA9PiBwb25nLnJlbGVhc2VLZXkoa2V5KSk7XG5cbiAgcG9uZy5ob2xkID0gaG9ub3VyRG9vckhvbGQoY3R4KTtcbiAgcG9uZy5zdGFydChuY3Vyc2VzQ29udGV4dChzb2NrZXQpLCAoKSA9PiB7XG4gICAgLy8gRVNDLiBgY3R4LmNsb3NlKClgIChzZGsvc3JjL2NvcmUvRG9vci50czoyMjcpIG9ubHkgZHJvcHMgdGhpcyBub2RlJ3NcbiAgICAvLyBydW5uaW5nLXNlc3Npb24gZW50cnk7IHRoZSBTREsgaW5wdXQgbG9vcCB0aGVuIHJlc29sdmVzIG9uIHRoZSBORVhUXG4gICAgLy8ga2V5c3Ryb2tlIChzZGsvc3JjL2NvcmUvRG9vci50czoyMTItMjE3KSwgd2hpY2ggaXMgd2hhdCB0aGUgbGluZSBiZWxvd1xuICAgIC8vIGlzIGFza2luZyBmb3IuXG4gICAgc29ja2V0LmVtaXQoJ2Fuc2ktb3V0cHV0JywgJ1xcclxcblRoYW5rcyBmb3IgcGxheWluZyBQT05HLiBQcmVzcyBhbnkga2V5IHRvIGV4aXQuLi5cXHJcXG4nKTtcbiAgICBjdHguY2xvc2UoKTtcbiAgfSk7XG5cbiAgLy8gb25TdGFydCBSRVRVUk5TIGhlcmUsIGFuZCB0aGF0IGlzIHRoZSB3aG9sZSBwb2ludCAtIHNlZSB0aGUgaGVhZGVyLlxuICAvLyBUaGUgU0RLJ3MgaW5wdXQgbG9vcCBpcyB0aGlzIGRvb3IncyBzdGF5LWFsaXZlOiBpdCBob2xkcyBgZXhlY3V0ZSgpYCBvcGVuXG4gIC8vIHVudGlsIHRoZSBzb2NrZXQgZGlzY29ubmVjdHMsIHRoZSBCQlMgc2VuZHMgYGRvb3I6Y2xvc2VgLCBvciB0aGUgZG9vclxuICAvLyBpdHNlbGYgc2F5cyBpdCBpcyBmaW5pc2hlZCB2aWEgdGhlIHF1aXQgcGF0aCBhYm92ZS5cbn0pO1xuXG5kb29yLm9uSW5wdXQoYXN5bmMgKGN0eDogRG9vckNvbnRleHQsIGtleTogS2V5UHJlc3MpID0+IHtcbiAgY29uc3QgcG9uZyA9IGdhbWVzLmdldChjdHgubm9kZUlkKTtcbiAgaWYgKCFwb25nKSByZXR1cm47XG5cbiAgY29uc3QgeyBrZXk6IGtleURhdGEgfSA9IHBhcnNlS2V5RGF0YShrZXkucmF3KTtcbiAgcG9uZy5oYW5kbGVLZXkoa2V5RGF0YS5uYW1lID8/IGtleS5yYXcpO1xufSk7XG5cbmRvb3Iub25DbG9zZShhc3luYyAoY3R4OiBEb29yQ29udGV4dCkgPT4ge1xuICBjb25zdCBwb25nID0gZ2FtZXMuZ2V0KGN0eC5ub2RlSWQpO1xuICBpZiAocG9uZykge1xuICAgIHBvbmcuc3RvcCgpO1xuICAgIGdhbWVzLmRlbGV0ZShjdHgubm9kZUlkKTtcbiAgfVxuICBjdHguYmJzPy5kaXNhYmxlR2FtZU1vZGU/LigpO1xuXG4gIC8vIFRoZSBrZXktZWRnZSBjYWxsYmFja3MgY2xvc2Ugb3ZlciB0aGUgUG9uZ0Rvb3IgYWJvdmUsIGFuZCBuZWl0aGVyIHRoZSBUU1xuICAvLyBkb29yIHRlYXJkb3duIChoYW5kbGVycy9kb29yLmhhbmRsZXIudHM6MjM3NCwgd2hpY2ggZGVsZXRlc1xuICAvLyBkb29ySW5wdXRIYW5kbGVyIG9ubHkpIG5vciBEb29ySW5wdXRNYW5hZ2VyLmRpc2FibGUoKSBjbGVhcnMgdGhpcyBvbmUuXG4gIC8vIExlYXZpbmcgaXQgcG9pbnRlZCBhdCBhIHN0b3BwZWQgZ2FtZSBpcyBhIGxlYWsgdGhpcyBkb29yIGludHJvZHVjZWQsIHNvXG4gIC8vIHRoaXMgZG9vciBkcm9wcyBpdC5cbiAgaWYgKGN0eC5iYnNTZXNzaW9uKSB7XG4gICAgZGVsZXRlIGN0eC5iYnNTZXNzaW9uLmRvb3JLZXlTdGF0ZUhhbmRsZXI7XG4gIH1cbn0pO1xuXG5leHBvcnQgZGVmYXVsdCBkb29yO1xuIl19