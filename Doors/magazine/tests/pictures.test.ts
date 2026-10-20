/** M9: pictures set at their anchor in buildArticle, at the three widths. */
import assert from 'node:assert';
import type { Story, StoryMediaSidecar } from '@amiexpress/bbs-door-sdk/formats/magazine';
import { renderingKey, sidecarSizes } from '@amiexpress/bbs-door-sdk/formats/magazine';
import { buildArticle, buildLayout, rowText } from '../layout';

const STORY: Story = {
  id: 'p1',
  headline: 'A story with a picture',
  summary: '',
  body: 'First paragraph of the story.\n\nSecond paragraph of the story.\n\nThird paragraph of the story.',
  format: 'NEWS',
  desk: 'scene',
  date: '2026-10-19',
  source: 'example.org',
  url: 'https://example.org/a',
  firstSeen: '2026-10-19',
  seenCount: 1,
  media: [{ url: 'https://example.org/a.png', kind: 'image', alt: '', site: 'example.org', anchor: 1 }],
};

/** A sidecar with a solid picture at every column size, `mark` as its glyph. */
function sidecar(): StoryMediaSidecar {
  const renderings: StoryMediaSidecar['pictures'][0]['renderings'] = {};
  for (const size of sidecarSizes()) {
    if (size.placement !== 'column') continue;
    const row = size.terminal === 'petscii'
      ? Buffer.from([0x05, ...Array(size.cols).fill(0x41)]).toString('base64')
      : '\x1b[0;37;40m' + 'X'.repeat(size.cols) + '\x1b[0m';
    renderings[renderingKey(size.terminal, size.cols, 'column')] = { cols: size.cols, rows: [row, row, row] };
  }
  return { version: 1, pictures: [{ media: 0, url: STORY.media![0].url, renderings }] };
}

function allText(story: Story, width: number, height: number, petscii: boolean, withSidecar = true): string[] {
  const layout = buildLayout(width, height);
  const article = buildArticle(story, layout, [], undefined, { sidecar: withSidecar ? sidecar() : null, petscii });
  return article.spreads.flatMap((s) => s.map(rowText));
}

export async function pictureSitsAfterItsAnchorParagraphWithACreditLine(): Promise<void> {
  for (const [width, height, petscii] of [[80, 24, false], [132, 40, false], [40, 25, true]] as const) {
    const rows = allText(STORY, width, height, petscii);
    const joined = rows.join('\n');
    const first = rows.findIndex((r) => r.includes('First paragraph'));
    const second = rows.findIndex((r) => r.includes('Second paragraph'));
    const credit = rows.findIndex((r) => r.includes('>> IMG example.org  [V] view'));
    const pic = rows.findIndex((r) => r.includes(petscii ? 'aaaa' : 'XXXX'));
    assert.ok(first >= 0 && second >= 0, `${width}: text present`);
    assert.ok(credit >= 0, `${width}: credit line present`);
    assert.ok(pic >= 0, `${width}: picture rows present`);
    assert.ok(joined.includes('Third paragraph'));
  }
}

export async function pictureIsInsideOneColumnBetweenItsParagraphs(): Promise<void> {
  // One column at 40: strictly ordered first < picture < credit < second.
  const rows = allText(STORY, 40, 25, true);
  const idx = (needle: string): number => rows.findIndex((r) => r.includes(needle));
  assert.ok(idx('First paragraph') < idx('aaaa') && idx('aaaa') < idx('[V] view') && idx('[V] view') < idx('Second paragraph'));
}

export async function aVideoCreditSaysPlay(): Promise<void> {
  const story: Story = { ...STORY, media: [{ ...STORY.media![0], kind: 'video' }] };
  assert.ok(allText(story, 40, 25, true).some((r) => r.includes('>> VIDEO example.org  [V] play')));
}

export async function aStoryWithoutMediaOrSidecarRendersAsToday(): Promise<void> {
  const plain: Story = { ...STORY, media: undefined };
  for (const [width, height, petscii] of [[80, 24, false], [132, 40, false], [40, 25, true]] as const) {
    const layout = buildLayout(width, height);
    const today = buildArticle(plain, layout).spreads.map((s) => s.map(rowText));
    const withMediaArg = buildArticle(plain, layout, [], undefined, { sidecar: sidecar(), petscii }).spreads.map((s) => s.map(rowText));
    const noSidecar = buildArticle(STORY, layout, [], undefined, { sidecar: null, petscii }).spreads.map((s) => s.map(rowText));
    assert.deepStrictEqual(withMediaArg, today, `${width}: media argument changes nothing without story media`);
    assert.deepStrictEqual(noSidecar, today, `${width}: media without a sidecar renders as today`);
    const failed: Story = { ...STORY, media: [{ ...STORY.media![0], failure: 'gone' }] };
    assert.deepStrictEqual(buildArticle(failed, layout, [], undefined, { sidecar: sidecar(), petscii }).spreads.map((s) => s.map(rowText)), today);
  }
}

