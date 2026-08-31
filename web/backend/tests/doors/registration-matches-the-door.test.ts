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
});
