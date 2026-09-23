/**
 * PETSCII SOMEBODY TYPED, ON A TERMINAL THAT IS NOT A C64.
 *
 * A caller's PETSCII travels through the board as PetMe64 private-use
 * codepoints, one per cell - the convention `AnsiToPetsciiTransducer`
 * already speaks, so a C64 reader needs no new code and must not be
 * touched. Everybody else has no such font: a browser draws tofu, and an
 * Amiga telnet client's iconv writes `?`. That is a LIVE bug today for
 * `BBSApi.writePetscii(string)`, which the connection emitter documents as
 * emitting PUA ungated - this suite is what makes it false.
 *
 * Driven through `emitText`, which is the one call every line of prose on
 * this board goes out through, rather than through the fold itself: a unit
 * test of the fold cannot tell me whether anything CALLS it.
 */
process.env.SKIP_DB_INIT = '1';

import { emitText, flushOutput } from '../../src/utils/output.util';
import { installPetsciiModelChoke } from '../../src/utils/petscii-session-model';
import { puaForScreenCode } from '@amiexpress/bbs-door-sdk/petscii';

interface Emit { event: string; data: any }

function makeSocket(emits: Emit[], session: any) {
  const socket = {
    id: `pua-fold-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    session,
    emit: (event: string, data: any) => { emits.push({ event, data }); return true; },
    on: () => {}, off: () => {}, removeListener: () => {},
  } as any;
  installPetsciiModelChoke(socket);
  return socket;
}

const ansiSession = (over: Record<string, any> = {}): any => ({
  petsciiMode: false,
  terminalType: 'ansi',
  connectionType: 'web',
  nodeId: 0, currentConf: 0,
  screenWidth: 80, screenHeight: 24,
  user: { username: 'Spot' },
  ...over,
});

const c64Session = (over: Record<string, any> = {}): any => ({
  petsciiMode: true,
  terminalType: 'c64',
  connectionType: 'web',
  nodeId: 0, currentConf: 0,
  screenWidth: 40, screenHeight: 25,
  user: { username: 'Spot' },
  ...over,
});

/** Everything the socket was handed, as one string. */
function wire(emits: Emit[]): string {
  return emits.filter(e => e.event === 'ansi-output' && typeof e.data === 'string')
    .map(e => e.data as string).join('');
}

/** A rule drawn on a C64: three horizontal-line cells (screen code 0x40). */
const RULE = puaForScreenCode(0x40).repeat(3);

describe('a message written in PETSCII', () => {
  it('reaches an eighty-column caller as the shapes, not as tofu', () => {
    const emits: Emit[] = [];
    const socket = makeSocket(emits, ansiSession());

    emitText(socket, `top\r\n${RULE}\r\n`);
    flushOutput(socket);

    const out = wire(emits);
    expect(out).toContain('───');
    // No private-use codepoint may reach a terminal that has no font for it.
    expect(/[-]/.test(out)).toBe(false);
  });

  it('reaches a C64 caller untouched, because his own transducer draws it', () => {
    const emits: Emit[] = [];
    const socket = makeSocket(emits, c64Session());

    emitText(socket, RULE);
    flushOutput(socket);

    // The markers survive the choke: the transducer turns them into the
    // exact screen code, which a fold here would have thrown away first.
    expect(wire(emits)).toContain(RULE);
  });

  it('carries reverse video as SGR, so an ANSI reader sees the fill', () => {
    const emits: Emit[] = [];
    const socket = makeSocket(emits, ansiSession());

    emitText(socket, puaForScreenCode(0x40 | 0x80));
    flushOutput(socket);

    const out = wire(emits);
    expect(out).toContain('\x1b[7m');
    expect(out).toContain('\x1b[27m');
  });

  it('leaves ordinary prose exactly as it was', () => {
    const emits: Emit[] = [];
    const socket = makeSocket(emits, ansiSession());

    emitText(socket, 'nothing to see here\r\n');
    flushOutput(socket);

    expect(wire(emits)).toBe('nothing to see here\r\n');
  });
});
