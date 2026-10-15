/**
 * The shared pieces of a "real binary, real emulator, three screens" door test:
 * the socket that records what a door paints, the cut at the exit clear, and
 * the C64 model the 40-column frames are replayed into.
 *
 * themec-40, subs-40 and usersettings-40 each carried a copy of these; new
 * door tests import them from here.
 */
import { EventEmitter } from 'events';
import { AnsiToPetsciiTransducer } from '@amiexpress/bbs-door-sdk/petscii';
import { isRailTick } from '../../../../../dev/scripts/door-probe/rail-tick';

/** The socket a door is handed: everything it paints, in order. */
export class CaptureSocket extends EventEmitter {
  readonly ansi: string[] = [];
  /** When each write arrived (ms since the epoch), parallel to `ansi`: tells one answer from the next. */
  readonly times: number[] = [];
  emit(event: string, data?: any): boolean {
    if (event === 'ansi-output') { this.ansi.push(typeof data === 'string' ? data : String(data ?? '')); this.times.push(Date.now()); }
    return super.emit(event, data);
  }
}

/** A C64 screen code (bit 7 = reverse) back to the character it shows. */
export function screenCodeToChar(sc: number): string {
  const c = sc & 0x7f;
  if (c === 0) return '@';
  if (c <= 0x1f) return String.fromCharCode(64 + c);
  if (c <= 0x3f) return String.fromCharCode(c);
  if (c >= 0x41 && c <= 0x5a) return String.fromCharCode(c);
  return '·'; // a PETSCII graphic glyph
}

/**
 * The screen the CALLER saw: a door clears on the way out, so transducing the
 * whole capture models an empty terminal however well it painted. Only a final
 * clear followed by nothing but the teardown tail is cut.
 */
