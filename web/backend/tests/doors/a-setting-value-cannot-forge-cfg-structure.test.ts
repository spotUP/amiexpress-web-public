/**
 * A setting is one value, not new lines in the file.
 *
 * Every one of these cfg formats is line-oriented: a newline inside a value
 * does not escape, it ends the line and whatever follows becomes a new record.
 * The Key=value writer had stripped newlines since it was written; the Empire
 * writer beside it returned `String(value)` raw, so a bulletin title could
 * carry `\n[Init_END]\nDUAL_LISTING YES` and forge a section marker and a
 * setting inside `Bulls.CFG`. One rule now, asked by both writers.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeDoorSettings, oneCfgLine } from '../../src/doors/door-settings.service';

const repoEmp = path.resolve(__dirname, '..', '..', '..', '..', 'Doors', 'emp_tools');

function stageEmpire(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-cfg-'));
  fs.writeFileSync(
    path.join(dir, 'door.settings.json'),
    JSON.stringify({
      command: 'B',
      cfgFile: 'Bulls.CFG',
      cfgFormat: 'empire',
      settings: [
        {
          key: 'bull1_title',
          label: 'Bulletin 1 title',
          type: 'string',
          cfgRow: { section: 'bullnames_end', row: 0, field: 'title' },
        },
      ],
    })
  );
  fs.copyFileSync(path.join(repoEmp, 'Bulls.CFG'), path.join(dir, 'Bulls.CFG'));
  return dir;
}

describe('a value carrying newlines', () => {
  it('writes one line, and forges no section marker', () => {
    const dir = stageEmpire();
    // A marker only means anything at the start of a line, which is exactly
    // what a newline in a value would buy: count the structural ones.
    const markersAtLineStart = (text: string) =>
      text.split('\n').filter((l) => /^\s*\[\w+_END\]/i.test(l)).length;
    const before = fs.readFileSync(path.join(dir, 'Bulls.CFG'), 'latin1');

    writeDoorSettings(
      dir,
      { bull1_title: 'PWN\n[Init_END]\nDUAL_LISTING       YES' },
      undefined,
      'B'
    );

    const after = fs.readFileSync(path.join(dir, 'Bulls.CFG'), 'latin1');
    expect(markersAtLineStart(after)).toBe(markersAtLineStart(before));
    expect(after.split('\n').filter((l) => /^DUAL_LISTING\s+YES/.test(l))).toHaveLength(1);
    // It landed as one row, the forged text inert inside the title.
    expect(after).toContain('PWN [Init_END] DUAL_LISTING');
  });

  it('says a semicolon cannot be stored, instead of losing it silently', () => {
    // `;` starts a comment in these files, and in a bull row it separates the
    // title from its filename. Saving "a; ATTACK" used to read back as "a" -
    // the sysop's text was gone between the save and the next form load.
    const dir = stageEmpire();

    expect(() => writeDoorSettings(dir, { bull1_title: 'Raid; ATTACK' }, undefined, 'B'))
      .toThrow(/semicolon/i);
  });

  it('will not take a manifest whose cfgFile is a directory step', () => {
    // `.` and `..` both matched the bare-filename rule, and a path joined
    // with `..` leaves the door's own directory.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotted-cfg-'));
    fs.writeFileSync(
      path.join(dir, 'door.settings.json'),
      JSON.stringify({ command: 'B', cfgFile: '..', settings: [] })
    );

    expect(() => writeDoorSettings(dir, {}, undefined, 'B')).toThrow();
  });

  it('is the same rule for both writers', () => {
    expect(oneCfgLine('a\nb')).toBe('a b');
    expect(oneCfgLine('a\r\nb')).toBe('a b');
    expect(oneCfgLine('a\n\n\nb')).toBe('a b');
    expect(oneCfgLine(42)).toBe('42');
  });
});
