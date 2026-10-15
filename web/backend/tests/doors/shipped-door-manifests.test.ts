/**
 * Every manifest a door ships is one the admin can actually render.
 *
 * The door reads its declaration through the SDK and the admin reads it
 * through `door-settings.service.ts` - two implementations of the same rules,
 * because the backend's build cannot compile SDK source. A door whose manifest
 * only one of them accepts is a door with a Settings tab that errors, or a
 * setting the door never receives, and neither shows up until a sysop opens
 * the page.
 */

import * as fs from 'fs';
import * as path from 'path';
import { readDoorSettings } from '@amiexpress/bbs-door-sdk/settings';
import { readDoorSettingsView } from '../../src/doors/door-settings.service';

const DOORS_DIR = path.join(__dirname, '../../../../Doors');

const doorsWithManifests = fs.readdirSync(DOORS_DIR)
  .filter(name => fs.existsSync(path.join(DOORS_DIR, name, 'door.settings.json')))
  .sort();

describe('shipped door manifests', () => {
  it('includes the two doors phase 4 migrated', () => {
    expect(doorsWithManifests).toEqual(expect.arrayContaining(['bbslink', 'livechat']));
  });

  it.each(doorsWithManifests)('%s is readable by the admin and by the door', doorName => {
    const doorDir = path.join(DOORS_DIR, doorName);

    const view = readDoorSettingsView(doorDir);
    expect(view).not.toBeNull();

    /*
     * A manifest has to declare SOMETHING the admin can act on - settings or
     * art. It used to demand settings, on the premise that declaring settings
     * is what a manifest is for, and QuickNew broke that premise honestly: it
     * has no admin-editable settings at all, and its manifest exists so the
     * ANSI Studio can reach the config templates that ARE its screen
     * (186c4f630).
     *
     * Widened rather than loosened. An EMPTY manifest - neither settings nor
     * art - is still a defect, because it puts a door in the admin's list with
     * nothing behind it, and that is what this line is here to catch.
     */
    const declares =
      view!.manifest.settings.length + (view!.manifest.artSections?.length ?? 0) + (view!.manifest.notifications?.length ?? 0);
    expect(declares).toBeGreaterThan(0);

    // The door, reading the same files, gets every key the admin would show -
    // minus the secrets, which have no default and are not set in the repo.
    const asTheDoorSeesThem = readDoorSettings(doorDir);
    const declaredWithDefaults = view!.manifest.settings
      .filter(s => s.default !== undefined)
      .map(s => s.key);
    for (const key of declaredWithDefaults) {
      expect(asTheDoorSeesThem).toHaveProperty(key);
    }
  });

  it('refuses a manifest that declares nothing at all', () => {
    // The guard the widened rule still has to carry: a door in the admin's
    // list with neither settings nor art behind it is a defect, and a rule
    // widened to let QuickNew through must not let that through with it.
    const empty = { manifest: { settings: [], artSections: [] } };
    const declares =
      empty.manifest.settings.length + (empty.manifest.artSections?.length ?? 0);

    expect(declares).toBe(0);
  });

  // A door's package.json is what a FUTURE install would register; the board
  // runs what Commands/BBSCmd already holds. When they disagree the board
  // wins - BBSLink said LINKMENU where the board runs BBSLINK, the wall said
  // BBSLINKWALL where it runs LINKWALL, and the front end said FRONTEND for a
  // registration whose filename is Telnet-Front and which carries no BBSCMD
  // tooltype at all.
  it.each(doorsWithManifests)('%s declares the command its package.json registers', doorName => {
    const doorDir = path.join(DOORS_DIR, doorName);
    const manifest = JSON.parse(fs.readFileSync(path.join(doorDir, 'door.settings.json'), 'utf8'));

    // Settings are no longer TypeScript-only: a 68K/C door (REQUESTS) declares
    // a manifest too and has no package.json at all. There is nothing to
    // compare against for those, so the pairing check does not apply.
    const pkgPath = path.join(doorDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    const registered = pkg.bbsCommand || pkg.doorMetadata?.command;
    if (!registered) return; // not every door names its command in package.json

    expect(manifest.command.toUpperCase()).toBe(String(registered).toUpperCase());
  });

  /**
   * A manifest with nothing reading it is a form that edits into the void.
   *
   * card-lobby and dopewars landed exactly that way on 2026-09-08: both
   * declared six settings, the admin drew both forms, and neither door's
   * source called the SDK - every value the sysop typed was saved and
   * ignored. It is invisible from the admin, which shows a form either way.
   *
   * A TypeScript door reads through `readDoorSettings` /
   * `readDoorSettingOverrides`. A 68K door cannot: the board renders its
   * `.cfg` from the same manifest and the door parses that, so its proof is
   * that the C source names the cfg keys it declares.
   */
  it.each(doorsWithManifests)('%s reads the settings it declares', doorName => {
    const doorDir = path.join(DOORS_DIR, doorName);
    const manifest = JSON.parse(fs.readFileSync(path.join(doorDir, 'door.settings.json'), 'utf8'));

    // A manifest that only declares NOTIFY events has no settings for a door to read.
    if (!manifest.cfgFile && manifest.settings.length === 0 && manifest.notifications?.length) return;

    if (manifest.cfgFile) {
      // The 68K route: the board writes <cfgFile>, the door parses it. Its
      // source has to name each cfgKey, or that key reaches nothing.
      const source = cSourceFor(manifest.command);
      if (source === null) {
        // Binary-only door (Bulls): no source in the tree to name the keys,
        // so the proof is the file the binary parses — every bound setting
        // must resolve in the shipped cfg, or the form edits into the void.
        for (const setting of manifest.settings) {
          /*
           * An ART slot is not cfg-bound and must not be: its value names a
           * FILE inside the door's folder, the Studio writes the drawing, and
           * the door reads it with `fs`. GLC-VIEWER is the first door here to
           * declare both kinds - a flat cfg it shares with the 68K viewer AND
           * four drawable logos (2026-09-16) - so the rule now says which
           * settings it is about.
           */
          if (setting.art) continue;
          expect(cfgBindingResolves(doorDir, manifest, setting)).toBe(true);
        }
        return;
      }
      for (const setting of manifest.settings) {
        const cfgKey = setting.cfgKey ?? setting.key;
        expect(source).toContain(cfgKey);
      }
      return;
    }

    // The TypeScript route: something under the door reads the SDK.
    expect(typescriptSourcesUnder(doorDir).some(file => /readDoorSetting/.test(file))).toBe(true);
  });
});

/** Every .ts of a door's own, without its dependencies or its build output. */
function typescriptSourcesUnder(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'tests') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) typescriptSourcesUnder(full, found);
    else if (entry.name.endsWith('.ts')) found.push(fs.readFileSync(full, 'utf8'));
  }
  return found;
}

