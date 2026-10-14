/**
 * The magazine's art: the loader, and the shipped placeholder files.
 *
 * The files are bytes, so these tests read bytes: an `.ans` is Amiga ANSI
 * (ISO-8859-1, no PC glyphs), a `.seq` is replayed through the board's own
 * PETSCII machine and its glyphs are sent back through the board's transducer.
 */
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  AnsiToPetsciiTransducer,
  PetsciiMachine,
  SCREENCODE_TO_UNICODE,
  checkBoardRules,
  BOARD_CHARSET_BANK,
  C64_PALETTE_COLODORE,
} from '@amiexpress/bbs-door-sdk/petscii';
import { ART_NAMES, artKindFor, artRowText, artRows, ansiRows, loadArt, seqRows, seqSurface, shippedArtDir, slotFiles, slotKey, type ArtSources } from '../art';
import { buildAll } from '../tools/make-art';

const SHIPPED = shippedArtDir(path.join(__dirname, '..'));

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mag-art-'));
}

function sources(): { sources: ArtSources; override: string; shipped: string } {
  const override = tmp();
  const shipped = tmp();
  return { sources: { overrideDir: override, shippedDir: shipped }, override, shipped };
}

// ---- the loader -----------------------------------------------------------

export async function aFileTheStudioSavedIsTheFileTheLoaderReads(): Promise<void> {
  const s = sources();
  fs.writeFileSync(path.join(s.shipped, 'mag_front.ans'), 'shipped');
  assert.strictEqual(loadArt('mag_front', 'ans', s.sources)?.bytes.toString(), 'shipped');
  // The Studio saves in place, into the same art folder.
  fs.writeFileSync(path.join(s.shipped, 'mag_front.ans'), 'studio');
  const got = loadArt('mag_front', 'ans', s.sources);
  assert.strictEqual(got?.bytes.toString(), 'studio');
  assert.ok(got!.file.startsWith(s.shipped), 'it came from the door art folder');
  // The old sysop folder no longer decides which drawing a caller sees.
  fs.writeFileSync(path.join(s.override, 'mag_front.ans'), 'stale override');
  assert.strictEqual(loadArt('mag_front', 'ans', s.sources)?.bytes.toString(), 'studio');
}

export async function aSlotPointedAtAnotherFileReadsThatFileAndFallsBackWhenItIsGone(): Promise<void> {
  const s = sources();
  fs.writeFileSync(path.join(s.shipped, 'mag_front.ans'), 'default');
  fs.writeFileSync(path.join(s.shipped, 'sec_hack.ans'), 'picked');
  s.sources.slots = { mag_front: path.join(s.shipped, 'sec_hack.ans') };
  assert.strictEqual(loadArt('mag_front', 'ans', s.sources)?.bytes.toString(), 'picked');
  fs.rmSync(path.join(s.shipped, 'sec_hack.ans'));
  assert.strictEqual(loadArt('mag_front', 'ans', s.sources)?.bytes.toString(), 'default', 'a deleted pick does not blank the page');
}

export async function slotFilesTakesOnlyANameOrADirAndANameInsideTheDoor(): Promise<void> {
  const door = path.join(os.tmpdir(), 'door');
  const got = slotFiles({
    art_mag_title: 'art/alt_title.ans',
    art_mag_front: '../../etc/passwd',
    art_mag_contents: '/etc/passwd',
    art_mag_goodbye: 'a/b/c.ans',
    art_sec_hack: '.hidden',
    art_sec_scene: 'plain.ans',
    art_sec_music: 42,
    unrelated: 'art/x.ans',
  }, door);
  assert.deepStrictEqual(got, { mag_title: path.join(door, 'art/alt_title.ans'), sec_scene: path.join(door, 'plain.ans') });
}

export async function theStudiosC64DrawingBeatsTheShippedSeqForAFortyColumnCaller(): Promise<void> {
  const s = sources();
  const variants = tmp();
  fs.writeFileSync(path.join(s.shipped, 'sec_hack.seq'), 'seq');
  s.sources.variantDir = variants;
  assert.strictEqual(loadArt('sec_hack', 'seq', s.sources)?.kind, 'seq', 'nothing drawn: the shipped file');
  fs.writeFileSync(path.join(variants, 'setting:art_sec_hack.c64.ans'), '\x1b[36mDRAWN\n');
  const got = loadArt('sec_hack', 'seq', s.sources);
  assert.strictEqual(got?.kind, 'ans', 'the Studio draws ANSI, so it is read as ANSI');
  assert.deepStrictEqual(artRows(got!, 5, 40).map(artRowText), ['DRAWN']);
  assert.strictEqual(loadArt('sec_hack', 'ans', s.sources), null, 'a wide caller never reads the C64 drawing');
}

