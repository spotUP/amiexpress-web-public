/**
 * Writes the magazine's PLACEHOLDER art into Doors/magazine/art/.
 *
 *   npx tsx tools/make-art.ts            write the files
 *   npx tsx tools/make-art.ts --check    exit 1 if a file on disk differs
 *
 * Everything here is BYTES. A `.ans` is Amiga ANSI - Topaz, ISO-8859-1 - so a
 * glyph is one latin1 byte and nothing is ever written as UTF-8 text (a text
 * write would turn `¯` into two bytes and the Amiga would draw two glyphs). A
 * `.seq` is C64 PETSCII on the board's lowercase bank: letters are `$C1-$DA`
 * for capitals and `$41-$5A` for small, colours are the VIC colour codes, a
 * solid fill is reverse video, and no cell has a background of its own.
 *
 * The art is a placeholder and says so on every piece. An artist replaces it
 * in the ANSI Studio (admin Screens, Door screens, MAG), which saves over these
 * same files in place; the C64 and Teletext tabs draw the 40-column versions.
 *
 * LOOK: a signal terminal. Black screen, neon cyan / magenta / green, a
 * magenta rules, wide letter-spaced captions - not a diskmag copy.
 */
import * as fs from 'fs';
import * as path from 'path';
import { DESK_LABEL, FRONT_PAGE_LABEL, type Desk } from '@amiexpress/bbs-door-sdk/formats/magazine';

// ---------------------------------------------------------------------------
// Amiga ANSI (.ans): latin1 bytes
// ---------------------------------------------------------------------------

const ESC = '\x1b';
const sgr = (code: string): string => `${ESC}[${code}m`;
const C = {
  reset: sgr('0'),
  cyan: sgr('1;36'),
  cyanDim: sgr('0;36'),
  magenta: sgr('1;35'),
  magentaDim: sgr('0;35'),
  green: sgr('1;32'),
  greenDim: sgr('0;32'),
  white: sgr('1;37'),
  grey: sgr('1;30'),
  yellow: sgr('1;33'),
} as const;

/** A coloured run. */
type Run = [colour: string, text: string];

const visible = (runs: readonly Run[]): number => runs.reduce((n, [, t]) => n + t.length, 0);
const paint = (runs: readonly Run[]): string => runs.map(([c, t]) => `${c}${t}`).join('') + C.reset;

const pad = (n: number): string => ' '.repeat(Math.max(0, n));
const centred = (width: number, runs: readonly Run[]): Run[] => [[C.reset, pad(Math.floor((width - visible(runs)) / 2))], ...runs];

/** Letters spaced out: "FRONT PAGE" -> "F R O N T   P A G E". */
const spaced = (s: string): string => s.split('').join(' ').replace(/ {3}/g, '   ');

const PLACEHOLDER_NOTE = 'PLACEHOLDER art';

function ansBytes(rows: readonly string[], opts: { clear?: boolean } = {}): Buffer {
  const text = (opts.clear ? `${ESC}[0m${ESC}[2J${ESC}[H` : '') + rows.join('\r\n') + '\r\n';
  const buf = Buffer.from(text, 'latin1');
  // latin1 would turn a character above U+00FF into '?', and a C1 control is not a glyph.
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code > 0xff) throw new Error(`U+${code.toString(16)} is not ISO-8859-1`);
    if (code >= 0x80 && code < 0xa0) throw new Error(`C1 control ${code.toString(16)}`);
  }
  return buf;
}

/** A banner: caption, tagline, rule. Three rows, 80 wide. */
function ansBanner(label: string, tagline: string, ink: string, inkDim: string): Buffer {
  const width = 80;
  const caption: Run[] = [[C.reset, ' '], [inkDim, '« '], [ink, spaced(label)], [inkDim, ' »']];
  const note: Run[] = [[C.grey, `${PLACEHOLDER_NOTE} `]];
  const gap = width - visible(caption) - visible(note);
  return ansBytes([
    paint([...caption, [C.reset, pad(gap)], ...note]),
    paint([[C.reset, ' '], [C.greenDim, '¦ '], [C.green, tagline]]),
    paint([[C.magentaDim, '¯'.repeat(width)]]),
  ]);
}

function ansGoodbye(): Buffer {
  const W = 80;
  return ansBytes([
    '',
    '',
    '',
    '',
    paint(centred(W, [[C.magenta, 'S I G N A L   L O S T']])),
    paint(centred(W, [[C.greenDim, 'the frequency stays open · tune in again']])),
    '',
    '',
    paint(centred(W, [[C.grey, `${PLACEHOLDER_NOTE} - redraw it in the ANSI Studio: Door screens, MAG`]])),
  ], { clear: true });
}

