/**
 * C64/40-col plan, Task 4: AmigaGuideViewer takes the caller's screen width.
 *
 * The viewer painted every rule and every rendered line at a fixed 80
 * columns. A PETSCII caller has 40, so both rules wrapped onto a second
 * row and the body ran off the right edge.
 *
 * The default stays 80 - an ANSI caller that passes nothing is
 * byte-for-byte unchanged.
 */

import { AmigaGuideParser } from '../../src/amigaguide/AmigaGuideParser';
import { AmigaGuideViewer } from '../../src/amigaguide/AmigaGuideViewer';

const GUIDE = [
  '@database TestGuide',
  '@node Main "Main Page"',
  'The quick brown fox jumps over the lazy dog and keeps on running well past any sane column limit.',
  '@endnode',
  '',
].join('\n');

function makeSocket() {
  const emitted: string[] = [];
  const socket: any = {
    id: 'guide-width-test',
    emit(event: string, data: string) {
      if (event === 'ansi-output') emitted.push(data);
      return true;
    },
    on() {
      return socket;
    },
  };
  return { socket, emitted };
}

function ruleWidths(emitted: string[]): number[] {
  return emitted
    .filter((chunk) => /^-+\r\n$/.test(chunk))
    .map((chunk) => chunk.replace(/\r\n$/, '').length);
}

function makeParser(): AmigaGuideParser {
  const parser = new AmigaGuideParser();
  parser.parse(GUIDE);
  return parser;
}

describe('AmigaGuideViewer width parameter', () => {
  test('defaults to 80 columns when the caller passes no width (ANSI unchanged)', () => {
    const { socket, emitted } = makeSocket();
    new AmigaGuideViewer(socket, makeParser()).display();

    const rules = ruleWidths(emitted);
    expect(rules.length).toBeGreaterThan(0);
    for (const width of rules) expect(width).toBe(80);
  });

  test('draws its rules at the width it is given (40 for a C64 caller)', () => {
    const { socket, emitted } = makeSocket();
    new AmigaGuideViewer(socket, makeParser(), undefined, 40).display();

    const rules = ruleWidths(emitted);
    expect(rules.length).toBeGreaterThan(0);
    for (const width of rules) expect(width).toBe(40);
  });

  test('renders body lines no wider than the given width', () => {
    const { socket, emitted } = makeSocket();
    new AmigaGuideViewer(socket, makeParser(), undefined, 40).display();

    const body = emitted.filter((chunk) => chunk.includes('quick') || chunk.includes('running'));
    expect(body.length).toBeGreaterThan(0);
    for (const chunk of body) {
      const printable = chunk.replace(/\r\n$/, '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
      expect(printable.length).toBeLessThanOrEqual(40);
    }
  });
});
