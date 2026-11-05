/**
 * THE SHIPPED LAYOUT, RENDERING A REAL RECORD.
 *
 * Not a copy of the template pasted into a test - the actual
 * `Prompts/FILEVIEW.40` on disk, compiled by the loader the board uses, driving
 * the interpreter both render paths share. If someone edits that file, this
 * test moves with it, which is exactly the contract layout-as-data offers: the
 * repo pins its own default, and the sysop's edits are honoured.
 */
import * as fs from 'fs';
import * as path from 'path';

import { compileFileLayout } from '../../src/services/file-layout.service';
import {
  renderFileBlock,
  renderFileRow,
  type FileRecordFields,
} from '../../../../sdk/petscii/frame/file-record';

const SHIPPED = path.join(__dirname, '..', '..', '..', '..', 'board', 'Prompts', 'FILEVIEW.40');
const layout = compileFileLayout(fs.readFileSync(SHIPPED, 'utf8'));

const FILE: FileRecordFields = {
  num: 12,
  name: 'OTL-DOOR.LHA',
  sizeBytes: 40960,
  flag: 'P',
  isNew: true,
  date: '03-28-18',
  version: '2.1',
  desc: 'A door from the Outlaws',
  group: 'Outlaws',
};

const glass = (line: string) => line.replace(/~[^|]*\|/g, '');

describe('the shipped FILEVIEW.40, rendering a list row', () => {
  const row = glass(renderFileRow(FILE, layout.row));

  it('produces the columns the design specifies', () => {
    expect(row.indexOf('12')).toBe(0);
    expect(row.indexOf('40K')).toBe(5);
    expect(row[12]).toBe('P');
    expect(row[13]).toBe('*');
    expect(row.indexOf('OTL-DOOR.LHA')).toBe(14);
    expect(row.indexOf('03-28-18')).toBe(31);
  });

  it('fits a C64 screen', () => {
    expect(row.length).toBeLessThanOrEqual(40);
  });

  it('fits twenty-plus records on a screen, which is why a row is a row', () => {
    // 25 rows: header (2) + footer (1) leaves 22 for records, C*Base's own
    // pagination figure.
    const chrome = layout.header.length + layout.footer.length;
    expect(25 - chrome).toBeGreaterThanOrEqual(20);
  });
});

describe('the shipped FILEVIEW.40, rendering a single record', () => {
  it('leads with the group and the description, as the sysop asked', () => {
    const rows = renderFileBlock(FILE, layout.record).map(glass);
    expect(rows[0]).toBe('OUTLAWS');
    expect(rows[1]).toContain('A door from the Outlaws');
    expect(rows.every((r) => r.length <= 40)).toBe(true);
  });

  it('omits what it does not know instead of printing a blank row', () => {
    const rows = renderFileBlock({ ...FILE, group: null, desc: null }, layout.record).map(glass);
    expect(rows.every((r) => r.trim() !== '')).toBe(true);
  });
});

describe('the header the list is printed under', () => {
  it('names the columns and rules them off', () => {
    const header = layout.header.map(glass);
    expect(header[0]).toContain('Size');
    expect(header[0]).toContain('Filename');
    expect(header[0]).toContain('Date');
    // The rule is one PETSCII glyph repeated - $A3 on the wire.
    expect(header[1]).toMatch(/▔+/);
  });

  it('rules to the screen edge and no further', () => {
    for (const line of layout.header.map(glass)) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
  });
});
