/**
 * You see your own formatting.
 *
 * Reported 2026-08-26: "**this is bold** just prints **this is bold**".
 *
 * The sender was the one person who never saw it. The server does not echo a
 * message back to whoever sent it, and the incoming handler skips its own
 * (`if (m.userId === String(uid)) return`), so the sender's copy comes from a
 * LOCAL ECHO in the submit handler - and that echo passed the line with
 * applyMarkdown false, so it went to the log untouched. Everyone else in the
 * room saw the same message correctly bold, because their copy went through
 * formatMessage -> parseContent.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseContent } from '../../../../Doors/livechat/utils/markdown';

const DOOR = join(__dirname, '..', '..', '..', '..', 'Doors', 'livechat');
const submit = readFileSync(join(DOOR, 'handlers', 'input-submit-handler.ts'), 'utf8');

describe('the local echo', () => {
  const echo = submit.slice(
    submit.indexOf('// Add local echo immediately'),
    submit.indexOf('// Clear typing preview')
  );

  it('parses the message content', () => {
    expect(echo).toMatch(/parseContent\(processedMsg\)/);
  });

  it('puts the parsed content in the line', () => {
    expect(echo).toMatch(/\$\{rendered\}/);
    expect(echo).not.toMatch(/> \$\{processedMsg\}/);
  });

  it('does not parse the whole line a second time', () => {
    // The timestamp and username tags are ours; re-parsing them would
    // escape or mangle them.
    expect(echo).toMatch(/addChatMessage\([\s\S]*?, false\)/);
  });
});

describe('what the sender now sees', () => {
  it('renders bold', () => {
    expect(parseContent('**this is bold**')).toBe('{bold}this is bold{/bold}');
  });

  it('renders every markdown the format picker offers', () => {
    expect(parseContent('*italic*')).toContain('{italic}');
    expect(parseContent('__underline__')).toContain('{underline}');
    expect(parseContent('~~strike~~')).toContain('{gray-fg}');
    expect(parseContent('`code`')).toContain('{inverse}');
  });

  it('leaves a plain message alone', () => {
    expect(parseContent('just a normal message')).toBe('just a normal message');
  });
});
