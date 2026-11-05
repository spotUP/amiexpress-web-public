/**
 * With BBS_DATA_DIR and BBS_ROOT both unset, the board is <repo>/board.
 * config.ts reads the environment once at load, so the module is loaded fresh
 * (isolateModules) with the env cleared; boardRoot() must answer from it.
 */
import * as path from 'path';

describe('boardRoot() fallback', () => {
  const saved = { dir: process.env.BBS_DATA_DIR, root: process.env.BBS_ROOT };
  afterEach(() => {
    if (saved.dir === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = saved.dir;
    if (saved.root === undefined) delete process.env.BBS_ROOT; else process.env.BBS_ROOT = saved.root;
  });

  it('is <repo>/board when no environment names the board', () => {
    delete process.env.BBS_DATA_DIR;
    delete process.env.BBS_ROOT;
    let answer = '';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      answer = require('../../src/utils/board-root.util').boardRoot();
    });
    expect(answer).toBe(path.resolve(__dirname, '../../../../board'));
  });

  it('BBS_DATA_DIR still wins over the fallback', () => {
    process.env.BBS_DATA_DIR = '/tmp/some-board';
    delete process.env.BBS_ROOT;
    let answer = '';
    jest.isolateModules(() => {
      answer = require('../../src/utils/board-root.util').boardRoot();
    });
    expect(answer).toBe(path.resolve('/tmp/some-board'));
  });
});
