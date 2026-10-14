/** The pure rows: widths, summaries, parsing. */
import assert from 'node:assert';
import { DEFAULT_SETTINGS, NOTIFY_EVENTS } from '@amiexpress/bbs-door-sdk/formats/notify';
import { doorEventDef } from '@amiexpress/bbs-door-sdk/formats/notify';
import {
  CHANNELS, MARKER_W, buildEventRows, cellWord, columnPlan, compactSummary, deliveryRows, eventRowText, headerText, parseDigest, parseQuiet, prefsFromRows,
} from '../layout';

const can = { email: true, push: false, board: true };
const strip = (t: string): string => t.replace(/\{\/?inverse\}/g, '');
const rows = buildEventRows(NOTIFY_EVENTS.filter((e) => !e.sysopOnly), { 'msg.reply': { email: 'instant', board: 'digest' } }, can);

export async function theEightyColumnRowIsPinned(): Promise<void> {
  const plan = columnPlan(80);
  assert.deepStrictEqual(plan, { compact: false, nameW: 34, cellW: 13, descW: 0 });
  assert.strictEqual(headerText(plan).trimEnd(), '   Event                              Email        Push         Board');
  const reply = rows.find((r) => r.id === 'msg.reply')!;
  assert.strictEqual(strip(eventRowText(reply, plan)).trimEnd(), ' Reply to my message                Instant      Unavailable  Digest');
  const mail = rows.find((r) => r.id === 'mail.private')!;
  assert.match(strip(eventRowText(mail, plan)), /Private mail +Off +Unavailable +Unavailable/);
}

export async function everyRowFitsItsWidth(): Promise<void> {
  for (const w of [40, 80, 100, 132]) {
    const plan = columnPlan(w);
    for (const r of rows) assert.ok(strip(eventRowText(r, plan, 'push')).length <= w - 1, `${w}: ${r.id}`);
    assert.ok(strip(headerText(plan)).length <= w - 1);
    for (const r of rows) assert.ok(MARKER_W + strip(eventRowText(r, plan, 'push')).length <= w - 1, `${w}: ${r.id} with the list marker`);
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
  assert.strictEqual(compactSummary(reply), ' E:Inst P:-    B:Dig  ');
  assert.strictEqual(compactSummary(reply, 'email'), '[E:Inst]P:-    B:Dig  ');
  assert.strictEqual(compactSummary(reply, 'board'), ' E:Inst P:-   [B:Dig ]');
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
  const web = { ...base, web: true, pushDeliverable: true };
  assert.ok(deliveryRows(web, 79).find((r) => r.id === 'push')!.text.includes('Off  (Enter turns it on here)'));
  assert.ok(deliveryRows({ ...web, pushBrowsers: 2 }, 79).find((r) => r.id === 'push')!.text.includes('On in 2 browsers'));
  assert.ok(deliveryRows({ ...web, pushDeliverable: false }, 79).find((r) => r.id === 'push')!.text.includes('Not available'));
  assert.ok(telnet.find((r) => r.id === 'zone')!.text.includes('Europe/Stockholm (board)'));
  for (const w of [39, 79]) for (const r of deliveryRows({ ...base, address: 'a-very-long-address@some-long-domain.example.com' }, w)) assert.ok(r.text.length <= w);
}

const WIDE = [80, 100, 132] as const;

export async function headerTitlesSitOverTheirValuesAt80And132(): Promise<void> {
  for (const w of WIDE) {
    const plan = columnPlan(w);
    // The list puts a marker in front of every item; the header is a separate box and must allow for it.
    const head = headerText(plan);
    for (const r of rows) {
      for (const active of [undefined, ...CHANNELS] as const) {
        const line = ' '.repeat(MARKER_W) + eventRowText(r, plan, active);
        for (const c of CHANNELS) {
          const title = c[0].toUpperCase() + c.slice(1);
          const at = head.indexOf(title);
          assert.ok(at > 0, `${w}: no ${title} title`);
          // The value starts where its title does, whether or not the cell is the active one ('[' sits one column left).
          const word = cellWord(r.cells[c]);
          const start = line.indexOf(word, at - 1);
          assert.strictEqual(start, at, `${w}: ${r.id} ${c}: value at ${start}, title at ${at}`);
        }
      }
    }
  }
}

export async function cellsNeverTouchAndFitTheLongestWord(): Promise<void> {
  for (const w of WIDE) {
    const plan = columnPlan(w);
    assert.ok(plan.cellW >= cellWord('na').length + 2, `${w}: a cell is narrower than Unavailable plus its gap`);
    for (const r of rows) {
      for (const active of [undefined, ...CHANNELS] as const) {
        const line = eventRowText(r, plan, active);
        for (let i = 0; i < CHANNELS.length - 1; i++) {
          const edge = 1 + plan.nameW + (i + 1) * plan.cellW; // first column of the next cell
          assert.ok(line[edge] === ' ' || line[edge] === '[', `${w}: ${r.id}: cells run together at ${edge}: ${line}`);
          assert.ok(line[edge - 1] === ' ' || line[edge - 1] === ']', `${w}: ${r.id}: cells run together before ${edge}: ${line}`);
        }
      }
    }
    // two plain rows: at least one blank between the longest word and the next word
    const mail = rows.find((x) => x.id === 'mail.private')!;
    assert.match(eventRowText(mail, plan), /Unavailable {2,}Unavailable/);
  }
}

export async function theSelectedRowIsOneBarNotCutByAColourTag(): Promise<void> {
  for (const w of WIDE) {
    const plan = columnPlan(w);
    for (const c of CHANNELS) {
      const line = eventRowText(rows[1], plan, c);
      assert.ok(!/\{[^}]*\}/.test(line), `${w}: the active ${c} cell carries a tag that cuts the row's highlight: ${line}`);
      assert.ok(line.includes(`[${cellWord(rows[1].cells[c])}]`), `${w}: the active ${c} cell is not marked`);
    }
  }
}

export async function theWorstCompactRowFitsFortyColumnsAndNeverWraps(): Promise<void> {
  const long = doorEventDef('door.x.update', 'A door event with a very long label indeed', 'About it')!;
  const events = [...NOTIFY_EVENTS, { ...long, channels: [...long.channels] }];
  const worst = buildEventRows(events, Object.fromEntries(events.map((e) => [e.id, { email: 'instant', push: 'instant', board: 'instant' }])), { email: true, push: true, board: true });
  for (const w of [36, 40, 60]) {
    const plan = columnPlan(w);
    for (const r of worst) for (const active of [undefined, ...CHANNELS] as const) {
      const line = eventRowText(r, plan, active);
      assert.ok(MARKER_W + line.length <= w - 1, `${w}: ${r.id} is ${MARKER_W + line.length} wide with the marker: ${line}`);
    }
  }
}

export async function theCompactSelectedRowCarriesNoTagThatCutsItsHighlight(): Promise<void> {
  const plan = columnPlan(40);
  for (const c of CHANNELS) assert.ok(!/\{[^}]*\}/.test(eventRowText(rows[1], plan, c)), `active ${c} carries a tag`);
}
