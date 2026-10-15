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

export async function boardScreenAnswer(request: string, ctx: BoardScreenContext): Promise<string> {
  const [verb, arg = '', letter = ''] = request.trim().split(/\s+/);
  switch (verb) {
    case 'SIZE': {
      const g = responsiveDoorGeometry(ctx.session);
      return `${g.cols}\t${g.rows}`;
    }
    case 'WIPE': {
      if (arg === 'END') {
        const cap = ctx.state.wipeCapture;
        ctx.state.wipeCapture = null;
        if (!cap || cap.text.length === 0) return 'OK';
        const type = WIPE_CODES[cap.letter] as WipeType;
        const content = cap.text.join('');
        const frames = cap.kind === 'in' ? getWipeFrames(type, content, ctx.columns()) : getWipeOutFrames(type, content, ctx.columns());
        await playWipeFrames(ctx.socket, frames, { eventName: 'ansi-output' });
        return 'OK';
      }
      if ((arg !== 'IN' && arg !== 'OUT') || !letter || !WIPE_CODES[letter.toUpperCase()] || !wipeEffectsEnabled(ctx.session)) return 'NO';
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
