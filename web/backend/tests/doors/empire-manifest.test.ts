/**
 * The shipped Empire manifest (Doors/emp_tools/door.settings.json) binds.
 *
 * Scope note: bulletin titles and files are NOT in this manifest — the Bulls
 * Menu page (BullsInfoPage + bulls-config.service) already edits them with
 * add/remove rows, problem flags and a bulletin browser, which 40 flat
 * fields could never match. This manifest owns what nothing else edits:
 * the init toggles, the conference masks and joincnf.cfg. The Title logo
 * belongs to the ANSI Studio via artSections.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  readDoorSettingsView,
  writeDoorSettings,
} from '../../src/doors/door-settings.service';

const repoEmp = path.resolve(__dirname, '..', '..', '..', '..', 'Doors', 'emp_tools');

function stage(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'empire-manifest-'));
  for (const f of ['Bulls.CFG', 'joincnf.cfg', 'door.settings.json']) {
    fs.copyFileSync(path.join(repoEmp, f), path.join(dir, f));
  }
  return dir;
}

describe('emp_tools door.settings.json', () => {
  test('validates and reads the live-shaped files', () => {
    const dir = stage();
    try {
      const view = readDoorSettingsView(dir)!;
      expect(view).not.toBeNull();
      expect(view.manifest.command).toBe('B');
      expect(view.manifest.settings.length).toBe(49);
      expect(view.values.dual_listing).toBe('YES');
      expect(view.values.cursor_keys).toBe('YES');
      expect(view.values.conf_1_mask).toBe('XXXXXX--------------');
      expect(view.values.conf_10_mask).toBeDefined();
      expect(view.values.join_dual_listing).toBe('NO');
      expect(view.values.join_nrconflines).toBe(11);
      // Bulletin titles live on the Bulls Menu page, not here.
      expect(view.manifest.settings.some((s) => s.key.startsWith('bull_'))).toBe(false);
      // No Conference 9 in the file, none in the form.
      expect(view.manifest.settings.some((s) => s.key === 'conf_9_mask')).toBe(false);
      // Art rides to the Studio, not the form.
      expect(view.manifest.artSections).toHaveLength(1);
      expect(view.manifest.artSections![0].section).toBe('title');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('round-trip: write then read back, others preserved', () => {
    const dir = stage();
    try {
      const before = fs.readFileSync(path.join(dir, 'Bulls.CFG'), 'latin1');
      writeDoorSettings(dir, {
        dual_listing: 'NO',
        conf_10_mask: 'XXXXXXXXXXXXXXXXXXXX',
        join_nrconflines: 14,
      });
      const view = readDoorSettingsView(dir)!;
      expect(view.values.dual_listing).toBe('NO');
      expect(view.values.conf_10_mask).toBe('XXXXXXXXXXXXXXXXXXXX');
      expect(view.values.join_nrconflines).toBe(14);
      const after = fs.readFileSync(path.join(dir, 'Bulls.CFG'), 'latin1');
      const beforeLines = before.split('\n');
      const afterLines = after.split('\n');
      expect(afterLines.length).toBe(beforeLines.length);
      const changed = afterLines.filter((l, i) => l !== beforeLines[i]);
      // Toggle row + mask row, nothing else.
      expect(changed).toHaveLength(2);
      expect(fs.existsSync(path.join(dir, 'settings.json'))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
