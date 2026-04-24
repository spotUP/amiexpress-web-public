/**
 * Regression test for the R reader exit flow (2026-04-24).
 *
 * When the user pressed Enter at the last message, the previous code
 * transitioned session.subState to DISPLAY_CONF_BULL, which made the
 * display-flow dispatcher replay CONF_BULL -> NODE_BULL -> MENU — ie the
 * entire login-time bulletin chain. express.e's R command just returns
 * to STATE_LOGGEDON/SUBSTATE_READ_COMMAND (the menu prompt), so the fix
 * is to set subState = DISPLAY_MENU on exit.
 *
 * We drive the public `handleMessageReaderNav` entry point with an
 * empty input (Enter) while the session is parked at the last message.
 */

import { handleMessageReaderNav, setMessagingDependencies } from '../src/handlers/message/messaging.handler';
import { LoggedOnSubState } from '../src/constants/bbs-states';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

let socketCounter = 0;
function makeSocket() {
  const emits: any[] = [];
  socketCounter++;
  const socket: any = {
    id: `rx-${socketCounter}-${Date.now()}`,
    emit(event: string, payload: any) { emits.push({ event, payload }); },
    on() {},
    disconnect() {},
  };
  return { socket, emits };
}

describe('R reader exit transitions straight to DISPLAY_MENU (2026-04-24 fix)', () => {
  beforeAll(async () => {
    const db = await waitForTestDb();
    setMessagingDependencies({ db });
  }, 30000);

  test('Enter at the last message exits with subState=DISPLAY_MENU (not DISPLAY_CONF_BULL)', async () => {
    const { socket } = makeSocket();

    // Minimal session shape — reader already initialised, positioned at
    // the last message so Enter triggers saveMessagePointerAndExit.
    // lastMsgReadConf === highestRead skips the db.updateReadPointer call
    // that would otherwise require a numeric user id the repository expects.
    const session: any = {
      state: 'loggedon',
      subState: LoggedOnSubState.MSG_READER_NAV,
      user: { id: 'test-user-exit', username: 'exitTester' },
      currentConf: 1,
      currentMsgBase: 1,
      lastMsgReadConf: 1,
      inputBuffer: '',
      tempData: {
        msgReaderMessages: [{ id: 1, msgNumber: 1, subject: 'only', author: 'sysop', body: 'yo', isPrivate: false }],
        msgReaderIndex: 0,             // at the only message (last)
        msgReaderHighestRead: 1,
      },
    };

    await handleMessageReaderNav(socket, session, '');

    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    // And we should NOT be leaving the user in the bulletin-replay chain.
    expect(session.subState).not.toBe(LoggedOnSubState.DISPLAY_CONF_BULL);
    expect(session.subState).not.toBe(LoggedOnSubState.DISPLAY_NODE_BULL);
  });

  test('Q at any message also exits with subState=DISPLAY_MENU', async () => {
    const { socket } = makeSocket();
    const session: any = {
      state: 'loggedon',
      subState: LoggedOnSubState.MSG_READER_NAV,
      user: { id: 'test-user-q', username: 'qTester' },
      currentConf: 1,
      currentMsgBase: 1,
      lastMsgReadConf: 1,   // skip updateReadPointer call
      inputBuffer: '',
      tempData: {
        msgReaderMessages: [
          { id: 1, msgNumber: 1, subject: 'one',   author: 'sysop', body: '1', isPrivate: false },
          { id: 2, msgNumber: 2, subject: 'two',   author: 'sysop', body: '2', isPrivate: false },
        ],
        msgReaderIndex: 0,  // mid-read
        msgReaderHighestRead: 1,
      },
    };

    await handleMessageReaderNav(socket, session, 'Q');

    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});
