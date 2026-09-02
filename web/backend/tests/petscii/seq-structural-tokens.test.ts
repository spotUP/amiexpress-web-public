/**
 * Task 7 of `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`:
 * the STRUCTURAL MCI tokens inside a PETSCII `.seq` - `~SS_` (include),
 * `~SR_` (random numbered include), `~CC_` (run a command) and the inline
 * `~f` clear - plus the include-recursion depth guard and the include
 * resolver hole the shipped `Logoff.seq` exposes.
 *
 * Mechanism under test: `displayScreen`'s `isPetscii` branch hands a gated
 * `.seq` (first byte `~`, express.e:6800-6806) to the SAME inline sentinel
 * walker the ANSI path uses, with a PETSCII chunk emitter. Chunks are
 * rendered by `renderChunkBytes` - encode + feed the ONE oracle - and go out
 * on `petscii-bytes`, so a real C64 (telnet) and a web `P` session receive
 * identical bytes in document order.
 *
 * Every fixture is built as bytes in code: a `.seq` byte above 0x7F does not
 * survive a UTF-8 write (MEMORY: Edit/Write destroys high-bit bytes).
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

process.env.SKIP_DB_INIT = '1';

// The walker `require`s this module at call time for `~CC_`; it is the only
// place `screen.handler` touches it, so a factory mock cannot leak elsewhere.
jest.mock('../../src/handlers/command.handler', () => ({
  processCommand: jest.fn(async () => true),
}));

import { displayScreen, loadScreenFile, parseMciCodes } from '../../src/handlers/screen.handler';
import { disposePetsciiRenderCtx } from '../../src/handlers/petscii-screen.render';
import { processCommand } from '../../src/handlers/command.handler';
import { ANSI_ART_SKIPPED_NOTICE } from '../../src/utils/ansi-art-detect.util';

interface Emit {
  event: string;
  data: any;
}

function makeSocket(emits: Emit[]) {
  return {
    id: `t7-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    emit: (event: string, data: any) => emits.push({ event, data }),
    on: () => {},
  } as any;
}

/** Every `petscii-bytes` payload, decoded, in emission order. */
function petsciiPayloads(emits: Emit[]): Buffer[] {
  return emits.filter(e => e.event === 'petscii-bytes').map(e => Buffer.from(e.data, 'base64'));
}

/** Everything the caller's terminal receives, as one latin1 string. */
function wireText(emits: Emit[]): string {
  return emits
    .map(e =>
      e.event === 'petscii-bytes'
        ? Buffer.from(e.data, 'base64').toString('latin1')
        : typeof e.data === 'string'
          ? e.data
          : '',
    )
    .join('');
}

const petsciiSession = (over: Record<string, any> = {}): any => ({
  petsciiMode: true,
  nodeId: 0,
  currentConf: 0,
  currentConfName: 'Main',
  user: { username: 'spot' },
  ...over,
});

/** latin1 `.seq` fixture: strings and raw byte arrays, in order. */
function seqBytes(...parts: Array<string | number | number[]>): Buffer {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === 'string') out.push(...Array.from(Buffer.from(part, 'latin1')));
    else if (typeof part === 'number') out.push(part);
    else out.push(...part);
  }
  return Buffer.from(out);
}

function tmpdir(tag: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `seq-t7-${tag}-`));
}

