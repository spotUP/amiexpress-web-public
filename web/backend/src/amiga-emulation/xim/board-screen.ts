/**
 * AEW_SCREEN (10800): what a C door needs from the board to look like the
 * board - its real size, the board's own wipes, and the mouse. Wire table:
 * plan M5. Degradation: a board without 10800 answers nothing; the SDK then
 * uses BB_SCRWIDTH, draws without wipes and without a mouse.
 *
 * SAVE <top> <left> <rows> <cols> / RESTORE (plan 2026-10-17 menu styles, P9):
 * an overlay's way back. SAVE copies the region (1-based, inside the screen)
 * from the board's model of the caller's screen (services/screen-model) and
 * answers OK, or NO when the region leaves the screen or the board has no
 * screen for this caller. RESTORE repaints the held region, every cell, then
 * puts back the cursor and SGR that were in force at SAVE, and answers OK; NO
 * when nothing is held. A RESTORE releases the hold.
 */
import { WIPE_CODES, REGION_WIPE_CODES, type WipeType } from '../../screens/wipe-codes';
import { getWipeFrames, getWipeOutFrames, getRegionSlideFrames, wipeEffectsEnabled, type GridCell, type WipeRegion } from '../../utils/screen-wipe.util';
import { playWipeFrames } from '../../utils/wipe-playback';
import { MOUSE_REPORTING_OFF } from '../../utils/terminal-modes';
import { responsiveDoorGeometry } from './screen-width.util';
import type { MouseAbsorber } from './mouse-absorber';
import { saveScreenRegion, screenRows, takeScreenRestore } from '../../services/screen-model/screen-model';

export interface BoardScreenContext {
  session: any; socket: any;
  state: { wipeCapture?: { kind: 'in' | 'out'; letter: string; text: string[]; region?: WipeRegion; old?: GridCell[][] } | null };
  mouse: MouseAbsorber | null;
  armMouse(on: boolean, buttons?: boolean): void;
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
  const content = cap.text.join('');
  if (cap.region) {
    await playWipeFrames(ctx.socket, capWipeFrames(getRegionSlideFrames(content, ctx.columns(), cap.region, cap.old)), { eventName: 'ansi-output' });
    return;
  }
  const type = WIPE_CODES[cap.letter] as WipeType;
  const frames = cap.kind === 'in' ? getWipeFrames(type, content, ctx.columns()) : getWipeOutFrames(type, content, ctx.columns());
  await playWipeFrames(ctx.socket, capWipeFrames(frames), { eventName: 'ansi-output' });
}

/**
 * `P <top> <rows> <F|B>` after `WIPE IN`: the region of a push wipe, or null
 * when a field is missing, not an integer, or the rows leave the screen.
 */
function parseRegion(fields: string[], screenRows: number): WipeRegion | null {
  const [topText, rowsText, dir] = fields;
  if (fields.length !== 3 || !/^\d+$/.test(topText ?? '') || !/^\d+$/.test(rowsText ?? '') || (dir !== 'F' && dir !== 'B')) return null;
  const top = Number(topText);
  const rows = Number(rowsText);
  if (top < 1 || rows < 1 || top + rows - 1 > screenRows) return null;
  return { top, rows, forward: dir === 'F' };
}

/** What the push region shows now, before the door draws the new page: the rows the push moves out. */
function oldRows(ctx: BoardScreenContext, region: WipeRegion): GridCell[][] {
  const id = ctx.socket?.id;
  return typeof id === 'string' ? screenRows(id, region.top, region.rows, ctx.columns()) : [];
}

export async function boardScreenAnswer(request: string, ctx: BoardScreenContext): Promise<string> {
  const [verb, arg = '', letter = '', ...extra] = request.trim().split(/\s+/);
  switch (verb) {
    case 'SIZE': {
      const g = responsiveDoorGeometry(ctx.session);
      return `${g.cols}\t${g.rows}`;
    }
    case 'WIPE': {
      if (arg === 'END') { await playCapture(ctx); return 'OK'; }
      const isRegion = REGION_WIPE_CODES[letter.toUpperCase()] !== undefined;
      let region: WipeRegion | undefined;
      if (isRegion) {
        if (arg !== 'IN' || !wipeEffectsEnabled(ctx.session)) return 'NO';
        const parsed = parseRegion(extra, responsiveDoorGeometry(ctx.session).rows);
        if (!parsed) return 'NO';
        region = parsed;
      }
      if (!isRegion && ((arg !== 'IN' && arg !== 'OUT') || !letter || !WIPE_CODES[letter.toUpperCase()] || !wipeEffectsEnabled(ctx.session))) return 'NO';
      // A wipe still held is played first, never dropped (the door forgot WIPE END).
      await playCapture(ctx);
      ctx.state.wipeCapture = { kind: arg === 'IN' ? 'in' : 'out', letter: letter.toUpperCase(), text: [], ...(region ? { region, old: oldRows(ctx, region) } : {}) };
      return 'OK';
    }
    case 'MOUSE': {
      if (arg === 'ON') {
        const s = ctx.session || {};
        if (s.petsciiMode === true || s.texttvMode === true || s.ripMode === true) return 'NO';
        // `MOUSE ON B`: the door also wants the button (left/middle/right) as a fourth MOUSE? field.
        emit(ctx, MOUSE_ON); ctx.armMouse(true, letter.toUpperCase() === 'B'); return 'OK';
      }
      if (arg === 'OFF') { emit(ctx, MOUSE_REPORTING_OFF); ctx.armMouse(false); return 'OK'; }
      return '';
    }
    case 'SAVE': {
      const fields = request.trim().split(/\s+/).slice(1);
      if (fields.length !== 4 || !fields.every(f => /^\d{1,4}$/.test(f))) return 'NO';
      const [top, left, rows, cols] = fields.map(Number);
      const id = ctx.socket?.id;
      return typeof id === 'string' && saveScreenRegion(id, top, left, rows, cols) ? 'OK' : 'NO';
    }
    case 'RESTORE': {
      const id = ctx.socket?.id;
      const bytes = typeof id === 'string' ? takeScreenRestore(id) : null;
      if (bytes === null) return 'NO';
      // Through the socket's own emit, behind the door's paced output and past
      // the observers, so the model sees its own repaint.
      ctx.socket.emit('ansi-output', bytes);
      return 'OK';
    }
    case 'MOUSE?': {
      const e = ctx.mouse?.next();
      if (!e) return '';
      return ctx.mouse?.reportButtons ? `${e.kind}\t${e.col}\t${e.row}\t${e.button}` : `${e.kind}\t${e.col}\t${e.row}`;
    }
    default:
      return '';
  }
}
