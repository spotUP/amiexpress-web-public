/**
 * `FI <n>` - the command that makes the list row's ordinal mean something.
 *
 * The two 40-column surfaces connect through that number: a caller reads the
 * list, sees `12`, and types `FI 12` to see what the file IS. Without the
 * command the ordinal is decoration and the single-record view is unreachable
 * code - which is exactly what it was for about an hour.
 *
 * Driven through the REAL dispatcher, not by calling the handler: a case in a
 * switch that no dispatch reaches is the same unreachable code wearing a
 * different hat.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { FileListingHandler } from '../../../src/handlers/file/file-listing.handler';
import { INTERNAL_COMMAND_NAMES } from '../../../src/handlers/command-handler/internal-command-names';
import { config } from '../../../src/config';
import { resetFileViewLayoutCache } from '../../../src/services/file-layout.service';

const INDENT = ' '.repeat(33);
const DIR = [
  'OTL-DOOR.LHA P  40960  03-28-18  A door from the Outlaws',
  INDENT + 'MegaDoor v2.1',
  'PDX-TOOL.LHA N 108741  01-21-26  A tool from Paradox',
  '',
].join('\n');

let tmp = '';

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'file-info-'));
  fs.mkdirSync(path.join(tmp, 'Conf1'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'Conf1', 'DIR1'), DIR, 'binary');
  config.set('dataDir', tmp);
  config.set('bbsRoot', tmp);
  resetFileViewLayoutCache();
});

afterAll(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }
  resetFileViewLayoutCache();
});

function makeSession(): any {
  return {
    currentConf: 1,
    screenWidth: 40,
    screenHeight: 25,
    petsciiMode: true,
    terminalType: 'c64',
    state: 'loggedon',
    user: { id: 1, username: 'sysop', secLevel: 255, newSinceDate: new Date(2026, 0, 1) },
    tempData: {},
  };
}

function makeSocket(session: any, wire: string[]): any {
  const socket: any = {
    session,
    id: 'file-info',
    emit: (event: string, payload: any) => {
      if (event === 'ansi-output' && typeof payload === 'string') wire.push(payload);
      return true;
    },
    on: () => socket, once: () => socket, off: () => socket,
    removeListener: () => socket, removeAllListeners: () => socket,
  };
  return socket;
}

const glass = (s: string) => s.replace(/~[^|]*\|/g, '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

describe('FI is a command the board knows', () => {
  it('is on the internal roster, so the prompt can complete it', () => {
    expect(INTERNAL_COMMAND_NAMES).toContain('FI');
  });
});

describe('FI <n>, after a listing', () => {
  it('shows the record the ordinal named', async () => {
    const session = makeSession();
    const wire: string[] = [];
    const socket = makeSocket(session, wire);

    await FileListingHandler.handleFileList(socket, session, '', false);
    wire.length = 0;                      // only what FI emits
    await FileListingHandler.handleFileInfoCommand(socket, session, '2');

    const out = glass(wire.join(''));
    expect(out).toContain('PDX-TOOL.LHA');
    expect(out).toContain('A tool from Paradox');   // the description, which the LIST row has not got
    expect(out).not.toContain('OTL-DOOR.LHA');
  });

  it('carries the description the list row deliberately drops', async () => {
    const session = makeSession();
    const wire: string[] = [];
    const socket = makeSocket(session, wire);

    await FileListingHandler.handleFileList(socket, session, '', false);
    const listed = glass(wire.join(''));
    expect(listed).not.toContain('A door from the Outlaws');   // not in a list row

    wire.length = 0;
    await FileListingHandler.handleFileInfoCommand(socket, session, '1');
    expect(glass(wire.join(''))).toContain('A door from the Outlaws');
  });

  it('says so when the number names nothing, instead of showing the wrong file', async () => {
    const session = makeSession();
    const wire: string[] = [];
    const socket = makeSocket(session, wire);

    await FileListingHandler.handleFileList(socket, session, '', false);
    wire.length = 0;
    await FileListingHandler.handleFileInfoCommand(socket, session, '99');
    expect(glass(wire.join(''))).toMatch(/No file 99/);
  });

  it('asks for a number when given none', async () => {
    const session = makeSession();
    const wire: string[] = [];
    await FileListingHandler.handleFileInfoCommand(makeSocket(session, wire), session, '');
    expect(glass(wire.join(''))).toMatch(/Usage: FI/);
  });

  it('numbers a NEW listing from one again', async () => {
    // The memory is per pass: a second listing must not have the first one's
    // ordinals still in it, or `FI 3` after a one-file listing shows a file
    // from the listing before.
    const session = makeSession();
    const wire: string[] = [];
    const socket = makeSocket(session, wire);

    await FileListingHandler.handleFileList(socket, session, '', false);
    await FileListingHandler.handleFileList(socket, session, '', false);
    expect(FileListingHandler.listedRecord(session, 1)?.filename).toBe('OTL-DOOR.LHA');
    expect(FileListingHandler.listedRecord(session, 3)).toBeNull();
  });

  it('never sends raw MCI', async () => {
    const session = makeSession();
    const wire: string[] = [];
    const socket = makeSocket(session, wire);
    await FileListingHandler.handleFileList(socket, session, '', false);
    wire.length = 0;
    await FileListingHandler.handleFileInfoCommand(socket, session, '1');
    expect(wire.join('')).not.toMatch(/~[A-Za-z0-9_]*\|/);
  });
});

/**
 * AND THROUGH THE REAL DISPATCH, because a `case` no dispatcher reaches is the
 * same unreachable code the ordinal was decoration for.
 */
