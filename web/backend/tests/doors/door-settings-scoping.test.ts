/**
 * Per-command setting scopes: one directory serving two doors.
 *
 * emp_tools serves Bulls (B) and Joincnf (J) from a single
 * door.settings.json. Without scoping both forms showed all 49 settings -
 * the B form carried 8 join_* rows for joincnf.cfg, the J form 41 Bulls
 * rows, and "Dual listing" twice. Settings tagged `commands` show only
 * for those doors; untagged settings show everywhere (every single-door
 * manifest today).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  readDoorSettingsView,
  writeDoorSettings,
  UnknownDoorSettingError,
} from '../../src/doors/door-settings.service';

const repoEmp = path.resolve(__dirname, '..', '..', '..', '..', 'board', 'Doors', 'emp_tools');

function stageManifest(extra: Record<string, unknown> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-settings-'));
  fs.writeFileSync(
    path.join(dir, 'door.settings.json'),
    JSON.stringify({
      command: 'B',
      cfgFile: 'Bulls.CFG',
      cfgFormat: 'empire',
      settings: [
        { key: 'dual_listing', label: 'Dual listing (bulletins)', type: 'choice',
          choices: [{ value: 'YES', label: 'Yes' }, { value: 'NO', label: 'No' }],
          default: 'YES', cfgKey: 'DUAL_LISTING', commands: ['B'], ...extra },
      ],
    })
  );
  fs.copyFileSync(path.join(repoEmp, 'Bulls.CFG'), path.join(dir, 'Bulls.CFG'));
  return dir;
}

describe('command-scoped settings', () => {
  test('B sees its own settings, J does not', () => {
    const dir = stageManifest();
    const b = readDoorSettingsView(dir, 'B')!;
    expect(b.manifest.settings.map(s => s.key)).toEqual(['dual_listing']);
    const j = readDoorSettingsView(dir, 'J')!;
    expect(j.manifest.settings.map(s => s.key)).toEqual([]);
    expect(j.values).toEqual({});
  });

  test('untagged settings show for every command, no command shows all', () => {
    const dir = stageManifest();
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'door.settings.json'), 'utf8'));
    delete raw.settings[0].commands;
    fs.writeFileSync(path.join(dir, 'door.settings.json'), JSON.stringify(raw));
    expect(readDoorSettingsView(dir, 'J')!.manifest.settings.map(s => s.key)).toEqual(['dual_listing']);
    expect(readDoorSettingsView(dir)!.manifest.settings.map(s => s.key)).toEqual(['dual_listing']);
  });

  test('command match is case-insensitive', () => {
    const dir = stageManifest();
    expect(readDoorSettingsView(dir, 'b')!.manifest.settings).toHaveLength(1);
  });

  test('a PUT for the wrong door refuses the foreign key by name', () => {
    const dir = stageManifest();
    expect(() => writeDoorSettings(dir, { dual_listing: 'NO' }, undefined, 'J')).toThrow(
      UnknownDoorSettingError,
    );
    expect(() => writeDoorSettings(dir, { dual_listing: 'NO' }, undefined, 'B')).not.toThrow();
  });

  test('the shipped emp_tools manifest scopes cleanly - every setting in exactly one command', () => {
    /*
     * THE PARTITION, NOT THE COUNTS.
     *
     * This asserted 41 for B and 8 for J, and went red the moment emp_tools
     * gained `conf_9_mask` - a correct change (d9f0ee128) that had to be
     * argued with a test. Worse, the pair of numbers never said the thing
     * that matters: 41 and 8 are consistent with a setting being in BOTH
     * scopes, or in neither, as long as the totals happen to land.
     *
     * Covering and disjoint is the property, it is stronger than the numbers
     * were, and it survives the next setting somebody adds.
     */
    const all = readDoorSettingsView(repoEmp)!;
    const b = readDoorSettingsView(repoEmp, 'B')!;
    const j = readDoorSettingsView(repoEmp, 'J')!;

    const keys = (view: typeof all) => view.manifest.settings.map(s => s.key).sort();
    const bKeys = keys(b);
    const jKeys = keys(j);

    // Neither scope is empty - an empty one would satisfy every rule below.
    expect(bKeys.length).toBeGreaterThan(0);
    expect(jKeys.length).toBeGreaterThan(0);
    // Disjoint: nothing is offered under both commands.
    expect(bKeys.filter(k => jKeys.includes(k))).toEqual([]);
    // Covering: between them they are the whole manifest.
    expect([...bKeys, ...jKeys].sort()).toEqual(keys(all));
    // And the split is the one the door means: J owns the join_ settings.
    expect(b.manifest.settings.every(s => !s.key.startsWith('join_'))).toBe(true);
    expect(j.manifest.settings.every(s => s.key.startsWith('join_'))).toBe(true);
    expect(b.values.dual_listing).toBe('YES');
  });

  /**
   * Art scopes the same way, and for the same reason: emp_tools holds two
   * logos in two files - Bulls.CFG's title and joincnf.cfg's conference
   * banner - and a sysop editing the bulletins has no business being offered
   * the other door's banner.
   */
  test('each door is offered its OWN logo and not the other one', () => {
    const b = readDoorSettingsView(repoEmp, 'B')!;
    const j = readDoorSettingsView(repoEmp, 'J')!;

    expect(b.manifest.artSections).toHaveLength(1);
    expect(b.manifest.artSections![0].file).toBe('Bulls.CFG');
    expect(j.manifest.artSections).toHaveLength(1);
    expect(j.manifest.artSections![0].file).toBe('joincnf.cfg');

    // Asked as nobody in particular, the manifest still holds both.
    const all = readDoorSettingsView(repoEmp)!;
    expect(all.manifest.artSections).toHaveLength(2);
  });

  test('untagged art shows for every command, like an untagged setting', () => {
    // `stageManifest` spreads its argument into the SETTING, so the manifest
    // is written out here rather than through it.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-art-'));
    fs.writeFileSync(
      path.join(dir, 'door.settings.json'),
      JSON.stringify({
        command: 'B',
        cfgFile: 'Bulls.CFG',
        cfgFormat: 'empire',
        artSections: [
          { file: 'Bulls.CFG', section: 'title', label: 'Shared', maxLines: 20, maxLineLength: 200 },
        ],
        settings: [
          { key: 'dual_listing', label: 'Dual listing', type: 'choice',
            choices: [{ value: 'YES', label: 'Yes' }, { value: 'NO', label: 'No' }],
            default: 'YES', cfgKey: 'DUAL_LISTING' },
        ],
      }),
    );
    fs.copyFileSync(path.join(repoEmp, 'Bulls.CFG'), path.join(dir, 'Bulls.CFG'));

    expect(readDoorSettingsView(dir, 'B')!.manifest.artSections).toHaveLength(1);
    expect(readDoorSettingsView(dir, 'J')!.manifest.artSections).toHaveLength(1);
  });
});