export async function theManifestDeclaresEveryPieceAsAStudioSlotWhoseDefaultIsShipped(): Promise<void> {
  const door = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(door, 'door.settings.json'), 'utf8')) as {
    settings: Array<{ key: string; art?: boolean; default?: string }>;
  };
  const slots = manifest.settings.filter((x) => x.art);
  assert.deepStrictEqual(slots.map((x) => x.key).sort(), ART_NAMES.map(slotKey).sort(), 'one slot per piece, no more');
  for (const slot of slots) {
    assert.strictEqual(slot.default, `art/${slot.key.slice('art_'.length)}.ans`);
    assert.ok(fs.statSync(path.join(door, slot.default!)).size > 0, `${slot.default} ships`);
  }
}

export async function aPetsciiCallerGetsTheSeqAndEveryoneElseTheAns(): Promise<void> {
  const s = sources();
  fs.writeFileSync(path.join(s.shipped, 'sec_hack.ans'), 'ans');
  fs.writeFileSync(path.join(s.shipped, 'sec_hack.seq'), 'seq');
  assert.strictEqual(artKindFor(true, 80), 'seq', 'a PETSCII session at any width');
  assert.strictEqual(artKindFor(false, 40), 'seq', 'forty columns never gets the 80-column drawing');
  assert.strictEqual(artKindFor(false, 80), 'ans');
  assert.strictEqual(artKindFor(false, 132), 'ans');
  assert.strictEqual(loadArt('sec_hack', artKindFor(true, 80), s.sources)?.bytes.toString(), 'seq');
  assert.strictEqual(loadArt('sec_hack', artKindFor(false, 80), s.sources)?.bytes.toString(), 'ans');
}

export async function aMissingOrEmptyFileIsSkippedWithoutAnError(): Promise<void> {
  const s = sources();
  assert.strictEqual(loadArt('mag_title', 'ans', s.sources), null, 'nowhere: no art');
  assert.strictEqual(loadArt('mag_title', 'ans', { overrideDir: path.join(s.override, 'nope'), shippedDir: null }), null);
  // An empty file is not art.
  fs.writeFileSync(path.join(s.shipped, 'mag_title.ans'), '');
  assert.strictEqual(loadArt('mag_title', 'ans', s.sources), null);
  // A directory with the file's name is not a file.
  fs.mkdirSync(path.join(s.shipped, 'mag_goodbye.ans'));
  assert.strictEqual(loadArt('mag_goodbye', 'ans', s.sources), null);
}

export async function amigaArtIsReadAsLatin1AndNeverAsUtf8(): Promise<void> {
  const rows = ansiRows(Buffer.from([0x1b, 0x5b, 0x31, 0x3b, 0x33, 0x36, 0x6d, 0xaf, 0xa6, 0xab, 0x7b, 0x0d, 0x0a]), 5, 80);
  assert.deepStrictEqual(rows.map(artRowText), ['¯¦«{']);
  // Only SGR survives; a cursor move or a clear in a drawing is dropped, and rows are clipped.
  const clipped = ansiRows(Buffer.from(`\x1b[2J\x1b[5;5H\x1b[0;35m${'x'.repeat(100)}\r\n`, 'latin1'), 5, 80);
  assert.strictEqual(artRowText(clipped[0]).length, 80);
  assert.ok(!clipped[0].includes('\x1b[2J') && !clipped[0].includes('\x1b[5;5H'));
  assert.ok(clipped[0].includes('\x1b[0;35m'));
}

// ---- the shipped files ----------------------------------------------------

const BANNERS = ['mag_front', 'mag_contents', 'sec_hack', 'sec_scene', 'sec_graffiti', 'sec_music', 'sec_people', 'sec_archive', 'sec_stream', 'sec_general'];

/** The latin1 glyphs the placeholders may use: the ones every Amiga Topaz has and CP437 does not borrow. */
const ALLOWED_HIGH = new Set([0xa4, 0xa6, 0xab, 0xac, 0xaf, 0xb0, 0xb1, 0xb2, 0xb3, 0xb4, 0xb7, 0xb8, 0xba, 0xbb, 0xd7, 0xf7]);

