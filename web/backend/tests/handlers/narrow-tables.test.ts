/**
 * C64/40-col plan, Task 5: every wide table gets a 40-column layout, and
 * every 80-column table keeps its bytes.
 *
 * Each surface has TWO tests, both driving the real handler through a stub
 * socket that carries the session (so the emitText width choke in
 * wrap-for-session.util.ts is live, exactly as on the board):
 *
 *  - an 80-column PIN: the exact bytes the handler emitted before this
 *    task. These are the byte-identity guarantee - they were written
 *    against the UNCHANGED handler and passed there first.
 *  - a 40-column layout test: no emitted line exceeds 39 printable
 *    columns (39, not 40: a C64 that has taken 40 printable characters has
 *    already wrapped, so the CRLF costs a second row and the table
 *    double-spaces), and the data is still there rather than clipped away.
 *
 * The 40-column assertions ALSO prove the table is laid out at the session
 * width rather than leaning on the prose wrap: a row that arrived at the
 * choke too long comes back with an inserted CRLF, which shows up here as
 * a short continuation line carrying the tail of a column.
 */

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return {
    BBSState: states.BBSState,
    LoggedOnSubState: states.LoggedOnSubState,
    BBSSession: {},
  };
});
jest.mock('../../src/utils/flag-pause.util', () => ({
  checkForPause: jest.fn().mockResolvedValue(true),
  flagPause: jest.fn().mockResolvedValue(true),
}));

import { flushOutput } from '../../src/utils/output.util';
import { printableLength } from '../../src/utils/wrap-for-session.util';

const NARROW_LINE_WIDTH = 39;

let socketSeq = 0;

interface Driver {
  socket: any;
  session: any;
  output: () => string;
  lines: () => string[];
}

function makeDriver(sessionOverrides: any = {}): Driver {
  const emitted: string[] = [];
  const session: any = {
    currentConf: 1,
    nodeId: 1,
    tempData: {},
    ...sessionOverrides,
  };
  const socket: any = {
    id: `narrow-tables-${socketSeq++}`,
    session,
    emit(event: string, data: string) {
      if (event === 'ansi-output') emitted.push(data);
      return true;
    },
    on() {
      return socket;
    },
  };
  const output = () => {
    flushOutput(socket);
    return emitted.join('');
  };
  return {
    socket,
    session,
    output,
    lines: () =>
      output()
        .split('\r\n')
        .filter((l) => l.length > 0),
  };
}

/** Every emitted line fits a C64 row. */
function expectFitsNarrow(lines: string[]): void {
  for (const line of lines) {
    expect({ line, columns: printableLength(line) }).toEqual({
      line,
      columns: expect.any(Number),
    });
    expect(printableLength(line)).toBeLessThanOrEqual(NARROW_LINE_WIDTH);
  }
}

const wide = () => makeDriver({ screenWidth: 80 });
const narrow = () => makeDriver({ petsciiMode: true, screenWidth: 40 });

// ===========================================================================
// 5a - file listings (file.handler.ts)
// ===========================================================================

const SEARCH_FILE = {
  id: 1,
  filename: 'ALKYS241.LHA',
  size: 90112,
  uploaddate: Date.UTC(2025, 11, 10),
  uploader: 'SPOT',
  description: 'Fine Amiga release with a longish description text that runs on',
  fileid_diz: null,
  areaname: 'AMIGA/DEMOS',
};

