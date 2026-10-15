/**
 * WEBTERM driven on a REAL blessed screen at the three geometries.
 *
 * A stub `bbs` answers getTerminalSize() and records every byte; the nine
 * board methods are stubbed and recorded. Keys go in the way the backend
 * feeds a caller (the session's doorInputHandler).
 */
import assert from 'node:assert';
import { themeById } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { startWebTerminal, type WebTerminal } from '../app';

const DOWN = '\x1b[B';
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const strip = (t: string): string => t.replace(/\{\/?[a-z-]+\}/g, '');

async function open(width: number, height: number, erase: 'refuse' | 'accept' | 'check-only' | 'deferred' = 'refuse', data = [{ label: 'Handle', value: 'Spot' }, { label: 'Group', value: 'Old Town' }]) {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  const writes: string[] = [];
  const calls: string[] = [];
  const touched: string[] = [];
  let palette = 'C128 (VDC)';
  const bbs: any = {
    write: (d: string) => { writes.push(String(d)); }, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width, height }), enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    getTheme: () => themeById('uprough-neon'), connectionType: 'web', unicodeCapable: true, isPetsciiMode: () => width === 40,
    webTerminalSettings: () => { touched.push('webTerminalSettings'); return { modemSpeed: 'MAX (No Throttle)', font: 'MicroKnight', fontFixedNotice: '', petsciiPalette: palette, petsciiCharset: 'STANDARD' }; },
    modemSpeedChoices: () => ['MAX (No Throttle)', '1200 bps', '2400 bps'],
    chooseModemSpeed: async (i: number) => { calls.push(`modem ${i}`); return true; },
    terminalFontChoices: () => [{ id: 'MicroKnight', label: 'MicroKnight' }, { id: 'mosoul', label: "mO'sOul" }],
    chooseTerminalFont: async (id: string) => { calls.push(`font ${id}`); return 'set'; },
    togglePetsciiPalette: async () => { calls.push('palette'); palette = 'C64 (VIC-II)'; return 'vic'; },
    togglePetsciiCharset: async () => { calls.push('charset'); return { charset: 'swedish', notice: 'PETSCII character set: SWEDISH' }; },
    myData: () => data,
    eraseMyAccount: async (a: any, o: any) => {
      calls.push(`erase ${a.confirm}/${a.username}/${o?.check ? 'check' : 'do'}`);
      if (erase === 'accept') return { ok: true };
      if (erase === 'check-only') return o?.check ? { ok: true } : { ok: false, reason: 'Session moved on.' };
      if (erase === 'deferred') { if (!o?.check) await gate; return { ok: true }; }
      return { ok: false, reason: 'Password incorrect. Deletion cancelled.' };
    },
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const session: any = { bbs, socket, params: [], bbsSession: { userId: 1, nodeId: 1, tempData: {}, socket } };
  const door: WebTerminal = await startWebTerminal(session);
  await sleep(50);
  let from = writes.length;
  return {
    door, calls, touched, bbs, release: () => release(),
    key: async (k: string) => { session.bbsSession.doorInputHandler(k); await sleep(60); },
    mark: () => { from = writes.length; },
    since: () => writes.slice(from).join(''),
  };
}

