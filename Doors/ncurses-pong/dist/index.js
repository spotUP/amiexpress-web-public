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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBb0JHOzs7QUFFSCwyREFBNkU7QUFDN0UscUNBQW9DO0FBRXBDLG9CQUFvQjtBQUNQLFFBQUEsUUFBUSxHQUFHO0lBQ3RCLElBQUksRUFBRSxjQUFjO0lBQ3BCLE9BQU8sRUFBRSxPQUFPO0lBQ2hCLFdBQVcsRUFBRSxrQ0FBa0M7SUFDL0MsTUFBTSxFQUFFLDZDQUE2QztJQUNyRCxPQUFPLEVBQUUsTUFBTTtDQUNoQixDQUFDO0FBRUY7O0dBRUc7QUFDSCxNQUFNLElBQUksR0FBRyxJQUFJLHlCQUFVLENBQUMsZ0JBQVEsQ0FBQyxDQUFDO0FBRXRDOzs7Ozs7R0FNRztBQUNILE1BQU0sS0FBSyxHQUFHLElBQUksR0FBRyxFQUFvQixDQUFDO0FBRTFDLHdDQUF3QztBQUN4QyxTQUFTLFlBQVksQ0FBQyxJQUFZO0lBQ2hDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQztJQUV0QixtREFBbUQ7SUFDbkQsSUFBSSxRQUFRLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNqRSw0QkFBNEI7UUFDNUIsSUFBSSxRQUFRLEtBQUssUUFBUSxJQUFJLFFBQVEsS0FBSyxRQUFRO1lBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztRQUM3RixJQUFJLFFBQVEsS0FBSyxRQUFRLElBQUksUUFBUSxLQUFLLFFBQVE7WUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDO1FBQy9GLElBQUksUUFBUSxLQUFLLFFBQVEsSUFBSSxRQUFRLEtBQUssUUFBUTtZQUFFLE9BQU8sRUFB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QyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDM0IsQ0FBQztJQUNELEdBQUcsQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFLEVBQUUsQ0FBQztJQUU3QiwyRUFBMkU7SUFDM0UsOERBQThEO0lBQzlELHlFQUF5RTtJQUN6RSwwRUFBMEU7SUFDMUUsc0JBQXNCO0lBQ3RCLElBQUksR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ25CLE9BQU8sR0FBRyxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQztJQUM1QyxDQUFDO0FBQ0gsQ0FBQyxDQUFDLENBQUM7QUFFSCxrQkFBZSxJQUFJLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIG5jdXJzZXMtcG9uZyAtIFBvcnQgb2YgdmljZW50ZWJvbGVhL1BvbmctY3Vyc2VzXG4gKlxuICogT3JpZ2luYWw6IGh0dHBzOi8vZ2l0aHViLmNvbS92aWNlbnRlYm9sZWEvUG9uZy1jdXJzZXNcbiAqIEF1dGhvcjogVmljZW50ZSBBZG9sZm8gQm9sZWEgU2FuY2hleiA8dmljZW50ZS5ib2xlYUBnbWFpbC5jb20+XG4gKlxuICogVGhpcyBpcyBhIGRpcmVjdCBwb3J0IHRvIHZhbGlkYXRlIHRoZSBuY3Vyc2VzIGNvbXBhdGliaWxpdHkgbGF5ZXIuXG4gKlxuICogVGhlIGRvb3IgdG9vayBubyBpbnB1dCBvbiBhbnkgc3VyZmFjZSB1bnRpbCAyMDI2LTA5LTAzOiBgb25TdGFydGAgdXNlZCB0b1xuICogYGF3YWl0IHBvbmcub25TdGFydChjb250ZXh0KWAgLSB0aGUgQyBnYW1lIGxvb3AgLSB3aGlsZSBgb25JbnB1dGAgc2F0XG4gKiByZWdpc3RlcmVkIGJlbG93LiBgRG9vci5leGVjdXRlKClgIG9ubHkgcmVhY2hlcyB0aGUgU0RLIGlucHV0IGxvb3AsIHRoZSBvbmVcbiAqIHRoaW5nIHRoYXQgaW5zdGFsbHMgYGJic1Nlc3Npb24uZG9vcklucHV0SGFuZGxlcmAgKHNkay9zcmMvY29yZS9Eb29yLnRzOjI1MCksXG4gKiBhZnRlciBldmVyeSBzdGFydCBoYW5kbGVyIGhhcyBSRVNPTFZFRCAoc2RrL3NyYy9jb3JlL0Rvb3IudHM6MTE4LTEzMSksIGFuZFxuICogYm90aCBsaXZlIHJvdXRlcnMgcmVhZCBleGFjdGx5IHRoYXQgcHJvcGVydHkgKHdlYjpcbiAqIHdlYi9iYWNrZW5kL3NyYy9zZXJ2ZXIvc29ja2V0LWhhbmRsZXJzLnRzOjc3OTsgdGVsbmV0OlxuICogd2ViL2JhY2tlbmQvc3JjL2luZGV4LnRzOjEyNDEpLiBUaGUgbG9vcCB3YXMgbmV2ZXIgcmVhY2hlZCwgdGhlIGhhbmRsZXIgd2FzXG4gKiBuZXZlciBpbnN0YWxsZWQsIGFuZCBldmVyeSBrZXlzdHJva2UgZmVsbCB0aHJvdWdoIHRvIHRoZSBgZG9vcjppbnB1dGBcbiAqIGRlYWQtZHJvcCBhdCBzb2NrZXQtaGFuZGxlcnMudHM6NzgzLlxuICpcbiAqIFJlcG9ydDogLnN1cGVycG93ZXJzL3NkZC8yMDI2LTA5LTAzLW5jdXJzZXMtcG9uZy1pbnB1dC9wcm9ncmVzcy5tZFxuICovXG5cbmltcG9ydCB7IFNlcnZlckRvb3IsIERvb3JDb250ZXh0LCBLZXlQcmVzcyB9IGZyb20gJ0BhbWlleHByZXNzL2Jicy1kb29yLXNkayc7XG5pbXBvcnQgeyBQb25nRG9vciB9IGZyb20gJy4vYXBwLmpzJztcblxuLyoqIERvb3IgbWV0YWRhdGEgKi9cbmV4cG9ydCBjb25zdCBtZXRhZGF0YSA9IHtcbiAgbmFtZTogJ25jdXJzZXMtcG9uZycsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGRlc2NyaXB0aW9uOiAnQ2xhc3NpYyBQb25nIGdhbWUgKG5jdXJzZXMgcG9ydCknLFxuICBhdXRob3I6ICdWaWNlbnRlIEJvbGVhIChvcmlnaW5hbCksIEFtaUV4cHJlc3MgKHBvcnQpJyxcbiAgY29tbWFuZDogJ1BPTkcnLFxufTtcblxuLyoqXG4gKiBNYWluIGRvb3IgY2xhc3NcbiAqL1xuY29uc3QgZG9vciA9IG5ldyBTZXJ2ZXJEb29yKG1ldGFkYXRhKTtcblxuLyoqXG4gKiBUaGUgbGl2ZSBnYW1lIGZvciBlYWNoIG5vZGUuXG4gKlxuICogVGhlIG9sZCBjb2RlIHN0YXNoZWQgdGhlIGtleSBoYW5kbGVyIG9uIHRoZSBkb29yIGNvbnRleHQgYmVoaW5kIGFuIGBhbnlgXG4gKiBjYXN0OyB0aGUgbm9kZSBpZCBpcyB0aGUga2V5IHRoZSBCQlMgaXRzZWxmIHVzZXMsIGFuZCBpdCBpcyB0aGUgb25lXG4gKiBgRG9vci5leGVjdXRlKClgIGhhbmRzIGV2ZXJ5IGhhbmRsZXIgKGBjdHgubm9kZUlkYCkuXG4gKi9cbmNvbnN0IGdhbWVzID0gbmV3IE1hcDxudW1iZXIsIFBvbmdEb29yPigpO1xuXG4vLyBQYXJzZSBlc2NhcGUgc2VxdWVuY2VzIGludG8ga2V5IG5hbWVzXG5mdW5jdGlvbiBwYXJzZUtleURhdGEoZGF0YTogc3RyaW5nKTogeyBrZXk6IHsgbmFtZT86IHN0cmluZzsgc2VxdWVuY2U6IHN0cmluZyB9IH0ge1xuICBjb25zdCBzZXF1ZW5jZSA9IGRhdGE7XG5cbiAgLy8gQXJyb3cga2V5cyBhbmQgc3BlY2lhbCBrZXlzIHZpYSBlc2NhcGUgc2VxdWVuY2VzXG4gIGlmIChzZXF1ZW5jZS5zdGFydHNXaXRoKCdcXHgxYlsnKSB8fCBzZXF1ZW5jZS5zdGFydHNXaXRoKCdcXHgxYk8nKSkge1xuICAgIC8vIENTSSBzZXF1ZW5jZXMgKEVTQyBbIC4uLilcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYltBJyB8fCBzZXF1ZW5jZSA9PT0gJ1xceDFiT0EnKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ3VwJywgc2VxdWVuY2UgfSB9O1xuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiW0InIHx8IHNlcXVlbmNlID09PSAnXFx4MWJPQicpIHJldHVybiB7IGtleTogeyBuYW1lOiAnZG93bicsIHNlcXVlbmNlIH0gfTtcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYltDJyB8fCBzZXF1ZW5jZSA9PT0gJ1xceDFiT0MnKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ3JpZ2h0Jywgc2VxdWVuY2UgfSB9O1xuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiW0QnIHx8IHNlcXVlbmNlID09PSAnXFx4MWJPRCcpIHJldHVybiB7IGtleTogeyBuYW1lOiAnbGVmdCcsIHNlcXVlbmNlIH0gfTtcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYltIJyB8fCBzZXF1ZW5jZSA9PT0gJ1xceDFiT0gnKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ2hvbWUnLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbRicgfHwgc2VxdWVuY2UgPT09ICdcXHgxYk9GJykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICdlbmQnLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbNX4nKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ3BhZ2V1cCcsIHNlcXVlbmNlIH0gfTtcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYls2ficpIHJldHVybiB7IGtleTogeyBuYW1lOiAncGFnZWRvd24nLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbMn4nKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ2luc2VydCcsIHNlcXVlbmNlIH0gfTtcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYlszficpIHJldHVybiB7IGtleTogeyBuYW1lOiAnZGVsZXRlJywgc2VxdWVuY2UgfSB9O1xuICAgIC8vIEYxLUY0IChTUzMpXG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJPUCcpIHJldHVybiB7IGtleTogeyBuYW1lOiAnZjEnLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJPUScpIHJldHVybiB7IGtleTogeyBuYW1lOiAnZjInLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJPUicpIHJldHVybiB7IGtleTogeyBuYW1lOiAnZjMnLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJPUycpIHJldHVybiB7IGtleTogeyBuYW1lOiAnZjQnLCBzZXF1ZW5jZSB9IH07XG4gIH1cblxuICAvLyBFU0MgYWxvbmVcbiAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWInKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ2VzY2FwZScsIHNlcXVlbmNlIH0gfTtcblxuICAvLyBCYWNrc3BhY2VcbiAgaWYgKHNlcXVlbmNlID09PSAnXFx4N2YnIHx8IHNlcXVlbmNlID09PSAnXFx4MDgnKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ2JhY2tzcGFjZScsIHNlcXVlbmNlIH0gfTtcblxuICAvLyBFbnRlclxuICBpZiAoc2VxdWVuY2UgPT09ICdcXHInIHx8IHNlcXVlbmNlID09PSAnXFxuJykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICdlbnRlcicsIHNlcXVlbmNlIH0gfTtcblxuICAvLyBUYWJcbiAgaWYgKHNlcXVlbmNlID09PSAnXFx0JykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICd0YWInLCBzZXF1ZW5jZSB9IH07XG5cbiAgLy8gUmVndWxhciBjaGFyYWN0ZXJcbiAgcmV0dXJuIHsga2V5OiB7IG5hbWU6IGRhdGEsIHNlcXVlbmNlIH0gfTtcbn1cblxuLyoqXG4gKiBUaGUgdHdvIEJCU0FwaSBrZXktZWRnZSBtZXRob2RzIHRoZSBTREsncyBvd24gaGVsZC1rZXkgdHJhY2tpbmcgdXNlc1xuICogKGBzZGsvdXRpbHMvZG9vci1pbnB1dC1tYW5hZ2VyLnRzOjI1Ny0yNzlgKS4gVGhleSBleGlzdCBvbiB0aGUgYmFja2VuZCdzXG4gKiBCQlNBcGkgKGB3ZWIvYmFja2VuZC9zcmMvZG9vcnMvQkJTQXBpLnRzOjU5MS02MTZgLCB3aGVyZSB0aGV5IGluc3RhbGxcbiAqIGBzZXNzaW9uLmRvb3JLZXlTdGF0ZUhhbmRsZXJgKSBidXQgYXJlIG5vdCBvbiB0aGUgU0RLJ3MgYEJCU0FwaWAgdHlwZSB5ZXQsXG4gKiBzbyB0aGUgZG9vciBuYW1lcyB0aGUgc2hhcGUgaXQgbmVlZHMgcmF0aGVyIHRoYW4gY2FzdGluZyB0byBgYW55YC5cbiAqL1xuaW50ZXJmYWNlIEtleUVkZ2VBcGkge1xuICBvbktleURvd24/KGNhbGxiYWNrOiAoa2V5OiBzdHJpbmcsIGtleVN0YXRlOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPikgPT4gdm9pZCk6IHZvaWQ7XG4gIG9uS2V5VXA/KGNhbGxiYWNrOiAoa2V5OiBzdHJpbmcsIGtleVN0YXRlOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPikgPT4gdm9pZCk6IHZvaWQ7XG59XG5cbi8qKiBuY3Vyc2VzIGBpbml0c2NyKClgIHRha2VzIGFueSBvYmplY3QgdGhhdCBjYW4gcHV0IGJ5dGVzIG9uIHRoZSB3aXJlLiAqL1xuZnVuY3Rpb24gbmN1cnNlc0NvbnRleHQoc29ja2V0OiB7IGVtaXQ6IChldmVudDogc3RyaW5nLCBkYXRhOiBzdHJpbmcpID0+IHZvaWQgfSk6IHtcbiAgZW1pdDogKGV2ZW50OiBzdHJpbmcsIGRhdGE6IHN0cmluZykgPT4gdm9pZDtcbiAgd3JpdGU6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQ7XG59IHtcbiAgcmV0dXJuIHtcbiAgICBlbWl0OiAoZXZlbnQ6IHN0cmluZywgZGF0YTogc3RyaW5nKSA9PiB7XG4gICAgICBpZiAoZXZlbnQgPT09ICdhbnNpLW91dHB1dCcpIHtcbiAgICAgICAgc29ja2V0LmVtaXQoJ2Fuc2ktb3V0cHV0JywgZGF0YSk7XG4gICAgICB9XG4gICAgfSxcbiAgICB3cml0ZTogKGRhdGE6IHN0cmluZykgPT4gc29ja2V0LmVtaXQoJ2Fuc2ktb3V0cHV0JywgZGF0YSksXG4gIH07XG59XG5cbmRvb3Iub25TdGFydChhc3luYyAoY3R4OiBEb29yQ29udGV4dCkgPT4ge1xuICBjb25zdCB7IHNvY2tldCwgYmJzIH0gPSBjdHg7XG4gIGNvbnN0IHBvbmcgPSBuZXcgUG9uZ0Rvb3IoKTtcbiAgZ2FtZXMuc2V0KGN0eC5ub2RlSWQsIHBvbmcpO1xuXG4gIC8vIEdhbWUgbW9kZSBpcyB3aGF0IG1ha2VzIHRoZSBjbGllbnQgc2VuZCBrZXkgZXZlbnRzIGF0IGFsbCwgc28gaXQgY29tZXNcbiAgLy8gZmlyc3Q6IGBzZXNzaW9uLmdhbWVNb2RlRW5hYmxlZGAgaXMgc2V0IGFuZCBgZ2FtZS1tb2RlIHRydWVgIGdvZXMgdG8gdGhlXG4gIC8vIGJyb3dzZXIgKEJCU0FwaS50czo0NDQtNDQ3IC0+IHNlcnZpY2VzL2dhbWUtbW9kZS5zZXJ2aWNlLnRzOjIwLTMwKS5cbiAgYmJzPy5lbmFibGVHYW1lTW9kZT8uKCk7XG5cbiAgLy8gLi4uYW5kIHRoZW4gdGhlIHJlYWwga2V5IEVER0VTLCB3aGljaCBpcyB0aGUgaGFsZiB0aGF0IHdhcyBtaXNzaW5nLiBBXG4gIC8vIGtleS1kb3duIGFsb25lIHJlYWNoZXMgdGhlIGRvb3IgdGhyb3VnaCBgZG9vcklucHV0SGFuZGxlcmAsIGJ1dCBob2xkaW5nIGFcbiAgLy8ga2V5IG9ubHkgcmUtc2VuZHMga2V5LWRvd24gYWZ0ZXIgdGhlIGNsaWVudCdzIDQwMCBtcyByZXBlYXQgZGVsYXlcbiAgLy8gKHBhY2thZ2VzL3Rlcm1pbmFsL3NyYy9jb21wb25lbnRzL0JCU1Rlcm1pbmFsLnRzeDoxMzQyKSwgc28gdGhlIHBhZGRsZVxuICAvLyBoZXNpdGF0ZWQgYW5kIHRoZW4gc3R1dHRlcmVkLiBrZXktdXAgbmV2ZXIgcmVhY2hlcyBgZG9vcklucHV0SGFuZGxlcmAgYXRcbiAgLy8gYWxsIC0gYHNvY2tldC1oYW5kbGVycy50czo1NTEtNTcwYCBnaXZlcyByZWxlYXNlcyBvbmx5IHRvXG4gIC8vIGBkb29yS2V5U3RhdGVIYW5kbGVyYCwgd2hpY2ggaXMgZXhhY3RseSB3aGF0IHRoZXNlIHR3byBpbnN0YWxsLlxuICAvL1xuICAvLyBUaGlzIGlzIHRoZSBtZWNoYW5pc20gdGhlIHR3ZWx2ZSBhcmNhZGUgZG9vcnMgdXNlOyB0aGV5IHJlYWNoIGl0IHRocm91Z2hcbiAgLy8gYERvb3JJbnB1dE1hbmFnZXIoeyBlbmFibGVHYW1lTW9kZTogdHJ1ZSwgdHJhY2tIZWxkS2V5czogdHJ1ZSB9KWAsIHdoaWNoXG4gIC8vIGNhbGxzIHRoZXNlIHNhbWUgdHdvIG1ldGhvZHMgKGRvb3ItaW5wdXQtbWFuYWdlci50czoyNTctMjc5KS4gUE9ORyBjYW5ub3RcbiAgLy8gdXNlIHRoYXQgd3JhcHBlcjogaXQgcmVxdWlyZXMgYSBibGVzc2VkIGBTY3JlZW5gIGFuZCBpdHMgYGVuYWJsZSgpYCB3b3VsZFxuICAvLyBjYWxsIGBzZXR1cElucHV0SGFuZGxlcmAgKGRvb3ItaW5wdXQtbWFuYWdlci50czoyMDkpLCByZXBsYWNpbmcgdGhlXG4gIC8vIGBkb29ySW5wdXRIYW5kbGVyYCB0aGlzIGRvb3IncyBTREsgaW5wdXQgbG9vcCBvd25zLiBTYW1lIG1lY2hhbmlzbSxcbiAgLy8gd2l0aG91dCB0aGUgYmxlc3NlZCBsYXllciBhbiBuY3Vyc2VzIGRvb3IgZG9lcyBub3QgaGF2ZS5cbiAgLy9cbiAgLy8gUmVnaXN0cmF0aW9uIG9yZGVyIG1hdHRlcnM6IG9uS2V5VXAgV1JBUFMgdGhlIGhhbmRsZXIgb25LZXlEb3duIGluc3RhbGxlZFxuICAvLyAoQkJTQXBpLnRzOjYwNC02MTUpLCBzbyBkb3duIG11c3QgYmUgcmVnaXN0ZXJlZCBmaXJzdC5cbiAgY29uc3Qga2V5cyA9IGJicyBhcyAodHlwZW9mIGJicyAmIEtleUVkZ2VBcGkpIHwgdW5kZWZpbmVkO1xuICBrZXlzPy5vbktleURvd24/Ligoa2V5OiBzdHJpbmcpID0+IHBvbmcuaG9sZEtleShrZXkpKTtcbiAga2V5cz8ub25LZXlVcD8uKChrZXk6IHN0cmluZykgPT4gcG9uZy5yZWxlYXNlS2V5KGtleSkpO1xuXG4gIHBvbmcuc3RhcnQobmN1cnNlc0NvbnRleHQoc29ja2V0KSwgKCkgPT4ge1xuICAgIC8vIEVTQy4gYGN0eC5jbG9zZSgpYCAoc2RrL3NyYy9jb3JlL0Rvb3IudHM6MjI3KSBvbmx5IGRyb3BzIHRoaXMgbm9kZSdzXG4gICAgLy8gcnVubmluZy1zZXNzaW9uIGVudHJ5OyB0aGUgU0RLIGlucHV0IGxvb3AgdGhlbiByZXNvbHZlcyBvbiB0aGUgTkVYVFxuICAgIC8vIGtleXN0cm9rZSAoc2RrL3NyYy9jb3JlL0Rvb3IudHM6MjEyLTIxNyksIHdoaWNoIGlzIHdoYXQgdGhlIGxpbmUgYmVsb3dcbiAgICAvLyBpcyBhc2tpbmcgZm9yLlxuICAgIHNvY2tldC5lbWl0KCdhbnNpLW91dHB1dCcsICdcXHJcXG5UaGFua3MgZm9yIHBsYXlpbmcgUE9ORy4gUHJlc3MgYW55IGtleSB0byBleGl0Li4uXFxyXFxuJyk7XG4gICAgY3R4LmNsb3NlKCk7XG4gIH0pO1xuXG4gIC8vIG9uU3RhcnQgUkVUVVJOUyBoZXJlLCBhbmQgdGhhdCBpcyB0aGUgd2hvbGUgcG9pbnQgLSBzZWUgdGhlIGhlYWRlci5cbiAgLy8gVGhlIFNESydzIGlucHV0IGxvb3AgaXMgdGhpcyBkb29yJ3Mgc3RheS1hbGl2ZTogaXQgaG9sZHMgYGV4ZWN1dGUoKWAgb3BlblxuICAvLyB1bnRpbCB0aGUgc29ja2V0IGRpc2Nvbm5lY3RzLCB0aGUgQkJTIHNlbmRzIGBkb29yOmNsb3NlYCwgb3IgdGhlIGRvb3JcbiAgLy8gaXRzZWxmIHNheXMgaXQgaXMgZmluaXNoZWQgdmlhIHRoZSBxdWl0IHBhdGggYWJvdmUuXG59KTtcblxuZG9vci5vbklucHV0KGFzeW5jIChjdHg6IERvb3JDb250ZXh0LCBrZXk6IEtleVByZXNzKSA9PiB7XG4gIGNvbnN0IHBvbmcgPSBnYW1lcy5nZXQoY3R4Lm5vZGVJZCk7XG4gIGlmICghcG9uZykgcmV0dXJuO1xuXG4gIGNvbnN0IHsga2V5OiBrZXlEYXRhIH0gPSBwYXJzZUtleURhdGEoa2V5LnJhdyk7XG4gIHBvbmcuaGFuZGxlS2V5KGtleURhdGEubmFtZSA/PyBrZXkucmF3KTtcbn0pO1xuXG5kb29yLm9uQ2xvc2UoYXN5bmMgKGN0eDogRG9vckNvbnRleHQpID0+IHtcbiAgY29uc3QgcG9uZyA9IGdhbWVzLmdldChjdHgubm9kZUlkKTtcbiAgaWYgKHBvbmcpIHtcbiAgICBwb25nLnN0b3AoKTtcbiAgICBnYW1lcy5kZWxldGUoY3R4Lm5vZGVJZCk7XG4gIH1cbiAgY3R4LmJicz8uZGlzYWJsZUdhbWVNb2RlPy4oKTtcblxuICAvLyBUaGUga2V5LWVkZ2UgY2FsbGJhY2tzIGNsb3NlIG92ZXIgdGhlIFBvbmdEb29yIGFib3ZlLCBhbmQgbmVpdGhlciB0aGUgVFNcbiAgLy8gZG9vciB0ZWFyZG93biAoaGFuZGxlcnMvZG9vci5oYW5kbGVyLnRzOjIzNzQsIHdoaWNoIGRlbGV0ZXNcbiAgLy8gZG9vcklucHV0SGFuZGxlciBvbmx5KSBub3IgRG9vcklucHV0TWFuYWdlci5kaXNhYmxlKCkgY2xlYXJzIHRoaXMgb25lLlxuICAvLyBMZWF2aW5nIGl0IHBvaW50ZWQgYXQgYSBzdG9wcGVkIGdhbWUgaXMgYSBsZWFrIHRoaXMgZG9vciBpbnRyb2R1Y2VkLCBzb1xuICAvLyB0aGlzIGRvb3IgZHJvcHMgaXQuXG4gIGlmIChjdHguYmJzU2Vzc2lvbikge1xuICAgIGRlbGV0ZSBjdHguYmJzU2Vzc2lvbi5kb29yS2V5U3RhdGVIYW5kbGVyO1xuICB9XG59KTtcblxuZXhwb3J0IGRlZmF1bHQgZG9vcjtcbiJdfQ==