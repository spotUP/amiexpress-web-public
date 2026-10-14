/** The pure rows: widths, summaries, parsing. */
import assert from 'node:assert';
import { DEFAULT_SETTINGS, NOTIFY_EVENTS } from '@amiexpress/bbs-door-sdk/formats/notify';
import {
  buildEventRows, columnPlan, compactSummary, deliveryRows, eventRowText, headerText, parseDigest, parseQuiet, prefsFromRows,
} from '../layout';

const can = { email: true, push: false, board: true };
const strip = (t: string): string => t.replace(/\{\/?inverse\}/g, '');
const rows = buildEventRows(NOTIFY_EVENTS.filter((e) => !e.sysopOnly), { 'msg.reply': { email: 'instant', board: 'digest' } }, can);

export async function theEightyColumnRowIsPinned(): Promise<void> {
  const plan = columnPlan(80);
  assert.deepStrictEqual(plan, { compact: false, nameW: 34, cellW: 12, descW: 0 });
  assert.strictEqual(strip(headerText(plan)), ' Event                             Email       Push        Board       ');
  const reply = rows.find((r) => r.id === 'msg.reply')!;
  assert.strictEqual(strip(eventRowText(reply, plan)), ' Reply to my message               Instant     Unavailable Digest      ');
  const mail = rows.find((r) => r.id === 'mail.private')!;
  assert.match(strip(eventRowText(mail, plan)), /Private mail +Off +Unavailable +Unavailable/);
}

export async function everyRowFitsItsWidth(): Promise<void> {
  for (const w of [40, 80, 100, 132]) {
    const plan = columnPlan(w);
    for (const r of rows) assert.ok(strip(eventRowText(r, plan, 'push')).length <= w - 1, `${w}: ${r.id}`);
    assert.ok(strip(headerText(plan)).length <= w - 1);
  }
}

export async function theColumnsGrowFromTheWidth(): Promise<void> {
  assert.strictEqual(columnPlan(80).descW, 0);
  assert.strictEqual(columnPlan(40).compact, true);
  const wide = columnPlan(132);
  assert.ok(wide.cellW > columnPlan(80).cellW && wide.nameW > columnPlan(80).nameW && wide.descW >= 24);
  assert.ok(strip(eventRowText(rows[1], wide)).includes('Someone answers a message you posted'));
}

export async function theCompactSummaryReadsEPB(): Promise<void> {
  const reply = rows.find((r) => r.id === 'msg.reply')!;
  assert.strictEqual(compactSummary(reply), 'E:Inst P:- B:Dig');
  assert.strictEqual(strip(compactSummary(reply, 'email')), 'E:Inst P:- B:Dig');
}

export async function onlyChosenCellsAreKept(): Promise<void> {
  assert.deepStrictEqual(prefsFromRows(rows)['msg.reply'], { email: 'instant', board: 'digest' });
  assert.strictEqual(prefsFromRows(rows)['mail.private']?.board, undefined);
}

export async function quietAndDigestInputIsParsed(): Promise<void> {
  assert.deepStrictEqual(parseQuiet('22:00 to 07:00'), { ok: true, value: { quietFrom: '22:00', quietTo: '07:00' } });
  assert.deepStrictEqual(parseQuiet('22-7'), { ok: true, value: { quietFrom: '22:00', quietTo: '07:00' } });
  assert.deepStrictEqual(parseQuiet('none'), { ok: true, value: { quietFrom: null, quietTo: null } });
  assert.strictEqual(parseQuiet('25:00 to 07:00').ok, false);
  assert.deepStrictEqual(parseDigest('daily 8'), { ok: true, value: { digestKind: 'daily', digestHour: 8, digestWeekday: null } });
  assert.deepStrictEqual(parseDigest('weekly mon 18:00'), { ok: true, value: { digestKind: 'weekly', digestHour: 18, digestWeekday: 1 } });
  assert.strictEqual(parseDigest('weekly someday 8').ok, false);
  assert.strictEqual(parseDigest('daily 24').ok, false);
}

export async function theDeliveryViewSaysWhyPushIsOff(): Promise<void> {
  const base = { address: 'a@b.c', verified: true, emailDeliverable: true, pushDeliverable: false, web: false, settings: DEFAULT_SETTINGS, boardZone: 'Europe/Stockholm' };
  const telnet = deliveryRows(base, 79);
  assert.ok(telnet.find((r) => r.id === 'push')!.text.includes('Push needs the web terminal'));
  assert.ok(telnet.find((r) => r.id === 'email')!.text.includes('(verified)'));
  assert.ok(telnet.find((r) => r.id === 'zone')!.text.includes('Europe/Stockholm (board)'));
  for (const w of [39, 79]) for (const r of deliveryRows({ ...base, address: 'a-very-long-address@some-long-domain.example.com' }, w)) assert.ok(r.text.length <= w);
}
