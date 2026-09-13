/**
 * Saving a door setting must answer, even when the cfg is damaged.
 *
 * `ensureEmpireRow` grew a bulletin or mask section until the row the manifest
 * names exists. The append answers false when the file has no section to grow
 * - a `Bulls.CFG` that lost its `[BullNames_END]` marker - and `getBullRows`
 * answers `[]` for that same file, so the loop never grew and never ended.
 * Node runs one thread: a single PUT pinned a core and hung every caller,
 * socket and door on the board until it was restarted.
 *
 * Each test here fails by TIMING OUT if the loop comes back, so the timeouts
 * are deliberately short - a hang must be a red test, not a stuck run.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeDoorSettings } from '../../src/doors/door-settings.service';

const repoEmp = path.resolve(__dirname, '..', '..', '..', '..', 'Doors', 'emp_tools');

/** A manifest that writes bulletin row 6 and conference mask row 6. */
function stage(cfgBody: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'broken-bulls-'));
  fs.writeFileSync(
    path.join(dir, 'door.settings.json'),
    JSON.stringify({
      command: 'B',
      cfgFile: 'Bulls.CFG',
      cfgFormat: 'empire',
      settings: [
        {
          key: 'bull6_title',
          label: 'Bulletin 6 title',
          type: 'string',
          cfgRow: { section: 'bullnames_end', row: 5, field: 'title' },
        },
        {
          key: 'conf6_mask',
          label: 'Conference 6 access',
          type: 'string',
          cfgRow: { section: 'cnfaccess_end', row: 5, field: 'mask' },
        },
      ],
    })
  );
  fs.writeFileSync(path.join(dir, 'Bulls.CFG'), cfgBody, 'latin1');
  return dir;
}

/** The real file, minus one section marker. */
function realCfgWithout(marker: RegExp): string {
  const real = fs.readFileSync(path.join(repoEmp, 'Bulls.CFG'), 'latin1');
  const out = real
    .split('\n')
    .filter((line) => !marker.test(line))
    .join('\n');
  expect(out.length).toBeLessThan(real.length);
  return out;
}

describe('saving a setting into a damaged Bulls.CFG', () => {
  it('refuses the bulletin row instead of hanging the board', () => {
    const dir = stage(realCfgWithout(/^\s*\[?BullNames_END\]?/i));

    expect(() => writeDoorSettings(dir, { bull6_title: 'Notices' }, undefined, 'B'))
      .toThrow(/BullNames_END/i);
  }, 5000);

  it('refuses the conference mask instead of hanging the board', () => {
    const dir = stage(realCfgWithout(/^\s*\[?CnfAccess_END\]?/i));

    expect(() => writeDoorSettings(dir, { conf6_mask: 'X'.repeat(20) }, undefined, 'B'))
      .toThrow(/CnfAccess_END/i);
  }, 5000);

  it('still grows the list when the file is intact', () => {
    const dir = stage(fs.readFileSync(path.join(repoEmp, 'Bulls.CFG'), 'latin1'));

    expect(() => writeDoorSettings(dir, { bull6_title: 'Notices' }, undefined, 'B'))
      .not.toThrow();
    expect(fs.readFileSync(path.join(dir, 'Bulls.CFG'), 'latin1')).toContain('Notices');
  }, 5000);
});
