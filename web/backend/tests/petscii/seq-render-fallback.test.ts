/**
 * Task 8, carried over from Task 6's review: the PETSCII render has no
 * local try/catch, so a throw anywhere inside it (a malformed `.seq`, a
 * dispatch closure blowing up on half-written user data) escapes
 * `displayScreen`. On the command-handler path that surfaces as an error;
 * on the paths that do NOT wrap their display call - the login flow, a
 * screen painted from a door's exit - it stalls the session with a blank
 * terminal and no way forward.
 *
 * A screen must degrade, never stall: if the render throws, log it and put
 * the file's RAW bytes on the wire. Raw `.seq` bytes are exactly what the
 * board shipped before any of this plan existed (Task 6's `else` arm and
 * the express.e art gate both emit them verbatim), so the fallback is the
 * previous behaviour, not a guess: the caller sees art with unsubstituted
 * MCI rather than nothing at all.
 *
 * Both render entry points are covered - the whole-file one
 * (`emitPetsciiScreen` -> `renderPetsciiScreen`, an art `.seq`) and the
 * gated one (`emitPetsciiScreenInline` -> `preparePetsciiSeq`, a `.seq`
 * opening with `~`) - because the gated path is where the tokenizer, the
 * pre-passes and the dispatch actually run, i.e. where a throw is likely.
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/handlers/petscii-screen.render', () => {
  const actual = jest.requireActual('../../src/handlers/petscii-screen.render');
  return {
    ...actual,
    renderPetsciiScreen: jest.fn(actual.renderPetsciiScreen),
    preparePetsciiSeq: jest.fn(actual.preparePetsciiSeq),
  };
});

import { displayScreen } from '../../src/handlers/screen.handler';
import {
  renderPetsciiScreen,
  preparePetsciiSeq,
} from '../../src/handlers/petscii-screen.render';

interface Emit {
  event: string;
  data: any;
}

function makeSocket(emits: Emit[]) {
  return {
    id: `seq-fallback-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    emit: (event: string, data: any) => emits.push({ event, data }),
    on: () => {},
  } as any;
}

function writeSeq(bytes: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seq-fallback-'));
  const file = path.join(dir, 'T.SEQ');
  fs.writeFileSync(file, bytes);
  return file;
}

function petsciiPayloads(emits: Emit[]): Buffer[] {
  return emits
    .filter((e) => e.event === 'petscii-bytes')
    .map((e) => Buffer.from(e.data, 'base64'));
}

/** Art: `Node1/Screens/BBSTITLE.SEQ` opens `$1F`, so this one does too. */
const ART_SEQ = Buffer.from([0x1f, 0x0e, 0x48, 0x49, 0xa0]);
/** Gated: the express.e `~` opt-in byte, a space, a bank flip, art. */
const GATED_SEQ = Buffer.from([0x7e, 0x20, 0x0e, 0x48, 0x49, 0xa0]);

describe('Task 8: a throwing PETSCII render degrades to raw bytes', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    (renderPetsciiScreen as jest.Mock).mockClear();
    (preparePetsciiSeq as jest.Mock).mockClear();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('emits the raw .seq when the whole-file render throws', async () => {
    (renderPetsciiScreen as jest.Mock).mockImplementationOnce(() => {
      throw new Error('malformed .seq');
    });

    const emits: Emit[] = [];
    const session: any = { petsciiMode: true, nodeId: 0, user: { username: 'Spot' } };

    // The session is NOT left hanging: displayScreen resolves normally.
    expect(await displayScreen(makeSocket(emits), session, writeSeq(ART_SEQ))).toBe(true);

    const payloads = petsciiPayloads(emits);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].equals(ART_SEQ)).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('emits the raw .seq when the gated (MCI) render throws', async () => {
    (preparePetsciiSeq as jest.Mock).mockImplementationOnce(() => {
      throw new Error('tokenizer blew up');
    });

    const emits: Emit[] = [];
    const session: any = { petsciiMode: true, nodeId: 0, user: { username: 'Spot' } };

    expect(await displayScreen(makeSocket(emits), session, writeSeq(GATED_SEQ))).toBe(true);

    const payloads = petsciiPayloads(emits);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].equals(GATED_SEQ)).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('still renders normally when nothing throws (the fallback is not the path)', async () => {
    const emits: Emit[] = [];
    const session: any = { petsciiMode: true, nodeId: 0, user: { username: 'Spot' } };

    expect(await displayScreen(makeSocket(emits), session, writeSeq(GATED_SEQ))).toBe(true);

    const payloads = petsciiPayloads(emits);
    expect(payloads).toHaveLength(1);
    // The gate byte is consumed by the tokenizer, the art is not: the raw
    // buffer and the rendered one are different byte strings.
    expect(Array.from(payloads[0])).toEqual([0x20, 0x0e, 0x48, 0x49, 0xa0]);
  });
});
