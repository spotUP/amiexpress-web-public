/**
 * A door installed as TypeScript is registered as one.
 *
 * The installer writes `TYPE=typescript` into Commands/BBSCmd/<CMD>.info
 * (door-installer.ts:132) and the admin's Door Type list offers the same
 * word - but the enum member is `TS`, so the lookup missed and every such
 * door was registered as SIM, which is a 68K door. The board then hunted for
 * a 68K executable inside the door's directory and the door exited the moment
 * a caller ran it:
 *
 *   LOCATION points to directory /app/data/bbs/Doors/card-lobby but no
 *   matching executable found (tried: .../card-lobby, .../CARD-LOBBY, ...)
 *
 * Reported from the board on 2026-09-08 as "cardlobby exits on the live
 * server". It also made the admin lossy: the API served the misparsed SIM,
 * the form saved back what it had been shown, and CARDLOBBY.info's own
 * `TYPE=typescript` became `TYPE=SIM` on the first edit.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadCommandFromInfo } from '../../src/utils/amiga-command-parser.util';
import { DoorType } from '../../src/utils/amiga-command-parser.util';

/** A registration as the installer writes one, with the TYPE under test. */
function registrationWith(type: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbscmd-'));
  const file = path.join(dir, 'CARDLOBBY.info');
  fs.writeFileSync(file, [
    'BBSCMD=CARDLOBBY',
    `TYPE=${type}`,
    'LOCATION=Doors/card-lobby',
    'ACCESS=30',
    '',
  ].join('\n'));
  return file;
}

describe('the TYPE a door was installed with', () => {
  it('registers TYPE=typescript as a TypeScript door, not as 68K', () => {
    const parsed = loadCommandFromInfo(registrationWith('typescript'));

    expect(parsed).not.toBeNull();
    // SIM here is what sent the board looking for a 68K binary.
    expect(parsed!.type).toBe(DoorType.TS);
  });

  it('takes the enum spelling too, which is what the .info may already say', () => {
    expect(loadCommandFromInfo(registrationWith('TS'))!.type).toBe(DoorType.TS);
  });

  it('is case-insensitive, because a sysop types what he likes', () => {
    expect(loadCommandFromInfo(registrationWith('TypeScript'))!.type).toBe(DoorType.TS);
  });

  it('leaves a real 68K type alone', () => {
    expect(loadCommandFromInfo(registrationWith('XIM'))!.type).toBe(DoorType.XIM);
    expect(loadCommandFromInfo(registrationWith('SIM'))!.type).toBe(DoorType.SIM);
  });

  it('still falls back to SIM for a type nobody recognises - express.e:4676', () => {
    expect(loadCommandFromInfo(registrationWith('WAFFLE'))!.type).toBe(DoorType.SIM);
  });
});
