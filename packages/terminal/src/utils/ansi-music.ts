/**
 * ANSI music (the BASIC PLAY language a BBS sends between an intro and 0x0E).
 *
 * The rules, and the test vectors every host checks against, live in
 * DCTelnet's tools/ansimusic_reference.py (vectors committed by DEViLBOX at
 * src/lib/import/__tests__/fixtures/ansi-music/vectors.json). This is a port
 * of DCTelnet's streaming filter (dctelnet-ansimusic/src/ansimusic.c) with the
 * reference model's event semantics:
 *
 *   Intro   ESC[N and ESC[| always start music. ESC[M starts music only when
 *           the next non-space byte (at most 8 spaces) starts music: B F L S,
 *           N, A-G, O P T < > or 0x0E. Anything else makes ESC[M Delete Line.
 *   End     0x0E. ESC, CAN or SUB end it early; CAN and SUB are swallowed,
 *           ESC starts the next escape sequence.
 *   SMILE   A string containing ';' is a sound effect: no notes.
 *   Pitch   GW-BASIC NOTTAB, octave 6 shifted right, rounded half up.
 *   Length  240000 / (T * L) ms x 1.5 per dot; gate MN 7/8, MS 3/4, ML 1.
 *
 * The socket hands the terminal strings in arbitrary chunks, so the filter is
 * a state machine that holds an undecided tail (ESC, ESC[, ESC[M + spaces, an
 * unfinished music string) until the next chunk decides it.
 */

/** One note or rest. `gate` is the sounding part of `ms`; a rest has gate 0. */
export interface MusicEvent {
  hz: number;
  ms: number;
  gate: number;
  rest: boolean;
}

/** GW-BASIC NOTTAB: octave 6 in whole Hz, C C# D D# E F F# G G# A A# B. */
const OCTAVE6 = [4186, 4435, 4699, 4978, 5274, 5588, 5920, 6272, 6645, 7040, 7459, 7902];
const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const GATE: Record<Style, [number, number]> = { N: [7, 8], S: [3, 4], L: [1, 1] };
const MAX_SPACES = 8;
const ESC = '\x1b';
const SO = '\x0e';
const CAN = '\x18';
const SUB = '\x1a';

type Style = 'N' | 'S' | 'L';
type State = 'text' | 'esc' | 'csi' | 'csiM' | 'music';

