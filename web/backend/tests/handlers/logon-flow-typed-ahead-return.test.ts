/**
 * Regression: "telnet sessions get stuck at the tip of the day screen, any key
 * to continue does not work" (live, 2026-11-09).
 *
 * MAILSCAN.TXT starts with ~CC_TIPLOGIN, so the CONF_SCAN step of the logon
 * flow awaits the tip door. A RETURN typed ahead during the login pauses was
 * queued before the door started; dispatchInOrder's 2 s cap released it while
 * the first step still waited, and it stepped the flow again: MAILSCAN drawn
 * twice, the tip door started twice. The caller's key went to the second door
 * and the first sat out its 30 s timeout.
 *
 * Drives the real handleCommand -> advanceDisplayFlow -> stepDisplayFlow with
 * the real dispatchInOrder; displayScreen('MAILSCAN') stands in for the door
 * start (counts calls, never resolves until released).
 */
process.env.SKIP_DB_INIT = '1';
let mailscanStarts = 0;
let releaseDoor: () => void = () => {};
jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn(async (_s: unknown, session: { inDoorManager?: boolean; doorInputHandler?: unknown }, name: string) => {
    if (name !== 'MAILSCAN') return false;
    mailscanStarts += 1;
    session.inDoorManager = true;
    session.doorInputHandler = () => {};
    await new Promise<void>((r) => { releaseDoor = r; });
    session.inDoorManager = false;
    session.doorInputHandler = undefined;
    return true;
  }),
  doPause: jest.fn(),
  checkScreenClear: jest.fn(),
  runQueuedScreenCommands: jest.fn(async () => {}),
  continueAfterScreen: jest.fn(async (_s: unknown, _se: unknown, next: () => unknown) => { await next(); return false; }),
}));
jest.mock('../../src/handlers/message/message-scan.handler', () => ({
  performConferenceScan: jest.fn(async () => 0),
  setMessageScanDependencies: jest.fn(),
}));

import { handleCommand } from '../../src/handlers/command.handler';
import { dispatchInOrder } from '../../src/server/terminal-input';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

it('a RETURN typed ahead before the tip door starts does not start the tip door a second time', async () => {
  const socket = { id: 's1', emit() {}, on() {}, off() {}, removeListener() {} };
  const session = {
    state: 'loggedon', subState: LoggedOnSubState.CONF_SCAN, nodeId: 1, currentConf: 1, relConfNum: 1,
    user: { id: 1, username: 'tester', name: 'tester', secLevel: 10, securityFlags: '', confAccess: 'X' },
    tempData: {},
  };
  // Both keys arrived while no door was active, so both are queued for the BBS.
  dispatchInOrder(session as never, ['\r', '\r'], (p) => handleCommand(socket as never, session as never, p), (e) => { throw e; });
  // Past the 2 s dispatch cap, which releases the second key while the first waits on the door.
  await new Promise((r) => setTimeout(r, 2600));
  expect(mailscanStarts).toBe(1);
  releaseDoor();
  await new Promise((r) => setTimeout(r, 50));
  // The first step still carries the flow on when the door ends.
  expect(session.subState).not.toBe(LoggedOnSubState.CONF_SCAN);
  expect(mailscanStarts).toBe(1);
}, 10000);
