/**
 * Task 9: raw-byte transport — `petscii-bytes` end-to-end.
 *
 * Replaces the PUA round-trip for petsciiMode sessions: the loader carries
 * the exact `.seq` bytes it read off disk (`petsciiBuffer`), the display
 * path emits them raw over `petscii-bytes` (base64) instead of running them
 * through the ANSI MCI/wipe/pagination pipeline, and the telnet/SSH
 * connection emitter forwards the identical bytes to a real C64 (or
 * degrades them for a non-PETSCII terminal that somehow got PETSCII
 * content).
 *
 * SKIP_DB_INIT convention and emit-spy socket mocks follow
 * tests/handlers/graphics-answer.test.ts.
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

process.env.SKIP_DB_INIT = '1';

import { loadScreenFile, emitPetsciiScreen, displayScreen } from '../../src/handlers/screen.handler';
import { buildConnectionEmitter } from '../../src/server/connection-emitter';

describe('petscii raw byte transport', () => {
  // Fixture: raw PETSCII with control (clear/cursor-down/reverse-on/
  // reverse-off/CR) + reverse + high-bit graphics bytes, terminated by
  // $FF (pi). Built in code, never via Edit/Write on a .seq — the UTF-8
  // round-trip through those tools destroys high-bit bytes (0xA1, 0xFF).
  const fixture = Buffer.from([0x93, 0x1C, 0x12, 0xA1, 0xB0, 0x92, 0x0D, 0xC1, 0xFF]);

  /**
   * loadScreenFile's absolute-path branch (screen.handler.ts's
   * `isAbsolutePath` handling) resolves a screen name that is already a
   * full filesystem path directly against disk, bypassing the
   * dataDir/Node-search machinery entirely — no BBS_DATA_DIR env
   * indirection needed (and none would work here: tests/setup.ts already
   * loads the config singleton, with its dataDir baked in, before this
   * file runs — see the comment in
   * tests/handlers/alter-flags-require-paths.test.ts for the same lesson).
   * Passing the full path WITH its .SEQ extension is required: the
   * extension-guessing fallback in that branch only tries .txt/.ans, never
   * .seq.
   */
  function loadScreenFileForTest(dir: string, screenName: string, session: any) {
    const absPath = path.join(dir, `${screenName}.SEQ`);
    return loadScreenFile(absPath, undefined, 0, session);
  }

  it('loadScreenFile returns the exact .seq bytes as petsciiBuffer (no conversion)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'petscii-seq-'));
    const seqPath = path.join(dir, 'BBSTITLE.SEQ');
    fs.writeFileSync(seqPath, fixture);

    const result = loadScreenFileForTest(dir, 'BBSTITLE', { petsciiMode: true });

    expect(result).not.toBeNull();
    expect(result!.isPetscii).toBe(true);
    expect(result!.petsciiBuffer).toBeDefined();
    expect(Buffer.compare(result!.petsciiBuffer!, fixture)).toBe(0); // byte-identical
  });

  it('display path emits petscii-bytes whose base64 decodes to the buffer', async () => {
    const emitted: Array<{ event: string; data: any }> = [];
    const socket = { emit: (event: string, data: any) => emitted.push({ event, data }) };

    await emitPetsciiScreen(socket as any, { petsciiMode: true } as any, {
      content: '', isPetscii: true, isRip: false, filePath: 'x.seq', petsciiBuffer: fixture,
    });

    const evt = emitted.find((e) => e.event === 'petscii-bytes');
    expect(evt).toBeDefined();
    expect(Buffer.compare(Buffer.from(evt!.data, 'base64'), fixture)).toBe(0);
  });

  it('display path falls back to petscii-output when no buffer was carried (legacy string content)', async () => {
    const emitted: Array<{ event: string; data: any }> = [];
    const socket = { emit: (event: string, data: any) => emitted.push({ event, data }) };

    await emitPetsciiScreen(socket as any, { petsciiMode: true } as any, {
      content: '', isPetscii: true, isRip: false, filePath: 'x.seq',
    });

    expect(emitted).toEqual([{ event: 'petscii-output', data: '' }]);
  });

  it('telnet emitter writes raw PETSCII bytes for terminalType c64', () => {
    const written: Buffer[] = [];
    const connection = {
      write: (b: Buffer | string) => written.push(Buffer.isBuffer(b) ? b : Buffer.from(b)),
      session: { terminalType: 'c64' },
    };

    const emitter = buildConnectionEmitter(connection as any);
    emitter.emit('petscii-bytes', fixture.toString('base64'));

    expect(written).toHaveLength(1);
    expect(Buffer.compare(written[0], fixture)).toBe(0);
  });

  it('telnet emitter writes raw PETSCII bytes for a telnet session with petsciiMode set (non-c64 terminalType)', () => {
    const written: Buffer[] = [];
    const connection = {
      write: (b: Buffer | string) => written.push(Buffer.isBuffer(b) ? b : Buffer.from(b)),
      session: { terminalType: 'ansi', petsciiMode: true },
    };

    const emitter = buildConnectionEmitter(connection as any);
    emitter.emit('petscii-bytes', fixture.toString('base64'));

    expect(Buffer.compare(written[0], fixture)).toBe(0);
  });

  /**
   * The other tests above exercise emitPetsciiScreen and
   * buildConnectionEmitter directly - useful building blocks, but not the
   * product's actual entry point. A real caller (command.handler.ts,
   * menu.ts, etc.) calls displayScreen(socket, session, screenName); THIS
   * test drives that exact function, through the real (unmocked)
   * loadScreenFile, and asserts the isPetscii early return actually fires
   * end-to-end: one petscii-bytes emit, nothing from the ANSI/MCI/
   * pagination pipeline, no pause/segment state left on the session.
   */
  it('displayScreen (the real entry point) emits petscii-bytes and skips the ANSI/MCI pipeline entirely', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'petscii-display-'));
    const seqPath = path.join(dir, 'BBSTITLE.SEQ');
    fs.writeFileSync(seqPath, fixture);

    const emitted: Array<{ event: string; data: any }> = [];
    const socket = {
      // getAnsiBuffer (via displayScreen's initial flushOutput(socket) call)
      // keys its per-socket buffer map on socket.id and registers a
      // 'disconnect' cleanup listener - both need to exist on the mock,
      // even though this test never appends anything to that buffer.
      id: `petscii-display-test-${Date.now()}`,
      emit: (event: string, data: any) => emitted.push({ event, data }),
      on: () => {},
    };
    const session: any = { petsciiMode: true, nodeId: 0 };

    // screenName is forwarded verbatim from displayScreen into
    // loadScreenFile (only ever .toUpperCase()'d for flow-screen/clear-set
    // membership checks along the way, which a filesystem path never
    // matches) - so the same absolute-path-with-extension seam
    // loadScreenFileForTest uses above works here too, driving the real
    // production call path instead of a synthetic loader invocation.
    const result = await displayScreen(socket as any, session, seqPath);

    expect(result).toBe(true);

    const petsciiEvents = emitted.filter((e) => e.event === 'petscii-bytes');
    expect(petsciiEvents).toHaveLength(1);
    expect(Buffer.compare(Buffer.from(petsciiEvents[0].data, 'base64'), fixture)).toBe(0);

    // No ANSI/MCI pipeline output at all: not a screen-clear, not the
    // legacy PUA conversion, nothing else.
    expect(emitted).toHaveLength(1);
    expect(emitted.some((e) => e.event === 'ansi-output')).toBe(false);
    expect(emitted.some((e) => e.event === 'petscii-output')).toBe(false);

    // No pagination/pause/~SP segment state left behind by the (skipped)
    // MCI pipeline.
    expect(session.screenSegments).toBeUndefined();
    expect(session.paginatedScreen).toBeUndefined();
    expect(session.queuedScreenCommands).toBeUndefined();
    expect(session.pendingScreenCommand).toBeUndefined();
    expect(session.lastScreenHadPause).toBe(false);
  });

  it('telnet emitter degrades to PetMe64 PUA text for a non-PETSCII terminal', () => {
    const written: (Buffer | string)[] = [];
    const connection = {
      write: (b: Buffer | string) => written.push(b),
      session: { terminalType: 'ansi' },
    };

    const emitter = buildConnectionEmitter(connection as any);
    emitter.emit('petscii-bytes', fixture.toString('base64'));

    expect(written).toHaveLength(1);
    // Degraded output is the Unicode-PUA text conversion, not raw bytes.
    expect(typeof written[0]).toBe('string');
    expect(Buffer.isBuffer(written[0])).toBe(false);
  });
});
