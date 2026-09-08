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
    expect(view!.manifest.settings.length).toBeGreaterThan(0);

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

    if (manifest.cfgFile) {
      // The 68K route: the board writes <cfgFile>, the door parses it. Its
      // source has to name each cfgKey, or that key reaches nothing.
      const source = cSourceFor(manifest.command);
      expect(source).not.toBeNull();
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
