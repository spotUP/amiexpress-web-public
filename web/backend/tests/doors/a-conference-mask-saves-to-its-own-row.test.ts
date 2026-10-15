/**
 * A conference's mask is written to that conference's row, and no other.
 *
 * "the masks dont save" (sysop, 2026-09-14), from the Bulls Menu matrix.
 *
 * They did save - to the wrong row. `Bulls.CFG` had 39 mask rows where the
 * board has 40 conferences (no row for conference 9), and the manifest was
 * written against that file: 39 settings for conferences 1-8 and 10-40, each
 * one from 10 up bound to the row BELOW the conference it names. Ticking
 * conference 12 wrote row 11, and the reload read 12 back unchanged - which
 * is indistinguishable from not saving at all.
 *
 * The file is repaired (7b9705be0) and the binding is now the only one that
 * can be checked by inspection: the Nth conference is the Nth row.
 *
 * Driven through `writeDoorSettings` against the board's REAL manifest and a
 * copy of its REAL Bulls.CFG, because the fault was the agreement between
 * those two files and a fixture of my own would have agreed with itself.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readDoorSettingsView, writeDoorSettings } from '../../src/doors/door-settings.service';

const EMP = path.resolve(__dirname, '..', '..', '..', '..', 'Doors', 'emp_tools');

/** The board's own manifest and cfg, staged where a write cannot reach them. */
function stageTheBoard(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mask-row-'));
  fs.copyFileSync(path.join(EMP, 'door.settings.json'), path.join(dir, 'door.settings.json'));
  fs.copyFileSync(path.join(EMP, 'Bulls.CFG'), path.join(dir, 'Bulls.CFG'));
  return dir;
}

/** The mask rows of a Bulls.CFG, in the order the door reads them. */
function maskRows(dir: string): string[] {
  return fs.readFileSync(path.join(dir, 'Bulls.CFG'), 'latin1').split(/\r?\n/)
    .map(line => /^([X-]{20})\s+; Conference \d+\s*$/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => m[1]);
}

describe('the Bulls conference matrix', () => {
  it('offers a mask for every conference the board has', () => {
    const dir = stageTheBoard();
    const view = readDoorSettingsView(dir, 'B');

    const keys = (view?.manifest.settings ?? [])
      .filter(s => s.cfgRow?.field === 'mask')
      .map(s => s.key);

    expect(keys).toHaveLength(40);
    // Conference 9 is the one that was missing, and its absence is what made
    // every conference above it edit its neighbour.
    expect(keys).toContain('conf_9_mask');
  });

  it.each([1, 9, 12, 40])('writes conference %i to its own row', (conf) => {
    const dir = stageTheBoard();
    const before = maskRows(dir);
    const wanted = '-'.repeat(19) + 'X';

    writeDoorSettings(dir, { [`conf_${conf}_mask`]: wanted }, undefined, 'B');

    const after = maskRows(dir);
    expect(after).toHaveLength(40);
    expect(after[conf - 1]).toBe(wanted);
    // ...and nothing else moved.
    for (let i = 0; i < after.length; i += 1) {
      if (i === conf - 1) continue;
      expect(`row ${i + 1}: ${after[i]}`).toBe(`row ${i + 1}: ${before[i]}`);
    }
  });

  it('reads back what it just wrote, which is what the matrix does', () => {
    // The sysop's actual complaint: tick, save, reload, and the tick is gone.
    const dir = stageTheBoard();
    const wanted = 'X'.repeat(20);

    writeDoorSettings(dir, { conf_12_mask: wanted }, undefined, 'B');
    const view = readDoorSettingsView(dir, 'B');

    expect(view?.values.conf_12_mask).toBe(wanted);
  });
});
