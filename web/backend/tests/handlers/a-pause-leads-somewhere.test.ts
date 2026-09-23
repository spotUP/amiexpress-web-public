/**
 * "BARA ETT SVART FÄLT DÄR DET LIGGER EN DOLD PRESS RETURN" (the sysop,
 * 2026-09-23, walking the upload command).
 *
 * The board's own `Conf1/uploadmsg.txt` ends with `~SP|` after ten blank
 * rows. `~SP` is a pause, and it splits the screen there - so the caller was
 * stopped in front of a black field and made to press a key to be shown the
 * blank lines behind it. The prompt is real and visible; what it leads to is
 * nothing, which is what makes it read as hidden.
 *
 * A pause is for something the caller has not seen yet. MCI counts as
 * something: a segment that looks blank but carries `~CC_gl` runs a door that
 * draws the screen the pause exists to protect, and that pause must stay.
 */
process.env.SKIP_DB_INIT = '1';

import { armSegmentBoundaryPause } from '../../src/handlers/screen.handler';

let sockets = 0;
function aSocket() {
  const wire: string[] = [];
  return {
    wire,
    id: `pause-leads-somewhere-${++sockets}`,
    emit: (event: string, data: unknown) => {
      if (event === 'ansi-output' && typeof data === 'string') wire.push(data);
    },
    on: () => {},
  };
}

function aSessionWith(segments: string[]): any {
  return {
    nodeId: 1,
    screenSegments: { segments, eventName: 'ansi-output' },
  };
}

const ESC = String.fromCharCode(27);
const promptShown = (socket: ReturnType<typeof aSocket>) =>
  socket.wire.join('').includes('Space To Resume');

describe('a boundary pause', () => {
  it('is not armed when there is nothing behind it', () => {
    const socket = aSocket();
    // What `~SP|` at the end of uploadmsg.txt leaves: a blank row and the
    // reset the art signed off with.
    const session = aSessionWith([`\r\n   \r\n${ESC}[0m`]);

    expect(armSegmentBoundaryPause(socket, session)).toBe(false);
    expect(promptShown(socket)).toBe(false);
    expect(session.paginatedScreen).toBeUndefined();
  });

  it('is armed when a single glyph is behind it', () => {
    const socket = aSocket();
    const session = aSessionWith([`\r\n${ESC}[0m   .   \r\n`]);

    expect(armSegmentBoundaryPause(socket, session)).toBe(true);
    expect(promptShown(socket)).toBe(true);
  });

  it('is armed for a segment that only runs a door', () => {
    // `~CC_gl` draws the global last-callers list. Blank to look at, and the
    // pause in front of it is the one the sysop asked for on 2026-09-15.
    const socket = aSocket();
    const session = aSessionWith(['\r\n~CC_gl\r\n']);

    expect(armSegmentBoundaryPause(socket, session)).toBe(true);
    expect(promptShown(socket)).toBe(true);
  });

  it('is armed when a LATER segment has something, even if the next is blank', () => {
    const socket = aSocket();
    const session = aSessionWith(['\r\n\r\n', 'the rest of the screen']);

    expect(armSegmentBoundaryPause(socket, session)).toBe(true);
  });
});
