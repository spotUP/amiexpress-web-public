/**
 * Pressing Return at the menu redraws the menu. Every time.
 *
 * express.e:28228 redisplays the menu when a caller enters an empty command,
 * with no rate limit of any kind. This port added a 500ms debounce to
 * `displayMainMenu` for "rapid door-completion/state-transition races" - a
 * guard with no express.e equivalent - and it does not know the difference
 * between a race and a keystroke.
 *
 * The live board, 2026-09-15, while the sysop was at the menu:
 *
 *   === handleCommand called ===  data: "\r"   subState: read_command
 *    Empty command, redisplaying menu
 *   [menu] displayMainMenu SKIPPED (debounce - last menu was 129 ms ago)
 *
 * Two separate keypresses, the second swallowed. He pressed a key and the
 * board did nothing - which is worse than the doubled draw the guard exists
 * to prevent, because the caller is the one who asked.
 *
 * Driven through the real `handleCommand` and the real `displayMainMenu`: a
 * menu drawn 100ms ago, then Return. `_lastMainMenuTime` only moves when the
 * menu is actually drawn (a debounced call returns before touching it), so it
 * is the witness that the second draw happened.
 */
process.env.SKIP_DB_INIT = '1';

import { handleCommand } from '../../src/handlers/command.handler';
import { displayMainMenu } from '../../src/handlers/command-handler/menu';
import { BBSState, LoggedOnSubState } from '../../src/index';

function makeSocket() {
  return {
    id: `empty-cmd-${Math.random().toString(36).slice(2)}`,
    emit: () => true,
    on: () => {}, off: () => {}, removeListener: () => {},
  } as any;
}

/** A caller at the command prompt whose menu was drawn `msAgo` ago. */
function atTheMenu(msAgo: number): any {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.READ_COMMAND,
    connectionType: 'web',
    screenWidth: 80,
    screenHeight: 25,
    nodeId: 1,
    currentConf: 1,
    inputBuffer: '',
    user: { id: 1, username: 'spot', secLevel: 255, expert: 'X' },
    tempData: {},
    _lastMainMenuTime: Date.now() - msAgo,
  };
}

describe('an empty command at the menu', () => {
  it('redraws the menu even when the last one was drawn a moment ago', async () => {
    const session = atTheMenu(100);
    const before = session._lastMainMenuTime;

    await handleCommand(makeSocket(), session, '\r');

    expect(session._lastMainMenuTime).toBeGreaterThan(before);
  });
});

describe('the debounce itself', () => {
  it('still swallows an internal redraw inside 500ms, the race it was written for', async () => {
    // The round trip: this fix exempts ONE caller, it does not delete the
    // guard. Internal callers that fire twice on a state transition still
    // meet it.
    const session = atTheMenu(100);
    const before = session._lastMainMenuTime;

    await displayMainMenu(makeSocket(), session);

    expect(session._lastMainMenuTime).toBe(before);
  });

  it('lets a caller that means it past', async () => {
    const session = atTheMenu(100);
    const before = session._lastMainMenuTime;

    await displayMainMenu(makeSocket(), session, false, /* bypassDebounce */ true);

    expect(session._lastMainMenuTime).toBeGreaterThan(before);
  });
});
