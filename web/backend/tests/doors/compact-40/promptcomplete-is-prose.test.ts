/**
 * PROMPTCOMPLETE IS PROSE, AND PROSE IS ALREADY WRAPPED.
 *
 * This door draws no screen: "No list, no box, no second screen" (its own
 * header). Run as a command it prints nine lines about itself, and it prints
 * them through `bbs.write()`, which is the board's choke - for a PETSCII
 * session that is `wrapDoorTextForSession`, and it wraps at the caller's
 * width.
 *
 * So what earns this door its `MIN_COLUMNS=40` is not a layout but the
 * absence of one, and the thing worth pinning is that it never reaches past
 * the choke. A door that emits its own bytes would not be wrapped by
 * anything, which is the defect this rules out.
 */
import * as fs from 'fs';
import * as path from 'path';

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../../../../Doors/prompt-complete/index.ts'),
  'utf8',
);

describe('the door that only writes prose', () => {
  it('writes through the board, never onto the socket', () => {
    // `socket.emit('ansi-output', ...)` is the way past the choke, and this
    // door must not take it: its lines are 64 columns wide.
    expect(SOURCE).not.toContain("emit('ansi-output'");
    expect(SOURCE).toContain('bbs?.write?.');
  });

  it('is the choke that shortens it, proven where the choke lives', () => {
    const { wrapDoorTextForSession } = require('../../../src/utils/wrap-for-session.util');
    const line = 'Type at the menu prompt and the rest of the command appears in\r\n';

    const wrapped = wrapDoorTextForSession(line, {
      petsciiMode: true, screenWidth: 40, terminalType: 'c64',
    });

    for (const row of wrapped.split(/\r?\n/)) {
      expect(row.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length).toBeLessThanOrEqual(40);
    }
    // ...and an eighty-column caller gets the line untouched.
    expect(wrapDoorTextForSession(line, { petsciiMode: false, screenWidth: 80 })).toBe(line);
  });
});
