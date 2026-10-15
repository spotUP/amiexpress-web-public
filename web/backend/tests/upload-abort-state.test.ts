/**
 * Regression test for E-14: Upload A=Abort handling at filename input.
 *
 * express.e:17668-17670 — at the FileName prompt, a single 'A' or 'a' aborts
 * the batch upload by emitting '\b\n' and returning RESULT_FAILURE. The
 * caller cleanItUp's and returns to the main menu loop.
 *
 * Driven through the real `handleCommand`, one key per call as the transport
 * delivers them, so this catches regressions where:
 *   - the abort branch is removed (B-23-style "tidy up")
 *   - the post-abort transition drifts back to DISPLAY_CONF_BULL (which
 *     re-displays the conference bulletin instead of the menu — the
 *     parallel UPLOAD_OKAY_CONFIRM A=Abort path uses DISPLAY_MENU)
 */
process.env.SKIP_DB_INIT = '1';

import { handleCommand } from '../src/handlers/command.handler';
import { BBSState, LoggedOnSubState } from '../src/index';

let n = 0;
function atTheFileNamePrompt() {
  const socket = { id: `upload-abort-${++n}`, emit: () => true, on: () => {}, off: () => {}, removeListener: () => {} } as any;
  const session: any = {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.UPLOAD_FILENAME_INPUT,
    connectionType: 'web',
    nodeId: 1,
    currentConf: 1,
    user: { id: 1, username: 'spot', secLevel: 100 },
    tempData: { uploadMode: true, uploadBatch: [], uploadCount: 1, uploadStartTime: Date.now() },
  };
  return { socket, session };
}

async function type(keys: string) {
  const { socket, session } = atTheFileNamePrompt();
  for (const key of keys) await handleCommand(socket, session, key);
  return session;
}

describe('Upload abort at filename input (E-14, express.e:17668-17670)', () => {
  test.each(['A', 'a'])('%s alone abandons the upload and goes back to the menu, not the bulletin', async (key) => {
    const session = await type(`${key}\r`);

    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(session.tempData).toBeUndefined();
  });

  test('a name that merely starts with A is a filename, not an abort', async () => {
    const session = await type('AB.LHA\r');

    expect(session.subState).not.toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(session.tempData?.currentFilename).toBe('AB.LHA');
  });
});
