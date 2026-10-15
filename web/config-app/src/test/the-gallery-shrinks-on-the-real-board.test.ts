/**
 * THE GATE: the gallery shrinks on the board this was written for.
 *
 * Every other test in this batch builds its own two or three files. This one
 * runs the grouping over an index built from the LIVE board's 269 screens, so
 * a rule that works on a fixture and not on the real shape of this board fails
 * here.
 *
 * The numbers this work exists for, measured 2026-09-15 with the board's own
 * buildScreenIndex before anything was changed: 214 art files, 59
 * content-grouped cards, 44 distinct screen names. The gallery showed 59.
 *
 * The fixture is FACTS ONLY - paths, hashes, readers, flags. No bodies, so it
 * is 97 KB rather than 2.7 MB and carries none of the board's art into git.
 */
import { expect, it } from 'vitest';

import index from './fixtures/live-screen-index.json';
import { buildGalleryItems } from '../pages/screen-index-view';

const cards = () =>
  buildGalleryItems(index as never, { showGenerated: false, showUnread: false, theme: 'default' } as never);

it('shows fewer cards than there are versions', () => {
  const items = cards();

  // 59 was the count before the grouping; anything at or above it means the
  // fold did nothing on the real board whatever the unit tests say.
  expect(items.length).toBeLessThan(59);
  expect(items.length).toBeGreaterThan(0);
});

it('shows each screen once', () => {
  const items = cards();

  // One card per screen is the whole claim. A repeat here is the artist
  // scrolling past the same screen twice, which is what was reported.
  const keys = items.map(i => `${i.label}|${i.path.split('/').pop()?.toLowerCase()}`);
  expect(new Set(keys).size).toBe(keys.length);
});

it('shows no screen that is only directives', () => {
  const items = cards();
  const files = (index as { files: Record<string, { codesOnly?: boolean }> }).files;

  // 45 of the live board's files are codesOnly. An artist never needs to see
  // one: "the sysop would be interested in the mci codes etc but artist dont
  // even need to see them".
  expect(items.every(i => !files[i.path]?.codesOnly)).toBe(true);
});

it('still shows a bulletin that is art AND runs an include', () => {
  const items = cards();
  const files = (index as { files: Record<string, { program?: boolean; codesOnly?: boolean }> }).files;

  // 8 of the live board's files are both - 1745 bytes of ANSI logo with one
  // include at the end - which is exactly why `program` and `codesOnly`
  // cannot be one flag. They are art and must stay.
  expect(items.some(i => files[i.path]?.program && !files[i.path]?.codesOnly)).toBe(true);
});

it('reports drift where the board actually has it', () => {
  const items = cards();

  // The board really does have drifted screens; a run where nothing reports
  // versions would mean the counts never reached the card.
  const drifted = items.filter(i => (i.versions ?? 1) > 1);
  expect(drifted.length).toBeGreaterThan(0);
  for (const card of drifted) {
    expect(card.scopes).toBeGreaterThanOrEqual(0);
    expect(card.otherVersions?.length).toBe((card.versions ?? 1) - 1);
  }
});
