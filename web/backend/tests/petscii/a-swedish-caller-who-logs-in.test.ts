/**
 * "MY PETSCII CHARACTER SET IS SET TO SWEDISH IN W" - and the letters were
 * still folded (the sysop, 2026-09-23).
 *
 * The output fold learned about the Swedish ROM earlier the same day, and the
 * test that proved it built its own transducer. The BOARD does not: it keeps
 * ONE transducer per session (`petsciiTerminalModelFor`), because that object
 * is also the oracle for the caller's screen - every cursor walk and every
 * erase is measured against it, so it cannot be thrown away and rebuilt.
 *
 * It was constructed the first time PETSCII output was needed, which on a `P`
 * session is the GRAPHICS PROMPT - before anybody has logged in. `session.user`
 * was undefined, so `swedish` latched to false and stayed false for the rest
 * of the call, whatever the caller then chose in `W`.
 *
 * A caller's preference is a live reading, not a constructor argument. This
 * drives the real session model across a login and a `W` toggle.
 */
process.env.SKIP_DB_INIT = '1';

import { transducePetsciiAtChoke, petsciiTerminalModelFor } from '../../src/utils/petscii-session-model';

const A_RING = 0x5d;   // ROM 325018-02 draws a-ring where an American `]` is
const PLAIN_A = 0x41;  // what the Latin-1 fold gives a standard machine

/** A `P` session at the graphics prompt: nobody has logged in yet. */
const beforeLogin = (): any => ({
  petsciiMode: true,
  terminalType: 'c64',
  connectionType: 'web',
  nodeId: 0, currentConf: 0,
  screenWidth: 40, screenHeight: 25,
});

describe('a Swedish caller who logs in after the screen exists', () => {
  it('gets his own letters once his record says so', () => {
    const session = beforeLogin();

    // The prompt, before login: the transducer is built here.
    transducePetsciiAtChoke(session, 'Graphics? ');

    session.user = { username: 'sysop', petsciiCharset: 'swedish' };
    const bytes = Array.from(transducePetsciiAtChoke(session, '\r\nM\u00e5ns'));

    expect(bytes).toContain(A_RING);
  });

  it('follows the W toggle in both directions, on the SAME screen model', () => {
    const session = beforeLogin();
    session.user = { username: 'sysop', petsciiCharset: 'swedish' };

    const model = petsciiTerminalModelFor(session);
    expect(Array.from(transducePetsciiAtChoke(session, 'å'.normalize('NFC')))).toContain(A_RING);

    // W row 22, back to standard. The oracle must be the same object, or the
    // caller's cursor is measured against a screen nobody is looking at.
    session.user.petsciiCharset = 'standard';
    expect(petsciiTerminalModelFor(session)).toBe(model);
    expect(Array.from(transducePetsciiAtChoke(session, 'å'))).toContain(PLAIN_A);
  });

  it('still leaves a standard caller his pound sign', () => {
    const session = beforeLogin();
    session.user = { username: 'spot', petsciiCharset: 'standard' };
    expect(Array.from(transducePetsciiAtChoke(session, 'å'))).not.toContain(A_RING);
  });
});
