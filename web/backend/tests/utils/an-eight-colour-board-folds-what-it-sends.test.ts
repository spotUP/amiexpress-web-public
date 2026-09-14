/**
 * A board that declares eight colours sends eight colours.
 *
 * "amiexpress can only show 8 colors on the amiga... it CAN show 16 colors if
 * ibmcon device is used but that was not common practice", and "the amiga did
 * not use ice colors either" (sysop, 2026-09-14). `TERMINAL_COLOURS=8` folds
 * every bright code the board emits onto the eight pens console.device had,
 * so sixteen-colour art still displays - in the colours an Amiga would have
 * shown it in - instead of arriving with sequences the terminal cannot read.
 *
 * Driven through emitText, the board's one output choke, rather than through
 * the fold on its own: the fold is already pinned in the SDK's suite, and
 * what this has to prove is that the board's output actually goes through it.
 */

import { emitText, flushAllBuffers } from '../../src/utils/ansi-buffer.util';
import { forgetBoardColourDepth } from '../../src/utils/eight-colour-session.util';
// The service is auto-mocked: spying on a live ES module export throws
// "Cannot redefine property" under ts-jest, and what this test needs is
// control of the one value the fold reads.
jest.mock('../../src/services/bbs-config-file.service');
import { getBoardConfig } from '../../src/services/bbs-config-file.service';

/** A socket that records what reached the wire. */
function wireSpy(): { socket: any; sent: () => string } {
  const chunks: string[] = [];
  const socket: any = {
    id: `spy-${Math.random()}`,
    connected: true,
    // getAnsiBuffer subscribes to 'disconnect' to release the buffer.
    on: () => undefined,
    emit: (event: string, data: unknown) => {
      if (event === 'ansi-output') chunks.push(String(data));
    },
  };
  return { socket, sent: () => chunks.join('') };
}

function boardWith(colours: number | undefined): void {
  (getBoardConfig as jest.Mock).mockReturnValue({ terminal_colours: colours });
  forgetBoardColourDepth();
}

describe('an eight-colour board folds what it sends', () => {
  beforeEach(() => (getBoardConfig as jest.Mock).mockReset());
  afterEach(() => forgetBoardColourDepth());

  it('brings bright art down to the eight pens', () => {
    boardWith(8);
    const spy = wireSpy();
    emitText(spy.socket, '\x1b[93mBright\x1b[104m block\x1b[0m', true);
    flushAllBuffers();

    expect(spy.sent()).toContain('\x1b[33mBright');
    expect(spy.sent()).toContain('\x1b[44m block');
    expect(spy.sent()).not.toContain('\x1b[93m');
    expect(spy.sent()).not.toContain('\x1b[104m');
  });

  it('leaves a sixteen-colour board byte-identical', () => {
    boardWith(16);
    const spy = wireSpy();
    const art = '\x1b[93mBright\x1b[104m block\x1b[0m';
    emitText(spy.socket, art, true);
    flushAllBuffers();

    expect(spy.sent()).toContain(art);
  });

  it('treats a board with no setting as sixteen', () => {
    boardWith(undefined);
    const spy = wireSpy();
    emitText(spy.socket, '\x1b[93mBright\x1b[0m', true);
    flushAllBuffers();

    expect(spy.sent()).toContain('\x1b[93m');
  });

  it('leaves bold alone on an eight-colour board', () => {
    // ESC[1;33m is how art has asked for bright since the 80s, and bold is a
    // style console.device has. Folding it would take away a colour the
    // Amiga can actually show.
    boardWith(8);
    const spy = wireSpy();
    emitText(spy.socket, '\x1b[1;33mBold yellow\x1b[0m', true);
    flushAllBuffers();

    expect(spy.sent()).toContain('\x1b[1;33mBold yellow');
  });

  it('leaves prose with no colour in it exactly as it was', () => {
    boardWith(8);
    const spy = wireSpy();
    emitText(spy.socket, 'Nothing but words.\r\n', true);
    flushAllBuffers();

    expect(spy.sent()).toBe('Nothing but words.\r\n');
  });
});
