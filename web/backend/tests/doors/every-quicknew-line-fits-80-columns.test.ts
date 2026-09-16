/**
 * EVERY QUICKNEW LINE FITS 80 COLUMNS.
 *
 * "fix it's output for 80 columns" (sysop, 2026-09-15). The header carries
 * the area title inside the config's own prose, and a long title -
 * "Abandoned Applications" on this board - ran past 80; the live screen had
 * been hand-wrapped to fit. The generator now folds header and stats at a
 * space, escapes intact, with the SDK's wrapper.
 *
 * Driven through `generateQuickNewFromConfig` on the board's REAL config
 * (the reference-boardBBS QuickNew.Config1 shipped under Documentation), with the
 * database and disk lookups stubbed to "no files": the shape under test is
 * the header, and the header is what the config dictates.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'quicknew-width-'));

jest.mock('../../src/database', () => ({
  db: { getFileAreas: async () => [], getFileEntries: async () => [] },
}));
jest.mock('../../src/services/file-areas-loader', () => ({
  loadConferenceFileAreas: () => [],
}));
jest.mock('../../src/config', () => ({
  config: { getConfig: () => ({ dataDir: tmp }), get: (k: string) => (k === 'dataDir' ? tmp : undefined) },
}));

import { generateQuickNewFromConfig } from '../../src/utils/quicknew-generator';

/*
 * A FROZEN COPY of the reference-boardBBS config, not the one under Documentation.
 *
 * That file is not tracked by git - it is on this disk because this checkout
 * IS the live board - so a committed test reading it is green here and
 * impossible in CI (tests/repo/tracked-fixtures). The bytes matter to this
 * suite (the long "Abandoned Applications" title is what used to run past 80),
 * so they are frozen here rather than rebuilt approximately in the test.
 */
const REAL_CONFIG = path.join(
  __dirname, '..', 'fixtures', 'doors', 'reference-board-quicknew.config1',
);

/** Columns a terminal would advance by: escapes are free. */
const printable = (line: string) => line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\f/g, '').length;

describe('every quicknew line fits 80 columns', () => {
  it('folds the long-titled header rather than running past 80', async () => {
    const configCopy = path.join(tmp, 'QuickNew.Config1');
    fs.copyFileSync(REAL_CONFIG, configCopy);
    const out = path.join(tmp, 'quicknew.txt');

    const text = await generateQuickNewFromConfig(configCopy, 7, out);
    expect(text).not.toBeNull();

    const lines = (text as string).split(/\r?\n/);
    const tooWide = lines.filter(l => printable(l) > 80)
      .map(l => `${printable(l)}: ${l.replace(/\x1b/g, 'ESC')}`);
    // Before the fix this held the "Abandoned Applications" header at 88.
    expect(tooWide).toEqual([]);

    // And the title is still whole on one line - the fold lands at the seam
    // between the title and the counts, where the sysop's hand-wrap did.
    const titleLine = lines.find(l => l.includes('Abandoned Applications'));
    if (!titleLine) {
      // Show what the fold produced around the title, so a failure names it.
      console.log(lines.filter(l => /Abandoned|Applications/.test(l)).map(l => `${printable(l)}: ${l.replace(/\x1b/g, 'ESC')}`).join('\n'));
    }
    expect(titleLine).toBeDefined();
    expect(printable(titleLine as string)).toBeLessThanOrEqual(80);
    const after = lines[lines.indexOf(titleLine as string) + 1].replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
    expect(after).toMatch(/^\s+\(Files: /);
    expect(fs.existsSync(out)).toBe(true);
  });
});