describe('structural MCI tokens in a PETSCII .seq (Task 7)', () => {
  beforeEach(() => {
    (processCommand as jest.Mock).mockClear();
  });

  it('~SS_ prefers a .seq sibling over the .TXT one', async () => {
    const dir = tmpdir('ss-seq');
    const includeArt = seqBytes(0x12, 0xa1, 0xb0, 0x92);
    fs.writeFileSync(path.join(dir, 'INC.SEQ'), includeArt);
    fs.writeFileSync(path.join(dir, 'INC.TXT'), 'TEXTVERSION', 'latin1');

    const seqPath = path.join(dir, 'HOST.SEQ');
    fs.writeFileSync(seqPath, seqBytes('~ AA~SS_', path.join(dir, 'INC'), '|BB'));

    const emits: Emit[] = [];
    const session = petsciiSession();
    disposePetsciiRenderCtx(session);
    expect(await displayScreen(makeSocket(emits), session, seqPath)).toBe(true);

    const all = Buffer.concat(petsciiPayloads(emits));
    expect(all.includes(includeArt)).toBe(true);
    expect(wireText(emits)).not.toContain('TEXTVERSION');
    expect(wireText(emits)).not.toContain('~SS_');
  });

  it('~SS_ falls back to the .TXT sibling when no .seq exists, and that content takes the ANSI path', async () => {
    const dir = tmpdir('ss-txt');
    fs.writeFileSync(path.join(dir, 'INC.TXT'), 'TEXTVERSION\r\n', 'latin1');

    const seqPath = path.join(dir, 'HOST.SEQ');
    fs.writeFileSync(seqPath, seqBytes('~ AA~SS_', path.join(dir, 'INC'), '|BB'));

    const emits: Emit[] = [];
    const session = petsciiSession();
    disposePetsciiRenderCtx(session);
    await displayScreen(makeSocket(emits), session, seqPath);

    // The include is ANSI text: it must NOT arrive on the PETSCII transport.
    expect(Buffer.concat(petsciiPayloads(emits)).toString('latin1')).not.toContain('TEXTVERSION');
    // ...but it must still reach the caller.
    expect(wireText(emits)).toContain('TEXTVERSION');
    // The host screen's own art still went out as PETSCII bytes.
    expect(Buffer.concat(petsciiPayloads(emits)).toString('latin1')).toContain('AA');
  });

  it('~CC_ calls processCommand exactly once, with the same code the ANSI walker passes', async () => {
    const dir = tmpdir('cc');
    const seqPath = path.join(dir, 'HOST.SEQ');
    fs.writeFileSync(seqPath, seqBytes('~ AA~CC_JOIN|BB'));

    const emits: Emit[] = [];
    const session = petsciiSession();
    disposePetsciiRenderCtx(session);
    await displayScreen(makeSocket(emits), session, seqPath);

    expect(processCommand as jest.Mock).toHaveBeenCalledTimes(1);
    const petsciiCall = (processCommand as jest.Mock).mock.calls[0];
    expect(petsciiCall[2]).toBe('JOIN');
    expect(petsciiCall[3]).toBe('');
    expect(petsciiCall[4]).toBe(true);
    expect(wireText(emits)).not.toContain('~CC_');
    expect(wireText(emits)).not.toContain('\x00CC:');

    // ONE walker, so the ANSI path must reach processCommand identically -
    // the flavour only decides how the text AROUND the token is encoded.
    (processCommand as jest.Mock).mockClear();
    const ansiEmits: Emit[] = [];
    const ansiSocket = makeSocket(ansiEmits);
    await parseMciCodes(
      'AA~CC_JOIN|BB',
      { nodeId: 0, user: { username: 'spot' } } as any,
      undefined,
      undefined,
      undefined,
      ansiSocket,
    );
    expect(processCommand as jest.Mock).toHaveBeenCalledTimes(1);
    const ansiCall = (processCommand as jest.Mock).mock.calls[0];
    expect(ansiCall.slice(2)).toEqual(petsciiCall.slice(2));
  });

  it('emits art / include / art as three payloads, in document order', async () => {
    const dir = tmpdir('order');
    const includeArt = seqBytes(0xa1, 0xa2);
    fs.writeFileSync(path.join(dir, 'INC.SEQ'), includeArt);

    const seqPath = path.join(dir, 'HOST.SEQ');
    fs.writeFileSync(seqPath, seqBytes('~ AA~SS_', path.join(dir, 'INC'), '|BB'));

    const emits: Emit[] = [];
    const session = petsciiSession();
    disposePetsciiRenderCtx(session);
    await displayScreen(makeSocket(emits), session, seqPath);

    const payloads = petsciiPayloads(emits);
    expect(payloads.length).toBe(3);
    expect(payloads[0].toString('latin1')).toBe(' AA');
    expect(Array.from(payloads[1])).toEqual(Array.from(includeArt));
    expect(payloads[2].toString('latin1')).toBe('BB');
    // Every emit on this screen is PETSCII - a gated .seq never falls through
    // to the 40-column reflow / art-skip path.
    expect(emits.every(e => e.event === 'petscii-bytes')).toBe(true);
    expect(wireText(emits)).not.toContain(ANSI_ART_SKIPPED_NOTICE);
  });

  it('a self-including .seq stops at the depth guard instead of blowing the stack', async () => {
    const dir = tmpdir('depth');
    const seqPath = path.join(dir, 'SELF.SEQ');
    fs.writeFileSync(seqPath, seqBytes('~ X~SS_', seqPath, '|'));

    const emits: Emit[] = [];
    const session = petsciiSession();
    disposePetsciiRenderCtx(session);
    await displayScreen(makeSocket(emits), session, seqPath);

    // Cap 8 includes: the top-level render plus includes at depths 1..8.
    const xs = Buffer.concat(petsciiPayloads(emits)).toString('latin1').split('X').length - 1;
    expect(xs).toBe(9);
  });

  it('the inline ~f clear goes out as $93 on the PETSCII wire, never as an ANSI escape', async () => {
    const dir = tmpdir('clear');
    const seqPath = path.join(dir, 'HOST.SEQ');
    fs.writeFileSync(seqPath, seqBytes('~ AA~f|BB'));

    const emits: Emit[] = [];
    const session = petsciiSession();
    disposePetsciiRenderCtx(session);
    await displayScreen(makeSocket(emits), session, seqPath);

    const all = Buffer.concat(petsciiPayloads(emits));
    expect(Array.from(all)).toEqual([0x20, 0x41, 0x41, 0x93, 0x42, 0x42]);
    expect(wireText(emits)).not.toContain('\x1b[2J');
  });
});

