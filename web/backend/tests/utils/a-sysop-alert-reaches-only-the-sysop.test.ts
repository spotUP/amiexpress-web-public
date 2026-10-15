/**
 * notifySysop wrote to the session it was handed - the CALLER's - so an
 * ordinary caller read the board's install trouble mid-call.
 */
import { notifySysop } from '../../src/utils/sysop-alert.util';

function sessionOf(secLevel: number) {
  const emit = jest.fn();
  return { emit, session: { socket: { emit }, user: { secLevel }, sysop_debug_enabled: true } };
}

test('a caller is not shown the alert', () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const { emit, session } = sessionOf(10);
  notifySysop(session, 'No Amiga ROM found.');
  expect(emit).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

test('the sysop is', () => {
  const { emit, session } = sessionOf(255);
  notifySysop(session, 'No Amiga ROM found.');
  expect(emit).toHaveBeenCalledWith('ansi-output', expect.stringContaining('No Amiga ROM found.'));
});
