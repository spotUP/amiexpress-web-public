/**
 * Final review wave, Finding 1 (Critical): TTYPE/dedicated-port C64s never
 * received BBSTITLE.SEQ.
 *
 * index.ts's `handleC64Detected` (now extracted to
 * server/c64-detected-handler.ts) used to carry its own hand-rolled
 * mini-emitter that understood only 'petscii-output'/'ansi-output' -
 * screen.handler.ts's raw-byte transport for .seq screens (`petscii-bytes`,
 * Task 9 - see tests/handlers/petscii-bytes-transport.test.ts) fell into
 * that emitter's missing `else` branch and vanished silently. The fix
 * reuses `buildConnectionEmitter` - the SAME emitter every other
 * telnet/SSH connection uses (built directly, with real fixture bytes, in
 * petscii-bytes-transport.test.ts) - instead of a second, divergent
 * implementation of the same contract.
 *
 * This file mocks screen.handler.ts's `displayScreen` (a real ESM export
 * compiled by swc to a non-configurable getter - jest.spyOn on the live
 * module object throws "Cannot redefine property", so jest.mock is the
 * only option), which is why this lives in its own file rather than
 * extending petscii-bytes-transport.test.ts: jest.mock is hoisted
 * file-wide and would replace the REAL displayScreen/loadScreenFile that
 * file's other tests deliberately exercise end-to-end.
 */
process.env.SKIP_DB_INIT = '1';

const displayScreenMock = jest.fn(async () => true);

jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: displayScreenMock,
}));

import { handleC64Detected } from '../../src/server/c64-detected-handler';
import { BBSState } from '../../src/constants/bbs-states';

describe('c64-detected handler (Finding 1: TTYPE/dedicated-port C64s reach the shared connection emitter)', () => {
  // Same fixture shape as petscii-bytes-transport.test.ts - built in code,
  // never via Edit/Write on a real .seq (the UTF-8 round-trip through those
  // tools destroys high-bit bytes like 0xA1/0xFF).
  const fixture = Buffer.from([0x93, 0x1C, 0x12, 0xA1, 0xB0, 0x92, 0x0D, 0xC1, 0xFF]);

  beforeEach(() => {
    displayScreenMock.mockClear();
    displayScreenMock.mockImplementation(async (emitter: any, _session: any, screenName: any) => {
      // What the real displayScreen does for a petsciiMode/.seq BBSTITLE
      // (see emitPetsciiScreen / the fixture tests in
      // petscii-bytes-transport.test.ts): emit the raw bytes over
      // petscii-bytes on whatever emitter it was handed.
      expect(screenName).toBe('BBSTITLE');
      emitter.emit('petscii-bytes', fixture.toString('base64'));
      return true;
    });
  });

  it('drives displayScreen through buildConnectionEmitter, and the fixture .seq bytes reach connection.write byte-identically', async () => {
    const written: Buffer[] = [];
    const connection: any = {
      write: (b: Buffer | string) => written.push(Buffer.isBuffer(b) ? b : Buffer.from(b)),
      session: { terminalType: 'c64', petsciiMode: true, tempData: {} },
    };

    await handleC64Detected(connection);

    expect(displayScreenMock).toHaveBeenCalledTimes(1);
    expect(displayScreenMock.mock.calls[0][1]).toBe(connection.session);
    expect(displayScreenMock.mock.calls[0][2]).toBe('BBSTITLE');

    // The old mini-emitter silently dropped this event entirely (no write
    // at all) - buildConnectionEmitter must forward the exact bytes,
    // untouched, as the very first write.
    expect(written.length).toBeGreaterThanOrEqual(1);
    expect(Buffer.compare(written[0], fixture)).toBe(0);

    // Session still transitions to LOGON/username exactly as before the
    // refactor - only the emitter changed, not the login hand-off.
    expect(connection.session.state).toBe(BBSState.LOGON);
    expect(connection.session.subState).toBeUndefined();
    expect(connection.session.tempData.loginPhase).toBe('username');

    // BBSTITLE bytes, then two CR for spacing, then the Username: prompt.
    expect(written).toHaveLength(3);
  });

  it('a dedicated-PETSCII-port session (petsciiMode set, terminalType not literally "c64" yet) also gets the raw bytes', () => {
    // telnet-server.ts's petsciiDefault path (task 10) stamps
    // terminalType='c64' too by the time c64-detected fires (see
    // telnet-server.ts:739-740), but buildConnectionEmitter's own
    // petscii-bytes branch independently honors petsciiMode alone - pin
    // that OR condition here so a future change to either signal doesn't
    // silently narrow the raw-byte gate.
    const written: Buffer[] = [];
    const connection: any = {
      write: (b: Buffer | string) => written.push(Buffer.isBuffer(b) ? b : Buffer.from(b)),
      session: { terminalType: 'ansi', petsciiMode: true, tempData: {} },
    };

    return handleC64Detected(connection).then(() => {
      expect(Buffer.compare(written[0], fixture)).toBe(0);
    });
  });

  it('does nothing when the connection has no session yet', async () => {
    const connection: any = {
      write: jest.fn(),
      session: undefined,
    };

    await handleC64Detected(connection);

    expect(displayScreenMock).not.toHaveBeenCalled();
    expect(connection.write).not.toHaveBeenCalled();
  });
});
