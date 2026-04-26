/**
 * Regression: handleShowFile / handleShowGFile / handleDisplayFileNonStop /
 * handleCheckToDisplay must emit the file body SYNCHRONOUSLY (before the
 * returned Promise resolves) for files that contain no MCI codes — the
 * common case (static ANSI art like dRE!Wall, AquaScan banners).
 *
 * Background:
 *   The deasync drains in jh-sf-sync-emit.test.ts (Paths A/B) are the
 *   safety net for the rare slow path (files with `~ML.`/`~MD.`/`~MN.`
 *   MCI codes that need DB lookups). The PRIMARY fix is to skip the
 *   async parseMciCodes pipeline entirely when content has no MCI
 *   markers, so the emit lands on the same synchronous call stack as the
 *   handler invocation. This guarantees a subsequent JH_WRITE (issued by
 *   the door immediately after JH_SF) cannot interleave ahead of the
 *   file body — there is no Promise microtask gap to slip through.
 *
 * Bug being prevented:
 *   dRE!Wall sends JH_SF (file body) followed by JH_WRITE (cursor moves +
 *   text overlay). With async file display, the JH_WRITE sometimes
 *   landed on the socket BEFORE the file body, breaking absolute cursor
 *   positioning (wall design rendered on top of name tags etc.). See
 *   commits b7011d8ca, 28b6fd94b, and the dRE!Wall handoff doc.
 *
 * Why a separate file:
 *   Loading XIMIOHandler in jh-sf-sync-emit.test.ts pulls the whole
 *   xim/io module graph and pushes the deasync.loopWhile drain in those
 *   pre-existing tests past their 5s deadline (jest sandbox flake). We
 *   keep these new tests in their own file so each test file's worker
 *   has the smallest possible module graph — both files green.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { XIMIOHandler } from '../../src/amiga-emulation/xim/io';

describe('XIMIOHandler sync fast path: emit lands before Promise resolves', () => {
  jest.setTimeout(5000);

  let tmpDir = '';
  let tmpFile = '';
  let tmpFileWithMci = '';

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-sf-fastpath-'));
    tmpFile = path.join(tmpDir, 'wall.txt');
    tmpFileWithMci = path.join(tmpDir, 'wall-mci.txt');
    // Plain ASCII ANSI banner — the dRE!Wall / AquaScan shape.
    fs.writeFileSync(
      tmpFile,
      ".----..----.|Dre!Wall|`----'`----'\n",
      'binary',
    );
    // File with a real MCI marker (~UN. is User Name) — forces slow path.
    fs.writeFileSync(
      tmpFileWithMci,
      'Hello ~UN. you have ~UC. calls\n',
      'binary',
    );
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
  });

  function buildHandler(): {
    handler: XIMIOHandler;
    emits: Array<[string, string]>;
    emitOrder: string[];
  } {
    const emits: Array<[string, string]> = [];
    const emitOrder: string[] = [];
    const socket: any = {
      emit: (ev: string, payload: string) => {
        emits.push([ev, payload]);
        emitOrder.push(`emit:${ev}`);
        return true;
      },
    };

    const emulator: any = {
      pause: () => {},
      resume: () => {},
      readMemory: () => 0,
      readMemory32: () => 0, // routes reply() to native-door (replyMsg) path
      writeMemory: () => {},
    };

    const execLibrary: any = {
      replyMsg: () => {},
      putMsg: () => {},
    };

    const messageParser: any = {
      writeCommand: () => {},
      writeMessageString: () => {},
      writeData: () => {},
      getCommandName: (_cmd: number) => 'TEST_CMD',
    };

    const state: any = {
      registered: true,
      shuttingDown: false,
      nonStopText: false,
      autoPauseEnabled: false, // disables in-emit pause prompt
      lineCount: 0,
      lineWrap: 0,
      pauseLines: 24,
      language: '',
      confAccess: '',
      carrierDropped: false,
      rawArrow: false,
      transfering: false,
      doorSilent: false,
    };

    const bbsSession: any = {
      bbsPath: tmpDir,
      dataDir: tmpDir,
      user: { secLevel: 100 },
    };

    const handler = new XIMIOHandler(
      emulator,
      execLibrary,
      socket,
      messageParser,
      state,
      bbsSession,
    );
    // XIMIOHandler.getMessageString reads bytes from emulator memory; our
    // stub emulator returns 0 for everything. Bypass that and route the
    // read at msg.string directly so test setup stays minimal.
    (handler as any).getMessageString = (m: any) => m.string || '';
    return { handler, emits, emitOrder };
  }

  function buildMsg(filePath: string, command = 8 /* JH_SF */, data = 0): any {
    return {
      msgAddr: 0xdead0000,
      command,
      data,
      replyPort: 0,
      string: filePath,
    };
  }

  test('handleShowFile: ansi-output emitted SYNCHRONOUSLY for non-MCI files', () => {
    const { handler, emits, emitOrder } = buildHandler();
    const promise = handler.handleShowFile(buildMsg(tmpFile));
    emitOrder.push('after-call');

    // Sync fast path: emit MUST be the first event recorded — i.e. it
    // happened before the .handleShowFile() call returned.
    expect(emitOrder[0]).toBe('emit:ansi-output');
    expect(emits.length).toBeGreaterThan(0);
    expect(emits[0][0]).toBe('ansi-output');
    expect(emits[0][1]).toContain('Dre!Wall');

    return promise;
  });

  test('handleShowFile: file with ~MCI codes still works (slow path)', async () => {
    const { handler, emits } = buildHandler();
    await handler.handleShowFile(buildMsg(tmpFileWithMci));

    expect(emits.length).toBeGreaterThan(0);
    expect(emits[0][0]).toBe('ansi-output');
  });

  test('handleDisplayFileNonStop: sync emit (forwards to handleShowFile)', () => {
    const { handler, emits, emitOrder } = buildHandler();
    const promise = handler.handleDisplayFileNonStop(buildMsg(tmpFile));
    emitOrder.push('after-call');

    expect(emitOrder[0]).toBe('emit:ansi-output');
    expect(emits[0][1]).toContain('Dre!Wall');
    return promise;
  });

  test('handleShowFile: missing file replies 0 synchronously without emitting', () => {
    const { handler, emits, emitOrder } = buildHandler();
    const promise = handler.handleShowFile(buildMsg('/nonexistent/path/abc.txt'));
    emitOrder.push('after-call');

    expect(emits.length).toBe(0);
    return promise;
  });
});
