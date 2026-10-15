/**
 * Regression tests for:
 *   - NODE_BULL sysop alert suppression (#20)
 *   - CONF_BULL display on every conference join (#21)
 *
 * NODE_BULL is optional (express.e:28557 shows it only IF it exists), so a
 * board without one must not raise a red 'Screen not found' alert to the
 * sysop on every login: the display flow asks for it silently.
 *
 * CONF_BULL lives inside joinConference (express.e:5058 - the bulletin is part
 * of "Joining Conference", not shown separately by the caller), so the login
 * flow's CONF_BULL step must reach joinConference or the bulletin is never
 * shown at all.
 *
 * Both are driven through the real `advanceDisplayFlow`, with only the screen
 * renderer and the join recorded, so a 'tidy-up' that drops the silent flag or
 * the join call turns this red.
 */
process.env.SKIP_DB_INIT = '1';

import { LoggedOnSubState } from '../src/constants/bbs-states';

const displayScreen = jest.fn(async (..._args: any[]) => true);
jest.mock('../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../src/handlers/screen.handler'),
  displayScreen: (...args: any[]) => displayScreen(...args),
}));

/** A join that draws its bulletin and parks the caller, as the real one does. */
const joinConference = jest.fn(async (_socket: any, session: any) => {
  session.subState = LoggedOnSubState.READ_COMMAND;
  return true;
});
jest.mock('../src/handlers/operations/conference.handler', () => ({
  ...jest.requireActual('../src/handlers/operations/conference.handler'),
  joinConference: (...args: any[]) => joinConference(...(args as [any, any])),
}));

import { advanceDisplayFlow } from '../src/handlers/command.handler';

function aCallerInTheLoginFlow(subState: string) {
  const socket = { id: `flow-${Math.random().toString(36).slice(2)}`, emit: () => {}, on: () => {} } as any;
  const session = {
    nodeId: 1,
    state: 'loggedon',
    subState,
    currentConf: 1,
    relConfNum: 1,
    user: { id: 1, username: 'spot', name: 'spot', secLevel: 255, expert: 'X', confRJoin: 1, msgBaseRJoin: 1 },
    tempData: {},
  } as any;
  return { socket, session };
}

describe('Node/conference screen display wiring (2026-04-24)', () => {
  beforeEach(() => {
    displayScreen.mockClear();
    joinConference.mockClear();
  });

  test('the node bulletin is asked for silently, so a board without one raises no alert', async () => {
    const { socket, session } = aCallerInTheLoginFlow(LoggedOnSubState.DISPLAY_NODE_BULL);

    await advanceDisplayFlow(socket, session);

    const nodeBull = displayScreen.mock.calls.find((c) => c[2] === 'NODE_BULL');
    expect(nodeBull).toBeDefined();
    // (socket, session, 'NODE_BULL', runCommands, silent)
    expect(nodeBull![4]).toBe(true);
  });

  test('the conference-bulletin step of the login flow joins the conference, which shows CONF_BULL', async () => {
    const { socket, session } = aCallerInTheLoginFlow(LoggedOnSubState.DISPLAY_CONF_BULL);

    await advanceDisplayFlow(socket, session);

    expect(joinConference).toHaveBeenCalledTimes(1);
  });
});
