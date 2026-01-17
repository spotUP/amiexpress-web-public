"use strict";
/**
 * ncurses-pong - Port of vicentebolea/Pong-curses
 *
 * Original: https://github.com/vicentebolea/Pong-curses
 * Author: Vicente Adolfo Bolea Sanchez <vicente.bolea@gmail.com>
 *
 * This is a direct port to validate the ncurses compatibility layer.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.runDoor = runDoor;
const app_js_1 = require("./app.js");
/** Door metadata */
exports.metadata = {
    name: 'ncurses-pong',
    version: '1.0.0',
    description: 'Classic Pong game (ncurses port)',
    author: 'Vicente Bolea (original), AmiExpress (port)',
    command: 'PONG',
};
/** Main door entry point - required by BBS */
async function runDoor(session) {
    const door = new app_js_1.PongDoor();
    let inputHandlerInstalled = false;
    // CRITICAL: Set inDoorManager flag so backend routes input to doorInputHandler
    // Without this, socket-handlers.ts won't call the doorInputHandler!
    session.bbsSession.inDoorManager = true;
    // Enable game mode for real-time input (required for ncurses games)
    // This makes the frontend send immediate key-down events instead of waiting for Enter
    try {
        if (session.bbs?.enableGameMode) {
            session.bbs.enableGameMode();
        }
    }
    catch (error) {
        // Continue anyway - game might still work without game mode
    }
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
    // Create a context compatible with ncurses initscr()
    const context = {
        emit: (event, data) => {
            if (event === 'ansi-output') {
                session.socket.emit('ansi-output', data);
            }
        },
        write: (data) => session.socket.emit('ansi-output', data),
        screen: {
            on: (event, handler) => {
                if (event === 'keypress') {
                    if (session.bbsSession) {
                        // CRITICAL: Set handler on bbsSession, not on the wrapper session
                        session.bbsSession.doorInputHandler = (data) => {
                            const { ch, key } = parseKeyData(data);
                            console.log(`[PONG] Routing input: "${data}" -> ch: ${JSON.stringify(ch)}, key: ${JSON.stringify(key)}`);
                            handler(ch, key);
                        };
                        inputHandlerInstalled = true;
                    }
                    else {
                        // Store fallback listener for cleanup
                        const socketListener = (data) => {
                            const { ch, key } = parseKeyData(data);
                            handler(ch, key);
                        };
                        session.socket.on('data', socketListener);
                        // Save reference for cleanup
                        session._ncursesPongSocketListener = socketListener;
                    }
                }
            }
        }
    };
    try {
        await door.onStart(context);
    }
    finally {
        // Clean up door manager flags
        session.bbsSession.inDoorManager = false;
        // Remove socket listeners to prevent memory leaks
        if (session.socket) {
            // Remove specific listener if it exists
            const socketListener = session._ncursesPongSocketListener;
            if (socketListener) {
                session.socket.removeListener('data', socketListener);
                delete session._ncursesPongSocketListener;
            }
            else {
                // Fallback to removing all data listeners
                session.socket.removeAllListeners('data');
            }
        }
        if (inputHandlerInstalled && session.bbsSession.doorInputHandler) {
            delete session.bbsSession.doorInputHandler;
        }
        // Disable game mode
        try {
            if (session.bbs?.disableGameMode) {
                session.bbs.disableGameMode();
            }
        }
        catch (error) {
            // Silently handle cleanup errors
        }
    }
}
exports.default = { runDoor, metadata: exports.metadata };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7R0FPRzs7O0FBd0JILDBCQTJIQztBQWpKRCxxQ0FBb0M7QUFFcEMsb0JBQW9CO0FBQ1AsUUFBQSxRQUFRLEdBQUc7SUFDdEIsSUFBSSxFQUFFLGNBQWM7SUFDcEIsT0FBTyxFQUFFLE9BQU87SUFDaEIsV0FBVyxFQUFFLGtDQUFrQztJQUMvQyxNQUFNLEVBQUUsNkNBQTZDO0lBQ3JELE9BQU8sRUFBRSxNQUFNO0NBQ2hCLENBQUM7QUFZRiw4Q0FBOEM7QUFDdkMsS0FBSyxVQUFVLE9BQU8sQ0FBQyxPQUFvQjtJQUNoRCxNQUFNLElBQUksR0FBRyxJQUFJLGlCQUFRLEVBQUUsQ0FBQztJQUM1QixJQUFJLHFCQUFxQixHQUFHLEtBQUssQ0FBQztJQUVsQywrRUFBK0U7SUFDL0Usb0VBQW9FO0lBQ3BFLE9BQU8sQ0FBQyxVQUFVLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQztJQUV4QyxvRUFBb0U7SUFDcEUsc0ZBQXNGO0lBQ3RGLElBQUksQ0FBQztRQUNILElBQUksT0FBTyxDQUFDLEdBQUcsRUFBRSxjQUFjLEVBQUUsQ0FBQztZQUNoQyxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQy9CLENBQUM7SUFDSCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLDREQUE0RDtJQUM5RCxDQUFDO0lBRUQsd0NBQXdDO0lBQ3hDLFNBQVMsWUFBWSxDQUFDLElBQVk7UUFDaEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDO1FBRXRCLG1EQUFtRDtRQUNuRCxJQUFJLFFBQVEsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksUUFBUSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ2pFLDRCQUE0QjtZQUM1QixJQUFJLFFBQVEsS0FBSyxRQUFRLElBQUksUUFBUSxLQUFLLFFBQVE7Z0JBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDO1lBQzVHLElBQUksUUFBUSxLQUFLLFFBQVEsSUFBSSxRQUFRLEtBQUssUUFBUTtnQkFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxFQUFFLENBQUM7WUFDOUcsSUFBSSxRQUFRLEtBQUssUUFBUSxJQUFJLFFBQVEsS0FBSyxRQUFRO2dCQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztZQUMvRyxJQUFJLFFBQVEsS0FBSyxRQUFRLElBQUksUUFBUSxLQUFLLFFBQVE7Z0JBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDO1lBQzlHLElBQUksUUFBUSxLQUFLLFFBQVEsSUFBSSxRQUFRLEtBQUssUUFBUTtnQkFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxFQUFFLENBQUM7WUFDOUcsSUFBSSxRQUFRLEtBQUssUUFBUSxJQUFJLFFBQVEsS0FBSyxRQUFRO2dCQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztZQUM3RyxJQUFJLFFBQVEsS0FBSyxTQUFTO2dCQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FB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SUFDckMsQ0FBQztZQUFTLENBQUM7UUFDVCw4QkFBOEI7UUFDOUIsT0FBTyxDQUFDLFVBQVUsQ0FBQyxhQUFhLEdBQUcsS0FBSyxDQUFDO1FBRXpDLGtEQUFrRDtRQUNsRCxJQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNuQix3Q0FBd0M7WUFDeEMsTUFBTSxjQUFjLEdBQUksT0FBZSxDQUFDLDBCQUEwQixDQUFDO1lBQ25FLElBQUksY0FBYyxFQUFFLENBQUM7Z0JBQ25CLE9BQU8sQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQztnQkFDdEQsT0FBUSxPQUFlLENBQUMsMEJBQTBCLENBQUM7WUFDckQsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLDBDQUEwQztnQkFDMUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUM1QyxDQUFDO1FBQ0gsQ0FBQztRQUNELElBQUkscUJBQXFCLElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ2pFLE9BQU8sT0FBTyxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQztRQUM3QyxDQUFDO1FBRUQsb0JBQW9CO1FBQ3BCLElBQUksQ0FBQztZQUNILElBQUksT0FBTyxDQUFDLEdBQUcsRUFBRSxlQUFlLEVBQUUsQ0FBQztnQkFDakMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUNoQyxDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixpQ0FBaUM7UUFDbkMsQ0FBQztJQUNILENBQUM7QUFDSCxDQUFDO0FBRUQsa0JBQWUsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFSLGdCQUFRLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogbmN1cnNlcy1wb25nIC0gUG9ydCBvZiB2aWNlbnRlYm9sZWEvUG9uZy1jdXJzZXNcbiAqXG4gKiBPcmlnaW5hbDogaHR0cHM6Ly9naXRodWIuY29tL3ZpY2VudGVib2xlYS9Qb25nLWN1cnNlc1xuICogQXV0aG9yOiBWaWNlbnRlIEFkb2xmbyBCb2xlYSBTYW5jaGV6IDx2aWNlbnRlLmJvbGVhQGdtYWlsLmNvbT5cbiAqXG4gKiBUaGlzIGlzIGEgZGlyZWN0IHBvcnQgdG8gdmFsaWRhdGUgdGhlIG5jdXJzZXMgY29tcGF0aWJpbGl0eSBsYXllci5cbiAqL1xuXG5pbXBvcnQgeyBQb25nRG9vciB9IGZyb20gJy4vYXBwLmpzJztcblxuLyoqIERvb3IgbWV0YWRhdGEgKi9cbmV4cG9ydCBjb25zdCBtZXRhZGF0YSA9IHtcbiAgbmFtZTogJ25jdXJzZXMtcG9uZycsXG4gIHZlcnNpb246ICcxLjAuMCcsXG4gIGRlc2NyaXB0aW9uOiAnQ2xhc3NpYyBQb25nIGdhbWUgKG5jdXJzZXMgcG9ydCknLFxuICBhdXRob3I6ICdWaWNlbnRlIEJvbGVhIChvcmlnaW5hbCksIEFtaUV4cHJlc3MgKHBvcnQpJyxcbiAgY29tbWFuZDogJ1BPTkcnLFxufTtcblxuLyoqIERvb3Igc2Vzc2lvbiBmcm9tIEJCUyBoYW5kbGVyICovXG5pbnRlcmZhY2UgRG9vclNlc3Npb24ge1xuICBzb2NrZXQ6IGFueTtcbiAgdXNlcjogYW55O1xuICBiYnNTZXNzaW9uOiBhbnk7XG4gIGJiczogYW55O1xuICBwYXJhbXM6IHN0cmluZ1tdO1xuICBkb29ySW5wdXRIYW5kbGVyPzogKGRhdGE6IHN0cmluZykgPT4gdm9pZDtcbn1cblxuLyoqIE1haW4gZG9vciBlbnRyeSBwb2ludCAtIHJlcXVpcmVkIGJ5IEJCUyAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1bkRvb3Ioc2Vzc2lvbjogRG9vclNlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3QgZG9vciA9IG5ldyBQb25nRG9vcigpO1xuICBsZXQgaW5wdXRIYW5kbGVySW5zdGFsbGVkID0gZmFsc2U7XG5cbiAgLy8gQ1JJVElDQUw6IFNldCBpbkRvb3JNYW5hZ2VyIGZsYWcgc28gYmFja2VuZCByb3V0ZXMgaW5wdXQgdG8gZG9vcklucHV0SGFuZGxlclxuICAvLyBXaXRob3V0IHRoaXMsIHNvY2tldC1oYW5kbGVycy50cyB3b24ndCBjYWxsIHRoZSBkb29ySW5wdXRIYW5kbGVyIVxuICBzZXNzaW9uLmJic1Nlc3Npb24uaW5Eb29yTWFuYWdlciA9IHRydWU7XG5cbiAgLy8gRW5hYmxlIGdhbWUgbW9kZSBmb3IgcmVhbC10aW1lIGlucHV0IChyZXF1aXJlZCBmb3IgbmN1cnNlcyBnYW1lcylcbiAgLy8gVGhpcyBtYWtlcyB0aGUgZnJvbnRlbmQgc2VuZCBpbW1lZGlhdGUga2V5LWRvd24gZXZlbnRzIGluc3RlYWQgb2Ygd2FpdGluZyBmb3IgRW50ZXJcbiAgdHJ5IHtcbiAgICBpZiAoc2Vzc2lvbi5iYnM/LmVuYWJsZUdhbWVNb2RlKSB7XG4gICAgICBzZXNzaW9uLmJicy5lbmFibGVHYW1lTW9kZSgpO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAvLyBDb250aW51ZSBhbnl3YXkgLSBnYW1lIG1pZ2h0IHN0aWxsIHdvcmsgd2l0aG91dCBnYW1lIG1vZGVcbiAgfVxuXG4gIC8vIFBhcnNlIGVzY2FwZSBzZXF1ZW5jZXMgaW50byBrZXkgbmFtZXNcbiAgZnVuY3Rpb24gcGFyc2VLZXlEYXRhKGRhdGE6IHN0cmluZyk6IHsgY2g6IHN0cmluZyB8IHVuZGVmaW5lZDsga2V5OiB7IG5hbWU/OiBzdHJpbmc7IHNlcXVlbmNlOiBzdHJpbmcgfSB9IHtcbiAgICBjb25zdCBzZXF1ZW5jZSA9IGRhdGE7XG5cbiAgICAvLyBBcnJvdyBrZXlzIGFuZCBzcGVjaWFsIGtleXMgdmlhIGVzY2FwZSBzZXF1ZW5jZXNcbiAgICBpZiAoc2VxdWVuY2Uuc3RhcnRzV2l0aCgnXFx4MWJbJykgfHwgc2VxdWVuY2Uuc3RhcnRzV2l0aCgnXFx4MWJPJykpIHtcbiAgICAgIC8vIENTSSBzZXF1ZW5jZXMgKEVTQyBbIC4uLilcbiAgICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiW0EnIHx8IHNlcXVlbmNlID09PSAnXFx4MWJPQScpIHJldHVybiB7IGNoOiB1bmRlZmluZWQsIGtleTogeyBuYW1lOiAndXAnLCBzZXF1ZW5jZSB9IH07XG4gICAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYltCJyB8fCBzZXF1ZW5jZSA9PT0gJ1xceDFiT0InKSByZXR1cm4geyBjaDogdW5kZWZpbmVkLCBrZXk6IHsgbmFtZTogJ2Rvd24nLCBzZXF1ZW5jZSB9IH07XG4gICAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYltDJyB8fCBzZXF1ZW5jZSA9PT0gJ1xceDFiT0MnKSByZXR1cm4geyBjaDogdW5kZWZpbmVkLCBrZXk6IHsgbmFtZTogJ3JpZ2h0Jywgc2VxdWVuY2UgfSB9O1xuICAgICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbRCcgfHwgc2VxdWVuY2UgPT09ICdcXHgxYk9EJykgcmV0dXJuIHsgY2g6IHVuZGVmaW5lZCwga2V5OiB7IG5hbWU6ICdsZWZ0Jywgc2VxdWVuY2UgfSB9O1xuICAgICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbSCcgfHwgc2VxdWVuY2UgPT09ICdcXHgxYk9IJykgcmV0dXJuIHsgY2g6IHVuZGVmaW5lZCwga2V5OiB7IG5hbWU6ICdob21lJywgc2VxdWVuY2UgfSB9O1xuICAgICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbRicgfHwgc2VxdWVuY2UgPT09ICdcXHgxYk9GJykgcmV0dXJuIHsgY2g6IHVuZGVmaW5lZCwga2V5OiB7IG5hbWU6ICdlbmQnLCBzZXF1ZW5jZSB9IH07XG4gICAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYls1ficpIHJldHVybiB7IGNoOiB1bmRlZmluZWQsIGtleTogeyBuYW1lOiAncGFnZXVwJywgc2VxdWVuY2UgfSB9O1xuICAgICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbNn4nKSByZXR1cm4geyBjaDogdW5kZWZpbmVkLCBrZXk6IHsgbmFtZTogJ3BhZ2Vkb3duJywgc2VxdWVuY2UgfSB9O1xuICAgICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJbMn4nKSByZXR1cm4geyBjaDogdW5kZWZpbmVkLCBrZXk6IHsgbmFtZTogJ2luc2VydCcsIHNlcXVlbmNlIH0gfTtcbiAgICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiWzN+JykgcmV0dXJuIHsgY2g6IHVuZGVmaW5lZCwga2V5OiB7IG5hbWU6ICdkZWxldGUnLCBzZXF1ZW5jZSB9IH07XG4gICAgICAvLyBGMS1GNCAoU1MzKVxuICAgICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJPUCcpIHJldHVybiB7IGNoOiB1bmRlZmluZWQsIGtleTogeyBuYW1lOiAnZjEnLCBzZXF1ZW5jZSB9IH07XG4gICAgICBpZiAoc2VxdWVuY2UgPT09ICdcXHgxYk9RJykgcmV0dXJuIHsgY2g6IHVuZGVmaW5lZCwga2V5OiB7IG5hbWU6ICdmMicsIHNlcXVlbmNlIH0gfTtcbiAgICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDFiT1InKSByZXR1cm4geyBjaDogdW5kZWZpbmVkLCBrZXk6IHsgbmFtZTogJ2YzJywgc2VxdWVuY2UgfSB9O1xuICAgICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWJPUycpIHJldHVybiB7IGNoOiB1bmRlZmluZWQsIGtleTogeyBuYW1lOiAnZjQnLCBzZXF1ZW5jZSB9IH07XG4gICAgfVxuXG4gICAgLy8gRVNDIGFsb25lXG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx4MWInKSByZXR1cm4geyBjaDogdW5kZWZpbmVkLCBrZXk6IHsgbmFtZTogJ2VzY2FwZScsIHNlcXVlbmNlIH0gfTtcblxuICAgIC8vIEJhY2tzcGFjZVxuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xceDdmJyB8fCBzZXF1ZW5jZSA9PT0gJ1xceDA4JykgcmV0dXJuIHsgY2g6IHVuZGVmaW5lZCwga2V5OiB7IG5hbWU6ICdiYWNrc3BhY2UnLCBzZXF1ZW5jZSB9IH07XG5cbiAgICAvLyBFbnRlclxuICAgIGlmIChzZXF1ZW5jZSA9PT0gJ1xccicgfHwgc2VxdWVuY2UgPT09ICdcXG4nKSByZXR1cm4geyBjaDogdW5kZWZpbmVkLCBrZXk6IHsgbmFtZTogJ2VudGVyJywgc2VxdWVuY2UgfSB9O1xuXG4gICAgLy8gVGFiXG4gICAgaWYgKHNlcXVlbmNlID09PSAnXFx0JykgcmV0dXJuIHsgY2g6IHVuZGVmaW5lZCwga2V5OiB7IG5hbWU6ICd0YWInLCBzZXF1ZW5jZSB9IH07XG5cbiAgICAvLyBSZWd1bGFyIGNoYXJhY3RlclxuICAgIHJldHVybiB7IGNoOiBkYXRhLCBrZXk6IHsgbmFtZTogZGF0YSwgc2VxdWVuY2UgfSB9O1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgY29udGV4dCBjb21wYXRpYmxlIHdpdGggbmN1cnNlcyBpbml0c2NyKClcbiAgY29uc3QgY29udGV4dCA9IHtcbiAgICBlbWl0OiAoZXZlbnQ6IHN0cmluZywgZGF0YTogc3RyaW5nKSA9PiB7XG4gICAgICBpZiAoZXZlbnQgPT09ICdhbnNpLW91dHB1dCcpIHtcbiAgICAgICAgc2Vzc2lvbi5zb2NrZXQuZW1pdCgnYW5zaS1vdXRwdXQnLCBkYXRhKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIHdyaXRlOiAoZGF0YTogc3RyaW5nKSA9PiBzZXNzaW9uLnNvY2tldC5lbWl0KCdhbnNpLW91dHB1dCcsIGRhdGEpLFxuICAgIHNjcmVlbjoge1xuICAgICAgb246IChldmVudDogc3RyaW5nLCBoYW5kbGVyOiAoY2g6IGFueSwga2V5OiBhbnkpID0+IHZvaWQpID0+IHtcbiAgICAgICAgaWYgKGV2ZW50ID09PSAna2V5cHJlc3MnKSB7XG4gICAgICAgICAgaWYgKHNlc3Npb24uYmJzU2Vzc2lvbikge1xuICAgICAgICAgICAgLy8gQ1JJVElDQUw6IFNldCBoYW5kbGVyIG9uIGJic1Nlc3Npb24sIG5vdCBvbiB0aGUgd3JhcHBlciBzZXNzaW9uXG4gICAgICAgICAgICBzZXNzaW9uLmJic1Nlc3Npb24uZG9vcklucHV0SGFuZGxlciA9IChkYXRhOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgeyBjaCwga2V5IH0gPSBwYXJzZUtleURhdGEoZGF0YSk7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbUE9OR10gUm91dGluZyBpbnB1dDogXCIke2RhdGF9XCIgLT4gY2g6ICR7SlNPTi5zdHJpbmdpZnkoY2gpfSwga2V5OiAke0pTT04uc3RyaW5naWZ5KGtleSl9YCk7XG4gICAgICAgICAgICAgIGhhbmRsZXIoY2gsIGtleSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaW5wdXRIYW5kbGVySW5zdGFsbGVkID0gdHJ1ZTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gU3RvcmUgZmFsbGJhY2sgbGlzdGVuZXIgZm9yIGNsZWFudXBcbiAgICAgICAgICAgIGNvbnN0IHNvY2tldExpc3RlbmVyID0gKGRhdGE6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICBjb25zdCB7IGNoLCBrZXkgfSA9IHBhcnNlS2V5RGF0YShkYXRhKTtcbiAgICAgICAgICAgICAgaGFuZGxlcihjaCwga2V5KTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBzZXNzaW9uLnNvY2tldC5vbignZGF0YScsIHNvY2tldExpc3RlbmVyKTtcbiAgICAgICAgICAgIC8vIFNhdmUgcmVmZXJlbmNlIGZvciBjbGVhbnVwXG4gICAgICAgICAgICAoc2Vzc2lvbiBhcyBhbnkpLl9uY3Vyc2VzUG9uZ1NvY2tldExpc3RlbmVyID0gc29ja2V0TGlzdGVuZXI7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIHRyeSB7XG4gICAgYXdhaXQgZG9vci5vblN0YXJ0KGNvbnRleHQgYXMgYW55KTtcbiAgfSBmaW5hbGx5IHtcbiAgICAvLyBDbGVhbiB1cCBkb29yIG1hbmFnZXIgZmxhZ3NcbiAgICBzZXNzaW9uLmJic1Nlc3Npb24uaW5Eb29yTWFuYWdlciA9IGZhbHNlO1xuXG4gICAgLy8gUmVtb3ZlIHNvY2tldCBsaXN0ZW5lcnMgdG8gcHJldmVudCBtZW1vcnkgbGVha3NcbiAgICBpZiAoc2Vzc2lvbi5zb2NrZXQpIHtcbiAgICAgIC8vIFJlbW92ZSBzcGVjaWZpYyBsaXN0ZW5lciBpZiBpdCBleGlzdHNcbiAgICAgIGNvbnN0IHNvY2tldExpc3RlbmVyID0gKHNlc3Npb24gYXMgYW55KS5fbmN1cnNlc1BvbmdTb2NrZXRMaXN0ZW5lcjtcbiAgICAgIGlmIChzb2NrZXRMaXN0ZW5lcikge1xuICAgICAgICBzZXNzaW9uLnNvY2tldC5yZW1vdmVMaXN0ZW5lcignZGF0YScsIHNvY2tldExpc3RlbmVyKTtcbiAgICAgICAgZGVsZXRlIChzZXNzaW9uIGFzIGFueSkuX25jdXJzZXNQb25nU29ja2V0TGlzdGVuZXI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBGYWxsYmFjayB0byByZW1vdmluZyBhbGwgZGF0YSBsaXN0ZW5lcnNcbiAgICAgICAgc2Vzc2lvbi5zb2NrZXQucmVtb3ZlQWxsTGlzdGVuZXJzKCdkYXRhJyk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChpbnB1dEhhbmRsZXJJbnN0YWxsZWQgJiYgc2Vzc2lvbi5iYnNTZXNzaW9uLmRvb3JJbnB1dEhhbmRsZXIpIHtcbiAgICAgIGRlbGV0ZSBzZXNzaW9uLmJic1Nlc3Npb24uZG9vcklucHV0SGFuZGxlcjtcbiAgICB9XG5cbiAgICAvLyBEaXNhYmxlIGdhbWUgbW9kZVxuICAgIHRyeSB7XG4gICAgICBpZiAoc2Vzc2lvbi5iYnM/LmRpc2FibGVHYW1lTW9kZSkge1xuICAgICAgICBzZXNzaW9uLmJicy5kaXNhYmxlR2FtZU1vZGUoKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gU2lsZW50bHkgaGFuZGxlIGNsZWFudXAgZXJyb3JzXG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IHsgcnVuRG9vciwgbWV0YWRhdGEgfTtcbiJdfQ==