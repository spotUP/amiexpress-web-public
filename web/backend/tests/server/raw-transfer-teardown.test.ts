/**
 * Regression: the SECOND zmodem transfer of a telnet/SSH session must work.
 *
 * Live bug (2026-09-08): "the second file transferred via zmodem fails via
 * telnet/ssh". While a transfer runs, classifyTerminalInput routes EVERY
 * inbound byte to session.transferRawSink and nowhere else. The only code that
 * cleared that routing lived in socket.io handlers ('transfer-raw:complete' /
 * ':cancel') - the BROWSER announcing the transfer was over. A telnet or SSH
 * caller sends no such event, so after his first transfer transferRawActive
 * stayed true and transferRawSink still pointed at the finished transfer's dead
 * lrzsz manager. Every later byte went into that corpse, so transfer #2 could
 * never work. Reconnecting "fixed" it only because the disconnect path cleared
 * the same fields.
 *
 * Two properties are pinned here, deliberately:
 *  1. RUNTIME - tearing down actually stops the real classifier routing.
 *  2. STRUCTURE - no transfer entry point starts a transfer without a matching
 *     teardown in the same file. This one is a source check and cannot prove
 *     the call runs; it exists to catch the exact defect class (a `set` with no
 *     `clear`) if a new entry point is added later. Test 1 is what proves the
 *     mechanism works.
 */

process.env.SKIP_DB_INIT = 'true';

import * as fs from 'fs';
import * as path from 'path';
import { classifyTerminalInput } from '../../src/server/terminal-input';
import { endRawTransfer } from '../../src/utils/raw-transfer-teardown.util';

describe('raw transfer teardown - the second transfer must not be swallowed', () => {
  function sessionMidTransfer(sink: (b: Buffer) => void): any {
    return { transferRawActive: true, transferRawSink: sink };
  }

  it('routes input to the transfer sink while a transfer is running', () => {
    const sink = jest.fn();
    const decision = classifyTerminalInput(sessionMidTransfer(sink) as any, 'abc');
    expect(decision.kind).toBe('transfer-sink');
  });

  it('stops routing to the finished transfer once it is torn down', () => {
    const sink = jest.fn();
    const session = sessionMidTransfer(sink);

    endRawTransfer(session);

    // The bug: without teardown this still answers 'transfer-sink', so the
    // next transfer's bytes are handed to the previous, dead manager.
    const decision = classifyTerminalInput(session as any, 'abc');
    expect(decision.kind).not.toBe('transfer-sink');
    expect(session.transferRawActive).toBe(false);
    expect(session.transferRawSink).toBeUndefined();
  });

  it('also drops a stale manager-based sink', () => {
    const session: any = {
      transferRawActive: true,
      transferManager: { handleInput: jest.fn() },
    };
    expect(classifyTerminalInput(session as any, 'x').kind).toBe('transfer-sink');

    endRawTransfer(session);

    expect(classifyTerminalInput(session as any, 'x').kind).not.toBe('transfer-sink');
    expect(session.transferManager).toBeUndefined();
  });

  it('is safe to call twice, and on a session with no transfer', () => {
    const session: any = {};
    expect(() => {
      endRawTransfer(session);
      endRawTransfer(session);
      endRawTransfer(undefined);
    }).not.toThrow();
  });

  // STRUCTURAL guard - see the header. Fails on the pre-fix tree, where both
  // handlers set the flag and neither ever cleared it.
  it('every handler that starts a raw transfer also tears one down', () => {
    const handlers = [
      'src/handlers/commands/user-commands.handler.ts',
      'src/handlers/commands/transfer-misc-commands.handler.ts',
    ];
    for (const rel of handlers) {
      const src = fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
      const starts = (src.match(/transferRawActive = true/g) || []).length;
      const teardowns = (src.match(/endRawTransfer\(/g) || []).length;
      expect(starts).toBeGreaterThan(0);
      // One teardown per start, at minimum: a transfer that begins must end.
      expect(teardowns).toBeGreaterThanOrEqual(starts);
    }
  });
});