/** A C door's source, which lives in the SDK's examples rather than beside it. */
function cSourceFor(command: string): string | null {
  const dir = path.join(__dirname, '../../../../sdk/c/examples', String(command).toLowerCase());
  if (!fs.existsSync(dir)) return null;
  const sources = fs.readdirSync(dir).filter(name => name.endsWith('.c'));
  if (sources.length === 0) return null;
  return sources.map(name => fs.readFileSync(path.join(dir, name), 'utf8')).join('\n');
}

/**
 * A binary-only door's proof: every bound setting resolves in the shipped
 * cfg file the binary parses. Same question the C-source check answers for
 * compiled doors — does this key reach anything — asked of the file.
 */
function cfgBindingResolves(doorDir: string, manifest: any, setting: any): boolean {
  const file = setting.cfgFile ?? manifest.cfgFile;
  if (!file || (!setting.cfgKey && !setting.cfgRow)) return false;
  const full = path.join(doorDir, file);
  if (!fs.existsSync(full)) return false;

  /*
   * A PLAIN `Key=value` cfg is not an Empire file and must not be read as
   * one. The Empire parser answers `undefined` for every key in a flat cfg,
   * so asking it about GWALL.cfg said "this setting reaches nothing" about a
   * setting sitting in plain sight - which is what happened to GWall,
   * GLCViewer and DoorRepo, the first binary-only doors here whose config is
   * flat (2026-09-14). The question this function asks is right; it was only
   * ever asked in one dialect.
   */
  if (manifest.cfgFormat !== 'empire') {
    if (!setting.cfgKey) return false;
    const wanted = String(setting.cfgKey).toLowerCase();
    return fs.readFileSync(full, 'utf8')
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      // `;` and `#` both start a comment in these files, and a commented-out
      // key is not a key the door reads.
      .filter((line: string) => line && !line.startsWith(';') && !line.startsWith('#'))
      .some((line: string) => {
        const at = line.indexOf('=');
        return at > 0 && line.slice(0, at).trim().toLowerCase() === wanted;
      });
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const empire = require('../../src/doors/text-cfg/empire');
  const parsed = empire.parseEmpireFile(fs.readFileSync(full));
  const row = setting.cfgRow;
  if (row) {
    if (row.field === 'title' || row.field === 'file') {
      return empire.getBullRows(parsed).length > (row.row ?? -1);
    }
    if (row.field === 'mask') {
      return empire.getMaskRows(parsed).length > (row.row ?? -1);
    }
    if (setting.cfgKey) {
      return empire.getKv(parsed, row.section, setting.cfgKey) !== undefined;
    }
    return false;
  }
  return empire.getKv(parsed, 'init', setting.cfgKey) !== undefined;
}

/**
 * Labels are what the sysop reads: two settings sharing one label render
 * as the same radios twice with nothing telling them apart. Live
 * 2026-09-11: the B form showed "Dual listing" twice - Bulls.CFG's
 * DUAL_LISTING and joincnf.cfg's DUAL_LISTING under one name.
 */
describe('shipped manifest labels', () => {
  it.each(doorsWithManifests)('%s labels every setting distinctly', doorName => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(DOORS_DIR, doorName, 'door.settings.json'), 'utf8')
    );
    const seen = new Map<string, string>();
    for (const setting of manifest.settings) {
      const label = String(setting.label ?? '').toLowerCase();
      expect(seen.has(label)).toBe(false);
      seen.set(label, setting.key);
    }
  });
});
