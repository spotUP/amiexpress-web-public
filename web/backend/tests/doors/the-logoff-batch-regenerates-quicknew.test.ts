/**
 * THE LOGOFF BATCH REGENERATES QUICKNEW AGAIN.
 *
 * Every logoff batch on the live board had been logging
 * `Skipping missing program: doors:quicknew/quicknew` - the 68K binary is
 * not shipped, and the TypeScript generator that replaced it was deleted by
 * an unrelated commit along with the batch intercept that called it. The
 * quicknew screen showed 00 files for months. "re-enable quicknew" (sysop,
 * 2026-09-15).
 *
 * Driven through `runBatchFile` on a real batch file, with the generator
 * module mocked: what is pinned is that the Amiga line reaches the
 * generator with its config, its day count and its stdout redirect, instead
 * of being skipped as a missing program.
 *
 * AND THAT THE PATHS ARE THE VOLUME'S, NOT THE LINE'S. The batch line says
 * `doors:quicknew/quicknew.config1` and `bbs:screens/quicknew.txt`; the
 * volume holds `Doors/QuickNew/QuickNew.Config1` and `Screens/`. A resolver
 * that keeps the line's case reads a config that is not there and writes a
 * lowercase `screens/quicknew.txt` beside the real one - which is exactly
 * what the live volume held on 2026-09-15 (two 0-byte files in `screens/`),
 * with the loader's case-insensitive walk free to serve either directory.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * The live volume is Linux and case-sensitive; this test may run on a Mac
 * whose filesystem is not, where `existsSync('Doors/quicknew')` says yes
 * for `Doors/QuickNew` and the resolver's fast path never walks. Make
 * `existsSync` answer the way the live disk does - a name exists only in
 * the case the directory listing spells it - so the real resolver runs the
 * real walk here too.
 */
jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  const nodePath = jest.requireActual<typeof import('path')>('path');
  const existsCaseSensitively = (target: string): boolean => {
    const parts = nodePath.resolve(String(target)).split(nodePath.sep).filter(Boolean);
    let current: string = nodePath.sep;
    for (const part of parts) {
      let entries: string[];
      try { entries = actual.readdirSync(current); } catch { return false; }
      if (!entries.includes(part)) return false;
      current = nodePath.join(current, part);
    }
    return true;
  };
  return { ...actual, existsSync: existsCaseSensitively };
});

const generate = jest.fn(async () => 'screen');
jest.mock('../../src/utils/quicknew-generator', () => ({
  generateQuickNewFromConfig: (...args: unknown[]) => generate(...(args as [])),
}));
// The board root is read at call time, so the test can point it at a
// directory it lays out itself.
jest.mock('../../src/config', () => ({
  config: {
    getConfig: () => ({ dataDir: process.env.BBS_DATA_DIR }),
    get: (k: string) => (k === 'dataDir' ? process.env.BBS_DATA_DIR : undefined),
  },
}));

// tests/setup.ts has already loaded modules that reach amigafs, and those
// hold the REAL fs. A fresh registry makes the scheduler, and the amigafs
// under it, bind to the mocked one above.
const loadScheduler = (): typeof import('../../src/services/batch-scheduler') => {
  jest.resetModules();
  return require('../../src/services/batch-scheduler');
};

describe('the logoff batch regenerates quicknew', () => {
  it('hands the Amiga line to the generator, on the paths the volume spells', async () => {
    const { runBatchFile } = loadScheduler();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-quicknew-'));
    process.env.BBS_DATA_DIR = root;
    process.env.BBS_ROOT = root;
    // The volume's spelling.
    fs.mkdirSync(path.join(root, 'Doors', 'QuickNew'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Doors', 'QuickNew', 'QuickNew.Config1'), '\x1b[0m\n\x1b[35m\n0\n');
    fs.mkdirSync(path.join(root, 'Screens'));

    const batch = path.join(root, 'batch1');
    fs.writeFileSync(batch, [
      '.key node',
      '; a comment stays a comment',
      // The live line, verbatim (batch4/5/6 on the board, 2026-09-15).
      'doors:quicknew/quicknew doors:quicknew/quicknew.config1 7 >bbs:screens/quicknew.txt',
      '',
    ].join('\n'));

    await runBatchFile(batch, 1);

    expect(generate).toHaveBeenCalledTimes(1);
    const [configPath, daysBack, outputPath] = generate.mock.calls[0] as unknown as [string, number, string];
    expect(daysBack).toBe(7);
    // The config that exists, not the one the line spelled.
    expect(configPath).toBe(path.join(root, 'Doors', 'QuickNew', 'QuickNew.Config1'));
    // Into the Screens/ the loader reads, never a lowercase twin beside it.
    expect(outputPath).toBe(path.join(root, 'Screens', 'quicknew.txt'));
    expect(fs.existsSync(path.join(root, 'screens'))).toBe(false);
  });
});