describe('5a file search listing (file.handler.ts handleFileSearch)', () => {
  function driveSearch(driver: Driver) {
    const fileHandler = require('../../src/handlers/file/file.handler');
    fileHandler.setFileMaintenanceDependencies({
      searchFilesByName: jest.fn(),
      searchFilesAdvanced: jest.fn().mockResolvedValue([SEARCH_FILE]),
      getFileEntry: jest.fn(),
      deleteFileEntry: jest.fn(),
      moveFileEntry: jest.fn(),
      updateFileDescription: jest.fn(),
      getFileAreas: jest.fn().mockResolvedValue([]),
    });
    return fileHandler.handleFileSearch(driver.socket, driver.session, ['ALKYS']);
  }

  test('80-col PIN: the historical single-line row, byte-identical', async () => {
    const { formatLongDate } = require('../../src/utils/date-time.util');
    const driver = wide();
    await driveSearch(driver);

    const dateStr = formatLongDate(new Date(SEARCH_FILE.uploaddate));
    const expected =
      'ALKYS241.LHA   ' + // filename.padEnd(15)
      '   88' + // sizeKB.toString().padStart(5)
      `K ${dateStr} SPOT\r\n` +
      `  ${SEARCH_FILE.description}\r\n` +
      '  Area: AMIGA/DEMOS\r\n\r\n';
    expect(driver.output()).toContain(expected);
  });

  test('40-col: laid out as the two-line convention, nothing over 39 columns', async () => {
    const { narrowFileLines } = require('../../src/utils/table-format.util');
    const driver = narrow();
    await driveSearch(driver);

    const out = driver.output();
    expectFitsNarrow(out.split('\r\n').filter((l) => l.length > 0));

    // The exact block, so a row that only fits because the prose choke
    // folded it fails here: the choke's break lands in a different place.
    const expected =
      [
        ...narrowFileLines({
          filename: SEARCH_FILE.filename,
          sizeKB: 88,
          description: SEARCH_FILE.description,
        }),
        ' Area: AMIGA/DEMOS',
      ]
        .map((l: string) => `${l}\r\n`)
        .join('') + '\r\n';
    expect(out).toContain(expected);
    expect(out).toContain('ALKYS241.LHA'.padEnd(35) + ' 88K\r\n');
  });
});

describe('5a new files listing (file.handler.ts displayNewFiles)', () => {
  const NEW_FILE = {
    id: 7,
    filename: 'TESTFILE.LHA',
    description: 'A brand new upload with a description long enough to matter here',
    size: 40960,
    uploader: 'SPOT',
    uploaddate: Date.UTC(2026, 0, 2),
    downloads: 0,
  };

  function driveNewFiles(driver: Driver) {
    const fileHandler = require('../../src/handlers/file/file.handler');
    fileHandler.setDatabase({
      getFileAreas: jest.fn().mockResolvedValue([
        { id: 3, name: 'AMIGA/DEMOS', description: 'Demos area' },
      ]),
      query: jest.fn().mockResolvedValue({ rows: [NEW_FILE] }),
    });
    driver.session.user = { id: 'u1', username: 'SPOT', lastLogin: new Date(Date.UTC(2026, 0, 1)) };
    return fileHandler.displayNewFiles(driver.socket, driver.session, '');
  }

  test('80-col PIN: the historical colorized row, byte-identical', async () => {
    const { formatLongDate } = require('../../src/utils/date-time.util');
    const driver = wide();
    await driveNewFiles(driver);

    const uploadDate = formatLongDate(new Date(NEW_FILE.uploaddate));
    const expected =
      `\x1b[32m${'TESTFILE.LHA'.padEnd(20)}\x1b[0m ` +
      `\x1b[36m${'40'.padStart(6)}KB\x1b[0m ` +
      `\x1b[33m${uploadDate.padEnd(10)}\x1b[0m ` +
      '\x1b[37mSPOT\x1b[0m\r\n' +
      `  \x1b[37m${NEW_FILE.description}\x1b[0m\r\n`;
    expect(driver.output()).toContain(expected);
  });

  test('40-col: two-line convention, nothing over 39 columns', async () => {
    const { narrowFileLines } = require('../../src/utils/table-format.util');
    const driver = narrow();
    await driveNewFiles(driver);

    const out = driver.output();
    // The "Searching for files newer than: <date>" banner is PROSE, not a
    // table row: it reaches the emitText choke, which wraps at the session
    // width of 40. Task 5 lays out TABLES; the banner is excluded here so
    // this test fails for a table row and nothing else.
    expectFitsNarrow(
      out
        .split('\r\n')
        .filter((l) => l.length > 0 && !l.startsWith('Searching for files newer than'))
    );

    const [nameLine, ...descLines] = narrowFileLines({
      filename: NEW_FILE.filename,
      sizeKB: 40,
      description: NEW_FILE.description,
    });
    const expected =
      `\x1b[32m${nameLine}\x1b[0m\r\n` +
      descLines.map((l: string) => `\x1b[37m${l}\x1b[0m\r\n`).join('');
    expect(out).toContain(expected);
  });
});