describe('include resolver: a numbered name already carries its extension (Task 7)', () => {
  it('001.logoff.seq resolves to 001.logoff.txt when only the .txt exists', () => {
    const dir = tmpdir('resolve-txt');
    fs.writeFileSync(path.join(dir, '001.logoff.txt'), 'LOGOFF ART\r\n', 'latin1');

    const found = loadScreenFile(path.join(dir, '001.logoff.seq'), undefined, 0, petsciiSession());

    expect(found).not.toBeNull();
    expect(path.basename(found!.filePath)).toBe('001.logoff.txt');
    expect(found!.isPetscii).toBe(false);
  });

  it('001.logoff.seq resolves to the .seq when BOTH exist', () => {
    const dir = tmpdir('resolve-seq');
    fs.writeFileSync(path.join(dir, '001.logoff.txt'), 'LOGOFF ART\r\n', 'latin1');
    fs.writeFileSync(path.join(dir, '001.logoff.seq'), Buffer.from([0xa1, 0x0d]));

    const found = loadScreenFile(path.join(dir, '001.logoff.seq'), undefined, 0, petsciiSession());

    expect(found).not.toBeNull();
    expect(path.basename(found!.filePath)).toBe('001.logoff.seq');
    expect(found!.isPetscii).toBe(true);
  });

  it('an extensionless name resolves exactly as today (ANSI pin)', () => {
    const dir = tmpdir('resolve-ansi');
    fs.writeFileSync(path.join(dir, 'MENU.txt'), 'MENU TEXT\r\n', 'latin1');

    const ansi = loadScreenFile(path.join(dir, 'MENU'), undefined, 0, { nodeId: 0 } as any);
    expect(ansi).not.toBeNull();
    expect(path.basename(ansi!.filePath)).toBe('MENU.txt');

    // An explicit extension that DOES exist is still used verbatim.
    const explicit = loadScreenFile(path.join(dir, 'MENU.txt'), undefined, 0, { nodeId: 0 } as any);
    expect(path.basename(explicit!.filePath)).toBe('MENU.txt');
  });
});
