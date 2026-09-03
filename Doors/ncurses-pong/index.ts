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
});

export default door;
