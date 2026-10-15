/**
 * Every `~SP` is a pause - express.e:5455-5460 calls doPause whatever follows.
 *
 * 2026-09-23 made a trailing `~SP` after blank rows a no-op ("bara ett svart
 * fält där det ligger en dold press return", walking U). The prompt was
 * hidden because the U command cleared the screen over a pause it had not
 * waited for; the pause protects what the COMMAND draws next. 2026-09-29, the
 * sysop again: "there is no pause after the screen when i press u". The pause
 * is back, and U waits for it (continueAfterScreen).
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
  it('is armed with only blank rows behind it, as express.e pauses at every ~SP', () => {
    const socket = aSocket();
    // What `~SP|` at the end of uploadmsg.txt leaves: a blank row and the
    // reset the art signed off with.
    const session = aSessionWith([`\r\n   \r\n${ESC}[0m`]);

    expect(armSegmentBoundaryPause(socket, session)).toBe(true);
    expect(promptShown(socket)).toBe(true);
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
