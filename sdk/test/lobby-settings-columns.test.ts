/**
 * Settings editor column alignment.
 *
 * Reported live with a screenshot (TetriNET Game Options, 2026-08-25): the
 * panel read
 *
 *   Starting Level: < 1 >
 *   Lines for Special: < 1 >
 *   Inventory Size: < 10 >
 *
 * Every value started at a different column because the label was printed
 * unpadded, so nothing lined up and the closing arrows wandered too.
 */

import { describe, it, expect } from '@jest/globals';
import { formatSettingsRows } from '../engines/ui/blessed/widgets/multiplayer-lobby';

/** What the terminal actually shows, with the colour tags removed. */
function visible(line: string): string {
  return line.replace(/\{[^}]*\}/g, '');
}

const TETRINET = [
  { label: 'Starting Level', value: '1', canEdit: true },
  { label: 'Lines for Special', value: '1', canEdit: true },
  { label: 'Specials Added', value: '1', canEdit: true },
  { label: 'Inventory Size', value: '10', canEdit: true },
  { label: 'Sudden Death (min)', value: '2', canEdit: true },
];

describe('settings editor columns', () => {
  it('starts every value in the same column', () => {
    const columns = formatSettingsRows(TETRINET).map(row => visible(row).indexOf('<'));

    expect(new Set(columns).size).toBe(1);
  });

  it('ends every row in the same column', () => {
    const widths = formatSettingsRows(TETRINET).map(row => visible(row).length);

    expect(new Set(widths).size).toBe(1);
  });

  it('keeps the label readable and the value intact', () => {
    const rows = formatSettingsRows(TETRINET).map(visible);

    expect(rows[0]).toMatch(/^Starting Level:\s+< 1\s*>$/);
    expect(rows[3]).toMatch(/^Inventory Size:\s+< 10\s*>$/);
  });

  it('drops the arrows for settings this player cannot edit', () => {
    const [row] = formatSettingsRows([{ label: 'Mode', value: 'Standard', canEdit: false }]);

    expect(visible(row)).not.toContain('<');
    expect(visible(row)).toContain('Standard');
  });

  it('handles an empty settings list', () => {
    expect(formatSettingsRows([])).toEqual([]);
  });
});