/** Whole Hz of note number 1-84 as GW-BASIC computes it; 0 outside. */
export function noteHz(n: number): number {
  if (n < 1 || n > 84) return 0;
  const v = OCTAVE6[(n - 1) % 12];
  const shift = 6 - Math.floor((n - 1) / 12);
  if (shift === 0) return v;
  return (v >> shift) + ((v >> (shift - 1)) & 1);
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** What may follow ESC[M (and its spaces) in a tune. */
function musicStarts(c: string): boolean {
  return /^[A-GNPTLOSabcdefgnptlos<>\x0e]$/.test(c);
}

/**
 * Streaming ANSI music filter. `feed` returns the text with every music
 * string removed and, in its place, whatever `onMusic` returns for that
 * string's events (an empty string, or a marker the caller acts on later).
 */
export class AnsiMusicStream {
  private state: State = 'text';
  private spaces = 0;
  // Player state; it carries over from one string to the next.
  private tempo = 120;
  private length = 4;
  private octave = 4;
  private style: Style = 'N';
  // The string being read.
  private events: MusicEvent[] = [];
  private cmd = '';          // '' none, 'M' the letter after M, 'n' M then N, else the command
  private num: number | null = null;
  private sharp = 0;
  private dots = 0;
  private smile = false;
  private saved: { tempo: number; length: number; octave: number; style: Style } | null = null;

  feed(chunk: string, onMusic: (events: MusicEvent[]) => string): string {
    let out = '';
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      switch (this.state) {
        case 'text':
          if (c === ESC) this.state = 'esc';
          else out += c;
          break;
        case 'esc':
          if (c === '[') this.state = 'csi';
          else { out += ESC + c; this.state = 'text'; }
          break;
        case 'csi':
          if (c === 'N' || c === '|') this.startString('');
          else if (c === 'M') { this.state = 'csiM'; this.spaces = 0; }
          else { out += ESC + '[' + c; this.state = 'text'; }
          break;
        case 'csiM':
          if (c === ' ' && this.spaces < MAX_SPACES) { this.spaces++; break; }
          if (c !== ' ' && musicStarts(c)) this.startString('M');
          else {
            out += ESC + '[M' + ' '.repeat(this.spaces);
            this.spaces = 0;
            this.state = 'text';
          }
          i--; // this byte once more, in the new state
          break;
        case 'music':
          if (c === SO || c === ESC || c === CAN || c === SUB) {
            out += this.endString(onMusic);
            this.state = c === ESC ? 'esc' : 'text';
          } else {
            this.musicByte(c);
          }
          break;
      }
    }
    return out;
  }

  /** The stream is over: whatever is held is decided now. */
  flush(onMusic: (events: MusicEvent[]) => string): string {
    let out = '';
    if (this.state === 'esc') out = ESC;
    else if (this.state === 'csi') out = ESC + '[';
    else if (this.state === 'csiM') out = ESC + '[M' + ' '.repeat(this.spaces);
    else if (this.state === 'music') out = this.endString(onMusic);
    this.state = 'text';
    this.spaces = 0;
    return out;
  }

  private startString(cmd: string): void {
    this.state = 'music';
    this.events = [];
    this.cmd = cmd;
    this.num = null;
    this.sharp = 0;
    this.dots = 0;
    this.smile = false;
    this.saved = { tempo: this.tempo, length: this.length, octave: this.octave, style: this.style };
  }

  private endString(onMusic: (events: MusicEvent[]) => string): string {
    if (!this.smile) this.finish();
    const events = this.smile ? [] : this.events;
    this.events = [];
    this.cmd = '';
    this.smile = false;
    this.saved = null;
    return events.length ? onMusic(events) : '';
  }

  private musicByte(raw: string): void {
    if (this.smile) return;
    if (raw === ';') {
      // A SMILE sound effect: the whole string plays nothing and changes nothing.
      this.smile = true;
      if (this.saved) Object.assign(this, this.saved);
      return;
    }
    const c = raw.toUpperCase();
    if (this.cmd === 'M') {
      this.cmd = '';
      if (c === 'F' || c === 'B') return;
      if (c === 'L' || c === 'S') { this.style = c; return; }
      if (c === 'N') { this.cmd = 'n'; return; }
    }
    if (this.cmd === 'n') {
      if (c >= '0' && c <= '9') this.cmd = 'N';
      else this.finish(); // MN
    }
    if (c >= '0' && c <= '9' && this.cmd) {
      this.num = Math.min(65535, (this.num ?? 0) * 10 + (c.charCodeAt(0) - 48));
    } else if ((c === '#' || c === '+') && this.cmd in NOTE_INDEX) {
      this.sharp = 1;
    } else if (c === '-' && this.cmd in NOTE_INDEX) {
      this.sharp = -1;
    } else if (c === '.' && this.cmd) {
      this.dots++;
    } else if (c === '>' || c === '<') {
      this.finish();
      this.octave = clamp(this.octave + (c === '>' ? 1 : -1), 0, 6);
    } else if (c.length === 1 && 'ABCDEFGNPTLOM'.includes(c)) {
      this.finish();
      this.cmd = c;
    }
    // anything else (space, CR, LF, '"', unknown letters): skipped
  }

  /** The command collected so far is complete. */
  private finish(): void {
    const { cmd, num, sharp, dots } = this;
    if (cmd === 'n') this.style = 'N';
    else if (cmd in NOTE_INDEX) {
      const n = this.octave * 12 + NOTE_INDEX[cmd] + sharp + 1;
      this.note(noteHz(n), num ? clamp(num, 1, 64) : this.length, dots);
    } else if (cmd === 'N' && num !== null && num <= 84) this.note(noteHz(num), this.length, dots);
    else if (cmd === 'P') this.note(0, num ? clamp(num, 1, 64) : this.length, dots);
    else if (cmd === 'T' && num !== null) this.tempo = clamp(num, 32, 255);
    else if (cmd === 'L' && num !== null) this.length = clamp(num, 1, 64);
    else if (cmd === 'O' && num !== null) this.octave = clamp(num, 0, 6);
    this.cmd = '';
    this.num = null;
    this.sharp = 0;
    this.dots = 0;
  }

  private note(hz: number, length: number, dots: number): void {
    const ms = (240000 / (this.tempo * length)) * 1.5 ** dots;
    if (hz === 0) {
      this.events.push({ hz: 0, ms: round3(ms), gate: 0, rest: true });
      return;
    }
    const [num, den] = GATE[this.style];
    this.events.push({ hz, ms: round3(ms), gate: round3((ms * num) / den), rest: false });
  }
}

/** Peak gain of a music note at volume 1: square waves are loud. */
const MUSIC_GAIN = 0.12;
/** Attack and release, in seconds, so note edges do not click. */
const EDGE = 0.003;

/**
 * Schedules `events` on `ctx` one after another from `startAt` (seconds,
 * context time) and returns when the last one ends.
 */
export function scheduleMusic(
  ctx: AudioContext,
  events: MusicEvent[],
  startAt: number,
  volume: number,
): number {
  let t = Math.max(startAt, ctx.currentTime);
  const peak = MUSIC_GAIN * volume;
  for (const e of events) {
    const len = e.ms / 1000;
    const gate = e.gate / 1000;
    if (!e.rest && e.hz > 0 && gate > 0 && peak > 0) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(e.hz, t);
      const edge = Math.min(EDGE, gate / 4);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(peak, t + edge);
      gain.gain.setValueAtTime(peak, t + gate - edge);
      gain.gain.linearRampToValueAtTime(0, t + gate);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + gate + 0.01);
    }
    t += len;
  }
  return t;
}
