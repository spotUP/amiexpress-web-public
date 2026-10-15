/**
 * The computer list sign-up and W share (express.e chooseComputer
 * 11318-11331): two to a row, each a 34-column field followed by a space on
 * the left; an odd last one alone; one per row on a 40-column screen.
 */
import { computerTypeRows } from '../../src/utils/computer-types.util';

const field = (s: string) => s.padEnd(34, ' ');

test('two to a row with express.e\'s spacing, an odd last one alone', () => {
  expect(computerTypeRows(['AMiGA 500', 'AMiGA 2000', 'PC'], { screenWidth: 80 })).toEqual([
    ` 1> ${field('AMiGA 500')}  2> ${field('AMiGA 2000')}\r\n`,
    ` 3> ${field('PC')} \r\n`,
  ]);
});

test('a name longer than the field is cut to it, as \\s[34] does', () => {
  const long = 'X'.repeat(40);
  expect(computerTypeRows([long], { screenWidth: 80 })[0]).toBe(` 1> ${'X'.repeat(34)} \r\n`);
});

test('a 40-column screen gets one per row', () => {
  expect(computerTypeRows(['AMiGA 500', 'PC'], { screenWidth: 40, petsciiMode: true })).toEqual([' 1> AMiGA 500\r\n', ' 2> PC\r\n']);
});
