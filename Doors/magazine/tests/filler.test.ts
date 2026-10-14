/**
 * Filler: Mortimer's clipart in the empty tail of a column. The behaviour is
 * tested where it lives (the placement and the layout); the one test that
 * proves it is WIRED through the reader sits in reader.test.ts.
 */
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Story } from '@amiexpress/bbs-door-sdk/formats/magazine';
import { shippedArtDir, type ArtSources } from '../art';
import {
  FILLER_MIN_GAP,
  chooseFiller,
  loadFiller,
  parsePiece,
  petsciiMappable,
  placeFiller,
  type FillerOptions,
  type FillerPiece,
} from '../filler';
import { buildArticle, buildLayout, buildListing, rowText, type ListingBlock } from '../layout';

const SHIPPED = shippedArtDir(path.join(__dirname, '..'));
const NO_OVERRIDE = path.join(os.tmpdir(), 'mag-fill-no-such-dir');
const sources = (override = NO_OVERRIDE): ArtSources => ({ overrideDir: override, shippedDir: SHIPPED });
const ALL = loadFiller(sources(), false);

const SHORT: Story = {
  id: 'short1',
  headline: 'Skaven releases Copper Lights',
  summary: 'A short story.\n\nA second short paragraph.',
  format: 'RELEASE', desk: 'scene', date: '2026-10-13', source: 'demozoo.org',
  url: 'https://demozoo.org/productions/1/', firstSeen: '2026-10-13', seenCount: 1,
};

