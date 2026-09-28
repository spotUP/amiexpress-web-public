/**
 * Regression test for E-19: fileStatus header switches on TOGGLES_CREDITBYKB.
 *
 * express.e:24156-24160:
 *   IF sopt.toggles[TOGGLES_CREDITBYKB]
 *     aePuts('...    Conf  Files    KBytes         Files    KBytes         KBytes Avail Ratio\b\n')
 *   ELSE
 *     aePuts('...    Conf  Files    Bytes          Files    Bytes          Bytes Avail  Ratio\b\n')
 *   ENDIF
 *
 * Active FS command path is FileStatusHandler. We drive BOTH, with the
 * toggle set each way through the real ACS config, and assert on the header
 * the caller receives:
 *   - FileStatusHandler.handleFileStatusCommand (live path; harness as in
 *     tests/handlers/narrow-tables.test.ts)
 *   - file.handler.ts displayFileStatus (dead-but-exported duplicate; if it
 *     ever gets re-wired we don't want to silently regress to the
 *     always-KBytes-only header.)
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../src/index', () => {
  const states = require('../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});

import { flushOutput } from '../src/utils/output.util';
import { getACSConfig, setACSConfig, ToggleFlags } from '../src/utils/acs.util';
import { displayFileStatus, setGetUserStats } from '../src/handlers/file/file.handler';

const KB_HEADER = 'Conf  Files    KBytes         Files    KBytes         KBytes Avail Ratio';
const BYTES_HEADER = 'Conf  Files    Bytes          Files    Bytes          Bytes Avail  Ratio';

function aCaller() {
  const emitted: string[] = [];
  const session: any = {
    currentConf: 1,
    nodeId: 1,
    tempData: {},
    user: { id: 'u1', username: 'SPOT', securityFlags: 'T'.repeat(64), confAccess: 'X', byteLimit: 0, ratio: 3 },
  };
  const socket: any = {
    id: `fs-header-${Math.random().toString(36).slice(2)}`,
    session,
    emit(event: string, data: string) { if (event === 'ansi-output') emitted.push(data); return true; },
    on() { return socket; },
  };
  const output = () => { flushOutput(socket); return emitted.join(''); };
  return { socket, session, output };
}

const originalToggles = { ...getACSConfig().toggles };
function creditByKB(on: boolean) {
  setACSConfig({ toggles: { ...originalToggles, [ToggleFlags.CREDITBYKB]: on } as any });
}
afterAll(() => setACSConfig({ toggles: originalToggles }));

describe('fileStatus header switches on TOGGLES_CREDITBYKB (E-19, express.e:24156-24160)', () => {
  async function driveFileStatusHandler(): Promise<string> {
    const { FileStatusHandler } = require('../src/handlers/file/file-status.handler');
    const handler = new FileStatusHandler(
      { getConferences: jest.fn().mockResolvedValue([{ id: 1, name: 'General', uploads: 1, bytesUpload: 1, downloads: 1, bytesDownload: 1, ratio: 3 }]) },
      {} as any,
    );
    const caller = aCaller();
    await handler.handleFileStatusCommand(caller.socket, caller.session);
    return caller.output();
  }

  test.each([
    [true, KB_HEADER, BYTES_HEADER],
    [false, BYTES_HEADER, KB_HEADER],
  ])('FileStatusHandler with CREDITBYKB=%s shows the matching header only', async (on, shown, hidden) => {
    creditByKB(on);
    const out = await driveFileStatusHandler();
    expect(out).toContain(shown);
    expect(out).not.toContain(hidden);
  });

  test.each([
    [true, KB_HEADER, BYTES_HEADER],
    [false, BYTES_HEADER, KB_HEADER],
  ])('displayFileStatus duplicate with CREDITBYKB=%s shows the matching header only', async (on, shown, hidden) => {
    creditByKB(on);
    setGetUserStats(async () => ({ bytes_uploaded: 10, bytes_downloaded: 1, files_uploaded: 1, files_downloaded: 1 }));
    const caller = aCaller();
    await displayFileStatus(caller.socket, caller.session, '');
    const out = caller.output();
    expect(out).toContain(shown);
    expect(out).not.toContain(hidden);
  });
});
