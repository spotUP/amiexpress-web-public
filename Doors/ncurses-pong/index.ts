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

import { ServerDoor, DoorContext, KeyPress } from '@amiexpress/bbs-door-sdk';
import { PongDoor } from './app.js';

/** Door metadata */
export const metadata = {
  name: 'ncurses-pong',
  version: '1.0.0',
  description: 'Classic Pong game (ncurses port)',
  author: 'Vicente Bolea (original), AmiExpress (port)',
  command: 'PONG',
};

/**
 * Main door class
 */
const door = new ServerDoor(metadata);

/**
 * The live game for each node.
 *
 * The old code stashed the key handler on the door context behind an `any`
 * cast; the node id is the key the BBS itself uses, and it is the one
 * `Door.execute()` hands every handler (`ctx.nodeId`).
 */
const games = new Map<number, PongDoor>();

// Parse escape sequences into key names
function parseKeyData(data: string): { key: { name?: string; sequence: string } } {
  const sequence = data;

  // Arrow keys and special keys via escape sequences
  if (sequence.startsWith('\x1b[') || sequence.startsWith('\x1bO')) {
    // CSI sequences (ESC [ ...)
    if (sequence === '\x1b[A' || sequence === '\x1bOA') return { key: { name: 'up', sequence } };
    if (sequence === '\x1b[B' || sequence === '\x1bOB') return { key: { name: 'down', sequence } };
    if (sequence === '\x1b[C' || sequence === '\x1bOC') return { key: { name: 'right', sequence } };
    if (sequence === '\x1b[D' || sequence === '\x1bOD') return { key: { name: 'left', sequence } };
    if (sequence === '\x1b[H' || sequence === '\x1bOH') return { key: { name: 'home', sequence } };
    if (sequence === '\x1b[F' || sequence === '\x1bOF') return { key: { name: 'end', sequence } };
    if (sequence === '\x1b[5~') return { key: { name: 'pageup', sequence } };
    if (sequence === '\x1b[6~') return { key: { name: 'pagedown', sequence } };
    if (sequence === '\x1b[2~') return { key: { name: 'insert', sequence } };
    if (sequence === '\x1b[3~') return { key: { name: 'delete', sequence } };
    // F1-F4 (SS3)
    if (sequence === '\x1bOP') return { key: { name: 'f1', sequence } };
    if (sequence === '\x1bOQ') return { key: { name: 'f2', sequence } };
    if (sequence === '\x1bOR') return { key: { name: 'f3', sequence } };
    if (sequence === '\x1bOS') return { key: { name: 'f4', sequence } };
  }

  // ESC alone
  if (sequence === '\x1b') return { key: { name: 'escape', sequence } };

  // Backspace
  if (sequence === '\x7f' || sequence === '\x08') return { key: { name: 'backspace', sequence } };

  // Enter
  if (sequence === '\r' || sequence === '\n') return { key: { name: 'enter', sequence } };

  // Tab
  if (sequence === '\t') return { key: { name: 'tab', sequence } };

  // Regular character
  return { key: { name: data, sequence } };
}

/**
 * The two BBSApi key-edge methods the SDK's own held-key tracking uses
 * (`sdk/utils/door-input-manager.ts:257-279`). They exist on the backend's
 * BBSApi (`web/backend/src/doors/BBSApi.ts:591-616`, where they install
 * `session.doorKeyStateHandler`) but are not on the SDK's `BBSApi` type yet,
 * so the door names the shape it needs rather than casting to `any`.
 */
interface KeyEdgeApi {
  onKeyDown?(callback: (key: string, keyState: Record<string, boolean>) => void): void;
  onKeyUp?(callback: (key: string, keyState: Record<string, boolean>) => void): void;
}

/** ncurses `initscr()` takes any object that can put bytes on the wire. */
function ncursesContext(socket: { emit: (event: string, data: string) => void }): {
  emit: (event: string, data: string) => void;
  write: (data: string) => void;
} {
  return {
    emit: (event: string, data: string) => {
      if (event === 'ansi-output') {
        socket.emit('ansi-output', data);
      }
    },
    write: (data: string) => socket.emit('ansi-output', data),
  };
}

door.onStart(async (ctx: DoorContext) => {
  const { socket, bbs } = ctx;
  const pong = new PongDoor();
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
  const keys = bbs as (typeof bbs & KeyEdgeApi) | undefined;
  keys?.onKeyDown?.((key: string) => pong.holdKey(key));
  keys?.onKeyUp?.((key: string) => pong.releaseKey(key));

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

door.onInput(async (ctx: DoorContext, key: KeyPress) => {
  const pong = games.get(ctx.nodeId);
  if (!pong) return;

  const { key: keyData } = parseKeyData(key.raw);
  pong.handleKey(keyData.name ?? key.raw);
});

door.onClose(async (ctx: DoorContext) => {
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

export default door;
