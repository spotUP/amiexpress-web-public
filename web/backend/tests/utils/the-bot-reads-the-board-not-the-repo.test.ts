/**
 * The co-sysop answered about the wrong board, and nothing looked wrong.
 *
 * Three call sites worked out where the board's files are, independently, and
 * two checked only BBS_ROOT before falling back to the repo tree. In the
 * container BBS_ROOT is empty and BBS_DATA_DIR is /app/data/bbs, so those
 * resolved to /app - which HAS a Conf1, the repo's own copy. No error, no
 * empty list: just a conference list, a bulletin and a door catalogue
 * belonging to the source tree rather than to the callers.
 */
import * as path from 'path';

import { boardRoot as importedBoardRoot } from '../../src/utils/board-root.util';
import { config } from '../../src/config';

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

/** boardRoot() as a process started with the current env would answer: config reads the env once, at load. */
function boardRoot(): string {
  let answer = '';
  jest.isolateModules(() => {
    answer = require('../../src/utils/board-root.util').boardRoot();
  });
  return answer;
}

describe('where the board is', () => {
  it('is the container volume when it is set - the case that was wrong', () => {
    process.env.BBS_DATA_DIR = '/app/data/bbs';
    delete process.env.BBS_ROOT;
    expect(boardRoot()).toBe('/app/data/bbs');
  });

  it('prefers the volume over a host override, because the volume is the board', () => {
    process.env.BBS_DATA_DIR = '/app/data/bbs';
    process.env.BBS_ROOT = '/somewhere/else';
    expect(boardRoot()).toBe('/app/data/bbs');
  });

  it('honours a host override when there is no volume', () => {
    delete process.env.BBS_DATA_DIR;
    process.env.BBS_ROOT = '/srv/board';
    expect(boardRoot()).toBe('/srv/board');
  });

  it('falls back to the repo tree in dev, where the checkout IS a board', () => {
    delete process.env.BBS_DATA_DIR;
    delete process.env.BBS_ROOT;
    // Four up from web/backend/src/utils is the repo root.
    expect(boardRoot()).toBe(path.resolve(__dirname, '../../../..'));
  });

  it('never leaves a trailing slash to double up in a join', () => {
    process.env.BBS_DATA_DIR = '/app/data/bbs/';
    expect(boardRoot()).toBe('/app/data/bbs');
  });
});

describe('one answer', () => {
  it('follows config.dataDir when it changes at runtime (admin, tests)', () => {
    const original = config.get.bind(config);
    jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? '/somewhere/chosen' : original(key as never)));
    try {
      expect(importedBoardRoot()).toBe('/somewhere/chosen');
    } finally {
      jest.restoreAllMocks();
    }
  });
});

describe('the sites that read it', () => {
  const src = (f: string) => require('fs').readFileSync(
    require('path').join(__dirname, '../../src', f), 'utf8');

  it('do not work it out for themselves any more', () => {
    for (const f of ['server/routes-setup.ts', 'handlers/operator-chat.handler.ts']) {
      const text = src(f);
      expect(text).toContain('boardRoot()');
      // The shape that was wrong: BBS_ROOT alone, then the repo tree.
      expect(text).not.toMatch(/process\.env\.BBS_ROOT \? path\.resolve/);
    }
  });
});
