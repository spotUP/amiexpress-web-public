/**
 * A finished download returns the caller to his prompt, with no key between.
 *
 * runPostDownload runs when the transfer ends, long after the D command
 * returned, so no command dispatch is waiting to run the display flow for
 * it. It set DISPLAY_MENU and stopped: the caller saw the stats and then a
 * silent line (the telnet regression suite, 2026-09-27, after a ZMODEM
 * download that had otherwise worked).
 */
process.env.SKIP_DB_INIT = '1';

const advanceDisplayFlow = jest.fn(async () => {});
jest.mock('../../src/handlers/command.handler', () => ({ advanceDisplayFlow }));
jest.mock('../../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => {}) }));
jest.mock('../../src/services/UserFileManager', () => ({ userFileManager: { updateUserDataFile: jest.fn() } }));
jest.mock('../../src/utils/download-logging.util', () => ({
  writeUDSessionHeader: jest.fn(async () => {}),
  writeToCallersLog: jest.fn(async () => {}),
  writeToUDLog: jest.fn(async () => {}),
}));
jest.mock('../../src/utils/display-ul-stats.util', () => ({ emitULStats: jest.fn() }));

import { runPostDownload } from '../../src/services/post-download.service';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

const emitter = { emit: jest.fn() } as any;
const aCaller = () => ({ nodeId: 1, user: { id: 'u1', username: 'sysop' } }) as any;
const finished = { downloadStartTime: Date.now() - 1000, downloadedFiles: 1, downloadedBytes: 4265, goodbyeAfter: false, success: true };

describe('the end of a download', () => {
  beforeEach(() => advanceDisplayFlow.mockClear());

  it('runs the display flow to the prompt', async () => {
    const session = aCaller();
    await runPostDownload(emitter, session, finished);

    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(advanceDisplayFlow).toHaveBeenCalledTimes(1);
  });

  it('leaves a pause that is already up for the caller to answer', async () => {
    const session = { ...aCaller(), paginatedScreen: { kind: 'doPause' } };
    await runPostDownload(emitter, session, finished);

    expect(advanceDisplayFlow).not.toHaveBeenCalled();
  });
});
