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
import { parseEmpireFile, getMaskRows } from '../../src/doors/text-cfg/empire';

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
      /*
       * NOT a count. This said `toBe(49)` and went red the moment emp_tools
       * gained `conf_9_mask` (d9f0ee128, "a conference's mask edits that
       * conference's row") - a correct change that had to be argued with a
       * test. A number here only ever asks "has anyone edited this file", and
       * the answer is yes, often; what the suite is for is whether the
       * manifest still READS.
       *
       * A floor keeps the case that mattered: a manifest that parsed to
       * nothing used to pass every assertion below it, because `[].some(...)`
       * is false and `[].every(...)` is true.
       */
      expect(view.manifest.settings.length).toBeGreaterThan(40);
      expect(view.values.dual_listing).toBe('YES');
      expect(view.values.cursor_keys).toBe('YES');
      /*
       * Each conf_N_mask reads mask row N of the file. The expected rows come
       * from parsing the staged Bulls.CFG, not from typed-in text: the sysop
       * edits the masks on the live board, so the text is theirs to change;
       * what this pins is that the setting for conference N is row N.
       */
      const fileMasks = getMaskRows(parseEmpireFile(fs.readFileSync(path.join(dir, 'Bulls.CFG'))));
      expect(fileMasks.length).toBeGreaterThan(0);
      expect(view.values.conf_1_mask).toBe(fileMasks[0]);
      expect(view.values.conf_10_mask).toBeDefined();
      expect(view.values.join_dual_listing).toBe('NO');
      expect(view.values.join_nrconflines).toBe(11);
      // Bulletin titles live on the Bulls Menu page, not here.
      expect(view.manifest.settings.some((s) => s.key.startsWith('bull_'))).toBe(false);
      /*
       * THE MASK ROWS ARE CONTIGUOUS - no conference is skipped.
       *
       * This used to assert `conf_9_mask` was ABSENT, with the note "No
       * Conference 9 in the file, none in the form". The file has forty mask
       * rows and always did; what was missing was the ninth SETTING, because
       * the manifest mapped a conference to the wrong cfg row and lost one in
       * the middle - conference 10 was offered while 9 was not, which is
       * exactly the shape of an off-by-one rather than of a deliberate
       * omission.
       *
       * d9f0ee128 ("a conference's mask edits that conference's row") fixed
       * the mapping and restored the ninth, and this assertion - written
       * around the bug - started failing for the right reason. Contiguity is
       * what the fix established and what a gap would break again; a named
       * conference is the thing that was only ever a symptom.
       */
      const masked = view.manifest.settings
        .map((s) => /^conf_(\d+)_mask$/.exec(s.key)?.[1])
        .filter((n): n is string => n !== undefined)
        .map(Number)
        .sort((a, b) => a - b);

      expect(masked.length).toBeGreaterThan(0);
      expect(masked).toEqual(Array.from({ length: masked.length }, (_, i) => i + 1));
      // The one the mapping bug dropped, named so the regression is legible.
      expect(masked).toContain(9);
      for (const n of masked) expect(view.values[`conf_${n}_mask`]).toBe(fileMasks[n - 1]);
      // Art rides to the Studio, not the form. Two of them now: emp_tools is
      // two doors in one directory, and each has a logo in its own file -
      // Bulls.CFG's title and joincnf.cfg's conference banner. Asked as one
      // door, only that door's art comes back (empire-art.test.ts).
      expect(view.manifest.artSections).toHaveLength(2);
      expect(view.manifest.artSections!.map((a) => a.file).sort())
        .toEqual(['Bulls.CFG', 'joincnf.cfg']);
      expect(view.manifest.artSections!.every((a) => a.section === 'title')).toBe(true);
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
