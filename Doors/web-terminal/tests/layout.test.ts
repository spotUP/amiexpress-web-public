import assert from 'node:assert';
import type { WebTerminalState } from '@amiexpress/bbs-door-sdk/core/types';
import { ROWS, rowLines, valueOf, dataLines } from '../layout';

const state: WebTerminalState = { modemSpeed: '2400 bps', font: 'MicroKnight', fontFixedNotice: '', petsciiPalette: 'C128 (VDC)', petsciiCharset: 'STANDARD' };

export async function the_six_rows_are_the_internal_w_rows_17_to_22(): Promise<void> {
  assert.deepStrictEqual(ROWS.map(r => r.id), ['modem', 'font', 'palette', 'charset', 'data', 'erase']);
}
export async function eighty_columns_is_one_line_label_then_value(): Promise<void> {
  const [line] = rowLines('modem', state, 80);
  assert.ok(line.includes('Modem emulation speed') && line.includes('2400 bps'));
  assert.ok(line.length <= 79);
}
export async function forty_columns_puts_the_value_under_its_label(): Promise<void> {
  const lines = rowLines('palette', state, 40);
  assert.strictEqual(lines.length, 2);
  assert.ok(lines[0].includes('PETSCII 80 colours') && lines[1].includes('C128 (VDC)'));
  assert.ok(lines.every(l => l.length <= 39));
}
export async function a_wide_screen_adds_the_blurb(): Promise<void> {
  assert.ok(rowLines('font', state, 132)[0].includes('typeface'));
  assert.ok(!rowLines('font', state, 80)[0].includes('typeface'));
}
export async function the_data_view_stacks_at_forty(): Promise<void> {
  const lines = dataLines([{ label: 'Handle', value: 'Spot' }], 40);
  assert.deepStrictEqual(lines, [' Handle', '   Spot']);
  assert.strictEqual(valueOf('erase', state), '');
}
