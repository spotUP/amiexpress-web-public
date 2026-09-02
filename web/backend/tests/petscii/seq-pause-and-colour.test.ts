/**
 * Task 8 of `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`:
 * `~SP` (decision 7) and the background colour half of decision 8, driven
 * through the PRODUCT'S entry points.
 *
 * The resume is not simulated: the screen is painted with
 * `displayScreen`, the pause is armed with `doPause` (what every real
 * caller does when `displayScreen` reports a pause) and the keypress goes
 * through `handlePaginatedScreenInput`, which is the function the socket
 * input handler calls. That chain ends in `processNextScreenSegment`, so
 * a segment machine that only worked when called directly would still be
 * RED here.
 *
 * The five assertions the plan pins on the resume:
 *   1. two `petscii-bytes` payloads, split at the pause;
 *   2. the second continues the FIRST one's machine - same bank, same
 *      cursor, same pen and reverse (a fresh oracle would encode the
 *      remainder's `~N|` in the other bank, which is assertion 2's
 *      discriminator, not a spelling of `toEqual`);
 *   3. the gate is per FILE: a remainder whose first byte is an art `~`
 *      keeps it - re-running the gate on the segment would eat it;
 *   4. no `\x1b` and no `$0A` on the PETSCII wire, and nothing at all on
 *      `petscii-output` (which `connection-emitter.ts:120-127`
 *      re-transduces, double-encoding bytes that are already PETSCII);
 *   5. `$A0` - the PETSCII shifted space, and a common solid art byte -
 *      survives on both sides of the boundary. `String.trim()` strips it
 *      (it is Unicode whitespace on a latin-1 view), which is why a `.seq`
 *      must never reach the `split(/~SP/).map(trim)` branch.
 *
 * Fixtures are byte arrays built in code. Never write a `.seq` fixture
 * through Edit/Write: the UTF-8 round-trip destroys every high-bit byte.
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

process.env.SKIP_DB_INIT = '1';

import { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import {
  displayScreen,
  doPause,
  handlePaginatedScreenInput,
} from '../../src/handlers/screen.handler';
import { petsciiMachineFor } from '../../src/handlers/petscii-screen.render';

interface Emit {
  event: string;
  data: any;
}

/** Fixture builder: latin1 strings, single bytes and byte arrays, in order. */
function seqBytes(...parts: Array<string | number | number[]>): Buffer {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === 'string') out.push(...Array.from(Buffer.from(part, 'latin1')));
    else if (typeof part === 'number') out.push(part);
    else out.push(...part);
  }
  return Buffer.from(out);
}

