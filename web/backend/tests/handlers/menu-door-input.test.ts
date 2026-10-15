/**
 * M19: which door input is the CALLER and which is the terminal talking to the door.
 */
import { isCallerInput } from '../../src/handlers/commands/menu-door-exit';

const E = '\x1b';
const rows: Array<[string, string, boolean]> = [
  ['a printable key', 'a', true],
  ['Enter (CR)', '\r', true],
  ['LF', '\n', true],
  ['a lone Esc', E, true],
  ['an arrow key', `${E}[A`, true],
  ['an SGR mouse press', `${E}[<0;12;5M`, true],
  ['an SGR mouse hover', `${E}[<35;12;5M`, true],
  ['a mouse release', `${E}[<0;12;5m`, true],
  ['a cursor-position reply', `${E}[24;80R`, false],
  ['two cursor-position replies', `${E}[1;1R${E}[24;80R`, false],
  ['focus in', `${E}[I`, false],
  ['focus out', `${E}[O`, false],
  ['a primary device-attribute reply', `${E}[?1;2c`, false],
  ['a secondary device-attribute reply', `${E}[>0;276;0c`, false],
  ['a status report', `${E}[0n`, false],
  ['a window size report', `${E}[8;24;80t`, false],
  ['an OSC reply ended by BEL', `${E}]11;rgb:0000/0000/0000\x07`, false],
  ['an OSC reply ended by ST', `${E}]11;rgb:0000/0000/0000${E}\\`, false],
  ['a reply with a real key behind it', `${E}[24;80Rq`, true],
  ['a real key between two replies', `${E}[Ix${E}[O`, true],
  ['nothing', '', false],
];

test.each(rows)('%s', (_name, data, expected) => {
  expect(isCallerInput(data)).toBe(expected);
});
