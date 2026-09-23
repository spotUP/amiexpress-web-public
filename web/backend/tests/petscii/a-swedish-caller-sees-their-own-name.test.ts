/**
 * "åäö shows as aao in petscii mode when i type" (the sysop, 2026-09-23).
 *
 * The INPUT half of this was already tested - a caller's keystrokes decode
 * to the right letters - and it passed, because the test asked the decode
 * for a Swedish session while nothing in the board ever did. The OUTPUT half
 * had no test at all: `unicode-to-petscii.ts` folds every accented Latin-1
 * letter onto its base, which is the right answer for a machine with no
 * glyph for it and the wrong one for a C64 sold in Sweden, whose ROM
 * 325018-02 has a-ring and the umlauts where the bracket trio sits.
 *
 * So what a caller typed came back as `aao`, and his own name with it.
 */
process.env.SKIP_DB_INIT = '1';

import { emitText, flushOutput } from '../../src/utils/output.util';
import { installPetsciiModelChoke, sessionWantsSwedishPetscii } from '../../src/utils/petscii-session-model';
import { AnsiToPetsciiTransducer, petsciiInputToAscii } from '@amiexpress/bbs-door-sdk/petscii';

interface Emit { event: string; data: any }

function makeSocket(emits: Emit[], session: any) {
  const socket = {
    id: `swede-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    session,
    emit: (event: string, data: any) => { emits.push({ event, data }); return true; },
    on: () => {}, off: () => {}, removeListener: () => {},
  } as any;
  installPetsciiModelChoke(socket);
  return socket;
}

const session = (charset: 'swedish' | 'standard'): any => ({
  petsciiMode: true,
  terminalType: 'c64',
  connectionType: 'web',
  nodeId: 0, currentConf: 0,
  screenWidth: 40, screenHeight: 25,
  user: { username: 'spot', petsciiCharset: charset },
});

function wire(emits: Emit[]): string {
  return emits.filter(e => e.event === 'ansi-output' && typeof e.data === 'string')
    .map(e => e.data as string).join('');
}

/** The bytes this caller's screen is actually handed. */
function bytesFor(charset: 'swedish' | 'standard', text: string): number[] {
  const emits: Emit[] = [];
  const sess = session(charset);
  const socket = makeSocket(emits, sess);
  emitText(socket, text);
  flushOutput(socket);
  const transducer = new AnsiToPetsciiTransducer({
    columns: 40,
    swedish: sessionWantsSwedishPetscii(sess),
  });
  return Array.from(transducer.transduce(wire(emits)));
}

describe('a Swedish caller', () => {
  it('is told his machine has the Swedish ROM', () => {
    expect(sessionWantsSwedishPetscii(session('swedish'))).toBe(true);
    expect(sessionWantsSwedishPetscii(session('standard'))).toBe(false);
  });

  it('sees a-ring where his ROM draws it, not a bare a', () => {
    const bytes = bytesFor('swedish', 'Måns');

    // $5D is a-ring on ROM 325018-02, where an American machine has `]`.
    expect(bytes).toContain(0x5d);
    // And NOT the letter the Latin-1 fold would have given him.
    expect(bytes.filter(b => b === 0x41).length).toBe(0);
  });

  it('sees all three letters of his own alphabet', () => {
    const bytes = bytesFor('swedish', 'äöå');

    expect(bytes).toEqual(expect.arrayContaining([0x5b, 0x5c, 0x5d]));
  });

  it('types them back as the same letters', () => {
    // The wire byte a Swedish machine sends, read the way the board reads it.
    expect(petsciiInputToAscii([0x5d, 0x5b, 0x5c], true)).toBe('åäö');
  });

  it('leaves a caller on the standard ROM exactly as he was', () => {
    const bytes = bytesFor('standard', 'å');

    // No glyph for it on an American machine, so the fold still applies -
    // and `$5C` stays the pound sign this board's MCI uses for its tab.
    expect(bytes).not.toContain(0x5d);
  });
});
