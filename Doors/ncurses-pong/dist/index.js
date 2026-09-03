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
            return { ch: undefined, key: { name: 'up', sequence } };
        if (sequence === '\x1b[B' || sequence === '\x1bOB')
            return { ch: undefined, key: { name: 'down', sequence } };
        if (sequence === '\x1b[C' || sequence === '\x1bOC')
            return { ch: undefined, key: { name: 'right', sequence } };
        if (sequence === '\x1b[D' || sequence === '\x1bOD')
            return { ch: undefined, key: { name: 'left', sequence } };
        if (sequence === '\x1b[H' || sequence === '\x1bOH')
            return { ch: undefined, key: { name: 'home', sequence } };
        if (sequence === '\x1b[F' || sequence === '\x1bOF')
            return { ch: undefined, key: { name: 'end', sequence } };
        if (sequence === '\x1b[5~')
            return { ch: undefined, key: { name: 'pageup', sequence } };
        if (sequence === '\x1b[6~')
            return { ch: undefined, key: { name: 'pagedown', sequence } };
        if (sequence === '\x1b[2~')
            return { ch: undefined, key: { name: 'insert', sequence } };
        if (sequence === '\x1b[3~')
            return { ch: undefined, key: { name: 'delete', sequence } };
        // F1-F4 (SS3)
        if (sequence === '\x1bOP')
            return { ch: undefined, key: { name: 'f1', sequence } };
        if (sequence === '\x1bOQ')
            return { ch: undefined, key: { name: 'f2', sequence } };
        if (sequence === '\x1bOR')
            return { ch: undefined, key: { name: 'f3', sequence } };
        if (sequence === '\x1bOS')
            return { ch: undefined, key: { name: 'f4', sequence } };
    }
    // ESC alone
    if (sequence === '\x1b')
        return { ch: undefined, key: { name: 'escape', sequence } };
    // Backspace
    if (sequence === '\x7f' || sequence === '\x08')
        return { ch: undefined, key: { name: 'backspace', sequence } };
    // Enter
    if (sequence === '\r' || sequence === '\n')
        return { ch: undefined, key: { name: 'enter', sequence } };
    // Tab
    if (sequence === '\t')
        return { ch: undefined, key: { name: 'tab', sequence } };
    // Regular character
    return { ch: data, key: { name: data, sequence } };
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
    // Enable game mode for real-time input. Both the `command` path and the
    // game-mode `key-down` path converge on `session.doorInputHandler`
    // (socket-handlers.ts:536-546, :779), so this changes the wire format the
    // browser uses, not who receives the key.
    bbs?.enableGameMode?.();
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
});
exports.default = door;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBb0JHOzs7QUFFSCwyREFBNkU7QUFDN0UscUNBQW9DO0FBRXBDLG9CQUFvQjtBQUNQLFFBQUEsUUFBUSxHQUFHO0lBQ3RCLElBQUksRUFBRSxjQUFjO0lBQ3BCLE9BQU8sRUFBRSxPQUFPO0lBQ2hCLFdBQVcsRUFBRSxrQ0FBa0M7SUFDL0MsTUFBTSxFQUFFLDZDQUE2QztJQUNyRCxPQUFPLEVBQUUsTUFBTTtDQUNoQixDQUFDO0FBRUY7O0dBRUc7QUFDSCxNQUFNLElBQUksR0FBRyxJQUFJLHlCQUFVLENBQUMsZ0JBQVEsQ0FBQyxDQUFDO0FBRXRDOzs7Ozs7R0FNRztBQUNILE1BQU0sS0FBSyxHQUFHLElBQUksR0FBRyxFQUFvQixDQUFDO0FBRTFDLHdDQUF3QztBQUN4QyxTQUFTLFlBQVksQ0FBQyxJQUFZO0lBQ2hDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQztJQUV0QixtREFBbUQ7SUFDbkQsSUFBSSxRQUFRLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNqRSw0QkFBNEI7UUFDNUIsSUFBSSxRQUFRLEtBQUssUUFBUSxJQUFJLFFBQVEsS0FBSyxRQUFRO1lBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDO1FBQzVHLElBQUksUUFBUSxLQUFLLFFBQVEsSUFBSSxRQUFRLEtBQUssUUFBUTtZQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztRQUM5RyxJQUFJLFFBQVEsS0FBSyxRQUFRLElBQUksUUFBUSxLQUFLLFFBQVE7WUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxFQUFFLENBQUM7UUFDL0csSUFBSSxRQUFRLEtBQUssUUFBUSxJQUFJLFFBQVEsS0FBSyxRQUFRO1lBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDO1FBQzlHLElBQUksUUFBUSxLQUFLLFFBQVEsSUFBSSxRQUFRLEtBQUssUUFBUTtZQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztRQUM5RyxJQUFJLFFBQVEsS0FBSyxRQUFRLElBQUksUUFBUSxLQUFLLFFBQVE7WUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxFQUFFLENBQUM7UUFDN0csSUFBSSxRQUFRLEtBQUssU0FBUztZQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztRQUN4RixJQUFJLFFBQVEsS0FBSyxTQUFTO1lBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDO1FBQzFGLElBQUksUUFBUSxLQUFLLFNBQVM7WUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxFQUFFLENBQUM7UUFDeEYsSUFBSSxRQUFRLEtBQUssU0FBUztZ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QUFFLGVBQWUsRUFBRSxFQUFFLENBQUM7QUFDL0IsQ0FBQyxDQUFDLENBQUM7QUFFSCxrQkFBZSxJQUFJLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIG5jdXJzZXMtcG9uZyAtIFBvcnQgb2YgdmljZW50ZWJvbGVhL1BvbmctY3Vyc2VzXG4gKlxuICogT3JpZ2luYWw6IGh0dHBzOi8vZ2l0aHViLmNvbS92aWNlbnRlYm9sZWEvUG9uZy1jdXJzZXNcbiAqIEF1dGhvcjogVmljZW50ZSBBZG9sZm8gQm9sZWEgU2FuY2hleiA8dmljZW50ZS5ib2xlYUBnbWFpbC5jb20+XG4gKlxuICogVGhpcyBpcyBhIGRpcmVjdCBwb3J0IHRvIHZhbGlkYXRlIHRoZSBuY3Vyc2VzIGNvbXBhdGliaWxpdHkgbGF5ZXIuXG4gKlxuICogVGhlIGRvb3IgdG9vayBubyBpbnB1dCBvbiBhbnkgc3VyZmFjZSB1bnRpbCAyMDI2LTA5LTAzOiBgb25TdGFydGAgdXNlZCB0b1xuICogYGF3YWl0IHBvbmcub25TdGFydChjb250ZXh0KWAgLSB0aGUgQyBnYW1lIGxvb3AgLSB3aGlsZSBgb25JbnB1dGAgc2F0XG4gKiByZWdpc3RlcmVkIGJlbG93LiBgRG9vci5leGVjdXRlKClgIG9ubHkgcmVhY2hlcyB0aGUgU0RLIGlucHV0IGxvb3AsIHRoZSBvbmVcbiAqIHRoaW5nIHRoYXQgaW5zdGFsbHMgYGJic1Nlc3Npb24uZG9vcklucHV0SGFuZGxlcmAgKHNkay9zcmMvY29yZS9Eb29yLnRzOjI1MCksXG4gKiBhZnRlciBldmVyeSBzdGFydCBoYW5kbGVyIGhhcyBSRVNPTFZFRCAoc2RrL3NyYy9jb3JlL0Rvb3IudHM6MTE4LTEzMSksIGFuZFxuICogYm90aCBsaXZlIHJvdXRlcnMgcmVhZCBleGFjdGx5IHRoYXQgcHJvcGVydHkgKHdlYjpcbiAqIHdlYi9iYWNrZW5kL3NyYy9zZXJ2ZXIvc29ja2V0LWhhbmRsZXJzLnRzOjc3OTsgdGVsbmV0OlxuICogd2ViL2JhY2tlbmQvc3JjL2luZGV4LnRzOjEyNDEpLiBUaGUgbG9vcCB3YXMgbmV2ZXIgcmVhY2hlZCwgdGhlIGhhbmRsZXIgd2FzXG4gKiBuZXZlciBpbnN0YWxsZWQsIGFuZCBldmVyeSBrZXlzdHJva2UgZmVsbCB0aHJvdWdoIHRvIHRoZSBgZG9vcjppbnB1dGBcbiAqIGRlYWQtZHJvcCBhdCBzb2NrZXQtaGFuZGxlcnMudHM6NzgzLlxuICpcbiAqIFJlcG9ydDogLnN1cGVycG93ZXJzL3NkZC8yMDI2LTA5LTAzLW5jdXJzZXMtcG9uZy1pbnB1dC9wcm9ncmVzcy5tZFxuICovXG5cbmltcG9ydCB7IFNlcnZlckRvb3IsIERvb3JDb250ZXh0LCBLZXlQcmVzcyB9IGZyb20gJ0BhbWlleHByZXNzL2Jicy1kb29yLXNkayc7XG5pbXBvcnQgeyBQb25nRG9vciB9IGZyb20gJy4vYXBwLmpzJztcblxuLyoqIERvb3IgbWV0YWRhdGEgKi9cbmV4cG9ydCBjb25zdCBtZXRhZGF0YSA9IHtcbiAgbmFtZTogJ25jdXJzZXMtcG9uZycsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGRlc2NyaXB0aW9uOiAnQ2xhc3NpYyBQb25nIGdhbWUgKG5jdXJzZXMgcG9ydCknLFxuICBhdXRob3I6ICdWaWNlbnRlIEJvbGVhIChvcmlnaW5hbCksIEFtaUV4cHJlc3MgKHBvcnQpJyxcbiAgY29tbWFuZDogJ1BPTkcnLFxufTtcblxuLyoqXG4gKiBNYWluIGRvb3IgY2xhc3NcbiAqL1xuY29uc3QgZG9vciA9IG5ldyBTZXJ2ZXJEb29yKG1ldGFkYXRhKTtcblxuLyoqXG4gKiBUaGUgbGl2ZSBnYW1lIGZvciBlYWNoIG5vZGUuXG4gKlxuICogVGhlIG9sZCBjb2RlIHN0YXNoZWQgdGhlIGtleSBoYW5kbGVyIG9uIHRoZSBkb29yIGNvbnRleHQgYmVoaW5kIGFuIGBhbnlgXG4gKiBjYXN0OyB0aGUgbm9kZSBpZCBpcyB0aGUga2V5IHRoZSBCQlMgaXRzZWxmIHVzZXMsIGFuZCBpdCBpcyB0aGUgb25lXG4gKiBgRG9vci5leGVjdXRlKClgIGhhbmRzIGV2ZXJ5IGhhbmRsZXIgKGBjdHgubm9kZUlkYCkuXG4gKi9cbmNvbnN0IGdhbWVzID0gbmV3IE1hcDxudW1iZXIsIFBvbmdEb29yPigpO1xuXG4vLyBQYXJzZSBlc2NhcGUgc2VxdWVuY2VzIGludG8ga2V5IG5hbWVzXG5mdW5jdGlvbiBwYXJzZUtleURhdGEoZGF0YTogc3RyaW5nKTogeyBjaDogc3RyaW5nIHwgdW5kZWZpbmVkOyBrZXk6IHsgbmFtZT86IHN0cmluZzsgc2VxdWVuY2U6IHN0cmluZyB9IH0ge1xuICBjb25zdCBzZXF1ZW5jZSA9IGRhdGE7XG5cbiAgLy8gQXJyb3cga2V5cyBhbmQgc3BlY2lhbCBrZXlzIHZpYSBlc2NhcGUgc2VxdWVuY2VzXG4gIGlmIChzZXF1ZW5jZS5zdGFydHNXaXRoKCdcXHgxYlsnKSB8fCBzZXF1ZW5jZS5zdGFydHNXaXRoKCdcXHgxYk8nKSkge1xuICAgIC8vIENTSSBzZXF1ZW5jZXMgKEVTQyBbIC4uLilcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYltBJyB8fCBzZXF1ZW5jZSA9PT0gJ1xceDFiT0EnKSByZXR1cm4geyBjaDogdW5kZWZpbmVkLCBrZXk6IHsgbmFtZTogJ3VwJywgc2VxdWVuY2UgfSB9O1xuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiW0InIHx8IHNlcXVlbmNlID09PSAnXFx4MWJPQicpIHJldHVybiB7IGNoOiB1bmRlZmluZWQsIGtleTogeyBuYW1lOiAnZG93bicsIHNlcXVlbmNlIH0gfTtcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYltDJyB8fCBzZXF1ZW5jZSA9PT0gJ1xceDFiT0MnKSByZXR1cm4geyBjaDogdW5kZWZpbmVkLCBrZXk6IHsgbmFtZTogJ3JpZ2h0Jywgc2VxdWVuY2UgfSB9O1xuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiW0QnIHx8IHNlcXVlbmNlID09PSAnXFx4MWJPRCcpIHJldHVybiB7IGNoOiB1bmRlZmluZWQsIGtleTogeyBuYW1lOiAnbGVmdCcsIHNlcXVlbmNlIH0gfTtcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYltIJyB8fCBzZXF1ZW5jZSA9PT0gJ1xceDFiT0gnKSByZXR1cm4geyBjaDogdW5kZWZpbmVkLCBrZXk6IHsgbmFtZTogJ2hvbWUnLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbRicgfHwgc2VxdWVuY2UgPT09ICdcXHgxYk9GJykgcmV0dXJuIHsgY2g6IHVuZGVmaW5lZCwga2V5OiB7IG5hbWU6ICdlbmQnLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbNX4nKSByZXR1cm4geyBjaDogdW5kZWZpbmVkLCBrZXk6IHsgbmFtZTogJ3BhZ2V1cCcsIHNlcXVlbmNlIH0gfTtcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYls2ficpIHJldHVybiB7IGNoOiB1bmRlZmluZWQsIGtleTogeyBuYW1lOiAncGFnZWRvd24nLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbMn4nKSByZXR1cm4geyBjaDogdW5kZWZpbmVkLCBrZXk6IHsgbmFtZTogJ2luc2VydCcsIHNlcXVlbmNlIH0gfTtcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYlszficpIHJldHVybiB7IGNoOiB1bmRlZmluZWQsIGtleTogeyBuYW1lOiAnZGVsZXRlJywgc2VxdWVuY2UgfSB9O1xuICAgIC8vIEYxLUY0IChTUzMpXG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJPUCcpIHJldHVybiB7IGNoOiB1bmRlZmluZWQsIGtleTogeyBuYW1lOiAnZjEnLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJPUScpIHJldHVybiB7IGNoOiB1bmRlZmluZWQsIGtleTogeyBuYW1lOiAnZjInLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJPUicpIHJldHVybiB7IGNoOiB1bmRlZmluZWQsIGtleTogeyBuYW1lOiAnZjMnLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJPUycpIHJldHVybiB7IGNoOiB1bmRlZmluZWQsIGtleTogeyBuYW1lOiAnZjQnLCBzZXF1ZW5jZSB9IH07XG4gIH1cblxuICAvLyBFU0MgYWxvbmVcbiAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWInKSByZXR1cm4geyBjaDogdW5kZWZpbmVkLCBrZXk6IHsgbmFtZTogJ2VzY2FwZScsIHNlcXVlbmNlIH0gfTtcblxuICAvLyBCYWNrc3BhY2VcbiAgaWYgKHNlcXVlbmNlID09PSAnXFx4N2YnIHx8IHNlcXVlbmNlID09PSAnXFx4MDgnKSByZXR1cm4geyBjaDogdW5kZWZpbmVkLCBrZXk6IHsgbmFtZTogJ2JhY2tzcGFjZScsIHNlcXVlbmNlIH0gfTtcblxuICAvLyBFbnRlclxuICBpZiAoc2VxdWVuY2UgPT09ICdcXHInIHx8IHNlcXVlbmNlID09PSAnXFxuJykgcmV0dXJuIHsgY2g6IHVuZGVmaW5lZCwga2V5OiB7IG5hbWU6ICdlbnRlcicsIHNlcXVlbmNlIH0gfTtcblxuICAvLyBUYWJcbiAgaWYgKHNlcXVlbmNlID09PSAnXFx0JykgcmV0dXJuIHsgY2g6IHVuZGVmaW5lZCwga2V5OiB7IG5hbWU6ICd0YWInLCBzZXF1ZW5jZSB9IH07XG5cbiAgLy8gUmVndWxhciBjaGFyYWN0ZXJcbiAgcmV0dXJuIHsgY2g6IGRhdGEsIGtleTogeyBuYW1lOiBkYXRhLCBzZXF1ZW5jZSB9IH07XG59XG5cbi8qKiBuY3Vyc2VzIGBpbml0c2NyKClgIHRha2VzIGFueSBvYmplY3QgdGhhdCBjYW4gcHV0IGJ5dGVzIG9uIHRoZSB3aXJlLiAqL1xuZnVuY3Rpb24gbmN1cnNlc0NvbnRleHQoc29ja2V0OiB7IGVtaXQ6IChldmVudDogc3RyaW5nLCBkYXRhOiBzdHJpbmcpID0+IHZvaWQgfSk6IHtcbiAgZW1pdDogKGV2ZW50OiBzdHJpbmcsIGRhdGE6IHN0cmluZykgPT4gdm9pZDtcbiAgd3JpdGU6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQ7XG59IHtcbiAgcmV0dXJuIHtcbiAgICBlbWl0OiAoZXZlbnQ6IHN0cmluZywgZGF0YTogc3RyaW5nKSA9PiB7XG4gICAgICBpZiAoZXZlbnQgPT09ICdhbnNpLW91dHB1dCcpIHtcbiAgICAgICAgc29ja2V0LmVtaXQoJ2Fuc2ktb3V0cHV0JywgZGF0YSk7XG4gICAgICB9XG4gICAgfSxcbiAgICB3cml0ZTogKGRhdGE6IHN0cmluZykgPT4gc29ja2V0LmVtaXQoJ2Fuc2ktb3V0cHV0JywgZGF0YSksXG4gIH07XG59XG5cbmRvb3Iub25TdGFydChhc3luYyAoY3R4OiBEb29yQ29udGV4dCkgPT4ge1xuICBjb25zdCB7IHNvY2tldCwgYmJzIH0gPSBjdHg7XG4gIGNvbnN0IHBvbmcgPSBuZXcgUG9uZ0Rvb3IoKTtcbiAgZ2FtZXMuc2V0KGN0eC5ub2RlSWQsIHBvbmcpO1xuXG4gIC8vIEVuYWJsZSBnYW1lIG1vZGUgZm9yIHJlYWwtdGltZSBpbnB1dC4gQm90aCB0aGUgYGNvbW1hbmRgIHBhdGggYW5kIHRoZVxuICAvLyBnYW1lLW1vZGUgYGtleS1kb3duYCBwYXRoIGNvbnZlcmdlIG9uIGBzZXNzaW9uLmRvb3JJbnB1dEhhbmRsZXJgXG4gIC8vIChzb2NrZXQtaGFuZGxlcnMudHM6NTM2LTU0NiwgOjc3OSksIHNvIHRoaXMgY2hhbmdlcyB0aGUgd2lyZSBmb3JtYXQgdGhlXG4gIC8vIGJyb3dzZXIgdXNlcywgbm90IHdobyByZWNlaXZlcyB0aGUga2V5LlxuICBiYnM/LmVuYWJsZUdhbWVNb2RlPy4oKTtcblxuICBwb25nLnN0YXJ0KG5jdXJzZXNDb250ZXh0KHNvY2tldCksICgpID0+IHtcbiAgICAvLyBFU0MuIGBjdHguY2xvc2UoKWAgKHNkay9zcmMvY29yZS9Eb29yLnRzOjIyNykgb25seSBkcm9wcyB0aGlzIG5vZGUnc1xuICAgIC8vIHJ1bm5pbmctc2Vzc2lvbiBlbnRyeTsgdGhlIFNESyBpbnB1dCBsb29wIHRoZW4gcmVzb2x2ZXMgb24gdGhlIE5FWFRcbiAgICAvLyBrZXlzdHJva2UgKHNkay9zcmMvY29yZS9Eb29yLnRzOjIxMi0yMTcpLCB3aGljaCBpcyB3aGF0IHRoZSBsaW5lIGJlbG93XG4gICAgLy8gaXMgYXNraW5nIGZvci5cbiAgICBzb2NrZXQuZW1pdCgnYW5zaS1vdXRwdXQnLCAnXFxyXFxuVGhhbmtzIGZvciBwbGF5aW5nIFBPTkcuIFByZXNzIGFueSBrZXkgdG8gZXhpdC4uLlxcclxcbicpO1xuICAgIGN0eC5jbG9zZSgpO1xuICB9KTtcblxuICAvLyBvblN0YXJ0IFJFVFVSTlMgaGVyZSwgYW5kIHRoYXQgaXMgdGhlIHdob2xlIHBvaW50IC0gc2VlIHRoZSBoZWFkZXIuXG4gIC8vIFRoZSBTREsncyBpbnB1dCBsb29wIGlzIHRoaXMgZG9vcidzIHN0YXktYWxpdmU6IGl0IGhvbGRzIGBleGVjdXRlKClgIG9wZW5cbiAgLy8gdW50aWwgdGhlIHNvY2tldCBkaXNjb25uZWN0cywgdGhlIEJCUyBzZW5kcyBgZG9vcjpjbG9zZWAsIG9yIHRoZSBkb29yXG4gIC8vIGl0c2VsZiBzYXlzIGl0IGlzIGZpbmlzaGVkIHZpYSB0aGUgcXVpdCBwYXRoIGFib3ZlLlxufSk7XG5cbmRvb3Iub25JbnB1dChhc3luYyAoY3R4OiBEb29yQ29udGV4dCwga2V5OiBLZXlQcmVzcykgPT4ge1xuICBjb25zdCBwb25nID0gZ2FtZXMuZ2V0KGN0eC5ub2RlSWQpO1xuICBpZiAoIXBvbmcpIHJldHVybjtcblxuICBjb25zdCB7IGtleToga2V5RGF0YSB9ID0gcGFyc2VLZXlEYXRhKGtleS5yYXcpO1xuICBwb25nLmhhbmRsZUtleShrZXlEYXRhLm5hbWUgPz8ga2V5LnJhdyk7XG59KTtcblxuZG9vci5vbkNsb3NlKGFzeW5jIChjdHg6IERvb3JDb250ZXh0KSA9PiB7XG4gIGNvbnN0IHBvbmcgPSBnYW1lcy5nZXQoY3R4Lm5vZGVJZCk7XG4gIGlmIChwb25nKSB7XG4gICAgcG9uZy5zdG9wKCk7XG4gICAgZ2FtZXMuZGVsZXRlKGN0eC5ub2RlSWQpO1xuICB9XG4gIGN0eC5iYnM/LmRpc2FibGVHYW1lTW9kZT8uKCk7XG59KTtcblxuZXhwb3J0IGRlZmF1bHQgZG9vcjtcbiJdfQ==