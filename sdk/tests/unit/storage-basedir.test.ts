/**
 * Door data must survive a redeploy: inside the production container the
 * default base is the shared volume root, everywhere else the cwd.
 *
 * A WHIP task list lived at <cwd>/data (the image layer) and every
 * container recreate wiped it (2026-09-09). The default below is what
 * keeps data/doors/<door> on the volume in prod and unchanged in dev.
 */
import { defaultBaseDir } from '../../src/core/Storage';

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
});