export function beforeTeardown(ansi: string): string {
  const clear = ansi.lastIndexOf('\x1b[2J');
  if (clear <= 0) return ansi;
  const tail = ansi.slice(clear);
  return /^\x1b\[2J(\x1b\[H)?(\x1b\[\?25[hl])?\s*$/.test(tail) ? ansi.slice(0, clear) : ansi;
}

/** What a real C64 is showing after eating `ansi`, row by row (reverse video is not shown). */
export function c64Rows(ansi: string): string[] {
  const transducer = new AnsiToPetsciiTransducer();
  transducer.transduce(ansi);
  const { screen, cols, rows } = transducer.machine.state;
  const out: string[] = [];
  for (let y = 0; y < rows; y++) {
    let row = '';
    for (let x = 0; x < cols; x++) row += screenCodeToChar(screen[y * cols + x]!);
    out.push(row);
  }
  return out;
}

export type Cell = { ch: string; bg: string };

const NAMED = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

/** Replay a CSI/text stream into a width x height grid of {ch, bg}. */
export function replay(stream: string, width: number, height: number): Cell[][] {
  const grid: Cell[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ ch: ' ', bg: 'unpainted' })));
  let x = 0, y = 0, bg = 'default';
  const re = /\x1b\[([0-9;?]*)([A-Za-z])|([^\x1b])/g;
  let m: RegExpExecArray | null;
  const color = (n: number): string => (n < 8 ? NAMED[n] : n < 16 ? 'bright' + NAMED[n - 8] : 'idx' + n);
  while ((m = re.exec(stream))) {
    if (m[3] !== undefined) {
      const c = m[3];
      if (c === '\r') x = 0;
      else if (c === '\n') y = Math.min(height - 1, y + 1);
      else if (y < height && x < width) { grid[y][x] = { ch: c, bg }; x++; }
      continue;
    }
    const args = m[1].split(';').filter(a => a !== '' && a[0] !== '?').map(Number);
    switch (m[2]) {
      case 'H': case 'f': y = (args[0] || 1) - 1; x = (args[1] || 1) - 1; break;
      case 'C': x += args[0] || 1; break;
      case 'D': x = Math.max(0, x - (args[0] || 1)); break;
      case 'A': y = Math.max(0, y - (args[0] || 1)); break;
      case 'B': y = Math.min(height - 1, y + (args[0] || 1)); break;
      case 'G': x = (args[0] || 1) - 1; break;
      case 'J': if (args[0] === 2 || args.length === 0) for (const r of grid) for (let i = 0; i < width; i++) r[i] = { ch: ' ', bg }; break;
      case 'K': for (let i = x; i < width; i++) grid[y][i] = { ch: ' ', bg }; break;
      case 'm': {
        const a = args.length ? args : [0];
        for (let i = 0; i < a.length; i++) {
          const v = a[i];
          if (v === 0 || v === 49) bg = v === 0 ? 'default' : 'black';
          else if (v >= 40 && v <= 47) bg = NAMED[v - 40];
          else if (v >= 100 && v <= 107) bg = 'bright' + NAMED[v - 100];
          else if (v === 48 && a[i + 1] === 5) { bg = color(a[i + 2]); i += 2; }
          else if (v === 48 && a[i + 1] === 2) { bg = `rgb${a[i + 2]},${a[i + 3]},${a[i + 4]}`; i += 4; }
          else if (v === 38 && a[i + 1] === 5) i += 2;
          else if (v === 38 && a[i + 1] === 2) i += 4;
        }
        break;
      }
    }
  }
  return grid;
}

/**
 * `at` is a time in ms, or 'idle': the door has painted and then been quiet for a second since the
 * previous idle key went in (load-proof). Idle steps run IN ORDER, one after the other, each waiting
 * for the door to answer the one before; a fixed time only suits a step that needs no answer.
 * A rail tick (every cursor address on row 1: the masthead animation) is not an answer and not "painting",
 * so a door that animates while idle still goes quiet.
 */
export interface Step {
  at: number | 'idle';
  keys: string;
  /** An idle step normally waits for the door to paint (its answer to the previous key). `false`: this key paints nothing, wait only for quiet. */
  paints?: boolean;
  /** How long the door must be quiet before the NEXT idle key goes in. A door under the emulator's Delay stall can sit silent for 20 s between two keys of one burst. */
  quietMs?: number;
}
export const QUIET_MS = 1000;

/** A chunk of the idle animation (the masthead rail): one definition, shared with the repaint-cost probe. */
export { isRailTick };

export interface DriveOptions {
  cols: number;
  rows?: number;
  steps: Step[];
  /** Merged over the fake BBS session (wireWidth, wireHeight, petsciiMode, themePreference, ...). */
  session?: Record<string, unknown>;
  /** Merged over the fake user (secLevel, menuOverflow, ...). */
  user?: Record<string, unknown>;
  /** The board for this run (BBS_DATA_DIR / config dataDir); omitted = whatever the process has. */
  boardRoot?: string;
  /** What the board's command word was: `ae_menu_command()` answers it (one binary, several registrations). Default 'W'. */
  command?: string;
}

export interface DriveResult {
  ansi: string;
  /** The BBS session the door ran against: read what it stored, or take what it armed (takeMenuExit). */
  session: any;
  user: any;
  /** Where the XIM sinks of this process write (XIM_LOG_DIR), '' when the test set none. */
  logDir: string;
  /** Everything the door painted, one entry per socket write. */
  chunks: string[];
  /** When each chunk arrived, parallel to `chunks` (ms since the epoch). */
  times: number[];
  /** For each key that went in: the chunk count at that moment (the door's answer is chunks[at..]). */
  marks: Array<{ keys: string; at: number }>;
}

/**
 * Drives a real 68K door binary through the board's emulator, the way themec-40, subs-40 and
 * usersettings-40 each did with their own copy (plan M15: one harness, no fourth copy).
 */
export async function driveDoor(binary: string, opts: DriveOptions): Promise<DriveResult> {
  const { cols, steps } = opts;
  const rows = opts.rows ?? 25;
  const command = opts.command ?? 'W';
  if (opts.boardRoot) {
    process.env.BBS_DATA_DIR = opts.boardRoot;
    require('../../../src/config').config.set('dataDir', opts.boardRoot);
    // The board reads its command registrations once at start: start this one the same way.
    const { commandCache, loadCommands } = require('../../../src/handlers/command-execution.handler');
    commandCache.bbscmd.clear();
    commandCache.syscmd.clear();
    loadCommands(opts.boardRoot, opts.session?.currentConf ?? 1, 1);
  }
  const { AmigaDoorSession } = require('../../../src/amiga-emulation/AmigaDoorSession');
  const socket = new CaptureSocket();
  const petscii = cols < 80;
  const user = {
    id: 7, username: 'Spot', realname: 'Johan', internetName: 'spot', email: 'spot@example.com',
    location: 'Old Town', phone: '555-1234', secLevel: 255, securityFlags: 'T'.repeat(128), userFlags: 0,
    editor: 'Prompt', zoomType: 0, availableForChat: true, protocol: 'zmodem', linesPerScreen: 0, ...opts.user };
  const bbsSession = {
    user,
    nodeId: 1, nodeNumber: 1, bbsName: 'AmiExpress-Web', sysopName: 'Sysop', timeRemaining: 60,
    doorCommand: command, doorId: command, petsciiMode: petscii, terminalType: petscii ? 'c64' : 'modern',
    screenWidth: cols, screenHeight: rows, currentConf: 1, ...opts.session,
  };
  const session = new AmigaDoorSession(socket as any, {
    executablePath: binary, doorType: 'XIM', timeout: 30, args: ['1'], assigns: {}, toolTypes: {}, bbsSession,
  });
  const marks: DriveResult['marks'] = [];
  const send = (keys: string) => { marks.push({ keys, at: socket.ansi.length }); socket.emit('door:input', keys); };
  const timers: NodeJS.Timeout[] = steps.filter(st => st.at !== 'idle').map(st => setTimeout(() => send(st.keys), st.at as number));
  let ended = false;
  const idleKeys = steps.filter(x => x.at === 'idle');
  // Wait until the door has painted something and then said nothing (rail ticks aside) for QUIET_MS, then type the next key.
  const typist = (async () => {
    for (const st of idleKeys) {
      let seen = st.paints === false ? 1 : 0, counted = socket.ansi.length, quietSince = Date.now();
      while (!ended) {
        await new Promise(r => setTimeout(r, 100));
        let painted = false;
        for (; counted < socket.ansi.length; counted++) {
          if (isRailTick(socket.ansi[counted]!)) continue;
          seen += socket.ansi[counted]!.length; painted = true;
        }
        if (painted) { quietSince = Date.now(); continue; }
        if (seen > 0 && Date.now() - quietSince >= (st.quietMs ?? QUIET_MS)) break;
      }
      if (ended) return;
      send(st.keys);
    }
  })();
  try { await session.start(); } finally { ended = true; await typist; timers.forEach(t => { clearTimeout(t); clearInterval(t); }); }
  return { ansi: socket.ansi.join(''), session: bbsSession, user, logDir: process.env.XIM_LOG_DIR ?? '', chunks: socket.ansi, times: socket.times, marks };
}

/** One screen cell: the glyph and the attributes in force when it was painted. */
export interface PaintedCell { ch: string; sgr: string }

/**
 * Replay a CSI/text stream into a width x height grid of (glyph, SGR): the attributes are the cell's whole
 * colour state (foreground, background, bold, reverse), so two cells with the same text and a different bar
 * colour differ. ESC 7 / ESC 8 (the idle rail's cursor save) keep the attributes with the cursor.
 */
export function replayCells(stream: string, width: number, height: number): PaintedCell[][] {
  const grid: PaintedCell[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ ch: ' ', sgr: '' })));
  let x = 0, y = 0;
  let a = { fg: '', bg: '', bold: false, rev: false };
  let saved = { x: 0, y: 0, a };
  const key = () => `${a.fg}|${a.bg}|${a.bold ? 'b' : ''}${a.rev ? 'r' : ''}`;
  const re = /\x1b\[([0-9;?]*)([A-Za-z])|\x1b([78])|([^\x1b])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stream))) {
    if (m[3]) {
      if (m[3] === '7') saved = { x, y, a: { ...a } }; else { x = saved.x; y = saved.y; a = { ...saved.a }; }
      continue;
    }
    if (m[4] !== undefined) {
      const c = m[4];
      if (c === '\r') x = 0;
      else if (c === '\n') y = Math.min(height - 1, y + 1);
      else if (y < height && x < width) { grid[y]![x] = { ch: c, sgr: key() }; x++; }
      continue;
    }
    const args = m[1]!.split(';').filter(v => v !== '' && v[0] !== '?').map(Number);
    switch (m[2]) {
      case 'H': case 'f': y = (args[0] || 1) - 1; x = (args[1] || 1) - 1; break;
      case 'C': x += args[0] || 1; break;
      case 'J': if (args[0] === 2 || args.length === 0) for (const r of grid) for (let i = 0; i < width; i++) r[i] = { ch: ' ', sgr: key() }; break;
      case 'K': for (let i = x; i < width; i++) grid[y]![i] = { ch: ' ', sgr: key() }; break;
      case 'm': {
        const p = args.length ? args : [0];
        for (let i = 0; i < p.length; i++) {
          const v = p[i]!;
          if (v === 0) a = { fg: '', bg: '', bold: false, rev: false };
          else if (v === 1) a.bold = true;
          else if (v === 22) a.bold = false;
          else if (v === 7) a.rev = true;
          else if (v === 27) a.rev = false;
          else if (v === 39) a.fg = '';
          else if (v === 49) a.bg = '';
          else if ((v === 38 || v === 48) && p[i + 1] === 2) { (v === 38 ? (a.fg = p.slice(i + 2, i + 5).join(',')) : (a.bg = p.slice(i + 2, i + 5).join(','))); i += 4; }
          else if ((v === 38 || v === 48) && p[i + 1] === 5) { (v === 38 ? (a.fg = `i${p[i + 2]}`) : (a.bg = `i${p[i + 2]}`)); i += 2; }
          else if ((v >= 30 && v <= 37) || (v >= 90 && v <= 97)) a.fg = `c${v}`;
          else if ((v >= 40 && v <= 47) || (v >= 100 && v <= 107)) a.bg = `c${v}`;
        }
        break;
      }
    }
  }
  return grid;
}

/** The rows of a painted grid as text. */
export const gridText = (grid: PaintedCell[][]): string[] => grid.map(r => r.map(c => c.ch).join(''));

/** What the door painted before the first key went in and before its first idle tick: the first frame. */
export function firstFrame(r: Pick<DriveResult, 'chunks' | 'marks'>): string {
  const upTo = r.marks.length ? r.marks[0]!.at : r.chunks.length;
  const chunks = r.chunks.slice(0, upTo);
  const tick = chunks.findIndex(isRailTick);
  return (tick < 0 ? chunks : chunks.slice(0, tick)).join('');
}
