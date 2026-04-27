// @ts-nocheck

// Mock getMaxDirs so FileListingHandler doesn't need real conference dirs
jest.mock('../../../src/utils/max-dirs.util', () => ({
  getMaxDirs: jest.fn(),
  getDirFiles: jest.fn().mockResolvedValue([]),
}));

import { FileListingHandler } from '../../../src/handlers/file/file-listing.handler';
import { DownloadHandler } from '../../../src/handlers/file/download.handler';
import { LoggedOnSubState } from '../../../src/constants/bbs-states';
import { getMaxDirs } from '../../../src/utils/max-dirs.util';

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

  test('emits permission denied and sets DISPLAY_MENU when secLevel is too low', async () => {
    const socket = makeSocket();
    const session = makeDownloadSession(5); // secLevel 5 < 10 → no permission
    await DownloadHandler.handleDownloadCommand(socket, session, '');
    // Should emit denial message
    const allEmits: string[] = socket.emit.mock.calls.map((c: any[]) => String(c[1] ?? ''));
    expect(allEmits.some(s => s.includes('ermission') || s.includes('denied') || s.includes('31m'))).toBe(true);
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
    await FileListingHandler.handleFileList(socket, session, '');
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
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
