/**
 * The line editor echoes a key and only then sees the line is past
 * maxLineLen and carries the word down (express.e 10300-10335). So the key
 * that wraps is drawn one column past the limit, after the ` N> ` prompt.
 * At eighty columns express.e's 75 puts it in column 80. At forty the port
 * gave 36, the 37th key landed in column 41, and the C64 screen wrapped the
 * row before the editor could erase it.
 */
import { messageBodyLineLimit, BODY_LINE_PROMPT_WIDTH } from '../../src/utils/table-format.util';

const wrappingKeyColumn = (session: any) => BODY_LINE_PROMPT_WIDTH + messageBodyLineLimit(session) + 1;

describe('the key that makes the editor wrap', () => {
  it('lands in the last column at eighty, as express.e has it', () => {
    expect(messageBodyLineLimit({ screenWidth: 80 })).toBe(75);
    expect(wrappingKeyColumn({ screenWidth: 80 })).toBe(80);
  });

  it('stays on a C64\'s forty-column row', () => {
    expect(wrappingKeyColumn({ screenWidth: 40, petsciiMode: true })).toBe(40);
  });
});
