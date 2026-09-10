/**
 * DS double-enter regression (live 2026-09-10).
 *
 * The sysop pressed Enter once at `Filespec(4):` and nothing happened;
 * only the second Enter reached the filename loop. Server log proof:
 * `ENTRY download_filename_input paginatedScreen=true` followed by
 * `handlePaginatedScreenInput returned: handled=true` — a stale
 * pagination gate ate the keystroke (emitting a bare newline) before
 * the line-input state ever saw it.
 *
 * Fix: every filespec prompt and the LAST CHANCE prompt disarm the gate.
 * A line-input prompt and a pending pause are mutually exclusive.
 */

import { DownloadHandler } from '../src/handlers/file/download.handler';
import { LoggedOnSubState } from '../src/constants/bbs-states';

function fakeSocket() {
  const out: string[] = [];
  return {
    socket: { emit: (_ev: string, text: string) => { out.push(String(text)); } } as any,
    out,
  };
}

function armedSession(extra: Record<string, unknown> = {}) {
  return {
    user: { secLevel: 255, uploads: 0, downloads: 0 },
    currentConf: 1,
    tempData: { downloadFileList: [{ name: 'ACP-SR10.LHA', size: 10240 }], downloadNumFiles: 1 },
    // The stale gate, exactly as the live log showed it.
    paginatedScreen: { lines: ['\r\n'], nextIndex: 0, pageSize: 1, kind: 'doPause' },
    menuPause: true,
    subState: LoggedOnSubState.DOWNLOAD_FILENAME_INPUT,
    ...extra,
  } as any;
}

describe('DS filespec prompt disarms a stale pagination gate', () => {
  test('showFilespecPrompt clears the gate before reading a line', () => {
    const { socket, out } = fakeSocket();
    const session = armedSession();
    (DownloadHandler as any).showFilespecPrompt(socket, session);
    expect(session.paginatedScreen).toBeUndefined();
    expect(session.menuPause).toBe(false);
    expect(out.join('')).toMatch(/Filespec\(2\):/);
  });

  test('blank Enter with files reaches LAST CHANCE despite an armed gate', async () => {
    const { socket, out } = fakeSocket();
    const session = armedSession();
    // The prompt disarms first (previous test's contract), then blank input
    // ends the list per express.e:20139.
    (DownloadHandler as any).showFilespecPrompt(socket, session);
    await DownloadHandler.handleFilenameInput(socket, session, '');
    expect(session.subState).toBe(LoggedOnSubState.DOWNLOAD_CONFIRM_INPUT);
    expect(session.paginatedScreen).toBeUndefined();
    expect(out.join('')).toMatch(/LAST CHANCE/);
  });

  test('LAST CHANCE prompt disarms the gate before reading the key', async () => {
    const { socket, out } = fakeSocket();
    const session = armedSession({ subState: LoggedOnSubState.DOWNLOAD_FILENAME_INPUT });
    (DownloadHandler as any).showFilespecPrompt(socket, session);
    // Re-arm between prompt and answer: the mid-loop case from the live log.
    session.paginatedScreen = { lines: ['\r\n'], nextIndex: 0, pageSize: 1, kind: 'doPause' };
    await DownloadHandler.handleFilenameInput(socket, session, '');
    expect(session.paginatedScreen).toBeUndefined();
    expect(out.join('')).toMatch(/LAST CHANCE/);
  });
});