/** The sidecar above plus a span rendering `cols` wide, `rows` tall, glyph `S`. */
function spanSidecar(cols: number, rows: number): StoryMediaSidecar {
  const s = sidecar();
  const row = '\x1b[0;37;40m' + 'S'.repeat(cols) + '\x1b[0m';
  s.pictures[0].renderings[renderingKey('ansi', cols, 'span')] = { cols, rows: Array(rows).fill(row) };
  return s;
}

const LONG: Story = {
  ...STORY,
  body: Array.from({ length: 8 }, (_, i) => `Paragraph ${i + 1} of the story runs long enough to wrap over several column lines here.`).join('\n\n'),
};

export async function aSpanPictureCrossesBothColumnsWithItsCreditUnderIt(): Promise<void> {
  // Sysop choice 2026-10-20: at two columns a picture spans the page.
  const layout = buildLayout(80, 24);
  const w = layout.geometry.contentWidth;
  const article = buildArticle(LONG, layout, [], undefined, { sidecar: spanSidecar(w, 6), petscii: false });
  const rows = article.spreads.flatMap((s) => s.map(rowText));
  const band = rows.map((r, i) => [r, i] as const).filter(([r]) => r.includes('SSSS'));
  assert.strictEqual(band.length, 6, 'one band of six rows');
  for (const [r] of band) assert.strictEqual((r.match(/S/g) ?? []).length, w, 'band row is the full content width');
  assert.ok(!rows.some((r) => r.includes('XXXX')), 'no column picture as well');
  const last = band[band.length - 1][1];
  assert.ok(rows[last + 1].includes('>> IMG example.org  [V] view'), 'credit directly under the band');
  for (const r of rows) assert.ok(r.length <= 80, `row fits the screen: ${r.length}`);
  const spread = article.pictures.findIndex((p) => p.includes(0));
  assert.ok(spread >= 0 && article.spreads[spread].map(rowText).some((r) => r.includes('SSSS')), 'Article.pictures names the band spread');
}

export async function aNarrowSpanPictureIsCentred(): Promise<void> {
  const layout = buildLayout(80, 24);
  const w = layout.geometry.contentWidth;
  const rows = buildArticle(LONG, layout, [], undefined, { sidecar: spanSidecar(31, 6), petscii: false }).spreads.flatMap((s) => s.map(rowText));
  const r = rows.find((x) => x.includes('SSSS'))!;
  const start = r.indexOf('S');
  const pad = r.length - r.trimEnd().length;
  assert.strictEqual((r.match(/S/g) ?? []).length, 31);
  assert.ok(Math.abs(start - layout.geometry.margin - (w - 31) / 2) <= 1, `centred, starts at ${start}`);
  assert.ok(pad >= 0);
}

export async function textBeforeTheBandIsBalancedAcrossColumns(): Promise<void> {
  // The anchor paragraph sits before the band; its spread is not one full
  // left column and an empty right one.
  const layout = buildLayout(80, 24);
  const article = buildArticle(LONG, layout, [], undefined, { sidecar: spanSidecar(layout.geometry.contentWidth, 6), petscii: false });
  const rows = article.spreads.flatMap((s) => s.map(rowText));
  const bandAt = rows.findIndex((r) => r.includes('SSSS'));
  const colStart = layout.geometry.margin + layout.geometry.colWidth + layout.geometry.gutter;
  const before = rows.slice(0, bandAt).filter((r) => r.includes('Paragraph') || r.includes('story'));
  assert.ok(before.length > 0, 'text before the band');
  assert.ok(before.some((r) => r.slice(colStart).trim().length > 0), 'right column holds part of the text before the band');
}

export async function oneColumnAndPetsciiKeepTheColumnPicture(): Promise<void> {
  for (const [width, height, petscii] of [[40, 25, true], [40, 25, false]] as const) {
    const layout = buildLayout(width, height);
    const rows = buildArticle(LONG, layout, [], undefined, { sidecar: spanSidecar(77, 6), petscii }).spreads.flatMap((s) => s.map(rowText));
    assert.ok(!rows.some((r) => r.includes('SSSS')), `${width}/${petscii}: no span band`);
    assert.ok(rows.some((r) => r.includes(petscii ? 'aaaa' : 'XXXX')), `${width}/${petscii}: column picture`);
  }
}
