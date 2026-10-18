// @ts-nocheck
/**
 * A TypeScript or ARexx door under the command palette ran on behind it.
 *
 * The bug (sysop, 2026-10-18): Ctrl+K over a 68K door holds the door still,
 * but a TypeScript or ARexx door kept running and kept writing to the screen
 * under the palette, scribbling over it.
 *
 * Now the door's hold (session.doorHold) holds what such a door writes until
 * the palette closes, and replays it after the palette's repaint; an ARexx
 * script also stops at its next clause until the palette closes.
 */
import { EventEmitter } from 'events';

jest.mock('../../src/handlers/command-execution.handler', () => ({ runBbsCommand: jest.fn(), commandCache: { bbscmd: new Map() } }));

import { runBbsCommand } from '../../src/handlers/command-execution.handler';
import { openPaletteOverDoor, holdDoorOutput, deliverToPalette, isPaletteOpen } from '../../src/services/palette-over-door';
import { AREXXInterpreter } from '../../src/services/arexx.service';

const settle = () => new Promise((resolve) => setImmediate(resolve));

function caller() {
  const socket: any = new EventEmitter();
  socket.id = 'palette-hold-' + Math.random();
  const seen: string[] = [];
  socket.emit = (event: string, ...args: unknown[]) => { if (event === 'ansi-output') seen.push(String(args[0])); return true; };
  // The hold a TypeScript door registers (door.handler.ts executeTypeScriptDoor).
  let release: any = null;
  const session: any = {
    doorHold: {
      pause: () => { release = holdDoorOutput(socket); },
      resume: (opts?: any) => { const r = release; release = null; r?.(opts); },
    },
  };
  return { socket, session, seen };
}

test('what a door writes under the palette waits until the palette closes', async () => {
  (runBbsCommand as jest.Mock).mockImplementation((shadowSocket: any, shadowSession: any) => new Promise<void>((done) => {
    shadowSocket.emit('ansi-output', 'PALETTE');
    shadowSession.doorInputHandler = (key: string) => { if (key === '\x1b') done(); };
  }));
  const { socket, session, seen } = caller();

  openPaletteOverDoor(socket, session);
  await settle();
  socket.emit('ansi-output', 'DOOR-TICK');          // the door's own timer, still running
  expect(seen).toEqual(['PALETTE']);                  // the palette shows, the door does not

  deliverToPalette(session, '\x1b');
  await settle(); await settle();
  expect(isPaletteOpen(session)).toBe(false);
  expect(seen).toEqual(['PALETTE', 'DOOR-TICK']);     // replayed once the palette is gone
  socket.emit('ansi-output', 'AFTER');
  expect(seen[seen.length - 1]).toBe('AFTER');        // and the door writes straight through again
});

test('an ARexx script held under the palette stops until it is released', async () => {
  const ctx: any = { output: [], session: {}, user: {} };
  const interp = new AREXXInterpreter(ctx, []);
  interp.holdExecution();
  let finished = false;
  const run = interp.execute("i = 0\nsay 'START'\ni = i + 1\nsay 'DONE'").then(() => { finished = true; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(finished).toBe(false);
  expect(ctx.output.join('\n')).not.toContain('DONE');
  interp.releaseExecution();
  await run;
  expect(ctx.output.join('\n')).toContain('DONE');
});
