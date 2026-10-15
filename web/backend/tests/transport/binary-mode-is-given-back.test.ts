/**
 * A telnet caller does not stay in BINARY after his transfer.
 *
 * P3-4, transfer row 1. express negotiates BINARY before a transfer
 * (express.e:15891-15896) and gives it back after (express.e:15956-15959,
 * `iac(...,254,0)` then `iac(...,252,0)`). This port only ever did the first
 * half, so a telnet session stayed in BINARY for the rest of the call - a
 * tolerant client never notices, a strict NVT one stops translating CR/LF and
 * renders the next menu as a staircase.
 *
 * The revert lives in `endRawTransfer`, which is the one place every path that
 * ends a transfer already goes through - the entry half is called from three.
 */
process.env.SKIP_DB_INIT = '1';

import { endRawTransfer } from '../../src/utils/raw-transfer-teardown.util';
import {
  endBinaryAfterTransfer,
  negotiateBinaryForTransfer,
} from '../../src/handlers/file/file-delivery';

/** IAC WILL BINARY, IAC DO BINARY. */
const ENTER = [255, 251, 0, 255, 253, 0];
/** IAC DONT BINARY, IAC WONT BINARY. */
const LEAVE = [255, 254, 0, 255, 252, 0];

function telnetSession() {
  const raw: number[][] = [];
  return {
    session: {
      connectionType: 'telnet',
      transferRawActive: true,
      transferRawSink: () => { /* a sink the teardown clears */ },
      transferManager: {},
      transferRawSendUnescaped: (buf: Buffer) => { raw.push([...buf]); },
    } as never,
    raw,
  };
}

describe('the two halves of the negotiation', () => {
  it('enters BINARY the way express does', () => {
    const { session, raw } = telnetSession();

    expect(negotiateBinaryForTransfer(session)).toBe(true);
    expect(raw).toEqual([ENTER]);
  });

  it('gives it back the way express does', () => {
    const { session, raw } = telnetSession();

    expect(endBinaryAfterTransfer(session)).toBe(true);
    expect(raw).toEqual([LEAVE]);
  });

  it('sends the revert on the UNESCAPED channel, or the IACs would double', () => {
    // `transport.send` doubles every 0xFF; an IAC that arrives as IAC IAC is
    // data, not a command, and the negotiation silently does nothing.
    const raw: number[][] = [];
    const escaped: number[][] = [];
    const session = {
      connectionType: 'telnet',
      transferRawSendUnescaped: (buf: Buffer) => { raw.push([...buf]); },
      transferRawSend: (buf: Buffer) => { escaped.push([...buf]); },
    } as never;

    endBinaryAfterTransfer(session);

    expect(raw).toEqual([LEAVE]);
    expect(escaped).toEqual([]);
  });
});

describe('when a transfer ends', () => {
  it('the teardown gives BINARY back, whatever ended it', () => {
    const { session, raw } = telnetSession();

    endRawTransfer(session);

    expect(raw).toEqual([LEAVE]);
    expect((session as any).transferRawActive).toBe(false);
    expect((session as any).transferRawSink).toBeUndefined();
  });

  it('leaves a web caller alone - there is no telnet layer to give back', () => {
    const raw: number[][] = [];
    const session = {
      connectionType: 'web',
      transferRawActive: true,
      transferRawSendUnescaped: (buf: Buffer) => { raw.push([...buf]); },
    } as never;

    endRawTransfer(session);

    expect(raw).toEqual([]);
    expect((session as any).transferRawActive).toBe(false);
  });

  it('is safe on a session that never transferred anything', () => {
    expect(() => endRawTransfer({ connectionType: 'telnet' })).not.toThrow();
  });
});
