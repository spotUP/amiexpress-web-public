import { loggableXimString } from '../../src/amiga-emulation/xim/redact';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

test('a DT_PASSWORD write never reaches a log', () => {
  expect(loggableXimString(XIMCommand.DT_PASSWORD, 0, 'hunter2')).toBe('[password withheld]');
});
test('the W door\'s PASSWORD request never reaches a log, any other request does', () => {
  expect(loggableXimString(XIMCommand.AEW_USERFIELD, 1, 'PASSWORD hunter2\thunter2')).toBe('PASSWORD [withheld]');
  expect(loggableXimString(XIMCommand.AEW_USERFIELD, 1, 'SET 4 Göteborg')).toBe('SET 4 Göteborg');
  expect(loggableXimString(XIMCommand.DT_NAME, 1, 'Spot')).toBe('Spot');
});
