/**
 * The 80-column non-negotiable, proved on the REAL emitter.
 *
 * Non-PETSCII sessions must be byte-for-byte what they were before the C64
 * door adapter existed. This runs the SAME door output through the SAME
 * `buildConnectionEmitter` (connection-emitter.ts - the live telnet/SSH
 * transport) twice: once with `installC64DoorAdapter` attempted, once with no
 * install at all, and compares the bytes that reached the wire.
 *
 * The third case is what keeps the first two from passing vacuously: for a
 * PETSCII session the two runs MUST differ, because the adapter is doing its
 * job. Loosen the install gate (c64AdapterDrives) and cases 1 and 2 go red -
 * which is the RED proof this pin is worth having.
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import {
  installC64DoorAdapter,
  uninstallC64DoorAdapter,
} from '../../src/server/c64-door-adapter';

const DOOR_OUTPUT = fs.readFileSync(
  path.resolve(__dirname, '../../../../sdk/tests/petscii/frame/fixtures/what.txt'),
  'latin1',
);

/** A TelnetConnection-shaped fake: only what buildConnectionEmitter touches. */
function fakeConnection(session: any) {
  const chunks: Buffer[] = [];
  return {
    chunks,
    connection: {
      sessionId: 'identity-test',
      session,
      write: (data: Buffer | string) =>
        chunks.push(typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data)),
      on: () => undefined,
      off: () => undefined,
      close: () => undefined,
    } as any,
  };
}

const ansiSession = () => ({ terminalType: 'modern', petsciiMode: false, screenWidth: 80, screenHeight: 24 });
const petsciiSession = () => ({ terminalType: 'c64', petsciiMode: true, screenWidth: 40, screenHeight: 25 });

/**
 * Push the fixture through a fresh emitter and return the wire bytes.
 * `withAdapter` decides only whether the install is ATTEMPTED - the gate
 * inside installC64DoorAdapter is what the pin is testing.
 */
function run(makeSession: () => any, withAdapter: boolean): Buffer {
  const session = makeSession();
  const { connection, chunks } = fakeConnection(session);
  const emitter = buildConnectionEmitter(connection);
  if (withAdapter) installC64DoorAdapter(emitter, session, { tickMs: 5, maxFrameMs: 20 });
  for (let i = 0; i < DOOR_OUTPUT.length; i += 64) {
    emitter.emit('ansi-output', DOOR_OUTPUT.slice(i, i + 64));
  }
  if (withAdapter) uninstallC64DoorAdapter(emitter);
  return Buffer.concat(chunks);
}

describe('the C64 door adapter never touches a non-PETSCII session', () => {
  it('an ANSI session gets byte-identical output with and without the adapter module in play', () => {
    const withAdapter = run(ansiSession, true);
    const without = run(ansiSession, false);
    expect(withAdapter.length).toBeGreaterThan(0);
    expect(withAdapter.equals(without)).toBe(true);
  });

  it('the door 80-column art is still verbatim in those bytes', () => {
    const bytes = run(ansiSession, true).toString('latin1');
    expect(bytes).toContain('-'.repeat(76));
    expect(bytes).toContain('WHAT: Transfer Activities v2.0');
  });

  it('a PETSCII session DOES differ - otherwise the pin above is vacuous', () => {
    const withAdapter = run(petsciiSession, true);
    const without = run(petsciiSession, false);
    expect(withAdapter.length).toBeGreaterThan(0);
    expect(withAdapter.equals(without)).toBe(false);
  });
});
