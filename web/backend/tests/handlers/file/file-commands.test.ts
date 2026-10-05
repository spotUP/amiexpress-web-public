// @ts-nocheck

// Mock getMaxDirs so FileListingHandler doesn't need real conference dirs
jest.mock('../../../src/utils/max-dirs.util', () => ({
  getMaxDirs: jest.fn(),
  getDirFiles: jest.fn().mockResolvedValue([]),
}));


// Mock the screen handler so we can assert displayScreen() is called with
// silent=true for optional screens (DOWNLOAD), and skip its IO.
jest.mock('../../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(false),
  doPause: jest.fn(),
}));

import { FileListingHandler } from '../../../src/handlers/file/file-listing.handler';
import { DownloadHandler } from '../../../src/handlers/file/download.handler';
import { LoggedOnSubState } from '../../../src/constants/bbs-states';
import { getMaxDirs } from '../../../src/utils/max-dirs.util';
import { displayScreen as mockedDisplayScreen } from '../../../src/handlers/screen.handler';

const mockGetMaxDirs = getMaxDirs as jest.Mock;

function makeSocket() {
  return { emit: jest.fn(), id: 'test-socket' };
}

function makeDownloadSession(secLevel = 20): any {
  return {
    state: 'logged_in',
    subState: LoggedOnSubState.DISPLAY_MENU,
    nodeId: 1,
    currentConf: 1,
    user: {
      username: 'Downloader',
      secLevel,
      confAccess: 'X',
    },
    flaggedFiles: [],
  };
}

function makeFileListSession(overrides: any = {}): any {
  return {
    state: 'logged_in',
    subState: 'display_menu',
    nodeId: 1,
    currentConf: 1,
    user: {
      username: 'Browser',
      secLevel: 20,
      confAccess: 'X',
    },
    flaggedFiles: [],
    ...overrides,
  };
}

describe('DownloadHandler.handleDownloadCommand — permission check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('refuses silently with RESULT_NOT_ALLOWED - the dispatcher says why (express.e:24854, 28400)', async () => {
    const socket = makeSocket();
    const session = makeDownloadSession(5); // secLevel 5 < 10 → no permission
    const { RESULT_NOT_ALLOWED } = require('../../../src/constants/command-results');
    expect(await DownloadHandler.handleDownloadCommand(socket, session, '')).toBe(RESULT_NOT_ALLOWED);
    expect(socket.emit).not.toHaveBeenCalled();
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  test('does not immediately set DISPLAY_MENU for permitted user (proceeds past permission gate)', async () => {
    const socket = makeSocket();
    const session = makeDownloadSession(20); // secLevel 20 → has permission
    // handleDownloadCommand will proceed into beginDLF → downloadAFile → prompt for filename
    // The subState may change to DOWNLOAD_FILENAME_INPUT or similar, not remain DISPLAY_MENU
    await DownloadHandler.handleDownloadCommand(socket, session, '');
    // Just verify it did NOT emit the 31m (red) permission denied prefix at call [0]
    const firstEmit = socket.emit.mock.calls[0]?.[1] ?? '';
    expect(String(firstEmit)).not.toMatch(/\[31mPermission denied/);
  });
});

// ACSPermission.DOWNLOAD = 3. Grant it via securityFlags (per-user
// override in the user record). This bypasses Access/ACS.*.info file lookups
// so the unit test doesn't need real ACS files on disk.
function makeDownloadUser(username: string) {
  const flags = '?'.repeat(87).split('');
  flags[3] = 'T'; // ACSPermission.DOWNLOAD
  return {
    username,
    secLevel: 20,
    confAccess: 'X',
    secLibrary: 0, // ratio disabled — skip ratio branch
    secOverride: '',
    securityFlags: flags.join(''),
  };
}

