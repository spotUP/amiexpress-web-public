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
  /*
   * GL, gl and GLC are one door under three icons - the TypeScript viewer in
   * `Doors/glc-viewer`, reading one GLCViewer.cfg. A sysop who changes STYLE
   * under any of those names has changed it for all of them, so the admin
   * drawing the same settings form under each is right rather than crossed.
   *
   * The DECLARED name moved: the manifest said `GLC` when this list was
   * written and says `GL` now, which is what `~CC_gl` in logon20.txt runs and
   * what the CallersLog records. So the long form is the alias today, and the
   * short ones need no entry at all. Kept as a map rather than deleted,
   * because the pairing is the point: three icons, one settings form.
   */
  ['glc.info', 'GL'],
  /*
   * SUBSCAN is the SAME BINARY as SUBS under a second name, on purpose: it is
   * how one door tells its full screen from the three-line digest a
   * conference bulletin runs, because AmigaDOS hands a door one argument and
   * that argument is the node number. The door asks the board which name
   * launched it (GET_CUSTOM_MSGBASE_MENUCMD, 605).
   *
   * So the admin drawing SUBS's settings form under SUBSCAN is CORRECT rather
   * than crossed - both registrations run one binary that reads one SUBS.cfg,
   * and a sysop who changes FeedWindow under either name has changed it for
   * both. This is the opposite of the GWWALL case below, where two commands
   * pointed at two different doors and the form edited the wrong one.
   *
   * It was invisible until 2026-09-08 only because Doors/SUBS was deleted
   * from the working tree at the time; manifestCommand() answers null for a
   * door directory that is not there, so the check skipped it entirely.
   */
  ['subscan.info', 'SUBS'],
  /*
   * J is Bulls' drawer-mate, not its alias: emp_tools holds TWO binaries
   * (Bulls and Joincnf) reading the SAME two files (Bulls.CFG the menu,
   * joincnf.cfg the join rules — Bulls.DOC names JoinCnf.CFG errors among
   * Bulls' own). One drawer, one manifest, two registrations, and a sysop
   * changing join settings under either name has changed them for both —
   * the SUBSCAN shape above, not the GWWALL one below.
   */
  ['j.info', 'B'],
  /*
   * BULLS is where B.info hands its command when the bulletins door is not
   * installed (FALLBACK=BULLS, 55979f592): the same Bulls drawer and the same
   * manifest (command B) under the name the Bulls binary was registered as
   * first. Declared on purpose - the SUBSCAN shape, not GWWALL's.
   */
  ['bulls.info', 'B'],
  /*
   * TIPLOGIN is TIP run at login, on purpose (c578f1a1d, sysop 2026-09-29):
   * the same Doors/tip-of-day under a second command, so the door can tell
   * the login tip (which a caller may switch off) from a tip he asked for by
   * typing TIP. One door, one manifest - the SUBSCAN shape, not GWWALL's.
   */
  ['tiplogin.info', 'TIP'],
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
  // board and absent from git - Doors/tic-tac-toe (TTT), BestConf. (scan.x
  // was the third example until L.info, its only registration, was retired on
  // 2026-09-06 for naming a binary that has never existed.)
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
