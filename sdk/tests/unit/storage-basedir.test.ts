/**
 * Door data must survive a redeploy: inside the production container the
 * default base is the shared volume root, everywhere else the cwd.
 *
 * A WHIP task list lived at <cwd>/data (the image layer) and every
 * container recreate wiped it (2026-09-09). The default below is what
 * keeps data/doors/<door> on the volume in prod and unchanged in dev.
 *
 * The SHIPPED path, not `src/core/Storage`: doors import
 * `@amiexpress/bbs-door-sdk/core`, which resolves to `dist/core/index.js`,
 * built from `core/Storage.ts`. This suite used to import the OTHER copy -
 * `src/**` is not even in tsconfig's include list - so deleting
 * `defaultBaseDir` from the file that actually ships left it green
 * (2026-09-13). `src/core/Storage.ts` is now a re-export of this module,
 * and the identity check below pins that.
 */
import { defaultBaseDir } from '../../core/Storage';
import * as legacyStorage from '../../src/core/Storage';

describe('defaultBaseDir', () => {
  const saved = process.env.BBS_DATA_DIR;
  afterEach(() => {
    if (saved === undefined) delete process.env.BBS_DATA_DIR;
    else process.env.BBS_DATA_DIR = saved;
  });

  it('uses the volume root when BBS_DATA_DIR points inside it', () => {
    process.env.BBS_DATA_DIR = '/app/data/bbs';
    expect(defaultBaseDir()).toBe('/app/data');
  });

  it('uses the cwd anywhere else', () => {
    delete process.env.BBS_DATA_DIR;
    expect(defaultBaseDir()).toBe(process.cwd());
  });

  it('ignores a BBS_DATA_DIR that is not a bbs dir', () => {
    process.env.BBS_DATA_DIR = '/somewhere/else';
    expect(defaultBaseDir()).toBe(process.cwd());
  });

  it('is the same function the legacy src/core path hands out', () => {
    // Not "behaves the same" - the SAME function object. Two copies of this
    // rule is how the guard came to protect a file nothing ships.
    expect(legacyStorage.defaultBaseDir).toBe(defaultBaseDir);
  });
});
