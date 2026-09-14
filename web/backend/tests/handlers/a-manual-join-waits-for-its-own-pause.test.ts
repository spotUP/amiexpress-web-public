/**
 * `J <n>` must not walk to the menu while the join is still paused.
 *
 * express.e:25181 is `joinConf(newConf,newMsgBase,FALSE,FALSE)` and it
 * BLOCKS: its doPause (5059) holds the caller, and "Joining Conference"
 * (5079), the message stats (5093) and the mail scan (5119) have all run by
 * the time it returns. Only then is the menu next.
 *
 * Ours cannot block. With a bulletin to pause on, `joinConference` installs
 * the pause, parks READ_COMMAND and returns; `continueJoinAfterBull` runs the
 * rest on dismissal and restores DISPLAY_MENU itself.
 *
 * The handler set DISPLAY_MENU anyway, straight over that park - so the flow
 * reached the menu while the join was still waiting. The live log has the
 * order exactly:
 *
 *     2921  [doPause] CALLED            <- the join's pause
 *     2937  displaying MENU
 *     2945  displayMenuPrompt called
 *     2964  executeAmigaDoor Doors/SUBS <- the mail scan, AFTER the prompt
 *
 * The sysop, 2026-09-15: "a bbs prompt leaks and there is a pause after the
 * subs mail list that should not be there".
 */
process.env.SKIP_DB_INIT = '1';

import { LoggedOnSubState } from '../../src/constants/bbs-states';
import {
  handleJoinConferenceCommand,
  setUserCommandsDependencies,
} from '../../src/handlers/commands/user-commands.handler';

/** The board, with `joinConference` standing in for the real one. */
function aBoard(joinConference: (...args: any[]) => Promise<any>) {
  setUserCommandsDependencies({
    // Three, because the handler bounds the number by conferences.LENGTH
    // (express.e:25140-25150), so "J 3" against a two-entry board falls
    // through to the conference prompt instead of joining.
    conferences: [
      { id: 1, name: 'Amiga Demoscene' },
      { id: 2, name: 'Internal' },
      { id: 3, name: 'Console Demoscene' },
    ],
    messageBases: [{ id: 3, conferenceId: 3, name: 'General' }],
    db: {} as any,
    joinConference,
    checkConfAccess: () => true,
    displayScreen: async () => false,
    displayUploadInterface: async () => {},
    displayDownloadInterface: async () => {},
  } as any);
}

function aCaller() {
  const socket = { id: 'manual-join', emit: () => {}, on: () => {} } as any;
  const session = {
    nodeId: 1,
    state: 'loggedon',
    subState: LoggedOnSubState.READ_COMMAND,
    currentConf: 1,
    relConfNum: 1,
    user: { id: 1, username: 'sysop', name: 'sysop', secLevel: 255, expert: 'X' },
    tempData: {},
  } as any;
  return { socket, session };
}

describe('a manual J with a bulletin to read', () => {
  it('leaves the join parked rather than jumping to the menu', async () => {
    // What joinConference does when it has a bulletin: pause, park, yield.
    aBoard(async (_s: any, session: any) => {
      session.paginatedScreen = { lines: [''], nextIndex: 1, pageSize: 1, kind: 'doPause' };
      session.subState = LoggedOnSubState.READ_COMMAND;
      return true;
    });
    const { socket, session } = aCaller();

    await handleJoinConferenceCommand(socket, session, '3');

    // Red before the fix: DISPLAY_MENU, and the menu prompt printed over the
    // pause with the mail scan still to come.
    expect(session.subState).toBe(LoggedOnSubState.READ_COMMAND);
  });

  it('still sends a bulletin-less join to the menu', async () => {
    // A join that never yields has nothing to wait for, and nothing else will
    // set the menu for it.
    aBoard(async () => true);
    const { socket, session } = aCaller();

    await handleJoinConferenceCommand(socket, session, '3');

    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  it('waits when the bulletin left segments rather than a pause', async () => {
    // The other shape of an unfinished screen: `~SP` segments still pending.
    aBoard(async (_s: any, session: any) => {
      session.screenSegments = { segments: ['~f\r\n~CC_ctop'], screenName: 'CONF_BULL' };
      session.subState = LoggedOnSubState.READ_COMMAND;
      return true;
    });
    const { socket, session } = aCaller();

    await handleJoinConferenceCommand(socket, session, '3');

    expect(session.subState).toBe(LoggedOnSubState.READ_COMMAND);
  });
});
