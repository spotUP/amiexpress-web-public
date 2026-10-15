/**
 * AEW_SCREEN (10800): what a C door needs from the board to look like the
 * board - its real size, the board's own wipes, and the mouse. Wire table:
 * plan M5. Degradation: a board without 10800 answers nothing; the SDK then
 * uses BB_SCRWIDTH, draws without wipes and without a mouse.
 */
import { WIPE_CODES, type WipeType } from '../../screens/wipe-codes';
import { getWipeFrames, getWipeOutFrames, wipeEffectsEnabled } from '../../utils/screen-wipe.util';
import { playWipeFrames } from '../../utils/wipe-playback';
import { MOUSE_REPORTING_OFF } from '../../utils/terminal-modes';
import { responsiveDoorGeometry } from './screen-width.util';
import type { MouseAbsorber } from './mouse-absorber';

export interface BoardScreenContext {
  session: any; socket: any;
  state: { wipeCapture?: { kind: 'in' | 'out'; letter: string; text: string[] } | null };
  mouse: MouseAbsorber | null;
  armMouse(on: boolean): void;
  columns(): number;
}

const MOUSE_ON = '\x1b[?1003h\x1b[?1006h';
const emit = (ctx: BoardScreenContext, text: string) => (ctx.socket._directEmit || ctx.socket.emit.bind(ctx.socket))('ansi-output', text);

/**
 * The most a wipe may spend playing inside one XIM answer. The door is
 * released after 5 s (ASYNC_HANDLER_DEADLINE_MS); a handler that outruns it
 * keeps emitting after the door was answered and replies twice. The longest
 * wipe measured (every code, in and out, 40x25 / 80x25 / 160x50) is 780 ms,
 * so this is a guard against a new wipe or a slow frame, not a trim.
 */
export const WIPE_BUDGET_MS = 3000;

/** Frames that fit the budget, then the final frame (the finished picture). */
export function capWipeFrames<T extends { delay: number }>(frames: T[], budgetMs: number = WIPE_BUDGET_MS): T[] {
  let spent = 0;
  const kept: T[] = [];
  for (let i = 0; i < frames.length - 1; i++) {
    spent += Math.max(16, frames[i].delay);
    if (spent > budgetMs) break;
    kept.push(frames[i]);
  }
  if (frames.length) kept.push(frames[frames.length - 1]);
  return kept;
}

/** Play what was captured and release the capture. Nothing captured: nothing to play. */
async function playCapture(ctx: BoardScreenContext): Promise<void> {
  const cap = ctx.state.wipeCapture;
  ctx.state.wipeCapture = null;
  if (!cap || cap.text.length === 0) return;
  const type = WIPE_CODES[cap.letter] as WipeType;
  const content = cap.text.join('');
  const frames = cap.kind === 'in' ? getWipeFrames(type, content, ctx.columns()) : getWipeOutFrames(type, content, ctx.columns());
  await playWipeFrames(ctx.socket, capWipeFrames(frames), { eventName: 'ansi-output' });
}

export async function boardScreenAnswer(request: string, ctx: BoardScreenContext): Promise<string> {
  const [verb, arg = '', letter = ''] = request.trim().split(/\s+/);
  switch (verb) {
    case 'SIZE': {
      const g = responsiveDoorGeometry(ctx.session);
      return `${g.cols}\t${g.rows}`;
    }
    case 'WIPE': {
      if (arg === 'END') { await playCapture(ctx); return 'OK'; }
      if ((arg !== 'IN' && arg !== 'OUT') || !letter || !WIPE_CODES[letter.toUpperCase()] || !wipeEffectsEnabled(ctx.session)) return 'NO';
      // A wipe still held is played first, never dropped (the door forgot WIPE END).
      await playCapture(ctx);
      ctx.state.wipeCapture = { kind: arg === 'IN' ? 'in' : 'out', letter: letter.toUpperCase(), text: [] };
      return 'OK';
    }
    case 'MOUSE': {
      if (arg === 'ON') {
        const s = ctx.session || {};
        if (s.petsciiMode === true || s.texttvMode === true || s.ripMode === true) return 'NO';
        emit(ctx, MOUSE_ON); ctx.armMouse(true); return 'OK';
      }
      if (arg === 'OFF') { emit(ctx, MOUSE_REPORTING_OFF); ctx.armMouse(false); return 'OK'; }
      return '';
    }
    case 'MOUSE?': {
      const e = ctx.mouse?.next();
      return e ? `${e.kind}\t${e.col}\t${e.row}` : '';
    }
    default:
      return '';
  }
}