function ansLoading(): Buffer {
  return ansBytes([
    paint([[C.reset, ' '], [C.cyan, 'T U N I N G'], [C.greenDim, '  ['], [C.green, '»»»»»»»»'], [C.grey, '········'], [C.greenDim, ']']]),
    paint([[C.reset, ' '], [C.grey, `${PLACEHOLDER_NOTE} - loading`]]),
  ]);
}

function ansLogoSmall(): Buffer {
  return ansBytes([
    paint([[C.reset, ' '], [C.cyan, 'THE UNKNOWN '], [C.magenta, 'FREQUENCY'], [C.greenDim, '  //  signal terminal'], [C.grey, `   ${PLACEHOLDER_NOTE}`]]),
    paint([[C.magentaDim, '¯'.repeat(80)]]),
  ]);
}

function ansArticleEnd(): Buffer {
  return ansBytes([
    paint(centred(80, [[C.cyanDim, '·  ·  ·  '], [C.green, 'end of transmission'], [C.cyanDim, '  ·  ·  ·']])),
    paint(centred(80, [[C.grey, PLACEHOLDER_NOTE]])),
  ]);
}

// ---------------------------------------------------------------------------
// C64 PETSCII (.seq): bytes
// ---------------------------------------------------------------------------

const PET = {
  clear: 0x93,
  rvsOn: 0x12,
  rvsOff: 0x92,
  cr: 0x0d,
  white: 0x05,
  green: 0x1e,
  yellow: 0x9e,
  cyan: 0x9f,
  purple: 0x9c,
  darkGrey: 0x97,
  lightGrey: 0x9b,
  lightGreen: 0x99,
} as const;

// Graphics, by PETSCII code (the board's lowercase bank): lower blocks and the horizontal line.
const G = { lower1: 0xa4, lower2: 0xaf, lower3: 0xb9, lower4: 0xa2, line: 0xc0 } as const;

/** ASCII to the PETSCII code of the board's bank: capitals shifted ($C1-$DA), small letters $41-$5A. */
function petCode(ch: string): number {
  const c = ch.charCodeAt(0);
  if (c >= 0x41 && c <= 0x5a) return c + 0x80;
  if (c >= 0x61 && c <= 0x7a) return c - 0x20;
  // Digits and the punctuation that is the same in both sets. '[', ']', '_', '|', '\\' are graphics there.
  if (c >= 0x20 && c <= 0x40) return c;
  throw new Error(`no PETSCII code for ${JSON.stringify(ch)}`);
}

class Seq {
  readonly bytes: number[] = [];
  private col = 0;
  private rows = 0;

  ctl(...codes: number[]): this { this.bytes.push(...codes); return this; }
  put(...codes: number[]): this {
    for (const code of codes) { this.bytes.push(code); this.col += 1; }
    if (this.col > 40) throw new Error('row wider than 40');
    return this;
  }
  text(s: string): this { for (const ch of s) this.put(petCode(ch)); return this; }
  colour(code: number): this { return this.ctl(code); }
  /** A reverse-video band: the text on a solid fill of `fill`, `width` cells wide. */
  band(fill: number, s: string, width = 40): this {
    const left = Math.floor((width - s.length) / 2);
    this.ctl(fill, PET.rvsOn);
    this.put(...Array(left).fill(0x20));
    this.text(s);
    this.put(...Array(width - left - s.length).fill(0x20));
    return this.ctl(PET.rvsOff);
  }
  rule(colour: number): this {
    this.colour(colour);
    for (let i = 0; i < 40; i++) this.put(G.line);
    return this.eol();
  }
  centre(colour: number, s: string): this {
    this.colour(colour);
    this.put(...Array(Math.floor((40 - s.length) / 2)).fill(0x20));
    return this.text(s).eol();
  }
  /** End the row. A full 40 cells already wrapped; a CR then would be a blank line. */
  eol(): this {
    this.ctl(PET.rvsOff);
    if (this.col < 40) this.ctl(PET.cr);
    this.col = 0;
    this.rows += 1;
    return this;
  }
  blank(): this { this.col = 0; this.rows += 1; return this.ctl(PET.cr); }
  buffer(): Buffer {
    if (this.rows > 25) throw new Error('more than 25 rows');
    return Buffer.from(this.bytes);
  }
}

const seq = (): Seq => new Seq().ctl(PET.clear);

function seqBanner(label: string, tagline: string, band: number, ink: number): Buffer {
  return seq()
    .band(band, label).eol()
    .centre(ink, tagline.toLowerCase())
    .centre(PET.darkGrey, 'placeholder art')
    .buffer();
}

