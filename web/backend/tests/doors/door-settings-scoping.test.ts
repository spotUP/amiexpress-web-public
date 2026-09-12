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

const repoEmp = path.resolve(__dirname, '..', '..', '..', '..', 'Doors', 'emp_tools');

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

  test('the shipped emp_tools manifest scopes cleanly: 41 for B, 8 for J', () => {
    const b = readDoorSettingsView(repoEmp, 'B')!;
    const j = readDoorSettingsView(repoEmp, 'J')!;
    expect(b.manifest.settings).toHaveLength(41);
    expect(j.manifest.settings).toHaveLength(8);
    expect(b.manifest.settings.every(s => !s.key.startsWith('join_'))).toBe(true);
    expect(j.manifest.settings.every(s => s.key.startsWith('join_'))).toBe(true);
    expect(b.values.dual_listing).toBe('YES');
  });
});