describe('DownloadHandler — flagged-file plumbing (regression for #10)', () => {
  // Background: the F command writes flags to session.flaggedFiles with shape
  // {filename, confNum, ...}. The 68K door's JH_FLAGFILE handler also writes
  // {filename, confNum} to session.flaggedFiles. The D command used to read
  // from session.tempData?.flaggedFiles (wrong location) AND key off f.fileName
  // (camelCase). So flags from the file-listing UI never got picked up.

  let originalFindFiles: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Spy/replace the private static so we don't touch the filesystem.
    originalFindFiles = (DownloadHandler as any).findFilesInConference;
    // The contract is `{ files, storageError }`, not a bare array: a pooled
    // area can answer with files AND an error, and findFilesReporting reports
    // the error before it uses the files. Returning an array here destructured
    // to `files === undefined` and threw "found is not iterable" - the suite
    // had been red on main since the pooled-storage change.
    (DownloadHandler as any).findFilesInConference = jest.fn(async (
      _dataDir: string, confNum: number, pattern: string
    ) => ({
      files: [{ name: pattern, size: 100, confNum, dirNum: 1, fullPath: `/fake/${pattern}` }],
      storageError: undefined,
    }));
  });

  afterEach(() => {
    (DownloadHandler as any).findFilesInConference = originalFindFiles;
  });

  test('flags from the F command (session.flaggedFiles[].filename) are picked up by D', async () => {
    const socket = makeSocket();
    const session: any = {
      state: 'logged_in',
      subState: LoggedOnSubState.DISPLAY_MENU,
      nodeId: 1,
      currentConf: 1,
      user: makeDownloadUser('Flagger'),
      // Shape produced by display-file-commands.handler.ts (and JH_FLAGFILE):
      flaggedFiles: [
        { filename: 'FOO.LZH', confNum: 1, size: 100 },
        { filename: 'BAR.LHA', confNum: 2, size: 200 },
      ],
    };

    await DownloadHandler.handleDownloadCommand(socket, session, '');

    const findFiles = (DownloadHandler as any).findFilesInConference as jest.Mock;
    // Both flagged files must have been resolved — once each, with their actual filenames
    // (proves we read `filename`, not `fileName`).
    expect(findFiles).toHaveBeenCalledWith(expect.any(String), 1, 'FOO.LZH');
    expect(findFiles).toHaveBeenCalledWith(expect.any(String), 2, 'BAR.LHA');

    // The resolved files must be staged in tempData.downloadFileList.
    expect(session.tempData?.downloadFileList?.length).toBe(2);
    expect(session.tempData?.downloadFileList?.map((f: any) => f.name)).toEqual(['FOO.LZH', 'BAR.LHA']);
  });

  test('legacy flagged objects keyed by fileName still resolve (back-compat)', async () => {
    const socket = makeSocket();
    const session: any = {
      state: 'logged_in',
      subState: LoggedOnSubState.DISPLAY_MENU,
      nodeId: 1,
      currentConf: 1,
      user: makeDownloadUser('Legacy'),
      flaggedFiles: [{ fileName: 'OLDSHAPE.ZIP', confNum: 1 }],
    };

    await DownloadHandler.handleDownloadCommand(socket, session, '');

    expect((DownloadHandler as any).findFilesInConference).toHaveBeenCalledWith(
      expect.any(String), 1, 'OLDSHAPE.ZIP'
    );
    expect(session.tempData?.downloadFileList?.length).toBe(1);
  });

  test('no flagged files and no params → findFilesInConference is not called', async () => {
    const socket = makeSocket();
    const session: any = {
      state: 'logged_in',
      subState: LoggedOnSubState.DISPLAY_MENU,
      nodeId: 1,
      currentConf: 1,
      user: makeDownloadUser('Nobody'),
      flaggedFiles: [],
    };

    await DownloadHandler.handleDownloadCommand(socket, session, '');

    expect((DownloadHandler as any).findFilesInConference).not.toHaveBeenCalled();
    expect(session.tempData?.downloadNumFiles).toBe(0);
  });

  test('the download screen is asked for by a name the loader routes, silently', async () => {
    const socket = makeSocket();
    const session: any = {
      state: 'logged_in',
      subState: LoggedOnSubState.DISPLAY_MENU,
      nodeId: 1,
      currentConf: 1,
      user: makeDownloadUser('Quiet'),
      flaggedFiles: [],
    };

    await DownloadHandler.handleDownloadCommand(socket, session, '');

    // This test used to pin the string 'DOWNLOAD', and passed for months on a
    // handler that could never show the screen: 'DOWNLOAD' is not a key in
    // SCREEN_DIR_MAP, so getScreenDirType answered null, the search list came
    // back empty, and the file was unreachable however well it was drawn.
    // Pin the ROUTED name - the one screen-tables.ts actually has - so the
    // test fails if the two ever disagree again.
    const { SCREEN_DIR_MAP } = require('../../../src/screens/screen-tables');
    expect(mockedDisplayScreen).toHaveBeenCalled();
    const call = (mockedDisplayScreen as jest.Mock).mock.calls.find(
      (c: any[]) => typeof c[2] === 'string' && c[2].toUpperCase().startsWith('DOWNLOAD')
    );
    expect(call).toBeDefined();
    expect(SCREEN_DIR_MAP[String(call[2]).toUpperCase()]).toBeDefined();
    // The 5th argument MUST be true — express.e treats the screen as optional.
    expect(call[4]).toBe(true);
  });
});