describe('FI reaches its handler from a typed command', () => {
  it('runs the file-info case rather than answering "no such command"', async () => {
    const { handleCommand } = require('../../../src/handlers/command.handler');
    const { LoggedOnSubState } = require('../../../src/constants/bbs-states');

    const session = {
      ...makeSession(),
      subState: LoggedOnSubState.PROCESS_COMMAND,
      nodeId: 1,
      commandHistory: [],
      historyIndex: 0,
      historyCycle: 0,
      commandText: 'FI 1',
      securityFlags: 'T'.repeat(64),
    };
    const wire: string[] = [];
    const socket = makeSocket(session, wire);

    // Populate the pass memory the way a listing does, then clear the pause it
    // leaves armed - a real caller presses a key there, and without that the
    // dispatcher reads `FI 1` as the keypress rather than as a command.
    await FileListingHandler.handleFileList(socket, session, '', false);
    session.menuPause = false;
    session.subState = LoggedOnSubState.PROCESS_COMMAND;
    (session as any).flagPauseHandler = undefined;
    (session as any).checkPauseHandler = undefined;
    session.tempData.lineCount = 0;
    wire.length = 0;

    await handleCommand(socket, session, '');

    const out = glass(wire.join(''));
    expect(out).not.toMatch(/No such command/i);
    expect(out).toContain('OTL-DOOR.LHA');
  });
});

describe('FI without a listing first', () => {
  it('answers anyway, from the conference\'s own order', async () => {
    // The sysop typed `fi 3` on a fresh session and got "No file 3 in the last
    // listing" (live, 2026-09-07). Depending on a session's memory made the
    // command fail for a caller who had plainly just read a list - across a
    // reconnect, or after a door printed the numbers. The ordinal is the
    // conference's own order, so the same walk answers without the memory.
    const session = makeSession();
    const wire: string[] = [];
    const socket = makeSocket(session, wire);

    await FileListingHandler.handleFileInfoCommand(socket, session, '2');

    const out = glass(wire.join(''));
    expect(out).toContain('PDX-TOOL.LHA');
    expect(out).not.toMatch(/No file 2/);
  });

  it('still says so for a number the conference has not got', async () => {
    const session = makeSession();
    const wire: string[] = [];
    await FileListingHandler.handleFileInfoCommand(makeSocket(session, wire), session, '99');
    expect(glass(wire.join(''))).toMatch(/No file 99/);
  });
});

describe('N prints the same row F does', () => {
  it('numbers its records and lays them out at the template columns', async () => {
    const { displayNewFiles } = require('../../../src/handlers/file/file.handler');
    const session = makeSession();
    session.user.newSinceDate = new Date(2018, 0, 1);   // everything is new
    const wire: string[] = [];
    const socket = makeSocket(session, wire);

    await displayNewFiles(socket, session, 'NS');

    const rows = glass(wire.join('')).split(/\r?\n/);
    const door = rows.find((r) => r.includes('OTL-DOOR.LHA'));
    expect(door).toBeDefined();
    // The size as the DIR file wrote it - see forty-column-file-list.
    expect(door!.indexOf('40960')).toBe(5);
    expect(door!.indexOf('OTL-DOOR.LHA')).toBe(14);
    // And the ordinal it printed can be handed straight to FI.
    expect(FileListingHandler.listedRecord(session, 1)?.filename).toBe('OTL-DOOR.LHA');
  });
});
