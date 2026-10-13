/**
 * The reader's rows across the three screens: pinned at 80x24, within 40
 * columns on a C64, three columns at 132. Pure - no terminal.
 */
import assert from 'node:assert';
import type { Story } from '@amiexpress/bbs-door-sdk/formats/magazine';
import {
  buildArticle,
  buildAwaitingEditor,
  buildLayout,
  buildListing,
  buildNotice,
  buildProgress,
  headerLine,
  rowText,
  signalStrength,
  signalTag,
  tickerText,
  type ListingBlock,
} from '../layout';

const STORY: Story = {
  id: 'a1',
  headline: 'Skaven releases Copper Lights, a new 64k intro for the Amiga',
  summary: 'The Amiga demoscene has a new release this week. It runs on a stock A500 with half a megabyte, and the group says the copper bars are the cleanest they have shipped in years.\n\nA second paragraph explains how the music was composed in a tracker and ported to the player.',
  format: 'RELEASE',
  desk: 'scene',
  date: '2026-10-13',
  source: 'demozoo.org',
  url: 'https://demozoo.org/productions/1/',
  firstSeen: '2026-10-13',
  seenCount: 1,
};

const WIDTHS: Array<[number, number]> = [[40, 25], [80, 24], [132, 40]];

export async function regionsArePinnedAtEightyByTwentyFour(): Promise<void> {
  const l = buildLayout(80, 24);
  assert.deepStrictEqual(
    { h: l.headerRow, t: l.tickerRow, p: l.panelTop, ph: l.panelHeight, pr: l.progressRow, f: l.footerRow, e: l.effects },
    { h: 0, t: 1, p: 2, ph: 20, pr: 22, f: 23, e: true },
  );
  assert.deepStrictEqual(l.geometry, { cols: 2, colWidth: 37, gutter: 3, margin: 1, contentWidth: 77 });
}

export async function fortyColumnsHasOneColumnOneChromeRowAndNoEffects(): Promise<void> {
  const l = buildLayout(40, 25);
  assert.strictEqual(l.effects, false, 'effects are off at 40');
  assert.strictEqual(l.tickerRow, null, 'no ticker row at 40');
  assert.strictEqual(l.geometry.cols, 1);
  assert.strictEqual(l.collapseChrome, true);
  assert.strictEqual(l.panelTop, 1, 'the panel starts right under the single header row');
  assert.strictEqual(l.footerRow, 24);
}

export async function wideScreenSetsThreeColumns(): Promise<void> {
  const l = buildLayout(132, 40);
  assert.strictEqual(l.geometry.cols, 3);
  assert.ok(l.geometry.colWidth <= 38, 'a wide screen gets margins, not longer lines');
}

export async function theSysopCanTurnTheTickerOff(): Promise<void> {
  const l = buildLayout(80, 24, { ticker: false });
  assert.strictEqual(l.tickerRow, null);
  assert.strictEqual(l.panelTop, 1);
  assert.strictEqual(l.panelHeight, 21);
}

export async function everyArticleRowFitsItsScreenAndEverySpreadFillsThePanel(): Promise<void> {
  for (const [w, h] of WIDTHS) {
    const l = buildLayout(w, h);
    const a = buildArticle({ ...STORY, summary: STORY.summary.repeat(30) }, l);
    assert.ok(a.spreads.length > 1, `${w}: a long story takes more than one spread`);
    for (const spread of a.spreads) {
      assert.strictEqual(spread.length, l.panelHeight, `${w}: a spread is exactly the panel`);
      for (const row of spread) {
        assert.ok(rowText(row).length <= w, `${w}: "${rowText(row)}" is ${rowText(row).length} wide`);
      }
    }
  }
}

export async function articleBodyIsSetInColumnsAtTheScreensCount(): Promise<void> {
  for (const [w, h, cols] of [[40, 25, 1], [80, 24, 2], [132, 40, 3]] as const) {
    const l = buildLayout(w, h);
    const a = buildArticle({ ...STORY, summary: STORY.summary.repeat(4) }, l);
    const body = rowText(a.spreads[0][5]);
    assert.strictEqual((body.match(/│/g) ?? []).length, cols - 1, `${w}: column rules`);
  }
}

export async function articleAtEightyIsPinned(): Promise<void> {
  const l = buildLayout(80, 24);
  const rows = buildArticle(STORY, l).spreads[0].map(rowText);
  assert.deepStrictEqual(rows.slice(0, 11), [
    ' [ RELEASE // SCENE // 2026-10-13 ]                                           ',
    ' SKAVEN RELEASES COPPER LIGHTS, A NEW 64K INTRO FOR THE AMIGA                 ',
    ' ─'.slice(0, 1) + '─'.repeat(77),
    ' The Amiga demoscene has a new release │ A second paragraph explains how the  ',
    ' this week. It runs on a stock A500    │ music was composed in a tracker and  ',
    ' with half a megabyte, and the group   │ ported to the player.                ',
    ' says the copper bars are the cleanest │                                      ',
    ' they have shipped in years.           │ >> SRC demozoo.org                   ',
    '                                       │ https://demozoo.org/productions/1/   ',
    '                                       │                                      ',
    '                                       │                                      ',
  ]);
}

