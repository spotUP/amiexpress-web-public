/**
 * A registration must not claim a door is 68K when the door is TypeScript.
 *
 * Four of these in two days, all the same shape, none visible until a user
 * ran the command - AmiExpress reads the registration, not the door:
 *
 *   GWALL     TYPE=XIM, LOCATION=DOORS:GWall/GWall        uninstalled 2026-08-31
 *   LINKMENU  TYPE=XIM, LOCATION=Doors:bbslink/bbslink    deleted 2026-09-01
 *   LINKWALL  TYPE=XIM, LOCATION=Doors:bbslink/bbslinkwall repaired 2026-09-01
 *   32 BBSLink game aliases (lord, luna, teos, tw2002...), every one pointing
 *   at the same Amiga E binary that no longer exists - deleted 2026-09-01,
 *   after the live board had already pruned all 32 from its volume.
 *
 * This reads the WORKING TREE, so on a case-insensitive filesystem a pair like
 * TEST.info and test.info collapses to one entry and only one of them is
 * checked - both were tracked, identical and dead, and only the git tree
 * showed it. On Linux, where the board runs, they are two files.
 *
 * A door directory that is not in the repo is skipped rather than failed: a
 * door installed through the admin lives on the volume and never lands here.
 * Doors/tic-tac-toe is registered as TTT on the live board and is not in git.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseInfoFile } from '../../src/utils/info-file.util';

const ROOT = path.resolve(__dirname, '../../../..');
const BBSCMD = path.join(ROOT, 'Commands/BBSCmd');

interface Registration {
  file: string;
  type: string;
  location: string;
  doorDir: string;
}

function registrations(): Registration[] {
  return fs.readdirSync(BBSCMD)
    .filter(name => name.toLowerCase().endsWith('.info'))
    .flatMap(name => {
      let parsed: any;
      try { parsed = parseInfoFile(path.join(BBSCMD, name)); } catch { return []; }
      const tooltypes: any[] = parsed?.tooltypes ?? [];
      const value = (key: string) =>
        String(tooltypes.find(t => t.key === key && !t.commented)?.value ?? '');

      const location = value('LOCATION');
      if (!location) return [];

      // Doors:foo/bar and Doors/foo/bar name the same place - the Amiga form
      // is what a 68K registration carries - and a 68K LOCATION names the
      // BINARY, so the door is the first segment under Doors.
      const relative = location.replace(/^Doors:/i, 'Doors/').replace(/^Doors\//i, '');
      const doorDir = path.join(ROOT, 'Doors', relative.split('/')[0]);

      return [{ file: name, type: value('TYPE').toUpperCase(), location, doorDir }];
    });
}

/**
 * The command a door's settings manifest says it belongs to.
 *
 * The admin renders a door's settings form from the DIRECTORY its
 * registration points at, so a registration aimed at the wrong door shows
 * another door's settings under its own name - and offers to save them there.
 */
function manifestCommand(doorDir: string): string | null {
  const manifest = path.join(doorDir, 'door.settings.json');
  if (!fs.existsSync(manifest)) return null;
  try {
    const command = JSON.parse(fs.readFileSync(manifest, 'utf8')).command;
    return command ? String(command).toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * Registrations that deliberately name a door under a second command.
 *
 * A sysop may register one door under any name they like - TC and TCONNECT
 * both open the telnet door, RIP opens rip-browser - so a name that differs
 * from the door's own is not by itself wrong. It is only wrong when nobody
 * meant it. This list is what "meant it" looks like; anything else pointing
 * at a door that ships a settings manifest is a crossed registration.
 */
const DECLARED_ALIASES = new Map<string, string>([
  ['irc.info', 'LIVECHAT'],
]);

function doorIsTypeScript(doorDir: string): boolean {
  const manifest = path.join(doorDir, 'package.json');
  if (!fs.existsSync(manifest)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    return String(pkg.doorType ?? '').toUpperCase() === 'TS'
      || Boolean(pkg.doorMetadata)
      || String(pkg.main ?? '').startsWith('dist/');
  } catch {
    return false;
  }
}

describe('door registrations', () => {
  const all = registrations();

  it('has registrations in this repo to check', () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it('does not register a TypeScript door as a 68K one', () => {
    const wrong = all.filter(r => r.type === 'XIM' && doorIsTypeScript(r.doorDir));

    // The report IS the assertion: a bare count says a registration is wrong,
    // this says which file and what it points at.
    const report = wrong.map(r => `${r.file}: TYPE=XIM -> ${r.location}`);
    expect(report).toEqual([]);
  });

  it('has no registration left pointing at the BBSLink 68K binary', () => {
    const stale = all.filter(r => /bbslink\/bbslink/i.test(r.location.replace(':', '/')));

    expect(stale.map(r => r.file)).toEqual([]);
  });

  // The pair that was broken by a sweep.
  //
  // Doors/mail-composer was deleted on 2026-05-29 by a commit that removed 801
  // corpus-extracted directories and kept "all TypeScript doors with BBSCmd
  // .info entries" - this one had no registration YET, so 448 lines of ANSI
  // message editor went with the junk. The registration arrived later, and
  // typing AE on the board answered "Door not found:
  // /app/data/bbs/Doors/mail-composer".
  //
  // Not a general rule: a registration may point at a door installed on the
  // board and absent from git - Doors/tic-tac-toe (TTT), BestConf, scan.x.
  // This pins the one pair that has already been broken once.
  // GWWALL, found by the sysop on 2026-09-01: the admin showed it BBSLink's
  // system code, auth code and scheme code.
  //
  // `GWWALL.info` carried LOCATION=Doors/bbslinkwall - the BBSLink one-liner
  // wall - so GWWALL and LINKWALL were two commands for one door, and the
  // settings form the admin drew for GWWALL was LINKWALL's manifest. It had
  // been that way since the SDK migration (890ca13e4); the Global Wall
  // registration that WAS checked, GWALL, had been uninstalled on 2026-08-31
  // for naming a missing 68K binary, and this one was never looked at.
  //
  // Only doors that ship a manifest are checked, because that is where the
  // symptom is: a wrong LOCATION on a door with no settings form shows
  // nothing wrong until someone runs it.
  it('does not draw one door\'s settings under another door\'s name', () => {
    const crossed = all.flatMap(r => {
      const declared = manifestCommand(r.doorDir);
      if (!declared) return [];

      const command = r.file.replace(/\.info$/i, '').toUpperCase();
      if (command === declared) return [];
      if (DECLARED_ALIASES.get(r.file.toLowerCase()) === declared) return [];

      return [`${r.file}: ${r.location} ships settings for ${declared}`];
    });

    expect(crossed).toEqual([]);
  });

  it('ships the mail composer that AE registers', () => {
    const ae = registrations().find(r => r.file.toLowerCase() === 'ae.info');

    expect(ae).toBeDefined();
    expect(ae!.location).toBe('Doors/mail-composer');
    expect(fs.existsSync(path.join(ROOT, 'Doors', 'mail-composer', 'index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'Doors', 'mail-composer', 'dist', 'index.js'))).toBe(true);
  });
});
