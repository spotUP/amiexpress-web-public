/**
 * "the download logo animates and ends incorrectly" (sysop, 2026-09-29).
 *
 * Screens/Conf/downloadmsg.txt opens with five blank lines, then
 * `\x9d\r\n\x9d\r\n\x0c\r\n`, then the art. 0x9D is ECMA-48's OSC - the start
 * of a control STRING - and a terminal swallows everything after it up to the
 * next ESC, those three line breaks included: the art starts on row 6. The
 * wipe's grid printed 0x9D and the form feed as cells and kept the breaks, so
 * it put the art on row 9 - and the settle frame, the file's own bytes, drew
 * it again on row 6. Two logos, three rows apart.
 *
 * The grid reads control bytes the way the terminal does.
 */
process.env.SKIP_DB_INIT = '1';

import { renderScreenGrid } from '../../src/utils/screen-wipe.util';

const plain = (grid: string) => grid.replace(/\x1b\[[0-9;]*m/g, '');
const rowOf = (grid: string, needle: string) =>
  grid.split('\n').findIndex((line) => line.replace(/\x1b\[[0-9;]*m/g, '').includes(needle));

describe('the wipe grid and control characters', () => {
  it('lands the download art on the row the terminal puts it', () => {
    const head = '\r\n'.repeat(5) + '\x9d\r\n\x9d\r\n\x0c\r\n\x1b[1;36m   _______\r\nMo!\r\n';
    const grid = renderScreenGrid(head);
    expect(rowOf(grid, '_______')).toBe(5);
    expect(rowOf(grid, 'Mo!')).toBe(6);
    expect(grid).not.toMatch(/[\x9d\x0c]/);
  });

  it('ends a control string at BEL and at ST, and resumes printing', () => {
    expect(plain(renderScreenGrid('A\x9dtitle\x07B'))).toMatch(/^AB/);
    expect(plain(renderScreenGrid('A\x90dcs\x9cB'))).toMatch(/^AB/);
  });

  it('reads 0x9B as CSI, and gives other C1 bytes no width', () => {
    expect(rowOf(renderScreenGrid('\x9b3BX'), 'X')).toBe(3);
    expect(plain(renderScreenGrid('A\x85\x8dB'))).toMatch(/^AB/);
  });

  it('moves a form feed or vertical tab down a line, as a terminal does, and prints neither', () => {
    const grid = renderScreenGrid('A\x0cB\x0bC');
    expect(grid).not.toMatch(/[\x0b\x0c]/);
    expect(rowOf(grid, 'C')).toBe(2);
  });
});