export async function headlineRowsAreReportedForTheOneShotGlitch(): Promise<void> {
  const l = buildLayout(40, 25);
  const a = buildArticle(STORY, l);
  assert.strictEqual(a.headlineRow, 1);
  assert.strictEqual(a.headlineRows, 2, 'the 40-column headline wraps onto two rows');
}

export async function aVeryLongHeadlineIsCutAtThreeRows(): Promise<void> {
  const l = buildLayout(40, 25);
  const a = buildArticle({ ...STORY, headline: 'word '.repeat(60) }, l);
  assert.strictEqual(a.headlineRows, 3);
  assert.ok(rowText(a.spreads[0][3]).trimEnd().endsWith('..'));
}

export async function laterSpreadsCarryARunningHeadInsteadOfTheFullHeadline(): Promise<void> {
  const l = buildLayout(80, 24);
  const a = buildArticle({ ...STORY, summary: STORY.summary.repeat(10) }, l);
  assert.ok(rowText(a.spreads[1][0]).startsWith(' SKAVEN RELEASES'));
  assert.ok(!rowText(a.spreads[1][0]).includes('[ RELEASE'), 'the signal tag is for the opening spread');
}

export async function signalTagIsBracketedAndUndatedStoriesSayUndated(): Promise<void> {
  assert.strictEqual(signalTag(STORY), '[ RELEASE // SCENE // 2026-10-13 ]');
  assert.strictEqual(signalTag({ ...STORY, date: '' }), '[ RELEASE // SCENE // UNDATED ]');
}

const BLOCKS: ListingBlock[] = [
  { kind: 'heading', label: 'HACKING & PHREAKING' },
  { kind: 'item', item: { storyId: 'a', page: 120, title: 'First hack story', unread: true, bookmarked: false } },
  { kind: 'item', item: { storyId: 'b', page: 121, title: 'A much longer second headline that has to wrap onto a second row of the contents', unread: false, bookmarked: true } },
  { kind: 'heading', label: 'SCENE & RETRO' },
  { kind: 'item', item: { storyId: 'c', page: 200, title: 'Scene item', unread: true, bookmarked: false } },
];

export async function listingEntriesHaveTheTitleLeftAndAThreeDigitPageRight(): Promise<void> {
  const l = buildLayout(40, 25);
  const rows = buildListing(BLOCKS, 'a', l, { left: 'CONTENTS', right: '2026-10-13' }).spreads[0].map(rowText);
  const entry = rows.find((r) => r.includes('First hack story'))!;
  assert.ok(entry.startsWith(' >First hack story'), `selected entry carries the mark: "${entry}"`);
  assert.ok(entry.trimEnd().endsWith(' 120'), 'page number right-aligned');
  for (const r of rows) assert.ok(r.length <= 40, `"${r}" fits 40`);
  assert.ok(rows.some((r) => r.includes('─ HACKING & PHREAKING ─')), 'heading centred between rules');
  assert.ok(rows.some((r) => r.includes('* A much longer')), 'bookmarked entries are starred');
}

export async function listingHeaderCarriesTheViewAndTheEdition(): Promise<void> {
  const l = buildLayout(80, 24);
  const head = rowText(buildListing(BLOCKS, 'a', l, { left: 'CONTENTS - ALL SECTIONS', right: 'SIGNAL x  2026-10-13' }).spreads[0][0]);
  assert.ok(head.includes('CONTENTS - ALL SECTIONS'));
  assert.ok(head.trimEnd().endsWith('2026-10-13'));
}

export async function listingFindsTheSpreadOfTheSelectionAndTheFirstItemOfEachSpread(): Promise<void> {
  const many: ListingBlock[] = Array.from({ length: 60 }, (_, i) => ({
    kind: 'item' as const,
    item: { storyId: `s${i}`, page: 100 + i, title: `Story ${i}`, unread: true, bookmarked: false },
  }));
  const l = buildLayout(40, 25);
  const first = buildListing(many, 's0', l, { left: 'C', right: '' });
  assert.ok(first.spreads.length > 1);
  assert.strictEqual(first.selectedSpread, 0);
  const last = buildListing(many, 's59', l, { left: 'C', right: '' });
  assert.strictEqual(last.selectedSpread, last.spreads.length - 1);
  assert.strictEqual(last.spreadFirst[0], 's0');
  for (const s of last.spreads) assert.strictEqual(s.length, l.panelHeight);
}