function makeSocket(emits: Emit[]) {
  return {
    id: `seq-pause-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    emit: (event: string, data: any) => emits.push({ event, data }),
    on: () => {},
  } as any;
}

const petsciiSession = (over: Record<string, any> = {}): any => ({
  petsciiMode: true,
  nodeId: 0,
  currentConf: 0,
  user: { username: 'Spot' },
  ...over,
});

function writeSeq(bytes: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seq-pause-'));
  const file = path.join(dir, 'T.SEQ');
  fs.writeFileSync(file, bytes);
  return file;
}

/** Every `petscii-bytes` payload, decoded, in order. */
function petsciiPayloads(emits: Emit[]): Buffer[] {
  return emits
    .filter((e) => e.event === 'petscii-bytes')
    .map((e) => Buffer.from(e.data, 'base64'));
}

/**
 * The whole product chain for a screen that pauses: paint, arm the pause
 * the way a real caller does, then press a key.
 */
async function paintAndResume(seqPath: string, session: any) {
  const emits: Emit[] = [];
  const socket = makeSocket(emits);

  const shown = await displayScreen(socket, session, seqPath);
  expect(shown).toBe(true);
  expect(session.lastScreenHadPause).toBe(true);

  doPause(socket, session);
  const beforeResume = emits.length;
  const handled = await handlePaginatedScreenInput(socket, session, '');
  expect(handled).toBe(true);

  return { emits, resumeEmits: emits.slice(beforeResume) };
}

describe('Task 8: ~SP inside a .seq pauses and resumes on the same machine', () => {
  /**
   * `~` gate, a space (the tokenizer eats the bare `~`), `$0E` (lower-case
   * bank), art, a cursor-down, an `$A0`, then the pause. The remainder
   * opens with an art `~` (written `~~ ` so the tokenizer's strict
   * fall-through leaves one behind), then `~N|`, then art.
   *
   * In the lower bank 'Spot' encodes S -> $D3 (A-Z are $C1-$DA) and pot ->
   * $50 $4F $54. In the power-on upper bank the same name folds to
   * $53 $50 $4F $54 - so the first value byte alone says whether the
   * resume continued the screen's machine or built a fresh one.
   */
  const RESUME_SEQ = seqBytes(
    0x7e, 0x20,      // the express.e gate byte
    0x0e,            // lower-case bank
    'AB',
    0x11,            // cursor down: the resume must continue on row 1
    0xa0,            // shifted space at the boundary - trim() food
    '~SP|',
    '~~ ',           // an ART tilde in the remainder (per-file gate)
    '~N|',
    'Z',
  );

  const PAYLOAD_1 = [0x20, 0x0e, 0x41, 0x42, 0x11, 0xa0];
  const PAYLOAD_2 = [0x7e, 0x20, 0xd3, 0x50, 0x4f, 0x54, 0x5a];

  it('splits at the pause and resumes in the bank and cursor the art left behind', async () => {
    const session = petsciiSession();
    const { emits, resumeEmits } = await paintAndResume(writeSeq(RESUME_SEQ), session);

    const payloads = petsciiPayloads(emits);

    // (1) Two payloads, split at the pause.
    expect(payloads).toHaveLength(2);
    expect(Array.from(payloads[0])).toEqual(PAYLOAD_1);

    // (2) + (3) The remainder, encoded against the FIRST payload's machine,
    // with its leading art `~` intact.
    expect(Array.from(payloads[1])).toEqual(PAYLOAD_2);
    expect(payloads[1][0]).toBe(0x7e);

    // (2, continued) The session's oracle agrees, byte for byte, with a
    // fresh machine fed everything the terminal received.
    const oracle = petsciiMachineFor(session).state;
    const mirror = new PetsciiMachine();
    mirror.feed(Buffer.concat(payloads));
    expect({
      bank: oracle.charsetBank,
      x: oracle.cursorX,
      y: oracle.cursorY,
      pen: oracle.pen,
      reverse: oracle.reverse,
    }).toEqual({
      bank: mirror.state.charsetBank,
      x: mirror.state.cursorX,
      y: mirror.state.cursorY,
      pen: mirror.state.pen,
      reverse: mirror.state.reverse,
    });
    // The art really did move the cursor off row 0 before the pause.
    expect(oracle.charsetBank).toBe(1);
    expect(mirror.state.cursorY).toBe(1);

    // (4) Nothing ANSI and no LF on the PETSCII wire, and the resume never
    // touches `petscii-output` or emits an all-attributes reset.
    for (const payload of payloads) {
      expect(payload.includes(0x1b)).toBe(false);
      expect(payload.includes(0x0a)).toBe(false);
    }
    expect(emits.filter((e) => e.event === 'petscii-output')).toHaveLength(0);
    expect(resumeEmits.some((e) => typeof e.data === 'string' && e.data.includes('\x1b[0m'))).toBe(
      false,
    );

    // (5) The `$A0` at the boundary survived.
    expect(payloads[0][payloads[0].length - 1]).toBe(0xa0);
  });

  /**
   * The `trim()` hazard on its own fixture: `$A0` both immediately before
   * the pause and as the remainder's FIRST byte. The non-inline splitter
   * (`content.split(/~SP(?:\s|\||\.)/).map(s => s.trim())`) would delete
   * both.
   */
  it('keeps $A0 art bytes on both sides of the pause boundary', async () => {
    const session = petsciiSession();
    const seq = seqBytes(0x7e, 0x20, 0xa0, 'AB', 0xa0, '~SP|', 0xa0, 'CD', 0xa0);
    const { emits } = await paintAndResume(writeSeq(seq), session);

    const payloads = petsciiPayloads(emits);
    expect(payloads).toHaveLength(2);
    expect(Array.from(payloads[0])).toEqual([0x20, 0xa0, 0x41, 0x42, 0xa0]);
    expect(Array.from(payloads[1])).toEqual([0xa0, 0x43, 0x44, 0xa0]);
  });
});

describe('Task 8: ~b2 sets the C64 background (decision 8)', () => {
  /**
   * CCGMS convention: `$02 <colour>` sets background AND border together
   * (`petscii-machine.ts` header). express.e's `~b2` is the third pen of
   * the `~c0..~c7` order, which the plan's Task 4 table maps onto VIC 5
   * (green) - PETSCII colour byte `$1E`.
   */
  it('emits $02 $1E, and the terminal reports background 5 with a full repaint', async () => {
    const session = petsciiSession();
    const emits: Emit[] = [];
    const seqPath = writeSeq(seqBytes(0x7e, 0x20, '~b2|', 'X'));

    expect(await displayScreen(makeSocket(emits), session, seqPath)).toBe(true);

    const payloads = petsciiPayloads(emits);
    expect(payloads).toHaveLength(1);
    expect(Array.from(payloads[0])).toEqual([0x20, 0x02, 0x1e, 0x58]);
    // Not an ANSI SGR anywhere near it.
    expect(payloads[0].includes(0x1b)).toBe(false);

    const machine = new PetsciiMachine();
    let fullRepaint = false;
    machine.onUpdate = (full: boolean) => {
      fullRepaint = fullRepaint || full;
    };
    machine.feed(payloads[0]);
    expect(machine.state.background).toBe(5);
    expect(machine.state.border).toBe(5);
    expect(fullRepaint).toBe(true);
  });
});
