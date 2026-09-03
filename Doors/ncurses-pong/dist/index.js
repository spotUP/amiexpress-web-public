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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBb0JHOzs7QUFFSCwyREFBNkU7QUFDN0UscUNBQW9DO0FBRXBDLG9CQUFvQjtBQUNQLFFBQUEsUUFBUSxHQUFHO0lBQ3RCLElBQUksRUFBRSxjQUFjO0lBQ3BCLE9BQU8sRUFBRSxPQUFPO0lBQ2hCLFdBQVcsRUFBRSxrQ0FBa0M7SUFDL0MsTUFBTSxFQUFFLDZDQUE2QztJQUNyRCxPQUFPLEVBQUUsTUFBTTtDQUNoQixDQUFDO0FBRUY7O0dBRUc7QUFDSCxNQUFNLElBQUksR0FBRyxJQUFJLHlCQUFVLENBQUMsZ0JBQVEsQ0FBQyxDQUFDO0FBRXRDOzs7Ozs7R0FNRztBQUNILE1BQU0sS0FBSyxHQUFHLElBQUksR0FBRyxFQUFvQixDQUFDO0FBRTFDLHdDQUF3QztBQUN4QyxTQUFTLFlBQVksQ0FBQyxJQUFZO0lBQ2hDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQztJQUV0QixtREFBbUQ7SUFDbkQsSUFBSSxRQUFRLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNqRSw0QkFBNEI7UUFDNUIsSUFBSSxRQUFRLEtBQUssUUFBUSxJQUFJLFFBQVEsS0FBSyxRQUFRO1lBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztRQUM3RixJQUFJLFFBQVEsS0FBSyxRQUFRLElBQUksUUFBUSxLQUFLLFFBQVE7WUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDO1FBQy9GLElBQUksUUFBUSxLQUFLLFFBQVEsSUFBSSxRQUFRLEtBQUssUUFBUTtZQUFFLE9BQU8sRUFB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SUFDckQsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDbkMsSUFBSSxDQUFDLElBQUk7UUFBRSxPQUFPO0lBRWxCLE1BQU0sRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLEdBQUcsWUFBWSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUMvQyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxJQUFJLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQzFDLENBQUMsQ0FBQyxDQUFDO0FBRUgsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBZ0IsRUFBRSxFQUFFO0lBQ3RDLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ25DLElBQUksSUFBSSxFQUFFLENBQUM7UUFDVCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDWixLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMzQixDQUFDO0lBQ0QsR0FBRyxDQUFDLEdBQUcsRUFBRSxlQUFlLEVBQUUsRUFBRSxDQUFDO0FBQy9CLENBQUMsQ0FBQyxDQUFDO0FBRUgsa0JBQWUsSUFBSSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBuY3Vyc2VzLXBvbmcgLSBQb3J0IG9mIHZpY2VudGVib2xlYS9Qb25nLWN1cnNlc1xuICpcbiAqIE9yaWdpbmFsOiBodHRwczovL2dpdGh1Yi5jb20vdmljZW50ZWJvbGVhL1BvbmctY3Vyc2VzXG4gKiBBdXRob3I6IFZpY2VudGUgQWRvbGZvIEJvbGVhIFNhbmNoZXogPHZpY2VudGUuYm9sZWFAZ21haWwuY29tPlxuICpcbiAqIFRoaXMgaXMgYSBkaXJlY3QgcG9ydCB0byB2YWxpZGF0ZSB0aGUgbmN1cnNlcyBjb21wYXRpYmlsaXR5IGxheWVyLlxuICpcbiAqIFRoZSBkb29yIHRvb2sgbm8gaW5wdXQgb24gYW55IHN1cmZhY2UgdW50aWwgMjAyNi0wOS0wMzogYG9uU3RhcnRgIHVzZWQgdG9cbiAqIGBhd2FpdCBwb25nLm9uU3RhcnQoY29udGV4dClgIC0gdGhlIEMgZ2FtZSBsb29wIC0gd2hpbGUgYG9uSW5wdXRgIHNhdFxuICogcmVnaXN0ZXJlZCBiZWxvdy4gYERvb3IuZXhlY3V0ZSgpYCBvbmx5IHJlYWNoZXMgdGhlIFNESyBpbnB1dCBsb29wLCB0aGUgb25lXG4gKiB0aGluZyB0aGF0IGluc3RhbGxzIGBiYnNTZXNzaW9uLmRvb3JJbnB1dEhhbmRsZXJgIChzZGsvc3JjL2NvcmUvRG9vci50czoyNTApLFxuICogYWZ0ZXIgZXZlcnkgc3RhcnQgaGFuZGxlciBoYXMgUkVTT0xWRUQgKHNkay9zcmMvY29yZS9Eb29yLnRzOjExOC0xMzEpLCBhbmRcbiAqIGJvdGggbGl2ZSByb3V0ZXJzIHJlYWQgZXhhY3RseSB0aGF0IHByb3BlcnR5ICh3ZWI6XG4gKiB3ZWIvYmFja2VuZC9zcmMvc2VydmVyL3NvY2tldC1oYW5kbGVycy50czo3Nzk7IHRlbG5ldDpcbiAqIHdlYi9iYWNrZW5kL3NyYy9pbmRleC50czoxMjQxKS4gVGhlIGxvb3Agd2FzIG5ldmVyIHJlYWNoZWQsIHRoZSBoYW5kbGVyIHdhc1xuICogbmV2ZXIgaW5zdGFsbGVkLCBhbmQgZXZlcnkga2V5c3Ryb2tlIGZlbGwgdGhyb3VnaCB0byB0aGUgYGRvb3I6aW5wdXRgXG4gKiBkZWFkLWRyb3AgYXQgc29ja2V0LWhhbmRsZXJzLnRzOjc4My5cbiAqXG4gKiBSZXBvcnQ6IC5zdXBlcnBvd2Vycy9zZGQvMjAyNi0wOS0wMy1uY3Vyc2VzLXBvbmctaW5wdXQvcHJvZ3Jlc3MubWRcbiAqL1xuXG5pbXBvcnQgeyBTZXJ2ZXJEb29yLCBEb29yQ29udGV4dCwgS2V5UHJlc3MgfSBmcm9tICdAYW1pZXhwcmVzcy9iYnMtZG9vci1zZGsnO1xuaW1wb3J0IHsgUG9uZ0Rvb3IgfSBmcm9tICcuL2FwcC5qcyc7XG5cbi8qKiBEb29yIG1ldGFkYXRhICovXG5leHBvcnQgY29uc3QgbWV0YWRhdGEgPSB7XG4gIG5hbWU6ICduY3Vyc2VzLXBvbmcnLFxuICB2ZXJzaW9uOiAnMS4wLjAnLFxuICBkZXNjcmlwdGlvbjogJ0NsYXNzaWMgUG9uZyBnYW1lIChuY3Vyc2VzIHBvcnQpJyxcbiAgYXV0aG9yOiAnVmljZW50ZSBCb2xlYSAob3JpZ2luYWwpLCBBbWlFeHByZXNzIChwb3J0KScsXG4gIGNvbW1hbmQ6ICdQT05HJyxcbn07XG5cbi8qKlxuICogTWFpbiBkb29yIGNsYXNzXG4gKi9cbmNvbnN0IGRvb3IgPSBuZXcgU2VydmVyRG9vcihtZXRhZGF0YSk7XG5cbi8qKlxuICogVGhlIGxpdmUgZ2FtZSBmb3IgZWFjaCBub2RlLlxuICpcbiAqIFRoZSBvbGQgY29kZSBzdGFzaGVkIHRoZSBrZXkgaGFuZGxlciBvbiB0aGUgZG9vciBjb250ZXh0IGJlaGluZCBhbiBgYW55YFxuICogY2FzdDsgdGhlIG5vZGUgaWQgaXMgdGhlIGtleSB0aGUgQkJTIGl0c2VsZiB1c2VzLCBhbmQgaXQgaXMgdGhlIG9uZVxuICogYERvb3IuZXhlY3V0ZSgpYCBoYW5kcyBldmVyeSBoYW5kbGVyIChgY3R4Lm5vZGVJZGApLlxuICovXG5jb25zdCBnYW1lcyA9IG5ldyBNYXA8bnVtYmVyLCBQb25nRG9vcj4oKTtcblxuLy8gUGFyc2UgZXNjYXBlIHNlcXVlbmNlcyBpbnRvIGtleSBuYW1lc1xuZnVuY3Rpb24gcGFyc2VLZXlEYXRhKGRhdGE6IHN0cmluZyk6IHsga2V5OiB7IG5hbWU/OiBzdHJpbmc7IHNlcXVlbmNlOiBzdHJpbmcgfSB9IHtcbiAgY29uc3Qgc2VxdWVuY2UgPSBkYXRhO1xuXG4gIC8vIEFycm93IGtleXMgYW5kIHNwZWNpYWwga2V5cyB2aWEgZXNjYXBlIHNlcXVlbmNlc1xuICBpZiAoc2VxdWVuY2Uuc3RhcnRzV2l0aCgnXFx4MWJbJykgfHwgc2VxdWVuY2Uuc3RhcnRzV2l0aCgnXFx4MWJPJykpIHtcbiAgICAvLyBDU0kgc2VxdWVuY2VzIChFU0MgWyAuLi4pXG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbQScgfHwgc2VxdWVuY2UgPT09ICdcXHgxYk9BJykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICd1cCcsIHNlcXVlbmNlIH0gfTtcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYltCJyB8fCBzZXF1ZW5jZSA9PT0gJ1xceDFiT0InKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ2Rvd24nLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbQycgfHwgc2VxdWVuY2UgPT09ICdcXHgxYk9DJykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICdyaWdodCcsIHNlcXVlbmNlIH0gfTtcbiAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYltEJyB8fCBzZXF1ZW5jZSA9PT0gJ1xceDFiT0QnKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ2xlZnQnLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbSCcgfHwgc2VxdWVuY2UgPT09ICdcXHgxYk9IJykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICdob21lJywgc2VxdWVuY2UgfSB9O1xuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiW0YnIHx8IHNlcXVlbmNlID09PSAnXFx4MWJPRicpIHJldHVybiB7IGtleTogeyBuYW1lOiAnZW5kJywgc2VxdWVuY2UgfSB9O1xuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiWzV+JykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICdwYWdldXAnLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbNn4nKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ3BhZ2Vkb3duJywgc2VxdWVuY2UgfSB9O1xuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiWzJ+JykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICdpbnNlcnQnLCBzZXF1ZW5jZSB9IH07XG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbM34nKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ2RlbGV0ZScsIHNlcXVlbmNlIH0gfTtcbiAgICAvLyBGMS1GNCAoU1MzKVxuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiT1AnKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ2YxJywgc2VxdWVuY2UgfSB9O1xuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiT1EnKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ2YyJywgc2VxdWVuY2UgfSB9O1xuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiT1InKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ2YzJywgc2VxdWVuY2UgfSB9O1xuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiT1MnKSByZXR1cm4geyBrZXk6IHsgbmFtZTogJ2Y0Jywgc2VxdWVuY2UgfSB9O1xuICB9XG5cbiAgLy8gRVNDIGFsb25lXG4gIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiJykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICdlc2NhcGUnLCBzZXF1ZW5jZSB9IH07XG5cbiAgLy8gQmFja3NwYWNlXG4gIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDdmJyB8fCBzZXF1ZW5jZSA9PT0gJ1xceDA4JykgcmV0dXJuIHsga2V5OiB7IG5hbWU6ICdiYWNrc3BhY2UnLCBzZXF1ZW5jZSB9IH07XG5cbiAgLy8gRW50ZXJcbiAgaWYgKHNlcXVlbmNlID09PSAnXFxyJyB8fCBzZXF1ZW5jZSA9PT0gJ1xcbicpIHJldHVybiB7IGtleTogeyBuYW1lOiAnZW50ZXInLCBzZXF1ZW5jZSB9IH07XG5cbiAgLy8gVGFiXG4gIGlmIChzZXF1ZW5jZSA9PT0gJ1xcdCcpIHJldHVybiB7IGtleTogeyBuYW1lOiAndGFiJywgc2VxdWVuY2UgfSB9O1xuXG4gIC8vIFJlZ3VsYXIgY2hhcmFjdGVyXG4gIHJldHVybiB7IGtleTogeyBuYW1lOiBkYXRhLCBzZXF1ZW5jZSB9IH07XG59XG5cbi8qKiBuY3Vyc2VzIGBpbml0c2NyKClgIHRha2VzIGFueSBvYmplY3QgdGhhdCBjYW4gcHV0IGJ5dGVzIG9uIHRoZSB3aXJlLiAqL1xuZnVuY3Rpb24gbmN1cnNlc0NvbnRleHQoc29ja2V0OiB7IGVtaXQ6IChldmVudDogc3RyaW5nLCBkYXRhOiBzdHJpbmcpID0+IHZvaWQgfSk6IHtcbiAgZW1pdDogKGV2ZW50OiBzdHJpbmcsIGRhdGE6IHN0cmluZykgPT4gdm9pZDtcbiAgd3JpdGU6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQ7XG59IHtcbiAgcmV0dXJuIHtcbiAgICBlbWl0OiAoZXZlbnQ6IHN0cmluZywgZGF0YTogc3RyaW5nKSA9PiB7XG4gICAgICBpZiAoZXZlbnQgPT09ICdhbnNpLW91dHB1dCcpIHtcbiAgICAgICAgc29ja2V0LmVtaXQoJ2Fuc2ktb3V0cHV0JywgZGF0YSk7XG4gICAgICB9XG4gICAgfSxcbiAgICB3cml0ZTogKGRhdGE6IHN0cmluZykgPT4gc29ja2V0LmVtaXQoJ2Fuc2ktb3V0cHV0JywgZGF0YSksXG4gIH07XG59XG5cbmRvb3Iub25TdGFydChhc3luYyAoY3R4OiBEb29yQ29udGV4dCkgPT4ge1xuICBjb25zdCB7IHNvY2tldCwgYmJzIH0gPSBjdHg7XG4gIGNvbnN0IHBvbmcgPSBuZXcgUG9uZ0Rvb3IoKTtcbiAgZ2FtZXMuc2V0KGN0eC5ub2RlSWQsIHBvbmcpO1xuXG4gIC8vIEVuYWJsZSBnYW1lIG1vZGUgZm9yIHJlYWwtdGltZSBpbnB1dC4gQm90aCB0aGUgYGNvbW1hbmRgIHBhdGggYW5kIHRoZVxuICAvLyBnYW1lLW1vZGUgYGtleS1kb3duYCBwYXRoIGNvbnZlcmdlIG9uIGBzZXNzaW9uLmRvb3JJbnB1dEhhbmRsZXJgXG4gIC8vIChzb2NrZXQtaGFuZGxlcnMudHM6NTM2LTU0NiwgOjc3OSksIHNvIHRoaXMgY2hhbmdlcyB0aGUgd2lyZSBmb3JtYXQgdGhlXG4gIC8vIGJyb3dzZXIgdXNlcywgbm90IHdobyByZWNlaXZlcyB0aGUga2V5LlxuICBiYnM/LmVuYWJsZUdhbWVNb2RlPy4oKTtcblxuICBwb25nLnN0YXJ0KG5jdXJzZXNDb250ZXh0KHNvY2tldCksICgpID0+IHtcbiAgICAvLyBFU0MuIGBjdHguY2xvc2UoKWAgKHNkay9zcmMvY29yZS9Eb29yLnRzOjIyNykgb25seSBkcm9wcyB0aGlzIG5vZGUnc1xuICAgIC8vIHJ1bm5pbmctc2Vzc2lvbiBlbnRyeTsgdGhlIFNESyBpbnB1dCBsb29wIHRoZW4gcmVzb2x2ZXMgb24gdGhlIE5FWFRcbiAgICAvLyBrZXlzdHJva2UgKHNkay9zcmMvY29yZS9Eb29yLnRzOjIxMi0yMTcpLCB3aGljaCBpcyB3aGF0IHRoZSBsaW5lIGJlbG93XG4gICAgLy8gaXMgYXNraW5nIGZvci5cbiAgICBzb2NrZXQuZW1pdCgnYW5zaS1vdXRwdXQnLCAnXFxyXFxuVGhhbmtzIGZvciBwbGF5aW5nIFBPTkcuIFByZXNzIGFueSBrZXkgdG8gZXhpdC4uLlxcclxcbicpO1xuICAgIGN0eC5jbG9zZSgpO1xuICB9KTtcblxuICAvLyBvblN0YXJ0IFJFVFVSTlMgaGVyZSwgYW5kIHRoYXQgaXMgdGhlIHdob2xlIHBvaW50IC0gc2VlIHRoZSBoZWFkZXIuXG4gIC8vIFRoZSBTREsncyBpbnB1dCBsb29wIGlzIHRoaXMgZG9vcidzIHN0YXktYWxpdmU6IGl0IGhvbGRzIGBleGVjdXRlKClgIG9wZW5cbiAgLy8gdW50aWwgdGhlIHNvY2tldCBkaXNjb25uZWN0cywgdGhlIEJCUyBzZW5kcyBgZG9vcjpjbG9zZWAsIG9yIHRoZSBkb29yXG4gIC8vIGl0c2VsZiBzYXlzIGl0IGlzIGZpbmlzaGVkIHZpYSB0aGUgcXVpdCBwYXRoIGFib3ZlLlxufSk7XG5cbmRvb3Iub25JbnB1dChhc3luYyAoY3R4OiBEb29yQ29udGV4dCwga2V5OiBLZXlQcmVzcykgPT4ge1xuICBjb25zdCBwb25nID0gZ2FtZXMuZ2V0KGN0eC5ub2RlSWQpO1xuICBpZiAoIXBvbmcpIHJldHVybjtcblxuICBjb25zdCB7IGtleToga2V5RGF0YSB9ID0gcGFyc2VLZXlEYXRhKGtleS5yYXcpO1xuICBwb25nLmhhbmRsZUtleShrZXlEYXRhLm5hbWUgPz8ga2V5LnJhdyk7XG59KTtcblxuZG9vci5vbkNsb3NlKGFzeW5jIChjdHg6IERvb3JDb250ZXh0KSA9PiB7XG4gIGNvbnN0IHBvbmcgPSBnYW1lcy5nZXQoY3R4Lm5vZGVJZCk7XG4gIGlmIChwb25nKSB7XG4gICAgcG9uZy5zdG9wKCk7XG4gICAgZ2FtZXMuZGVsZXRlKGN0eC5ub2RlSWQpO1xuICB9XG4gIGN0eC5iYnM/LmRpc2FibGVHYW1lTW9kZT8uKCk7XG59KTtcblxuZXhwb3J0IGRlZmF1bHQgZG9vcjtcbiJdfQ==