export async function eighty_columns_shows_the_six_rows_with_their_values(): Promise<void> {
  const h = await open(80, 24);
  const rows = h.door.rows().map(strip);
  assert.ok(rows.some(r => r.includes('Modem emulation speed') && r.includes('MAX (No Throttle)')));
  assert.ok(rows.some(r => r.includes('Delete my account')));
  h.door.stop(); await h.door.done;
}
export async function forty_columns_stacks_and_every_row_fits(): Promise<void> {
  const h = await open(40, 25);
  const rows = h.door.rows().map(strip);
  assert.ok(rows.every(r => r.length <= 39));
  const at = rows.findIndex(r => r.includes('PETSCII 80 colours'));
  assert.ok(rows[at + 1].includes('C128 (VDC)'));
  h.door.stop(); await h.door.done;
}
export async function a_toggle_goes_to_the_board_and_repaints_its_rows_only(): Promise<void> {
  const h = await open(80, 24);
  await h.key(DOWN); await h.key(DOWN);           // onto PETSCII 80 colours
  h.mark();
  await h.key('\r');
  assert.deepStrictEqual(h.calls, ['palette']);
  assert.ok(h.door.rows().map(strip).some(r => r.includes('C64 (VIC-II)')));
  const bytes = h.since().length;
  console.log(`[MEASURE] WEBTERM toggle at 80x24: ${bytes} bytes`);
  assert.ok(bytes < 400, `a toggle repainted ${bytes} bytes`);
  h.door.stop(); await h.door.done;
}
export async function a_toggle_at_forty_columns_repaints_under_four_hundred_bytes(): Promise<void> {
  const h = await open(40, 25);
  await h.key(DOWN); await h.key(DOWN);
  h.mark();
  await h.key('\r');
  assert.deepStrictEqual(h.calls, ['palette']);
  assert.ok(h.door.rows().map(strip).some(r => r.includes('C64 (VIC-II)')));
  const bytes = h.since().length;
  console.log(`[MEASURE] WEBTERM toggle at 40x25: ${bytes} bytes`);
  assert.ok(bytes < 400, `a toggle repainted ${bytes} bytes`);
  h.door.stop(); await h.door.done;
}
export async function delete_asks_three_times_checks_first_and_shows_the_boards_refusal(): Promise<void> {
  const h = await open(80, 24);
  for (let i = 0; i < 5; i++) await h.key(DOWN);  // onto Delete my account
  await h.key('\r');
  await h.key('YES ERASE\r');
  await h.key('wrong\r');
  await h.key('Spot\r');
  assert.deepStrictEqual(h.calls, ['erase YES ERASE/Spot/check']);
  assert.strictEqual(h.door.note(), 'Password incorrect. Deletion cancelled.');
  h.door.stop(); await h.door.done;
}
export async function a_password_is_never_painted_as_typed(): Promise<void> {
  const h = await open(80, 24);
  for (let i = 0; i < 5; i++) await h.key(DOWN);
  await h.key('\r');
  await h.key('YES ERASE\r');
  h.mark();
  await h.key('hunter2');
  assert.ok(!h.since().includes('hunter2'), 'the password reached the wire');
  h.door.stop(); await h.door.done;
}
export async function a_successful_erasure_ends_the_door_without_touching_the_user_again(): Promise<void> {
  const h = await open(80, 24, 'accept');
  for (let i = 0; i < 5; i++) await h.key(DOWN);
  await h.key('\r');
  await h.key('YES ERASE\r');
  await h.key('pw\r');
  const before = h.touched.length;
  await h.key('Spot\r');
  assert.deepStrictEqual(h.calls, ['erase YES ERASE/Spot/check', 'erase YES ERASE/Spot/do']);
  assert.ok(h.since().includes('\x1b[2J'), 'the door cleared its screen before the board spoke');
  await Promise.race([h.door.done, sleep(1000).then(() => { throw new Error('the door did not end after the erasure'); })]);
  assert.strictEqual(h.touched.length, before, 'the door read the user after the erasure');
}
export async function a_wide_screen_grows_and_adds_the_blurb(): Promise<void> {
  const h = await open(132, 40);
  assert.ok(h.door.rows().map(strip).some(r => r.includes('typeface')));
  h.door.stop(); await h.door.done;
}

const SIXTEEN = Array.from({ length: 16 }, (_, i) => ({ label: `Field number ${i + 1}`, value: `Value ${i + 1}` }));

export async function view_my_data_at_forty_columns_scrolls_to_the_last_field(): Promise<void> {
  const h = await open(40, 25, 'refuse', SIXTEEN);
  for (let i = 0; i < 4; i++) await h.key(DOWN);  // onto View my data
  await h.key('\r');
  assert.ok(!h.door.visible().map(strip).some(r => r.includes('Field number 16')), 'sixteen stacked fields fit on one 25-row screen');
  await h.key(DOWN);
  await h.key(DOWN);
  assert.ok(h.door.visible().map(strip).some(r => r.includes('Field number 16')), 'the last field is unreachable');
  await h.key('\x1b');                            // Esc returns to the list
  await sleep(400);                               // a lone Esc waits out the escape-sequence timeout
  assert.ok(h.door.visible().map(strip).some(r => r.includes('Modem emulation speed')));
  h.door.stop(); await h.door.done;
}
export async function a_refused_second_erasure_shows_its_reason_and_ends(): Promise<void> {
  const h = await open(80, 24, 'check-only');
  for (let i = 0; i < 5; i++) await h.key(DOWN);
  await h.key('\r'); await h.key('YES ERASE\r'); await h.key('pw\r'); await h.key('Spot\r');
  await Promise.race([h.door.done, sleep(1000).then(() => { throw new Error('the door did not end'); })]);
  assert.ok(h.since().includes('Session moved on.'), 'the refusal reason never reached the caller');
}
export async function done_stays_pending_while_the_board_erases(): Promise<void> {
  const h = await open(80, 24, 'deferred');
  for (let i = 0; i < 5; i++) await h.key(DOWN);
  await h.key('\r'); await h.key('YES ERASE\r'); await h.key('pw\r'); await h.key('Spot\r');
  let ended = false;
  void h.door.done.then(() => { ended = true; });
  await sleep(100);
  assert.strictEqual(ended, false, 'execute() resolved while the board was still erasing');
  h.release();
  await sleep(50);
  assert.strictEqual(ended, true);
}
