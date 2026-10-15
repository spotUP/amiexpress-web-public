/**
 * In the container BBS_ROOT is empty and BBS_DATA_DIR is /app/data/bbs. These
 * managers checked BBS_ROOT and fell back to the source tree, so on live they
 * read and wrote /app/Conf1/... - a copy baked into the image, emptied by every
 * deploy. R found "No new messages." in a conference holding ten (sysop
 * 2026-09-30, "r 1"), and anything the board's own editor saved went into the
 * container and was gone on the next deploy.
 *
 * utils/board-root.util is the one answer; every manager asks it.
 */
import * as path from 'path';

const DATA = path.resolve('/tmp/board-volume-under-test');

function rootOf(modulePath: string, exportName: string): string {
  let root = '';
  jest.isolateModules(() => {
    const saved = { data: process.env.BBS_DATA_DIR, root: process.env.BBS_ROOT };
    process.env.BBS_DATA_DIR = DATA;
    delete process.env.BBS_ROOT;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      root = (require(modulePath)[exportName] as { bbsRoot: string }).bbsRoot;
    } finally {
      process.env.BBS_DATA_DIR = saved.data;
      if (saved.root !== undefined) process.env.BBS_ROOT = saved.root;
    }
  });
  return root;
}

describe('the board files a live container reads', () => {
  it.each([
    ['../../src/services/MessageIndexManager', 'messageIndexManager'],
    ['../../src/services/MessageFileManager', 'messageFileManager'],
    ['../../src/services/MessagePointerFileManager', 'messagePointerFileManager'],
    ['../../src/services/ConferenceFileManager', 'conferenceFileManager'],
    ['../../src/services/DoorDropFileManager', 'doorDropFileManager'],
  ])('%s is rooted at BBS_DATA_DIR', (modulePath, exportName) => {
    expect(rootOf(modulePath, exportName)).toBe(DATA);
  });

  it('the message index finds a conference\'s HeaderFile on the volume', () => {
    let headerPath = '';
    jest.isolateModules(() => {
      const saved = process.env.BBS_DATA_DIR;
      process.env.BBS_DATA_DIR = DATA;
      delete process.env.BBS_ROOT;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { messageIndexManager } = require('../../src/services/MessageIndexManager');
        headerPath = (messageIndexManager as any).getHeaderFilePath(1);
      } finally {
        process.env.BBS_DATA_DIR = saved;
      }
    });
    expect(headerPath.startsWith(DATA + path.sep)).toBe(true);
    expect(headerPath.endsWith(path.join('MsgBase', 'HeaderFile'))).toBe(true);
  });
});