function seqGoodbye(): Buffer {
  return seq()
    .blank().blank().blank().blank()
    .blank()
    .centre(PET.purple, 's i g n a l   l o s t')
    .centre(PET.lightGreen, 'the frequency stays open')
    .blank()
    .blank()
    .centre(PET.darkGrey, 'placeholder art - goodbye')
    .buffer();
}

function seqLoading(): Buffer {
  return seq()
    .colour(PET.cyan).text('t u n i n g ').colour(PET.green).text('<<<<<<<<').colour(PET.darkGrey).text('........').eol()
    .centre(PET.darkGrey, 'placeholder art - loading')
    .buffer();
}

function seqLogoSmall(): Buffer {
  return seq()
    .colour(PET.cyan).text('THE UNKNOWN ').colour(PET.purple).text('FREQUENCY').eol()
    .centre(PET.darkGrey, 'placeholder art')
    .buffer();
}

function seqArticleEnd(): Buffer {
  return seq()
    .centre(PET.green, '- end of transmission -')
    .centre(PET.darkGrey, 'placeholder art')
    .buffer();
}

// ---------------------------------------------------------------------------
// The set
// ---------------------------------------------------------------------------

const DESKS: Array<{ desk: Desk; tagline: string; ink: [string, string, number, number] }> = [
  { desk: 'hack', tagline: 'signals intercepted, firmware opened', ink: [C.cyan, C.cyanDim, PET.cyan, PET.lightGreen] },
  { desk: 'scene', tagline: 'demos, trackers and retro iron', ink: [C.magenta, C.magentaDim, PET.purple, PET.cyan] },
  { desk: 'graffiti', tagline: 'walls, rooftops, the city after dark', ink: [C.green, C.greenDim, PET.green, PET.purple] },
  { desk: 'music', tagline: 'tracker beats and pirate radio', ink: [C.cyan, C.cyanDim, PET.cyan, PET.lightGreen] },
  { desk: 'people', tagline: 'long reads from the signal', ink: [C.magenta, C.magentaDim, PET.purple, PET.cyan] },
  { desk: 'archive', tagline: 'transmissions from the vault', ink: [C.green, C.greenDim, PET.green, PET.purple] },
  { desk: 'stream', tagline: 'the live wire, newest first', ink: [C.cyan, C.cyanDim, PET.cyan, PET.lightGreen] },
  { desk: 'general', tagline: 'everything else on the dial', ink: [C.magenta, C.magentaDim, PET.purple, PET.cyan] },
];

export function buildAll(): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  files.set('mag_goodbye.ans', ansGoodbye());
  files.set('mag_goodbye.seq', seqGoodbye());
  files.set('mag_loading.ans', ansLoading());
  files.set('mag_loading.seq', seqLoading());
  files.set('mag_logo_small.ans', ansLogoSmall());
  files.set('mag_logo_small.seq', seqLogoSmall());
  files.set('mag_article_end.ans', ansArticleEnd());
  files.set('mag_article_end.seq', seqArticleEnd());
  files.set('mag_front.ans', ansBanner(FRONT_PAGE_LABEL, 'the newest stories', C.cyan, C.cyanDim));
  files.set('mag_front.seq', seqBanner(FRONT_PAGE_LABEL, 'the newest stories', PET.cyan, PET.lightGreen));
  files.set('mag_contents.ans', ansBanner('CONTENTS', 'every section, every page number', C.magenta, C.magentaDim));
  files.set('mag_contents.seq', seqBanner('CONTENTS', 'every section, every page', PET.purple, PET.cyan));
  for (const { desk, tagline, ink } of DESKS) {
    files.set(`sec_${desk}.ans`, ansBanner(DESK_LABEL[desk], tagline, ink[0], ink[1]));
    files.set(`sec_${desk}.seq`, seqBanner(DESK_LABEL[desk], tagline, ink[2], ink[3]));
  }
  return files;
}

export const ART_DIR = path.join(__dirname, '..', 'art');

function main(): void {
  const check = process.argv.includes('--check');
  const files = buildAll();
  let differs = 0;
  if (!check) fs.mkdirSync(ART_DIR, { recursive: true });
  for (const [name, bytes] of files) {
    const file = path.join(ART_DIR, name);
    if (check) {
      const onDisk = fs.existsSync(file) ? fs.readFileSync(file) : null;
      if (!onDisk || !onDisk.equals(bytes)) { differs += 1; console.log(`[DIFF] ${name}`); }
    } else {
      fs.writeFileSync(file, bytes);
      console.log(`[OK] ${name} ${bytes.length} bytes`);
    }
  }
  if (check && differs) process.exit(1);
}

if (require.main === module) main();
