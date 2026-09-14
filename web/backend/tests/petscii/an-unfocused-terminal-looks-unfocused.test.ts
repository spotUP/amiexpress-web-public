/**
 * An unfocused terminal must LOOK unfocused.
 *
 * Sysop, three times over one evening: "the bbs caret/cursor is still white
 * and dont blink". Two fixes (f5999bedd, b99cc0697) went after the focus
 * desync - xterm not noticing that its textarea holds focus - and neither
 * changed what the failure looked like.
 *
 * xterm blinks ONLY while focused. With `cursorInactiveStyle: 'block'` an
 * unfocused terminal therefore draws a solid box that never blinks, which is
 * indistinguishable from a cursor that is broken. The sysop's own console
 * reading said `.xterm` carried no `focus` class, so what he was looking at
 * was the inactive cursor doing exactly what it was configured to do.
 *
 * 'outline' is xterm's own default and makes the state legible: hollow means
 * "not focused, click here", solid and blinking means "typing works". This is
 * a source pin because the option is set on a live xterm instance that jsdom
 * cannot construct here; it is deliberately narrow - it asserts the VALUE,
 * and fails if anyone sets it back.
 */
import * as fs from 'fs';
import * as path from 'path';

const SOURCE = path.resolve(
  __dirname, '../../../../packages/terminal/src/components/BBSTerminal.tsx',
);

describe('the inactive cursor', () => {
  const source = fs.readFileSync(SOURCE, 'utf8');

  it('is an outline, so an unfocused terminal cannot look like a broken one', () => {
    expect(source).toMatch(/cursorInactiveStyle = 'outline'/);
  });

  it('is never set back to a solid block', () => {
    expect(source).not.toMatch(/cursorInactiveStyle = 'block'/);
  });

  it('still blinks when it IS focused, which is the half that must not change', () => {
    expect(source).toMatch(/cursorBlink = true/);
  });
});