export async function emptyFrontPageSaysAwaitingEditor(): Promise<void> {
  for (const [w, h] of WIDTHS) {
    const l = buildLayout(w, h);
    const rows = buildAwaitingEditor(l).map(rowText);
    assert.strictEqual(rows.length, l.panelHeight);
    assert.ok(rows.some((r) => r.includes('AWAITING EDITOR')), `${w}: AWAITING EDITOR is shown`);
    for (const r of rows) assert.ok(r.length <= w);
  }
}

export async function noticeCentresItsTitle(): Promise<void> {
  const rows = buildNotice(buildLayout(40, 25), 'NO BOOKMARKS YET', ['x']).map(rowText);
  const title = rows.find((r) => r.includes('NO BOOKMARKS YET'))!;
  assert.strictEqual(title.indexOf('N') - 1, 38 - title.trim().length - (title.indexOf('N') - 1), 'centred in the 38-column set text');
}

export async function progressFillsInProportionAndShowsTheCounterOnlyAtForty(): Promise<void> {
  const eighty = buildProgress(buildLayout(80, 24), 1, 4);
  assert.strictEqual(rowText(eighty).length, 79);
  assert.strictEqual(eighty[0].text.length, Math.round((79 * 2) / 4));
  assert.ok(!rowText(eighty).includes('/'), 'no counter at 80');
  const forty = buildProgress(buildLayout(40, 25), 1, 4);
  assert.ok(rowText(forty).endsWith(' 2/4'), 'the counter at 40');
  assert.ok(rowText(forty).length <= 40);
  const last = buildProgress(buildLayout(80, 24), 3, 4);
  assert.strictEqual(last.length, 1, 'the last spread fills the whole line');
}

export async function headerLineKeepsBothSidesOrDropsTheRight(): Promise<void> {
  assert.strictEqual(headerLine('L', 'R', 10), 'L        R');
  assert.strictEqual(headerLine('LONG LEFT TEXT', 'R', 10).length, 10);
}

export async function tickerAndSignalStrengthDegradeToNothingWithoutData(): Promise<void> {
  assert.strictEqual(tickerText([]), 'NO TRANSMISSIONS');
  assert.ok(tickerText(['One', 'Two']).includes('One  //  Two'));
  assert.strictEqual(signalStrength([3], () => 'x'), '');
  assert.strictEqual(signalStrength([1, 2], () => 'ab'), 'SIGNAL ab');
}

export async function leavesABlankRowBetweenConsecutiveHeadlines(): Promise<void> {
  const COUNT = 120;
  const many: ListingBlock[] = [
    { kind: 'heading', label: 'SCENE' },
    ...Array.from({ length: COUNT }, (_, i) => ({
      kind: 'item' as const,
      item: { storyId: `s${i}`, page: 100 + i, title: i % 3 === 0 ? `Story ${i} with a headline long enough to wrap onto a second row of the contents list` : `Story ${i}`, unread: true, bookmarked: false },
    })),
  ];
  for (const [w, h] of WIDTHS) {
    const l = buildLayout(w, h);
    const ls = buildListing(many, 's0', l, { left: 'C', right: '' });
    assert.ok(ls.spreads.length > 1, `${w}: paginates`);
    const { cols, colWidth, gutter, margin } = l.geometry;
    let firsts = 0;
    for (const spread of ls.spreads) {
      assert.strictEqual(spread.length, l.panelHeight, `${w}: spread height`);
      for (let c = 0; c < cols; c++) {
        const at = margin + c * (colWidth + gutter);
        const cells = spread.slice(1).map((r) => rowText(r).slice(at, at + colWidth));
        cells.forEach((cell, r) => {
          // An entry's first row: mark column, title, three-digit page.
          if (!/^[ >]\S/.test(cell) || !/\s\d{3}$/.test(cell.trimEnd()) || cell.includes('─')) return;
          firsts++;
          if (r === 0) return;
          const above = cells[r - 1];
          assert.ok(above.trim() === '' || above.includes('─'), `${w}: "${cell.trim()}" sits directly under "${above.trim()}"`);
        });
        // A two-row title is never cut across a column break.
        cells.forEach((cell, r) => {
          if (/^ \S/.test(cell) && !/\s\d{3}$/.test(cell.trimEnd())) {
            assert.ok(r > 0 && cells[r - 1].trim() !== '', `${w}: continuation row "${cell.trim()}" has lost its first row`);
          }
        });
      }
    }
    assert.strictEqual(firsts, COUNT, `${w}: every entry once`);
  }
}