const LONG: Story = {
  ...SHORT,
  id: 'long1',
  body: Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1} of a very long story that fills every column of every page.`).join('\n\n'),
};

const options = (key: string, pieces: readonly FillerPiece[] = ALL): FillerOptions => ({ pieces, key });

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mag-fill-'));
}

// ---- the shipped set -------------------------------------------------------

export async function sixtyFivePiecesShipAndFiftyFourAreSignedWithTheArtistsMark(): Promise<void> {
  const dir = path.join(SHIPPED, 'fill');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt'));
  assert.strictEqual(files.length, 65);
  assert.strictEqual(ALL.length, 65, 'every shipped file parses as a piece');
  const index = fs.readFileSync(path.join(dir, 'index.tsv'), 'latin1').trim().split('\n').slice(1).map((l) => l.split('\t'));
  assert.strictEqual(index.length, 65);
  const indexedSigned = new Set(index.filter((r) => r[3] !== '0').map((r) => r[0]));
  assert.strictEqual(indexedSigned.size, 54, 'the index counts 54 signed objects');
  for (const piece of ALL) {
    const raw = fs.readFileSync(path.join(dir, piece.file)).toString('latin1');
    assert.strictEqual(piece.signed, raw.includes('\u00a9Mt'), `${piece.file}: signed flag reads the file`);
    assert.strictEqual(piece.signed, indexedSigned.has(piece.file), `${piece.file}: signed as the index says`);
  }
  assert.strictEqual(ALL.filter((p) => p.signed).length, 54);
  assert.strictEqual(ALL.filter((p) => !p.signed).length, 11);
}

export async function shippedPiecesAreLatin1BytesNotUtf8(): Promise<void> {
  for (const piece of ALL) {
    const bytes = fs.readFileSync(path.join(SHIPPED, 'fill', piece.file));
    assert.ok(!bytes.includes(Buffer.from([0xef, 0xbf, 0xbd])), `${piece.file}: no replacement character`);
  }
  const signed = fs.readFileSync(path.join(SHIPPED, 'fill', ALL.find((p) => p.signed)!.file));
  assert.ok(signed.includes(0xa9), 'the (c) sign is the single latin1 byte 0xA9');
}

// ---- placement --------------------------------------------------------------

export async function aGapSmallerThanTheThresholdGetsNothing(): Promise<void> {
  const room = 20;
  assert.strictEqual(placeFiller(options('k'), 0, [room - (FILLER_MIN_GAP - 1)], room, 38)[0], null, 'five empty rows: skipped');
  assert.ok(placeFiller(options('k'), 0, [0], room, 38)[0], 'a wholly empty column takes one');
  assert.strictEqual(FILLER_MIN_GAP, 6);
}

export async function aPieceTallerThanTheGapIsNeverCutNorChosen(): Promise<void> {
  const tall = ALL.filter((p) => p.height > 9);
  assert.ok(tall.length > 0);
  for (let gap = FILLER_MIN_GAP; gap <= 14; gap++) {
    const room = 30;
    const at = placeFiller(options('seed'), 0, [room - gap], room, 38)[0];
    if (!at) continue;
    assert.ok(at.piece.height <= gap - 1, `gap ${gap}: ${at.piece.height} rows leave a blank row under the text`);
    assert.ok(at.top >= room - gap + 1, 'and starts below that blank row');
    assert.ok(at.top + at.piece.height <= room, 'and ends inside the column');
  }
  assert.strictEqual(chooseFiller(ALL, 'x', 38, 3, new Set()), null, 'nothing is three rows tall');
}

export async function aPieceWiderThanTheColumnIsNeverUsed(): Promise<void> {
  const narrow = chooseFiller(ALL, 'x', 20, 40, new Set());
  assert.ok(narrow && narrow.width <= 20, 'a 20 column gets a piece that fits 20');
  for (let n = 0; n < 40; n++) {
    const p = chooseFiller(ALL, `key${n}`, 34, 40, new Set());
    assert.ok(p && p.width <= 34, 'only col34 pieces in a 34 column');
  }
  const only = ALL.filter((p) => p.width > 38);
  assert.ok(only.length > 0);
  assert.strictEqual(chooseFiller(only, 'x', 38, 40, new Set()), null, 'the wide pieces fit no column');
}

export async function oneSpreadShowsAtMostOnePiece(): Promise<void> {
  for (let n = 0; n < 200; n++) {
    for (const rows of [[0, 0, 0], [0, 0], [4, 0, 0], [20, 3, 9], [12, 8, 0]]) {
      const at = placeFiller(options(`story${n}`), n % 3, rows, 20, 38);
      assert.ok(at.filter(Boolean).length <= 1, `story${n} ${rows}: ${at.filter(Boolean).length} pieces`);
    }
    assert.strictEqual(placeFiller(options(`story${n}`), n % 3, [0, 0, 0], 20, 38).filter(Boolean).length, 1, 'and one is placed');
  }
}

export async function anEntirelyEmptyColumnIsPreferredAndThePieceIsCentredInIt(): Promise<void> {
  const room = 20;
  for (let n = 0; n < 100; n++) {
    // Column 0 holds text with a big tail gap; column 1 is empty: the piece goes to column 1.
    const at = placeFiller(options(`k${n}`), 0, [4, 0], room, 38);
    assert.strictEqual(at[0], null, 'nothing under or between the text of the column that holds text');
    const p = at[1]!;
    assert.ok(p, 'the empty column gets the piece');
    assert.strictEqual(p.top, Math.floor((room - p.piece.height) / 2), 'centred vertically');
    assert.strictEqual(p.indent, Math.floor((38 - p.piece.width) / 2), 'centred horizontally');
    // Even when the empty column comes first.
    const first = placeFiller(options(`k${n}`), 0, [0, 4], room, 38);
    assert.ok(first[0] && first[1] === null);
  }
}

export async function withNoEmptyColumnThePieceGoesInTheLargestGapNeverTwo(): Promise<void> {
  const room = 30;
  for (let n = 0; n < 100; n++) {
    const at = placeFiller(options(`g${n}`), 0, [30, 10, 16], room, 38); // gaps 0, 20, 14
    assert.deepStrictEqual(at.map((a) => a !== null), [false, true, false], 'the 20 row gap wins');
    assert.ok(at[1]!.top >= 10 + 1 && at[1]!.top + at[1]!.piece.height <= room);
    const flip = placeFiller(options(`g${n}`), 0, [10, 30, 16], room, 38);
    assert.deepStrictEqual(flip.map((a) => a !== null), [true, false, false]);
  }
  assert.deepStrictEqual(placeFiller(options('x'), 0, [30, 25, 26], room, 38), [null, null, null], 'no gap of 6: none');
}

export async function aPieceAlreadyOnTheSpreadIsSkippedEvenWhenTheHashPicksItAgain(): Promise<void> {
  const first = chooseFiller(ALL, 'collide', 38, 20, new Set())!;
  const second = chooseFiller(ALL, 'collide', 38, 20, new Set([first.file]))!;
  assert.notStrictEqual(second.file, first.file, 'the same hash, a different piece');
  const fits = ALL.filter((p) => p.width <= 38 && p.height <= 20);
  assert.strictEqual(chooseFiller(ALL, 'collide', 38, 20, new Set(fits.map((p) => p.file))), null, 'all used: none');
  const one = options('k', [first]);
  const placed = placeFiller(one, 0, [0, 0, 0], 20, 38);
  assert.strictEqual(placed.filter(Boolean).length, 1, 'one piece on offer fills one column, never two');
}

export async function theSameViewAlwaysGetsTheSamePieceAndOtherViewsVary(): Promise<void> {
  const a = placeFiller(options('same'), 0, [4, 0, 0], 20, 38);
  const b = placeFiller(options('same'), 0, [4, 0, 0], 20, 38);
  assert.deepStrictEqual(a, b);
  const seen = new Set<string>();
  for (let n = 0; n < 40; n++) seen.add(placeFiller(options(`v${n}`), 0, [0], 20, 38)[0]!.piece.file);
  assert.ok(seen.size > 8, `the hash spreads the choice (${seen.size} different pieces over 40 views)`);
}

// ---- in the layout ----------------------------------------------------------

/** Every character a text row had stays where it was: filler only writes into blanks. */
function onlyFillsBlanks(without: string[], withFill: string[]): void {
  assert.strictEqual(without.length, withFill.length);
  without.forEach((row, r) => {
    const other = withFill[r];
    assert.strictEqual(other.length, row.length, `row ${r} keeps its width`);
    for (let i = 0; i < row.length; i++) {
      if (row[i] !== ' ') assert.strictEqual(other[i], row[i], `row ${r} col ${i}: text is untouched`);
    }
  });
}

/** The piece found whole in one column of the rendered rows, with its first row; null when the column holds none. */
function pieceInColumn(rows: string[], left: number, colWidth: number): { piece: FillerPiece; first: number } | null {
  const slice = rows.map((r) => r.slice(left, left + colWidth));
  for (const p of ALL) {
    const first = slice.findIndex((s) => s.trim() === p.rows[0].trim());
    if (first < 0) continue;
    if (p.rows.every((row, i) => slice[first + i]?.trim() === row.trim())) return { piece: p, first };
  }
  return null;
}

export async function aShortArticleGetsExactlyOnePieceInAnEmptyColumnAtEightyAndAHundredThirtyTwo(): Promise<void> {
  for (const [w, h, cols] of [[80, 24, 2], [132, 40, 3]] as const) {
    const layout = buildLayout(w, h);
    assert.strictEqual(layout.geometry.cols, cols);
    const bare = buildArticle(SHORT, layout);
    const filled = buildArticle(SHORT, layout, [], options(SHORT.id));
    assert.strictEqual(filled.spreads.length, 1);
    const a = bare.spreads[0].map(rowText);
    const b = filled.spreads[0].map(rowText);
    onlyFillsBlanks(a, b);
    assert.notDeepStrictEqual(a, b, `${w}: something was drawn`);
    const { margin, colWidth, gutter } = layout.geometry;
    const found: number[] = [];
    for (let c = 0; c < cols; c++) {
      const left = margin + c * (colWidth + gutter);
      if (pieceInColumn(b, left, colWidth)) found.push(c);
    }
    assert.strictEqual(found.length, 1, `${w}: one piece on the screen, found in columns ${found}`);
    assert.ok(found[0] >= 1, `${w}: in an empty column, never under the article text in column 1`);
    assert.deepStrictEqual(buildArticle(SHORT, layout, [], options(SHORT.id)).spreads[0].map(rowText), b, 'deterministic');
  }
}

export async function aFullPageOfTextGetsNoFillerAndPagesIdentically(): Promise<void> {
  for (const [w, h] of [[80, 24], [132, 40]] as const) {
    const layout = buildLayout(w, h);
    const bare = buildArticle(LONG, layout);
    const filled = buildArticle(LONG, layout, [], options(LONG.id));
    assert.strictEqual(filled.spreads.length, bare.spreads.length, `${w}: filler never changes the page count`);
    bare.spreads.forEach((spread, n) => {
      const a = spread.map(rowText);
      const b = filled.spreads[n].map(rowText);
      onlyFillsBlanks(a, b);
      if (n < bare.spreads.length - 1) assert.deepStrictEqual(a, b, `${w}: full spread ${n} has no gap to fill`);
    });
  }
}

export async function aShortListingKeepsItsListCleanAndPutsOnePieceInTheEmptyRightColumn(): Promise<void> {
  const blocks: ListingBlock[] = [
    { kind: 'heading', label: 'SCENE' },
    { kind: 'item', item: { storyId: 'a', page: 120, title: 'First story', unread: true, bookmarked: false } },
    { kind: 'item', item: { storyId: 'b', page: 121, title: 'Second story', unread: false, bookmarked: false } },
  ];
  const layout = buildLayout(80, 24);
  const header = { left: 'CONTENTS', right: '2026-10-13' };
  const bare = buildListing(blocks, 'a', layout, header);
  const filled = buildListing(blocks, 'a', layout, header, options('CONTENTS'));
  onlyFillsBlanks(bare.spreads[0].map(rowText), filled.spreads[0].map(rowText));
  assert.notDeepStrictEqual(bare.spreads[0].map(rowText), filled.spreads[0].map(rowText), 'the empty column got a piece');
  // Exactly one piece, whole, in the right column; none under or between the entries on the left.
  const { margin, colWidth, gutter } = layout.geometry;
  const rowsOf = filled.spreads[0].map(rowText);
  const right = margin + colWidth + gutter;
  assert.ok(pieceInColumn(rowsOf, right, colWidth), 'the right column holds a whole piece');
  const bareRows = bare.spreads[0].map(rowText);
  rowsOf.forEach((row, r) => assert.strictEqual(row.slice(0, right - gutter), bareRows[r].slice(0, right - gutter), `row ${r}: the list column is clean`));
  assert.deepStrictEqual(filled.grid, bare.grid, 'filler rows are no entry: the grid is the same');
  assert.deepStrictEqual(filled.itemIds, bare.itemIds);
  assert.deepStrictEqual(filled.spreadFirst, bare.spreadFirst);
  assert.strictEqual(filled.selectedSpread, bare.selectedSpread);
}

// ---- the override ------------------------------------------------------------

export async function theSysopsFillDirectoryBeatsTheShippedOneWhenItHoldsPieces(): Promise<void> {
  const root = tmpDir();
  const mine = path.join(root, 'fill');
  fs.mkdirSync(mine);
  fs.writeFileSync(path.join(mine, 'mine.txt'), Buffer.from('  /\\_/\\\n ( o.o )\n  > ^ <  \xa9Mt\n', 'latin1'));
  const got = loadFiller(sources(root), false);
  assert.deepStrictEqual(got.map((p) => p.file), ['mine.txt'], 'the sysop set replaces the shipped one');
  assert.strictEqual(got[0].signed, true);
  fs.rmSync(path.join(mine, 'mine.txt'));
  assert.strictEqual(loadFiller(sources(root), false).length, 65, 'an empty override directory falls back to the shipped pieces');
  assert.strictEqual(loadFiller({ overrideDir: root, shippedDir: null }, false).length, 0, 'no shipped art, no override: no filler');
}

export async function aFileThatIsNotPlainPrintableArtIsNotAPiece(): Promise<void> {
  assert.strictEqual(parsePiece('a.txt', Buffer.from('\x1b[31mred\n', 'latin1')), null, 'an escape sequence');
  assert.strictEqual(parsePiece('b.txt', Buffer.from('\n\n', 'latin1')), null, 'blank');
  assert.ok(parsePiece('c.txt', Buffer.from(' x\n  y\n\n', 'latin1')));
}

// ---- PETSCII -------------------------------------------------------------------

export async function sixtyTwoOfSixtyFivePiecesMapThroughThePetsciiTransducer(): Promise<void> {
  assert.strictEqual(ALL.filter((p) => p.petsciiOk).length, 62);
  const bad = ALL.filter((p) => !p.petsciiOk).map((p) => p.file).sort();
  assert.deepStrictEqual(bad, ['mortimer_06.txt', 'mortimer_14.txt', 'mortimer_45.txt']);
  assert.strictEqual(petsciiMappable('\u00b6'), false, 'the pilcrow has no C64 shape');
  assert.strictEqual(petsciiMappable('\\_|{}~`\u00a9\u00b7'), true, 'the ASCII-art staples map');
}

export async function aPetsciiCallerIsOnlyEverOfferedPiecesThatMap(): Promise<void> {
  const c64 = loadFiller(sources(), true);
  assert.strictEqual(c64.length, 62);
  assert.ok(c64.every((p) => p.petsciiOk));
  const layout = buildLayout(40, 25);
  assert.strictEqual(layout.geometry.cols, 1);
  const filled = buildArticle(SHORT, layout, [], options(SHORT.id, c64));
  const bare = buildArticle(SHORT, layout);
  const rows = filled.spreads[0].map(rowText);
  onlyFillsBlanks(bare.spreads[0].map(rowText), rows);
  assert.ok(rows.join('').length > 0);
  for (const row of rows) assert.ok(row.length <= 40, `"${row}" fits forty columns`);
  assert.ok(petsciiMappable(rows.join('\n')), 'every glyph on the 40-column page maps');
  assert.notDeepStrictEqual(rows, bare.spreads[0].map(rowText), 'forty columns gets a piece too');
}
