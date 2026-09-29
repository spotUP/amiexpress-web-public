/**
 * CallersLog says how a call ended (express.e:8160-8166, logoffLog 9457).
 *
 * "Off Normally" when the board ended the call, "Off Loss Carrier" when the
 * line just went. The port logged every call "Off Normally", drops included
 * (parity survey, 2026-09-29), so a sysop could not tell a caller who said
 * goodbye from one whose connection died.
 */
jest.mock('../../src/utils/acs-access-loader');
import { logoffReason } from '../../src/server/socket-handlers';
import { BBSState } from '../../src/constants/bbs-states';

describe('the logoff reason CallersLog records', () => {
  test('a caller who closed the connection is Loss Carrier', () => {
    expect(logoffReason({ state: BBSState.LOGGEDON })).toBe('Loss Carrier');
  });

  test('G, a sysop kick and a board-side logoff are Off Normally', () => {
    expect(logoffReason({ state: BBSState.AWAIT, cleanLogoff: true })).toBe('N');
    expect(logoffReason({ state: BBSState.LOGGEDON, sysopKicked: true })).toBe('N');
    expect(logoffReason({ state: BBSState.LOGGING_OFF })).toBe('N');
  });

  test('an idle timeout says what TIMEOUT_LC made it', () => {
    expect(logoffReason({ state: BBSState.LOGGEDON, timeoutLogoffStat: 'Loss Carrier' })).toBe('Loss Carrier');
    expect(logoffReason({ state: BBSState.LOGGEDON, timeoutLogoffStat: 'N' })).toBe('N');
  });
});
