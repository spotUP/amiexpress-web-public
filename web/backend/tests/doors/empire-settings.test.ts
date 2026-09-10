/**
 * Empire file-backed settings (Bulls.CFG, joincnf.cfg).
 *
 * The CFG is the store: reads parse the files (the live file's customized
 * titles show, not manifest defaults), writes serialize in place with
 * unmapped bytes preserved, settings.json is never written. Unknown keys
 * are refused, bad masks rejected by pattern, missing files error the way
 * the door itself does.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  readDoorSettingsView,
  writeDoorSettings,
  UnknownDoorSettingError,
  renderDoorCfg,
} from '../../src/doors/door-settings.service';

const repoEmp = path.resolve(__dirname, '..', '..', '..', '..', 'Doors', 'emp_tools');

function stage(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'empire-settings-'));
  for (const f of ['Bulls.CFG', 'joincnf.cfg']) {
    fs.copyFileSync(path.join(repoEmp, f), path.join(dir, f));
  }
  fs.writeFileSync(
    path.join(dir, 'door.settings.json'),
    JSON.stringify({
      command: 'B',
      cfgFile: 'Bulls.CFG',
      cfgFormat: 'empire',
      settings: [
        { key: 'dual_listing', label: 'Dual listing', type: 'choice', group: 'Listing',
          choices: [{ value: 'YES', label: 'Yes' }, { value: 'NO', label: 'No' }],
          default: 'YES', cfgKey: 'DUAL_LISTING', help: 'Use 2 listings' },
        { key: 'bull_1_title', label: 'Bulletin 1 title', type: 'string', group: 'Bulletins',
          default: '', cfgRow: { section: 'bullnames', row: 0, field: 'title' } },
        { key: 'bull_1_file', label: 'Bulletin 1 file', type: 'string', group: 'Bulletins',
          default: 'bull1.txt', cfgRow: { section: 'bullnames', row: 0, field: 'file' } },
        { key: 'conf_1_mask', label: 'Conference 1 mask', type: 'string', group: 'Access',
          pattern: '^[X-]{20}$', default: '--------------------',
          cfgRow: { section: 'masks', row: 0, field: 'mask' } },
        { key: 'join_lines', label: 'Conference lines', type: 'number', group: 'Join',
          min: 4, default: 11, cfgFile: 'joincnf.cfg', cfgKey: 'NRCONFLINES' },
      ],
    })
  );
  return dir;
}

describe('Empire file-backed door settings', () => {
  test('read shows the file content, not the defaults', () => {
    const dir = stage();
    try {
      const view = readDoorSettingsView(dir)!;
      expect(view).not.toBeNull();
      expect(view.values.dual_listing).toBe('YES');
      expect(view.values.bull_1_title).toBe('Top Uploaders');
      expect(view.values.bull_1_file).toBe('bull1.txt');
      expect(view.values.conf_1_mask).toBe('XXXXXX--------------');
      expect(view.values.join_lines).toBe(11);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('write flips a toggle and edits rows, preserving everything else', () => {
    const dir = stage();
    try {
      const before = fs.readFileSync(path.join(dir, 'Bulls.CFG'), 'latin1');
      const out = writeDoorSettings(dir, {
        dual_listing: 'NO',
        bull_1_title: 'New Uploads',
        conf_1_mask: 'XXXXXXXXXXXXXXXXXXXX',
        join_lines: 15,
      });
      expect(out.dual_listing).toBe('NO');
      const after = fs.readFileSync(path.join(dir, 'Bulls.CFG'), 'latin1');
      expect(after).toContain('DUAL_LISTING       NO');
      expect(after).toContain('New Uploads');
      expect(after).toContain('XXXXXXXXXXXXXXXXXXXX');
      // Untouched rows, comments, delimiters, art survive.
      expect(after).toContain('Top Downloaders');
      expect(after).toContain('; Use 2 Listings [YES/NO]');
      expect(after).toContain('[BullNames_END]');
      expect(after).toContain('; Conference 2');
      // settings.json is never written for file-backed doors.
      expect(fs.existsSync(path.join(dir, 'settings.json'))).toBe(false);
      // joincnf landed too.
      expect(fs.readFileSync(path.join(dir, 'joincnf.cfg'), 'latin1')).toContain('NRCONFLINES        15');
      expect(before.length).toBeGreaterThan(1000);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('bad mask, bad choice and unknown keys are refused with names', () => {
    const dir = stage();
    try {
      expect(() => writeDoorSettings(dir, { conf_1_mask: 'nope' })).toThrow(/Conference 1 mask/);
      expect(() => writeDoorSettings(dir, { dual_listing: 'MAYBE' })).toThrow(/Dual listing/);
      expect(() => writeDoorSettings(dir, { nosuchkey: 'x' } as any)).toThrow(UnknownDoorSettingError);
      // Failed writes leave the file alone.
      expect(fs.readFileSync(path.join(dir, 'Bulls.CFG'), 'latin1')).toContain('DUAL_LISTING       YES');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('missing CFG errors the way the door does', () => {    const dir = stage();
    try {
      fs.unlinkSync(path.join(dir, 'Bulls.CFG'));
      expect(() => readDoorSettingsView(dir)).toThrow(/Bulls\.CFG not found/);
      expect(() => writeDoorSettings(dir, { dual_listing: 'NO' })).toThrow(/Bulls\.CFG not found/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('manifest validation: row-less row bindings and bad patterns rejected', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'empire-manifest-'));
    try {
      const badRow = {
        command: 'B', cfgFile: 'Bulls.CFG', cfgFormat: 'empire',
        settings: [{ key: 'x', label: 'X', type: 'string', cfgRow: { section: 'bullnames', field: 'title' } }],
      };
      fs.writeFileSync(path.join(dir, 'door.settings.json'), JSON.stringify(badRow));
      expect(() => readDoorSettingsView(dir)).toThrow(/row number/);
      const badPattern = {
        command: 'B', cfgFile: 'Bulls.CFG', cfgFormat: 'empire',
        settings: [{ key: 'x', label: 'X', type: 'string', pattern: '([unclosed' }],
      };
      fs.writeFileSync(path.join(dir, 'door.settings.json'), JSON.stringify(badPattern));
      expect(() => readDoorSettingsView(dir)).toThrow(/regular expression/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('startup Key=value render leaves empire files alone', () => {
    // renderAllDoorCfgs runs on every boot for every manifest with a cfgFile.
    // Without the empire guard it would flatten Bulls.CFG's sections,
    // comments and art into Key=value lines. (renderAllDoorCfgs delegates
    // to renderDoorCfg, so pinning the guard here pins the boot path.)
    const dir = stage();
    try {
      const before = fs.readFileSync(path.join(dir, 'Bulls.CFG'), 'latin1');
      expect(renderDoorCfg(dir)).toBeNull();
      expect(fs.readFileSync(path.join(dir, 'Bulls.CFG'), 'latin1')).toBe(before);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
