import { loggableXimString } from '../../src/amiga-emulation/xim/redact';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

test('a DT_PASSWORD write never reaches a log', () => {
  expect(loggableXimString(XIMCommand.DT_PASSWORD, 0, 'hunter2')).toBe('[password withheld]');
});
test('the W door\'s PASSWORD request never reaches a log, any other request does', () => {
  expect(loggableXimString(XIMCommand.AEW_USERFIELD, 1, 'PASSWORD hunter2\thunter2')).toBe('PASSWORD [withheld]');
  expect(loggableXimString(XIMCommand.AEW_USERFIELD, 1, 'SET 6 hunter2')).toBe('PASSWORD [withheld]');
  expect(loggableXimString(XIMCommand.AEW_USERFIELD, 1, 'SET 60 x')).toBe('SET 60 x');
  expect(loggableXimString(XIMCommand.AEW_USERFIELD, 1, 'SET 4 Göteborg')).toBe('SET 4 Göteborg');
  expect(loggableXimString(XIMCommand.DT_NAME, 1, 'Spot')).toBe('Spot');
});

// A menu door echoes the caller's typed command line as screen output (JH_SM), and a caller can type a password there.
test('a menu door\'s screen writes are logged as the fact of a write, never their text or length', () => {
  const echo = '\x1b[25;56Hj 5 secretpass\x1b[25;70H';
  for (const command of [XIMCommand.JH_SM, XIMCommand.JH_SMPTR, XIMCommand.JH_WRITE, XIMCommand.JH_CO]) {
    expect(loggableXimString(command, 0, echo, true)).toBe('[menu screen write withheld]');
  }
  expect(loggableXimString(XIMCommand.JH_SM, 0, '', true)).toBe('');
});

test('every other door still logs its screen writes, and a menu door still logs its requests', () => {
  const echo = '\x1b[25;56Hj 5 secretpass';
  expect(loggableXimString(XIMCommand.JH_SM, 0, echo)).toBe(echo);
  expect(loggableXimString(XIMCommand.AEW_MENU, 1, 'OPEN MAIN', true)).toBe('OPEN MAIN');
  expect(loggableXimString(XIMCommand.AEW_MENU, 1, 'RUN J 5 secretpass', true)).toBe('RUN [withheld]');
});
