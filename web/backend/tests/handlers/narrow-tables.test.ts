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

// WIDTH RULING (2026-09-02): a CRLF-terminated ROW may use all forty
// columns - the PETSCII transducer latches pendingWrap on the 40th glyph and
// newline() consumes the latch without emitting a $0D of its own
// (sdk/petscii/ansi-to-petscii.ts:108, :259-263, :289-301). A trailing
// PROMPT, which no CRLF follows and on which the cursor rests, stops at 39.
const NARROW_ROW_WIDTH = 40;
const NARROW_PROMPT_WIDTH = 39;

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

/** Every one of these lines is a ROW: forty columns are available. */
function expectFitsNarrow(lines: string[]): void {
  for (const line of lines) {
    expect(printableLength(line)).toBeLessThanOrEqual(NARROW_ROW_WIDTH);
  }
}

/**
 * A whole narrow screen: everything before the last CRLF is a row (<= 40),
 * and whatever trails the last CRLF is the prompt the cursor rests on
 * (<= 39). `skip` drops lines this task does not own.
 */
function expectNarrowScreen(out: string, skip: (line: string) => boolean = () => false): void {
  const parts = out.split('\r\n');
  const prompt = parts.pop() ?? '';
  expectFitsNarrow(parts.filter((l) => l.length > 0 && !skip(l)));
  if (prompt.length > 0 && !skip(prompt)) {
    expect(printableLength(prompt)).toBeLessThanOrEqual(NARROW_PROMPT_WIDTH);
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
    expectNarrowScreen(out);

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
    expect(out).toContain('ALKYS241.LHA'.padEnd(36) + ' 88K\r\n');
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
    expectNarrowScreen(out, (l) => l.startsWith('Searching for files newer than'));

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

// ===========================================================================
// 5b - WHO / user list / room members
// ===========================================================================

const ONLINE_USER = {
  id: 'u2',
  username: 'ZAPHOD',
  realname: 'Zaphod Beeblebrox',
  location: 'Betelgeuse Five',
  secLevel: 255,
  availableForChat: true,
};

function chatSessions(): Map<string, any> {
  const { LoggedOnSubState } = require('../../src/constants/bbs-states');
  return new Map<string, any>([
    ['sock-2', { user: ONLINE_USER, subState: LoggedOnSubState.DISPLAY_MENU }],
  ]);
}

function driveChat(driver: Driver, params: string) {
  const chat = require('../../src/handlers/chat/chat-commands.handler');
  chat.setChatCommandsDependencies({
    db: {},
    sessions: chatSessions(),
    io: {},
    handleChatRequest: jest.fn(),
    handleChatAccept: jest.fn(),
    handleChatDecline: jest.fn(),
  });
  driver.session.user = { id: 'u1', username: 'SPOT' };
  return chat.handleLiveChatCommand(driver.socket, driver.session, params);
}

describe('5b LIVECHAT WHO (chat-commands.handler.ts showOnlineUsers)', () => {
  test('80-col PIN: banner, header and row byte-identical', async () => {
    const driver = wide();
    await driveChat(driver, 'WHO');
    const out = driver.output();

    expect(out).toContain('\x1b[36m' + '═'.repeat(63) + '\x1b[0m\r\n');
    expect(out).toContain(
      '\x1b[33mUsername          Real Name                Status\r\n' +
        '================  =======================  ====================\r\n' +
        '\x1b[0m'
    );
    expect(out).toContain(
      'ZAPHOD'.padEnd(16, ' ').substring(0, 16) +
        '  ' +
        'Zaphod Beeblebrox'.padEnd(23, ' ').substring(0, 23) +
        '  ' +
        '\x1b[32mAvailable\x1b[0m\r\n'
    );
  });

  test('40-col: no line over 39 columns, username and full status word kept', async () => {
    const driver = narrow();
    await driveChat(driver, 'WHO');
    const out = driver.output();

    expectNarrowScreen(out);

    // Exact banner, header and row - the Real Name column is gone and the
    // full English status word survives.
    expect(out).toContain('\x1b[36m' + '═'.repeat(40) + '\x1b[0m\r\n');
    expect(out).toContain(
      '\x1b[33mUsername          Status\r\n' + '================  =============\r\n\x1b[0m'
    );
    expect(out).toContain('ZAPHOD'.padEnd(16) + '  \x1b[32mAvailable\x1b[0m\r\n');
  });
});

describe('5b LIVECHAT picker (chat-commands.handler.ts renderChatUserList)', () => {
  test('80-col PIN: header row byte-identical', async () => {
    const driver = wide();
    await driveChat(driver, '');
    const out = driver.output();

    expect(out).toContain('\x1b[33mUsername          Real Name                Status\x1b[0m\r\n');
    expect(out).toContain('\x1b[33m' + '─'.repeat(63) + '\x1b[0m\r\n');
    expect(out).toContain(
      '\x1b[44m\x1b[37m> ' +
        'ZAPHOD'.padEnd(16, ' ') +
        'Zaphod Beeblebrox'.padEnd(23, ' ') +
        '  ' +
        'Available'.padEnd(18) +
        '\x1b[0m\r\n'
    );
  });

  test('40-col: no line over 39 columns, selected row still marked', async () => {
    const driver = narrow();
    await driveChat(driver, '');
    const out = driver.output();

    expectNarrowScreen(out.replace('\x1b[2J\x1b[H', ''));

    expect(out).toContain('\x1b[33mUsername          Status\x1b[0m\r\n');
    expect(out).toContain('\x1b[33m' + '─'.repeat(40) + '\x1b[0m\r\n');
    // Exact selected row: inverse video, no Real Name column.
    expect(out).toContain(
      '\x1b[44m\x1b[37m> ' + 'ZAPHOD'.padEnd(16) + '  ' + 'Available'.padEnd(13) + '\x1b[0m\r\n'
    );
    // ASCII footer: the arrow glyphs are not PETSCII characters.
    expect(out).toContain('Up/Dn select, ENTER chat, Q quit');
  });
});

describe('5b user list (account.handler.ts displayUserList)', () => {
  const LIST_USER = { ...ONLINE_USER, lastLogin: new Date(Date.UTC(2026, 0, 2, 12, 0, 0)) };

  async function driveUserList(driver: Driver) {
    const account = require('../../src/handlers/user/account.handler');
    account.setDatabase({ getUsers: jest.fn().mockResolvedValue([LIST_USER]) });
    account.displayUserList(driver.socket, driver.session, 1);
    await new Promise((resolve) => setImmediate(resolve));
  }

  test('80-col PIN: header, 75-wide rule and row byte-identical', async () => {
    const driver = wide();
    await driveUserList(driver);
    const out = driver.output();

    expect(out).toContain(
      '\x1b[32mUsername'.padEnd(16) +
        'Real Name'.padEnd(20) +
        'Location'.padEnd(15) +
        'Level  Last Login\x1b[0m\r\n'
    );
    expect(out).toContain('\x1b[36m' + '='.repeat(75) + '\x1b[0m\r\n');
    expect(out).toContain(
      'ZAPHOD'.padEnd(16) +
        'Zaphod Beeblebrox'.padEnd(20) +
        'Betelgeuse Five'.padEnd(15) +
        '255'.padStart(5) +
        '  ' +
        LIST_USER.lastLogin.toLocaleDateString() +
        '\r\n'
    );
  });

  test('40-col: no line over 39 columns, level and location still shown', async () => {
    const driver = narrow();
    await driveUserList(driver);
    const out = driver.output();

    expectNarrowScreen(out);

    // Exact header, rule and the two stacked rows.
    expect(out).toContain('\x1b[32mUsername         Lvl  Last Login\x1b[0m\r\n');
    expect(out).toContain('\x1b[36m' + '='.repeat(40) + '\x1b[0m\r\n');
    expect(out).toContain(
      'ZAPHOD'.padEnd(16) + ' ' + '255'.padStart(3) + '  ' + LIST_USER.lastLogin.toLocaleDateString() + '\r\n'
    );
    expect(out).toContain('  Betelgeuse Five\r\n');
  });
});

describe('5b room members (room-commands.handler.ts whoInRoom)', () => {
  const MEMBER = {
    username: 'ZAPHOD',
    is_moderator: true,
    is_muted: false,
    joined_at: Date.UTC(2026, 0, 2, 12, 0, 0),
  };
  const joinedAt = new Date(MEMBER.joined_at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  function driveWho(driver: Driver) {
    const rooms = require('../../src/handlers/chat/room-commands.handler');
    rooms.setRoomCommandsDependencies({
      db: {
        getChatRoom: jest.fn().mockResolvedValue({ room_name: 'Amiga Demo Scene', max_users: 50 }),
        getRoomMembers: jest.fn().mockResolvedValue([MEMBER]),
      },
      sessions: new Map(),
      io: {},
      handleRoomCreate: jest.fn(),
      handleRoomJoin: jest.fn(),
      handleRoomLeave: jest.fn(),
      handleRoomList: jest.fn(),
      handleRoomKick: jest.fn(),
      handleRoomMute: jest.fn(),
    });
    driver.session.currentRoomId = 1;
    driver.session.user = { id: 'u1', username: 'SPOT' };
    return rooms.handleRoomCommand(driver.socket, driver.session, 'WHO');
  }

  test('80-col PIN: 70-wide rule and padded row byte-identical', async () => {
    const driver = wide();
    await driveWho(driver);
    const out = driver.output();

    expect(out).toContain('─'.repeat(70));
    expect(out).toContain(
      'ZAPHOD'.padEnd(20, ' ') + '[MOD] '.padEnd(15, ' ') + joinedAt + '\r\n'
    );
  });

  test('40-col: no line over 39 columns, moderator flag kept', async () => {
    const driver = narrow();
    await driveWho(driver);
    const out = driver.output();

    expectNarrowScreen(out);

    // Exact rule and row: the Joined column is gone, the ASCII flag stays.
    expect(out).toContain('─'.repeat(40));
    expect(out).toContain('ZAPHOD'.padEnd(16) + '[MOD]\r\n');
    expect(out).not.toContain(joinedAt);
  });
});

// ===========================================================================
// 5c - protocol menu + ~CL./~CD./~ML./~MD. conference lists
// ===========================================================================

describe('5c transfer protocol menu (info-commands.handler.ts, W option 11)', () => {
  async function driveProtocolMenu(driver: Driver) {
    const info = require('../../src/handlers/commands/info-commands.handler');
    // acs.util:174 - an explicit 'T' in securityFlags grants the permission,
    // so the real checkSecurity() runs rather than being mocked out.
    driver.session.user = {
      id: 'u1',
      username: 'SPOT',
      secLevel: 255,
      securityFlags: 'T'.repeat(64),
    };
    await info.handleWOptionSelectInput(driver.socket, driver.session, '11');
  }

  test('80-col PIN: the seven descriptive rows, byte-identical', async () => {
    const driver = wide();
    await driveProtocolMenu(driver);
    const out = driver.output();

    expect(out).toContain('\x1b[36mSelect Transfer Protocol:\r\n\x1b[0m');
    expect(out).toContain('\x1b[34m[1] \x1b[0mZMODEM          - Fast, reliable, batch transfers (recommended)\r\n');
    expect(out).toContain('\x1b[34m[6] \x1b[0mPunter (C64)    - Commodore 64/128 protocol\r\n');
    expect(out).toContain('\x1b[34m[7] \x1b[0mWebSocket       - Browser-based transfers\r\n');
    expect(out).toContain('Select (1-7) or <CR>=Cancel: ');
  });

  test('40-col: one protocol per line, full English names, nothing over 39 columns', async () => {
    const driver = narrow();
    await driveProtocolMenu(driver);
    const out = driver.output();

    expectNarrowScreen(out);
    // Exact rows: a menu that only fits because the prose choke folded the
    // 80-column descriptions fails here.
    expect(out).toContain('\x1b[34m[1] \x1b[0mZMODEM (recommended)\r\n');
    expect(out).toContain('\x1b[34m[2] \x1b[0mYMODEM (Batch)\r\n');
    expect(out).toContain('\x1b[34m[6] \x1b[0mPunter (Commodore 64/128)\r\n');
    expect(out).toContain('\x1b[34m[7] \x1b[0mWebSocket (browser)\r\n');
    expect(out).toContain('Select (1-7) or <CR>=Cancel: ');
  });
});

describe('5c conference / message-base MCI lists (screen.handler.ts parseMciCodes)', () => {
  const CONFERENCES = [
    { id: 1, name: 'Amiga Demo Scene Chat!' },
    { id: 2, name: 'Commodore 64 Programming' },
  ];
  const BASES = [{ name: 'General Discussion' }, { name: 'Amiga Coding Corner' }];

  let restoreMessageBases: (() => void) | null = null;

  function prepare(driver: Driver) {
    const screen = require('../../src/handlers/screen.handler');
    screen.setConferences(CONFERENCES);
    // `db` is a Proxy with no set trap (database.ts:3456), so it can only
    // be stubbed on the class it delegates to.
    const { Database } = require('../../src/database');
    const original = Database.prototype.getMessageBases;
    Database.prototype.getMessageBases = jest.fn().mockResolvedValue(BASES);
    restoreMessageBases = () => {
      Database.prototype.getMessageBases = original;
    };
    driver.session.user = { id: 'u1', username: 'SPOT', confAccess: 'XX' };
    driver.session.currentConf = 1;
    return screen;
  }

  afterEach(() => {
    if (restoreMessageBases) restoreMessageBases();
    restoreMessageBases = null;
  });

  async function render(driver: Driver, code: string): Promise<string> {
    const screen = prepare(driver);
    const result = await screen.parseMciCodes(code, driver.session);
    return result.parsed;
  }

  test('80-col PIN: ~CL. and ~CD. rows byte-identical', async () => {
    const driver = wide();
    expect(await render(driver, '~CL.')).toBe(
      '                     \x1b[32m  1\x1b[33m) \x1b[35m' + 'Amiga Demo Scene Chat!'.padEnd(30, ' ') + '\x1b[36m\x1b[0m\r\n' +
        '                     \x1b[32m  2\x1b[33m) \x1b[35m' + 'Commodore 64 Programming'.padEnd(30, ' ') + '\x1b[36m\x1b[0m\r\n'
    );
    expect(await render(driver, '~CD.')).toBe(
      '   \x1b[34m[\x1b[0m001\x1b[34m] \x1b[0m' + 'Amiga Demo Scene Chat!'.padEnd(30, ' ') +
        '   \x1b[34m[\x1b[0m002\x1b[34m] \x1b[0m' + 'Commodore 64 Programming'.padEnd(30, ' ') + '\r\n'
    );
  });

  test('80-col PIN: ~ML. and ~MD. rows byte-identical', async () => {
    const driver = wide();
    expect(await render(driver, '~ML.')).toBe(
      '                     \x1b[32m1\x1b[33m) \x1b[35m' + 'General Discussion'.padEnd(30, ' ') + '\x1b[36m\x1b[0m\r\n' +
        '                     \x1b[32m2\x1b[33m) \x1b[35m' + 'Amiga Coding Corner'.padEnd(30, ' ') + '\x1b[36m\x1b[0m\r\n'
    );
    expect(await render(driver, '~MD.')).toBe(
      '   \x1b[34m[\x1b[0m1\x1b[34m] \x1b[0m' + 'General Discussion'.padEnd(30, ' ') +
        '   \x1b[34m[\x1b[0m2\x1b[34m] \x1b[0m' + 'Amiga Coding Corner'.padEnd(30, ' ') + '\r\n'
    );
  });

  test('40-col: every MCI list row fits 39 columns and keeps its number', async () => {
    for (const code of ['~CL.', '~CD.', '~ML.', '~MD.']) {
      const driver = narrow();
      const parsed = await render(driver, code);
      const lines = parsed.split('\r\n').filter((l) => l.length > 0);
      expect(lines.length).toBe(2); // single column: one entry per row
      expectFitsNarrow(lines);
    }
  });

  test('40-col: the exact single-column rows', async () => {
    expect(await render(narrow(), '~CL.')).toBe(
      '  \x1b[32m  1\x1b[33m) \x1b[35mAmiga Demo Scene Chat!\x1b[0m\r\n' +
        '  \x1b[32m  2\x1b[33m) \x1b[35mCommodore 64 Programming\x1b[0m\r\n'
    );
    expect(await render(narrow(), '~CD.')).toBe(
      '   \x1b[34m[\x1b[0m001\x1b[34m] \x1b[0mAmiga Demo Scene Chat!\r\n' +
        '   \x1b[34m[\x1b[0m002\x1b[34m] \x1b[0mCommodore 64 Programming\r\n'
    );
    expect(await render(narrow(), '~ML.')).toBe(
      '  \x1b[32m1\x1b[33m) \x1b[35mGeneral Discussion\x1b[0m\r\n' +
        '  \x1b[32m2\x1b[33m) \x1b[35mAmiga Coding Corner\x1b[0m\r\n'
    );
    expect(await render(narrow(), '~MD.')).toBe(
      '   \x1b[34m[\x1b[0m1\x1b[34m] \x1b[0mGeneral Discussion\r\n' +
        '   \x1b[34m[\x1b[0m2\x1b[34m] \x1b[0mAmiga Coding Corner\r\n'
    );
  });
});

// ===========================================================================
// 5d - message tables, node status, new-user picker, file status, doors list
// ===========================================================================

describe('5d mail scan row (message-scan.handler.ts buildMailScanRow)', () => {
  const SCAN_MSG = {
    isPrivate: false,
    from: 'ZAPHOD BEEBLEBROX',
    subject: 'Your Amiga demo is ready',
    msgNum: 42,
  };

  test('80-col PIN: express.e:11720 row, byte-identical', () => {
    const { buildMailScanRow } = require('../../src/handlers/message/message-scan.handler');
    expect(buildMailScanRow(SCAN_MSG, false)).toEqual([
      'Public ' +
        '  ' +
        SCAN_MSG.from.substring(0, 29).padEnd(29) +
        '  ' +
        SCAN_MSG.subject.substring(0, 21).padEnd(21) +
        '  \x1b[0m000042',
    ]);
  });

  test('40-col: number, sender and subject stacked, nothing over 39 columns', () => {
    const { buildMailScanRow } = require('../../src/handlers/message/message-scan.handler');
    const lines = buildMailScanRow(SCAN_MSG, true);
    expect(lines.length).toBeGreaterThan(1);
    expectFitsNarrow(lines);
    expect(lines.join('\n')).toContain('000042');
    expect(lines.join('\n')).toContain('ZAPHOD BEEBLEBROX');
    expect(lines.join('\n')).toContain('Your Amiga demo is ready');
  });
});

describe('5d message reader (messaging.handler.ts displaySingleMessage + msg list)', () => {
  const MSG = {
    id: 42,
    msgNumber: 42,
    author: 'ZAPHOD BEEBLEBROX',
    toUser: 'SPOT',
    subject: 'Your Amiga demo is ready',
    body: 'Short body.',
    isPrivate: false,
    timestamp: new Date(Date.UTC(2026, 0, 2, 12, 0, 0)),
  };

  function prepare(driver: Driver) {
    driver.session.user = { id: 'u1', username: 'SPOT', userFlags: 0 };
    driver.session.currentConf = 1;
    driver.session.currentMsgBase = 1;
    driver.session.tempData = { msgReaderMessages: [MSG], msgReaderIndex: 0 };
    return require('../../src/handlers/message/messaging.handler');
  }

  test('80-col PIN: the padded-30 header pairs, byte-identical', async () => {
    const { formatLongDateTime } = require('../../src/utils/date-time.util');
    const driver = wide();
    const messaging = prepare(driver);
    await messaging.displaySingleMessage(driver.socket, driver.session, 0);
    const out = driver.output();

    const dateStr = formatLongDateTime(MSG.timestamp);
    expect(out).toContain(
      `\x1b[32mDate   \x1b[33m: \x1b[0m${dateStr.padEnd(30)}   \x1b[32mNumber\x1b[33m: \x1b[0m42\r\n`
    );
    expect(out).toContain(
      `\x1b[32mFrom   \x1b[33m: \x1b[0m${'ZAPHOD BEEBLEBROX'.padEnd(30)}   \x1b[32mStatus\x1b[33m: \x1b[0mPublic Message\r\n`
    );
    expect(out).toContain(`\x1b[32mSubject\x1b[33m: \x1b[0m${MSG.subject}\r\n`);
  });

  test('40-col: one field per line, nothing over 39 columns', async () => {
    const driver = narrow();
    const messaging = prepare(driver);
    await messaging.displaySingleMessage(driver.socket, driver.session, 0);
    const out = driver.output();

    // Nothing excluded: the "Msg. Options:" prompt used to be four separate
    // emitText calls, each short enough that the session-width choke never
    // saw the 45-column line they concatenated into. It is one string now,
    // so it is held to the ruling like everything else.
    expectNarrowScreen(out);
    expect(out).toContain('Number : 42');
    expect(out).toContain('From   : ZAPHOD BEEBLEBROX');
    expect(out).toContain('Subject: Your Amiga demo is ready');
  });

  test('40-col: the reader prompt is a row of letters plus a 39-column answer line', async () => {
    const driver = narrow();
    const messaging = prepare(driver);
    driver.session.user.securityFlags = 'T'.repeat(64); // D and M offered too
    await messaging.displaySingleMessage(driver.socket, driver.session, 0);
    messaging.displayMessageNavigationPrompt(driver.socket, driver.session);
    const out = driver.output();

    expectNarrowScreen(out);
    // The letters keep every option, including the permission-gated D and M.
    expect(out).toContain(
      '\x1b[32mMsg. Options: \x1b[33mA\x1b[36m,\x1b[33mD\x1b[36m,\x1b[33mM\x1b[36m' +
        ',\x1b[33mF\x1b[36m,\x1b[33mR\x1b[36m,\x1b[33mL\x1b[36m,\x1b[33mQ\x1b[36m,\x1b[33m?\x1b[36m,\x1b[33m??\x1b[36m,\x1b[32m<\x1b[33mCR\x1b[32m>\r\n'
    );
    // ...and the cursor rests on a separate, shorter answer line.
    expect(out.endsWith('\x1b[32m(\x1b[0m QUIT\x1b[32m )\x1b[0m>: ')).toBe(true);
  });

  test('EH From prompt: one emit, 80-col byte-identical, narrow inside the row', async () => {
    const wideDriver = wide();
    const messagingWide = prepare(wideDriver);
    wideDriver.session.user.securityFlags = 'T'.repeat(64);
    await messagingWide.handleMessageReaderNav(wideDriver.socket, wideDriver.session, 'EH');
    expect(wideDriver.output()).toContain(
      '\r\n     \x1b[36mFrom\x1b[0m\x1b[33m:\x1b[0m ' +
        '\x1b[32m(\x1b[0m\x1b[33mEnter\x1b[0m\x1b[32m)\x1b[0m' +
        '=\x1b[32m\'\x1b[0m\x1b[33mZAPHOD BEEBLEBROX\x1b[0m\x1b[32m\'\x1b[0m\x1b[32m?\x1b[0m '
    );

    const narrowDriver = narrow();
    const messagingNarrow = prepare(narrowDriver);
    narrowDriver.session.user.securityFlags = 'T'.repeat(64);
    await messagingNarrow.handleMessageReaderNav(narrowDriver.socket, narrowDriver.session, 'EH');
    expectNarrowScreen(narrowDriver.output());
  });

  test('80-col PIN: the reader prompt is byte-identical to the four-chunk original', async () => {
    const driver = wide();
    const messaging = prepare(driver);
    driver.session.user.securityFlags = 'T'.repeat(64);
    messaging.displayMessageNavigationPrompt(driver.socket, driver.session);

    expect(driver.output()).toBe(
      '\r\n\x1b[32mMsg. Options: \x1b[33mA\x1b[36m' +
        ',\x1b[33mD\x1b[36m' +
        ',\x1b[33mM\x1b[36m' +
        ',\x1b[33mF\x1b[36m,\x1b[33mR\x1b[36m,\x1b[33mL\x1b[36m,\x1b[33mQ\x1b[36m,\x1b[33m?\x1b[36m,\x1b[33m??\x1b[36m,\x1b[32m<\x1b[33mCR\x1b[32m> \x1b[32m(\x1b[0m QUIT\x1b[32m )\x1b[0m>: '
    );
  });

  test('80-col PIN: msg list row (express.e:8864), byte-identical', () => {
    const { buildMsgListRow } = require('../../src/handlers/message/messaging.handler');
    expect(buildMsgListRow({ msgNum: 42, isPrivate: false, from: MSG.author, subject: MSG.subject }, false)).toEqual([
      '000042 Public   ' +
        MSG.author.substring(0, 29).padEnd(29) +
        '  ' +
        MSG.subject.substring(0, 21).padEnd(21) +
        '\x1b[0m',
    ]);
  });

  test('40-col: msg list row stacked, nothing over 39 columns', () => {
    const { buildMsgListRow } = require('../../src/handlers/message/messaging.handler');
    const lines = buildMsgListRow(
      { msgNum: 42, isPrivate: false, from: MSG.author, subject: MSG.subject },
      true
    );
    expectFitsNarrow(lines);
    expect(lines.join('\n')).toContain('000042');
    expect(lines.join('\n')).toContain(MSG.subject);
  });
});

describe('5d node status (message-commands.handler.ts handleNodeManagementCommand)', () => {
  function driveNodeStatus(driver: Driver) {
    const { BBSState, LoggedOnSubState } = require('../../src/constants/bbs-states');
    const msgCommands = require('../../src/handlers/message/message-commands.handler');
    msgCommands.setMessageCommandsDependencies({
      messageBases: [],
      conferences: [],
      sessions: new Map<string, any>([
        [
          '2',
          {
            user: { username: 'ZAPHOD', location: 'Betelgeuse Five' },
            state: BBSState.LOGGEDON,
            blockOLM: false,
            currentStat: 0,
          },
        ],
      ]),
      joinConference: jest.fn(),
      displayScreen: jest.fn(),
      resetNewMailScanPointers: jest.fn(),
      resetLastMessageReadPointers: jest.fn(),
      getConferenceStats: jest.fn(),
      updateMessageNumberRange: jest.fn(),
      getMailStatFile: jest.fn(),
    });
    driver.session.user = { id: 'u1', username: 'SPOT', securityFlags: 'T'.repeat(64) };
    msgCommands.handleNodeManagementCommand(driver.socket, driver.session);
    expect(driver.session.subState).toBe(LoggedOnSubState.NM_INPUT);
  }

  test('80-col PIN: the boxed table, byte-identical', () => {
    const driver = wide();
    driveNodeStatus(driver);
    const out = driver.output();

    expect(out).toContain(
      '\x1b[34m.-----+---------------------+---------------------+---------------------+------.\x1b[0m\r\n'
    );
    expect(out).toContain(
      '\x1b[34m|\x1b[33m 02  \x1b[34m|\x1b[33m ' +
        'ZAPHOD'.padEnd(19) +
        ' \x1b[34m|\x1b[35m ' +
        'Betelgeuse Five'.padEnd(19) +
        ' \x1b[34m|\x1b[0m ' +
        'IDLE'.padEnd(19) +
        ' \x1b[34m|\x1b[32m YES  \x1b[34m|\x1b[0m\r\n'
    );
    expect(out).toContain(
      "\x1b[34m`-----+---------------------+---------------------+---------------------+------'\x1b[0m\r\n"
    );
  });

  test('40-col: two unboxed lines per node, nothing over 39 columns', () => {
    const driver = narrow();
    driveNodeStatus(driver);
    const out = driver.output();

    expectNarrowScreen(out);

    // Exact rows: no box drawing, node+handle then the action indented.
    expect(out).toContain(`\x1b[34m${'-'.repeat(40)}\x1b[0m\r\n`);
    expect(out).toContain('\x1b[33m02 ZAPHOD\x1b[0m\r\n');
    expect(out).toContain('\x1b[0m   IDLE\x1b[0m\r\n');
    expect(out).not.toContain('|');
  });
});

describe('5d new-user computer picker (new-user.handler.ts handleLinesInput)', () => {
  async function drivePicker(driver: Driver) {
    const newUser = require('../../src/handlers/user/new-user.handler');
    driver.session.newUserData = {};
    await newUser.handleLinesInput(driver.socket, driver.session, '24');
    return driver.session.newUserData.computerChoices as string[];
  }

  test('80-col PIN: the express.e two-column loop, byte-identical', async () => {
    const driver = wide();
    const choices = await drivePicker(driver);
    const out = driver.output();

    expect(choices.length).toBeGreaterThan(1);
    expect(out).toContain(
      ` 1> ${choices[0].padEnd(34, ' ')} 2> ${choices[1].padEnd(34, ' ')}\r\n`
    );
  });

  test('40-col: one choice per line, nothing over 39 columns', async () => {
    const driver = narrow();
    const choices = await drivePicker(driver);
    const out = driver.output();

    expectNarrowScreen(out);
    expect(out).toContain(` 1> ${choices[0]}\r\n`);
    expect(out).toContain(` 2> ${choices[1]}\r\n`);
  });
});

describe('5d file status (file-status.handler.ts handleFileStatusCommand)', () => {
  async function driveFileStatus(driver: Driver) {
    const { FileStatusHandler } = require('../../src/handlers/file/file-status.handler');
    const handler = new FileStatusHandler(
      {
        getConferences: jest.fn().mockResolvedValue([
          { id: 1, name: 'General', uploads: 12, bytesUpload: 1234567, downloads: 34, bytesDownload: 7654321, ratio: 3 },
        ]),
      },
      {} as any
    );
    driver.session.user = {
      id: 'u1',
      username: 'SPOT',
      securityFlags: 'T'.repeat(64),
      confAccess: 'X',
      byteLimit: 0,
    };
    driver.session.currentConf = 1;
    await handler.handleFileStatusCommand(driver.socket, driver.session);
  }

  test('80-col PIN: the wide column header, byte-identical', async () => {
    const driver = wide();
    await driveFileStatus(driver);
    const out = driver.output();

    expect(out).toContain('\x1b[0m    ----  -------  -------------- -------  -------------- -----------  -----\x1b[0m\r\n');
    expect(out).toContain(
      '\x1b[33m    ' + '   1' + '> ' + '\x1b[33m' +
      '12'.padEnd(7) + '  ' + '1234567'.padStart(14) + ' ' +
      '34'.padEnd(7) + '  ' + '7654321'.padStart(14) + '   ' +
      'Infinite'.padStart(9) + '   3:1\x1b[0m\r\n'
    );
  });

  test('40-col: stacked per-conference block, nothing over 39 columns', async () => {
    const driver = narrow();
    await driveFileStatus(driver);
    const out = driver.output();

    expectNarrowScreen(out);

    // Exact stacked block for the one conference.
    expect(out).toContain('\x1b[33m   1>\x1b[0m\r\n');
    expect(out).toContain(` UL ${'12'.padEnd(7)} ${'1234567'.padStart(14)}\r\n`);
    expect(out).toContain(` DL ${'34'.padEnd(7)} ${'7654321'.padStart(14)}\r\n`);
    expect(out).toContain(' Avail Infinite  3:1\r\n');
  });
});

describe('5d doors list (door.handler.ts displayDoorMenu)', () => {
  const DOORS = [
    { id: 'd1', command: 'PENGO', name: 'Pengo Arcade Game', type: 'TS', size: 123456, minColumns: 40 },
    { id: 'd2', command: 'TRADE', name: 'Trade Wars 2002', type: 'AMI', size: 654321 },
  ];

  async function driveDoorMenu(driver: Driver) {
    const door = require('../../src/handlers/door.handler');
    door.setDoors(DOORS);
    driver.session.user = { id: 'u1', username: 'SPOT', securityFlags: 'T'.repeat(64) };
    await door.displayDoorMenu(driver.socket, driver.session, '');
  }

  test('80-col PIN: masthead, footer rule and door row byte-identical', async () => {
    const door = require('../../src/handlers/door.handler');
    const driver = wide();
    await driveDoorMenu(driver);
    const out = driver.output();

    expect(out).toContain('\x1b[1;1H\x1b[0;37;44m' + ' DOOR GAMES & UTILITIES '.padEnd(80) + '\x1b[0m');
    expect(out).toContain('\x1b[0;37m' + '-'.repeat(80) + '\x1b[0m\r\n');
    // formatDoorLine is exported and is what the list loop emits per row.
    expect(door.formatDoorLine(DOORS[1], false)).toBe(
      '\x1b[2K \x1b[33m[AMI]\x1b[0m ' + 'TRADE'.padEnd(10) + ' ' + 'Trade Wars 2002'.padEnd(30) + '\x1b[36m' + '639KB'.padStart(8) + '\x1b[0m'
    );
  });

  test('40-col: masthead, rule and rows fit the row width, [40] marker kept', async () => {
    const driver = narrow();
    await driveDoorMenu(driver);
    const out = driver.output();

    const lines = out
      .replace(/\x1b\[2J\x1b\[H/g, '')
      // A cursor-position jump starts a new screen row, like a CRLF.
      .replace(/\x1b\[\d+;1H/g, '\r\n')
      .split('\r\n')
      .filter((l) => l.replace(/\x1b\[2K/g, '').length > 0);
    expectFitsNarrow(lines.map((l) => l.replace(/\x1b\[2K/g, '')));

    // Exact rows. The name column is 24, so the worst-case type token
    // ('[XIM]', 5) still lands the row on exactly 40.
    const door = require('../../src/handlers/door.handler');
    expect(door.formatDoorLine(DOORS[0], false, true)).toBe(
      '\x1b[2K \x1b[33m[TS]\x1b[0m ' + 'PENGO'.padEnd(8) + ' ' + 'Pengo Arcade Game'.padEnd(19) + ' [40]'
    );
    expect(door.formatDoorLine(DOORS[1], false, true)).toBe(
      '\x1b[2K \x1b[33m[AMI]\x1b[0m ' + 'TRADE'.padEnd(8) + ' ' + 'Trade Wars 2002'.padEnd(24)
    );
    expect(door.formatDoorLine(DOORS[0], true, true)).toBe(
      '\x1b[2K\x1b[0;37;44m \x1b[33m[TS]\x1b[0;37;44m ' + 'PENGO'.padEnd(8) + ' ' +
        'Pengo Arcade Game'.padEnd(19) + ' [40]\x1b[0m'
    );
  });

  test('40-col: a long name and a long command are clipped, never overflowed', () => {
    const door = require('../../src/handlers/door.handler');
    const long = {
      id: 'd3',
      command: 'VERYLONGCOMMANDNAME',
      name: 'Neo-Blessed Widget Showcase', // 27 characters
      type: 'XIM',
      size: 1,
    };
    for (const fortyOk of [true, false]) {
      for (const selected of [false, true]) {
        const row = door
          .formatDoorLine(fortyOk ? { ...long, minColumns: 40 } : long, selected, true)
          .replace(/\x1b\[2K/g, '');
        expect(printableLength(row)).toBeLessThanOrEqual(NARROW_ROW_WIDTH);
        // The marker outranks the name inside the name column.
        if (fortyOk) expect(row).toContain('[40]');
        expect(row).toContain('VERYLONG');
      }
    }
  });
});
