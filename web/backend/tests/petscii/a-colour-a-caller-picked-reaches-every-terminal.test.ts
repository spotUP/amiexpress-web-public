/**
 * ONE COLOUR, TYPED THE SAME WAY, ON WHATEVER TERMINAL.
 *
 * "i guess we could do the opposite as well let ansi users type colors the
 * same way and it gets translated to the petscii users" (the sysop,
 * 2026-09-22). So the pen is not SGR and not a blessed tag: it is the
 * board's own marker, and every terminal is handed its own spelling of it.
 * It has to be ESC-free, because a chat message has every ESC stripped out
 * of it before it is stored and that guard stays.
 *
 * Driven through `emitText` for the output half and through the real decode
 * for the input half, because the point is that the two agree.
 */
process.env.SKIP_DB_INIT = '1';

import { emitText, flushOutput } from '../../src/utils/output.util';
import { installPetsciiModelChoke } from '../../src/utils/petscii-session-model';
import { colourMarker, petsciiInputToAscii, puaForScreenCode } from '@amiexpress/bbs-door-sdk/petscii';
import { keyEventToPetscii } from '../../../../packages/terminal/src/petscii/keymap';
import { AnsiToPetsciiTransducer } from '@amiexpress/bbs-door-sdk/petscii';

interface Emit { event: string; data: any }

function makeSocket(emits: Emit[], session: any) {
  const socket = {
    id: `pen-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    session,
    emit: (event: string, data: any) => { emits.push({ event, data }); return true; },
    on: () => {}, off: () => {}, removeListener: () => {},
  } as any;
  installPetsciiModelChoke(socket);
  return socket;
}

const session = (petscii: boolean): any => ({
  petsciiMode: petscii,
  terminalType: petscii ? 'c64' : 'ansi',
  connectionType: 'web',
  nodeId: 0, currentConf: 0,
  screenWidth: petscii ? 40 : 80,
  screenHeight: petscii ? 25 : 24,
  user: { username: 'spot' },
});

function wire(emits: Emit[]): string {
  return emits.filter(e => e.event === 'ansi-output' && typeof e.data === 'string')
    .map(e => e.data as string).join('');
}

/** VIC 2 is red; the marker is what a caller's keystroke becomes. */
const RED = colourMarker(2);

describe('the pen a caller picked', () => {
  it('carries no ESC, so a chat message can hold it', () => {
    expect(RED).not.toContain('\x1b');
    expect(RED.length).toBe(1);
  });

  it('reaches an eighty-column reader as colour', () => {
    const emits: Emit[] = [];
    const socket = makeSocket(emits, session(false));
    emitText(socket, `${RED}danger`);
    flushOutput(socket);

    expect(wire(emits)).toContain('\x1b[38;2;');
  });

  it('reaches a C64 as the PETSCII colour byte, through his own transducer', () => {
    const emits: Emit[] = [];
    const socket = makeSocket(emits, session(true));
    emitText(socket, `${RED}danger`);
    flushOutput(socket);

    // The choke hands the transducer SGR; the transducer is what turns it
    // into $1C. Ask it the same question the session's own model would.
    const bytes = new AnsiToPetsciiTransducer({ columns: 40 }).transduce(wire(emits));
    expect(Array.from(bytes)).toContain(0x1c);
  });

  it('is what CTRL and a digit type, the way a C64 keyboard does it', () => {
    const typed = keyEventToPetscii('3', false, false, 'Digit3', false, true);

    expect(typed).toEqual([0x1c]);
    expect(petsciiInputToAscii(typed!)).toBe(RED);
  });

  it('is what the Commodore key and a digit type, for the other eight', () => {
    const orange = keyEventToPetscii('1', false, false, 'Digit1', true, false);

    expect(orange).toEqual([0x81]);
    expect(petsciiInputToAscii(orange!)).toBe(colourMarker(8));
  });

  it('lets a caller colour the shapes he drew', () => {
    const drawn = `${RED}${puaForScreenCode(0x40).repeat(2)}`;
    const emits: Emit[] = [];
    const socket = makeSocket(emits, session(false));
    emitText(socket, drawn);
    flushOutput(socket);

    const out = wire(emits);
    expect(out).toContain('\x1b[38;2;');
    expect(out).toContain('──');
  });
});
