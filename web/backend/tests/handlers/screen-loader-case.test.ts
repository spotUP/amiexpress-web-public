/**
 * Regression test for screen-loader filename-variant ordering.
 *
 * Bug: on the production Linux Alpine container, the live volume had
 *   /app/data/bbs/Screens/BBSTITLE.TXT  (stale, May 4)
 *   /app/data/bbs/Screens/BBSTITLE.txt  (current, May 17)
 *
 * The variant list put `.TXT` (uppercase) before `.txt`, so the loader
 * picked the stale uppercase file. The stale file lacked the trailing
 * `~SMC|` slow-mode-clear MCI, so slowmo stayed engaged through render
 * and the BBSTITLE wrap path emitted hide-cursor + cursor-home after
 * the art; the login prompt then printed inside the ASCII banner.
 *
 * Driven through the REAL loadScreenFile on a temp board. macOS' APFS is
 * case-insensitive, so the two twins cannot both exist in a tmp dir - but
 * what a case-sensitive volume does is LIST both, in whatever order its
 * directory hashing gives. `fs.readdirSync` is therefore made to list the
 * stale uppercase twin FIRST for the board's node directory, which is the
 * failing order on Linux. (The old header said amigafs.existsSync could not
 * be redefined; jest.mock replaces the module a src file imports, sealed
 * namespace or not, and the loader's choice is made by the listing anyway.)
 *
 * WHAT THIS FOUND (2026-09-28, source-pin conversion P47): the property does
 * NOT hold, and the variant order the old source pins checked decides
 * nothing. Every lookup goes through amigafs.findCaseInsensitive, which looks
 * the LOWERCASED name up in a listing that keeps the FIRST entry per
 * lowercased name (amigafs.ts listingOf, "First wins") - so 'BBSTITLE.txt'
 * and 'BBSTITLE.TXT' are one key, answered by whichever twin the volume lists
 * first. The security-screen lookup ahead of the variant list also asks for
 * `.TXT` first. Swapping the pinned literals stays green; a fix that prefers
 * the lowercase twin in findCaseInsensitive turns both tests below red. They
 * are `it.failing` until the loader is fixed - when they start passing, jest
 * reports them, and they become plain `it`.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// The node directory a case-sensitive volume would list with both twins.
let mockTwinDir = '';
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    readdirSync: (dir: any, ...rest: any[]) => {
      const entries = actual.readdirSync(dir, ...rest);
      if (mockTwinDir && String(dir) === mockTwinDir && rest.length === 0) {
        // Stale uppercase twin first, then what is really there.
        const twins = entries
          .filter((e: string) => /\.txt$/.test(e))
          .map((e: string) => e.replace(/\.txt$/, '.TXT'));
        return [...twins, ...entries];
      }
      return entries;
    },
  };
});

/**
 * The loader and what it reads, loaded AFTER the fs mock: tests/setup.ts
 * imports src/database, which caches amigafs with the real fs before any
 * test file's jest.mock is registered - so the registry is reset first.
 */
function freshLoader() {
  jest.resetModules();
  return {
    loadScreenFile: require('../../src/handlers/screen.handler').loadScreenFile,
    invalidateScreenIndex: require('../../src/screens/screen-index.service').invalidateScreenIndex,
    clearThemeRegistryCache: require('../../src/screens/theme-registry').clearThemeRegistryCache,
    config: require('../../src/config').config,
  };
}

describe('loadScreenFile — a stale uppercase twin never wins (regression)', () => {
  let root: string;
  let previousDataDir: string;
  let loader: ReturnType<typeof freshLoader>;

  beforeEach(() => {
    loader = freshLoader();
    const { config, clearThemeRegistryCache, invalidateScreenIndex } = loader;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-twins-'));
    previousDataDir = config.get('dataDir');
    config.set('dataDir', root);
    fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
    fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Node1', 'BBSTITLE.txt'), 'CURRENT TITLE ~SMC|\r\n', 'latin1');
    fs.writeFileSync(path.join(root, 'Node1', 'AWAITSCREEN.txt'), 'CURRENT AWAIT\r\n', 'latin1');
    mockTwinDir = path.join(root, 'Node1');
    clearThemeRegistryCache();
    invalidateScreenIndex();
  });
  afterEach(() => {
    const { config, clearThemeRegistryCache, invalidateScreenIndex } = loader;
    mockTwinDir = '';
    config.set('dataDir', previousDataDir);
    fs.rmSync(root, { recursive: true, force: true });
    clearThemeRegistryCache();
    invalidateScreenIndex();
  });

  const caller = (): any => ({ nodeId: 1, currentConf: 1, ansiEnabled: true, screenWidth: 80, screenHeight: 24, tempData: {} });

  it('the loader sees the twin listing (harness check: the screen is found)', () => {
    for (const name of ['BBSTITLE', 'AWAITSCREEN']) {
      const loaded = loader.loadScreenFile(name, 1, 1, caller());
      expect(loaded).not.toBeNull();
      expect(path.basename(loaded!.filePath).toLowerCase()).toBe(`${name.toLowerCase()}.txt`);
    }
  });

  it.failing('BBSTITLE: the lowercase .txt is served, not a .TXT twin listed first', () => {
    expect(path.basename(loader.loadScreenFile('BBSTITLE', 1, 1, caller())!.filePath)).toBe('BBSTITLE.txt');
  });

  it.failing('AWAITSCREEN: the lowercase .txt is served, not a .TXT twin listed first', () => {
    expect(path.basename(loader.loadScreenFile('AWAITSCREEN', 1, 1, caller())!.filePath)).toBe('AWAITSCREEN.txt');
  });
});
