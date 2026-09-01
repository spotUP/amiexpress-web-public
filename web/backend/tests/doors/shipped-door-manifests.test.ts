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
    const pkg = JSON.parse(fs.readFileSync(path.join(doorDir, 'package.json'), 'utf8'));

    const registered = pkg.bbsCommand || pkg.doorMetadata?.command;
    if (!registered) return; // not every door names its command in package.json

    expect(manifest.command.toUpperCase()).toBe(String(registered).toUpperCase());
  });
});