describe('FileListingHandler.handleFileList — no file areas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMaxDirs.mockResolvedValue(0);
  });

  test('emits error and sets DISPLAY_MENU when conference has no file areas', async () => {
    const socket = makeSocket();
    const session = makeFileListSession();
    await FileListingHandler.handleFileList(socket, session, '');
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    const allEmits: string[] = socket.emit.mock.calls.map((c: any[]) => String(c[1] ?? ''));
    const hasError = allEmits.some(s => s.includes('No file areas') || s.includes('31m') || s.includes('ailable'));
    expect(hasError).toBe(true);
  });

  test('transitions subState to DISPLAY_MENU on empty conference', async () => {
    const socket = makeSocket();
    const session = makeFileListSession();
    await FileListingHandler.handleFileList(socket, session, '');
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});

describe('FileListingHandler.handleFileList — with file areas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMaxDirs.mockResolvedValue(3); // Conference has 3 dir slots
  });

  test('always returns DISPLAY_MENU after listing completes', async () => {
    const socket = makeSocket();
    const session = makeFileListSession();
    // getDirFiles returns [] so no actual files to list — still sets DISPLAY_MENU
    await FileListingHandler.handleFileList(socket, session, 'A');
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  // express.e:27647 -> getDirSpan('') 26862-26874. The port listed every
  // directory on a bare F and never asked (parity survey, 2026-09-29).
  test('bare F asks which directories, and waits for the answer', async () => {
    const socket = makeSocket();
    const session = makeFileListSession();
    await FileListingHandler.handleFileList(socket, session, '');
    const said = socket.emit.mock.calls.map((c: any[]) => String(c[1] ?? '')).join('');
    expect(said.replace(/\x1b\[[0-9;]*m/g, '')).toContain('Directories: (1-3), (A)ll, (U)pload, ');
    expect(session.subState).toBe(LoggedOnSubState.FILE_LIST_DIR_INPUT);

    await FileListingHandler.handleFileListDirInput(socket, session, 'A');
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  test('Enter at the directory prompt lists nothing and goes back to the menu', async () => {
    const socket = makeSocket();
    const session = makeFileListSession();
    await FileListingHandler.handleFileList(socket, session, '');
    socket.emit.mockClear();
    await FileListingHandler.handleFileListDirInput(socket, session, '');
    const said = socket.emit.mock.calls.map((c: any[]) => String(c[1] ?? '')).join('');
    // lineInput's line break, then getDirSpan's aePuts('\b\n') (express.e:26873).
    expect(said).toBe('\r\n\r\n');
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  test('a span that names no directory is express.e\'s plain "No such directory."', async () => {
    const socket = makeSocket();
    const session = makeFileListSession();
    await FileListingHandler.handleFileList(socket, session, '');
    socket.emit.mockClear();
    await FileListingHandler.handleFileListDirInput(socket, session, '99');
    const said = socket.emit.mock.calls.map((c: any[]) => String(c[1] ?? '')).join('');
    expect(said).toBe('\r\n\r\nNo such directory.\r\n\r\n'); // express.e:26905
  });

  test('emits at least one ansi-output event', async () => {
    const socket = makeSocket();
    const session = makeFileListSession();
    await FileListingHandler.handleFileList(socket, session, '');
    const ansiEmits = socket.emit.mock.calls.filter((c: any[]) => c[0] === 'ansi-output');
    expect(ansiEmits.length).toBeGreaterThan(0);
  });

  test('invalid directory param sets DISPLAY_MENU', async () => {
    const socket = makeSocket();
    const session = makeFileListSession();
    // '99' is out of range for 3 dirs
    await FileListingHandler.handleFileList(socket, session, '99');
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});