export async function everyArtFileExistsInBothKinds(): Promise<void> {
  assert.strictEqual(ART_NAMES.length, 15);
  for (const name of ART_NAMES) {
    for (const ext of ['ans', 'seq']) assert.ok(fs.statSync(path.join(SHIPPED, `${name}.${ext}`)).size > 0, `${name}.${ext}`);
  }
}

export async function theShippedFilesAreExactlyWhatTheScriptWrites(): Promise<void> {
  for (const [name, bytes] of buildAll()) {
    assert.ok(fs.readFileSync(path.join(SHIPPED, name)).equals(bytes), `${name} differs from tools/make-art.ts: run it`);
  }
}

export async function everyAnsIsAmigaLatin1WithNoPcGlyphsAndFitsEighty(): Promise<void> {
  for (const name of ART_NAMES) {
    const bytes = fs.readFileSync(path.join(SHIPPED, `${name}.ans`));
    for (const b of bytes) {
      if (b >= 0x80) assert.ok(ALLOWED_HIGH.has(b), `${name}.ans: 0x${b.toString(16)} is not on the Amiga glyph list`);
      assert.ok(!(b >= 0x80 && b < 0xa0), `${name}.ans: C1 control`);
    }
    // UTF-8 for a box or block glyph (U+2500-259F) starts E2 94..96: Amiga art is never that.
    for (let i = 0; i + 1 < bytes.length; i++) {
      assert.ok(!(bytes[i] === 0xe2 && bytes[i + 1] >= 0x94 && bytes[i + 1] <= 0x96), `${name}.ans: a UTF-8 box or block glyph at ${i}`);
    }
    const text = bytes.toString('latin1').replace(/\x1b\[[0-9;]*m/g, '');
    assert.ok(!text.replace(/\x1b\[2J\x1b\[H/g, '').includes('\x1b'), `${name}.ans: only SGR (and one clear on a screen)`);
    const rows = text.replace(/\x1b\[2J\x1b\[H/g, '').split(/\r\n/);
    const plain = rows;
    for (const r of plain) assert.ok(r.length <= 80, `${name}.ans: a row is ${r.length} wide`);
    const used = plain.filter((r, i) => r.length > 0 || i < plain.length - 1).length;
    if (BANNERS.includes(name) || name === 'mag_article_end' || name === 'mag_logo_small' || name === 'mag_loading') {
      assert.ok(used <= 5, `${name}.ans: ${used} rows`);
    } else {
      assert.ok(used <= 25, `${name}.ans: ${used} rows`);
    }
    assert.ok(/placeholder/i.test(text), `${name}.ans says PLACEHOLDER`);
  }
}

export async function everySeqIsPetsciiOnABlackScreenThatTheBoardAccepts(): Promise<void> {
  for (const name of ART_NAMES) {
    const bytes = fs.readFileSync(path.join(SHIPPED, `${name}.seq`));
    assert.strictEqual(bytes[0], 0x93, `${name}.seq begins with a clear screen`);
    assert.deepStrictEqual(checkBoardRules(bytes), [], `${name}.seq breaks a board rule`);
    const s = seqSurface(bytes);
    assert.strictEqual(s.background, 0, `${name}.seq: black background`);
    assert.strictEqual(s.charsetBank, BOARD_CHARSET_BANK, `${name}.seq stays in the board's bank`);
    // Rows the file occupies: 40 wide by the machine's own screen, banners at most four.
    let lastRow = -1;
    const text: string[] = [];
    for (let y = 0; y < s.rows; y++) {
      let line = '';
      for (let x = 0; x < s.cols; x++) {
        const code = s.screen[y * s.cols + x];
        const glyph = SCREENCODE_TO_UNICODE[s.charsetBank][code & 0x7f];
        assert.ok(glyph && glyph !== '?', `${name}.seq: screen code ${code.toString(16)} has no glyph`);
        line += glyph;
        if ((code & 0x7f) !== 0x20 || (code & 0x80)) lastRow = y;
      }
      text.push(line);
    }
    assert.strictEqual(s.cols, 40);
    if (BANNERS.includes(name)) assert.ok(lastRow + 1 <= 4, `${name}.seq: ${lastRow + 1} rows`);
    assert.ok(/placeholder/i.test(text.join('\n')), `${name}.seq says placeholder`);
    // rows that fit: seqRows hands the reader at most what the file drew, 40 cells wide
    for (const r of seqRows(bytes, 25, 40)) assert.ok(artRowText(r).length <= 40, `${name}.seq: row too wide`);
  }
}

/** The cells of a `.seq` as an ANSI stream a blessed door would send: glyph, colour, reverse. */
function ansiOfSurface(bytes: Buffer): string {
  const s = seqSurface(bytes);
  let out = '\x1b[2J';
  for (let y = 0; y < s.rows; y++) {
    out += `\x1b[${y + 1};1H`;
    for (let x = 0; x < s.cols; x++) {
      const code = s.screen[y * s.cols + x];
      const hex = C64_PALETTE_COLODORE[s.colorRam[y * s.cols + x] & 0x0f];
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      out += `\x1b[38;2;${r};${g};${b}m${code & 0x80 ? '\x1b[7m' : '\x1b[27m'}${SCREENCODE_TO_UNICODE[s.charsetBank][code & 0x7f]}`;
    }
  }
  return out;
}

export async function everySeqSurvivesTheBoardsTransducerCellForCell(): Promise<void> {
  for (const name of ART_NAMES) {
    const bytes = fs.readFileSync(path.join(SHIPPED, `${name}.seq`));
    const want = seqSurface(bytes);
    const transducer = new AnsiToPetsciiTransducer();
    const wire = transducer.transduce(ansiOfSurface(bytes));
    const got = new PetsciiMachine();
    got.state.charsetBank = BOARD_CHARSET_BANK;
    got.feed(wire);
    for (let i = 0; i < want.screen.length; i++) {
      const blank = (want.screen[i] & 0x7f) === 0x20 && !(want.screen[i] & 0x80);
      if (blank) continue;
      assert.strictEqual(got.state.screen[i], want.screen[i], `${name}.seq: cell ${i} (row ${Math.floor(i / 40)}, col ${i % 40}) came out as ${got.state.screen[i].toString(16)}, drawn as ${want.screen[i].toString(16)}`);
    }
  }
}

export async function theRowsOfEachWordInTheTitleShareTheirLeftColumn(): Promise<void> {
  const text = fs.readFileSync(path.join(SHIPPED, 'mag_title.ans')).toString('latin1').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  const rows = text.split(/\r\n/);
  // A wordmark row is drawn with | or \; a word is a run of consecutive such rows (UNKNOWN, FREQUENCY).
  const words: string[][] = [];
  const isWordRow = (r: string | undefined): boolean => r !== undefined && r.trim().length < 70 && /[|\\]/.test(r); // the 80-cell waveform has a backslash too
  rows.forEach((r, i) => {
    if (!isWordRow(r)) return;
    if (isWordRow(rows[i - 1])) words[words.length - 1].push(r);
    else words.push([r]);
  });
  assert.strictEqual(words.length, 2, 'the title has two words');
  for (const word of words) {
    // The first letter's stem starts rows one and two; row three of a round letter (U) is indented by the glyph itself.
    const lefts = word.map((r) => r.length - r.trimStart().length);
    assert.strictEqual(lefts[0], lefts[1], `the rows of one word start at columns ${lefts.join(', ')}`);
    assert.ok(lefts[2] - lefts[0] <= 1, `the last row starts at ${lefts[2]}, the first at ${lefts[0]}`);
    // Padded to one width, so a row is never centred on its own length.
    assert.strictEqual(new Set(word.map((r) => r.length)).size, 1, `row widths ${word.map((r) => r.length).join(', ')}`);
  }
}

export async function noGeneratedPieceCarriesTheCyanFrequencyWave(): Promise<void> {
  // Sysop 2026-10-14: the cyan square-wave band is gone from every piece. ANSI: _/¯\__/¯¯\_ ; PETSCII: lower blocks a4 af b9 a2 b9 af a4.
  const wavePet = Buffer.from([0xa4, 0xaf, 0xb9, 0xa2, 0xb9, 0xaf, 0xa4, 0x20]);
  let n = 0;
  for (const name of ART_NAMES) {
    const ans = fs.readFileSync(path.join(SHIPPED, `${name}.ans`)).toString('latin1');
    assert.ok(!ans.includes('/\xaf\\__/\xaf\xaf\\'), `${name}.ans carries the wave`);
    assert.ok(!ans.includes('_/\xaf\\_'), `${name}.ans carries wave fragments`);
    assert.ok(!fs.readFileSync(path.join(SHIPPED, `${name}.seq`)).includes(wavePet), `${name}.seq carries the wave`);
    n += 1;
  }
  assert.ok(n >= 15, `checked ${n} pieces`);
  // And the generator itself no longer makes one.
  for (const [file, buf] of buildAll()) {
    assert.ok(!buf.toString('latin1').includes('/\xaf\\__/\xaf\xaf\\'), `generator still emits the wave in ${file}`);
  }
}
