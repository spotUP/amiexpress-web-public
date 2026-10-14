/**
 * NOTIFY driven on a REAL blessed screen at the three geometries.
 *
 * A stub `bbs` answers getTerminalSize() and records every byte; a fake
 * notifications API records what the door asks of the board. Keys go in the
 * way the backend feeds a caller (the session's doorInputHandler).
 */
import assert from 'node:assert';
import { NOTIFY_EVENTS, DEFAULT_SETTINGS, doorEventDef } from '@amiexpress/bbs-door-sdk/formats/notify';
import type { DoorNotificationsApi, NotifyPrefs, NotifySettings } from '@amiexpress/bbs-door-sdk/formats/notify';
import { themeById } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { startNotify, type Notify } from '../app';

const strip = (t: string): string => t.replace(/\{\/?inverse\}/g, '');
const UP = '\x1b[A';
const DOWN = '\x1b[B';
const RIGHT = '\x1b[C';
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface Fake { api: DoorNotificationsApi; sets: Array<{ prefs: NotifyPrefs; settings: NotifySettings }>; follows: number[][] }

function fakeApi(over: { push?: boolean; doorEvents?: number } = {}): Fake {
  const sets: Fake['sets'] = [];
  const follows: number[][] = [];
  let prefs: NotifyPrefs = {};
  let settings: NotifySettings = { ...DEFAULT_SETTINGS };
  let followed: number[] = [];
  const api: DoorNotificationsApi = {
    catalogue: async () => ({
      events: [
        ...NOTIFY_EVENTS.filter((e) => !e.sysopOnly),
        // Declared by installed doors (door.settings.json notifications): any number, any label length.
        ...Array.from({ length: over.doorEvents ?? 0 }, (_, i) => doorEventDef(`door.d${i}.update`, `Door event number ${i} with a long label that must be clipped`, 'What it is about')!),
      ].map((e) => ({ ...e, channels: [...e.channels] })),
      deliverable: { email: true, push: over.push === true, board: true },
      conferences: [{ id: 1, name: 'General' }, { id: 3, name: 'Amiga Files' }],
      boardZone: 'Europe/Stockholm',
    }),
    get: async () => ({ prefs, settings, follows: followed, email: { address: 'a@b.c', verified: true } }),
    set: async (p, s) => {
      sets.push({ prefs: JSON.parse(JSON.stringify(p)), settings: s });
      prefs = p; settings = s;
      return { ok: true, state: { prefs, settings, follows: followed, email: { address: 'a@b.c', verified: true } } };
    },
    follow: async (ids) => { follows.push([...ids]); followed = [...ids]; return { ok: true, follows: followed }; },
    startEmailVerification: async () => ({ ok: true, email: 'a@b.c', expiresAt: 1 }),
    confirmEmail: async () => ({ ok: true, email: 'a@b.c' }),
    test: async () => ({ ok: true, detail: 'ok' }),
  };
  return { api, sets, follows };
}

interface Harness { door: Notify; writes: string[]; fake: Fake; key: (k: string) => Promise<void>; since: () => string; mark: () => void }

async function open(width: number, height: number, web = true, doorEvents = 0): Promise<Harness> {
  const writes: string[] = [];
  const fake = fakeApi({ doorEvents });
  const theme = themeById('uprough-neon');
  const bbs: any = {
    write: (d: string) => { writes.push(String(d)); }, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width, height }), enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    getTheme: () => theme, connectionType: web ? 'web' : 'telnet', unicodeCapable: true,
    isPetsciiMode: () => width === 40, notifications: () => fake.api, setUserEmail: async () => true,
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const session: any = { bbs, socket, params: [], bbsSession: { userId: 1, nodeId: 1, tempData: {}, socket } };
  const door = await startNotify(session);
  await sleep(50);
  let from = writes.length;
  return {
    door, writes, fake,
    key: async (k: string) => { session.bbsSession.doorInputHandler(k); await sleep(60); },
    mark: () => { from = writes.length; },
    since: () => writes.slice(from).join(''),
  };
}

const find = (door: Notify, text: string): string => strip(door.rows().find((r) => strip(r).includes(text)) ?? '');

export async function at80TheEventsRowsHaveFullWordCells(): Promise<void> {
  const h = await open(80, 25);
  try {
    assert.strictEqual(h.door.view(), 'events');
    assert.strictEqual(find(h.door, 'Reply to my message'), ' Reply to my message               Off         Unavailable Off         ');
    assert.match(find(h.door, 'Private mail'), /Off +Unavailable +Unavailable/);
    assert.match(find(h.door, 'Achievement unlocked'), /Off +Unavailable +Unavailable/);
  } finally { h.door.stop(); }
}

export async function spaceCyclesTheActiveCellAndSavesIt(): Promise<void> {
  const h = await open(80, 25);
  try {
    await h.key(DOWN); // Reply to my message
    await h.key(' ');
    assert.match(find(h.door, 'Reply to my message'), /Instant +Unavailable/);
    assert.deepStrictEqual(h.fake.sets.at(-1)!.prefs['msg.reply'], { email: 'instant', board: 'off' });
    await h.key(' ');
    assert.match(find(h.door, 'Reply to my message'), /Digest/);
    await h.key(RIGHT); await h.key(RIGHT); await h.key(' ');
    assert.deepStrictEqual(h.fake.sets.at(-1)!.prefs['msg.reply'], { email: 'digest', board: 'instant' });
    // a cell the event does not offer refuses, and nothing is saved
    await h.key(UP); // Private mail has no Board
    const saves = h.fake.sets.length;
    await h.key(' ');
    assert.strictEqual(h.fake.sets.length, saves);
    assert.ok(h.door.note().length > 0);
  } finally { h.door.stop(); }
}

export async function aCursorMoveAndACellChangeRepaintOnlyTheirRows(): Promise<void> {
  for (const [w, h2] of [[80, 25], [40, 25]] as const) {
    const h = await open(w, h2);
    try {
      await sleep(1100); // let the masthead settle where it animates
      h.mark(); await h.key(DOWN);
      const move = h.since().length;
      h.mark(); await h.key(' ');
      const change = h.since().length;
      console.log(`  [INFO] repaint ${w}x${h2}: cursor move ${move} bytes, cell change ${change} bytes`);
      assert.ok(move < 700, `${w}: a cursor move cost ${move} bytes`);
      assert.ok(change < 700, `${w}: a cell change cost ${change} bytes`);
    } finally { h.door.stop(); }
  }
}

export async function at40OneEventPerRowWithACompactSummary(): Promise<void> {
  const h = await open(40, 25);
  try {
    for (const r of h.door.rows()) assert.ok(strip(r).length <= 39, `row too wide: ${strip(r)}`);
    assert.match(find(h.door, 'Reply to my message'), /E:Off P:- B:Off$/);
    await h.key(DOWN); await h.key(' ');
    assert.match(find(h.door, 'Reply to my message'), /E:Inst P:- B:Off$/);
    await h.key('\r');
    assert.strictEqual(h.door.view(), 'detail');
    const detail = h.door.rows().map(strip);
    assert.strictEqual(detail.length, 3);
    assert.match(detail[0], /Email +Instant/);
    assert.match(detail[1], /Push +Unavailable/);
    for (const r of detail) assert.ok(r.length <= 39);
    await h.key('x');
    assert.strictEqual(h.door.view(), 'events');
  } finally { h.door.stop(); }
}

export async function at40NoEffectKeepsRunning(): Promise<void> {
  const quiet = await open(40, 25);
  try {
    await sleep(300); quiet.mark(); await sleep(1500);
    assert.strictEqual(quiet.since(), '', 'something moved by itself at 40 columns');
  } finally { quiet.door.stop(); }
  const wide = await open(80, 25);
  try {
    await sleep(300); wide.mark(); await sleep(1500);
    assert.ok(wide.since().length > 0, 'the masthead should animate at 80');
  } finally { wide.door.stop(); }
}

export async function at132TheColumnsGrowAndADescriptionAppears(): Promise<void> {
  const h = await open(132, 40);
  try {
    const row = find(h.door, 'Reply to my message');
    assert.ok(row.includes('Someone answers a message you posted'));
    assert.ok(row.length <= 131);
    assert.ok(row.length > 80);
  } finally { h.door.stop(); }
}

export async function aFileEventListsTheConferencesToFollow(): Promise<void> {
  const h = await open(80, 25);
  try {
    await h.key(DOWN); await h.key(DOWN); // New file in a followed conference
    await h.key('\r');
    const rows = h.door.rows().map(strip);
    assert.ok(rows.some((r) => r.includes('[ ] 3 Amiga Files')));
    await h.key(DOWN); await h.key(DOWN); await h.key(DOWN); await h.key(DOWN); await h.key(DOWN); // to Amiga Files
    await h.key(' ');
    assert.deepStrictEqual(h.fake.follows.at(-1), [3]);
    assert.ok(h.door.rows().map(strip).some((r) => r.includes('[x] 3 Amiga Files')));
  } finally { h.door.stop(); }
}

export async function theDeliveryViewTellsATelnetCallerPushNeedsTheWebTerminal(): Promise<void> {
  const h = await open(80, 25, false);
  try {
    await h.key('a');
    assert.strictEqual(h.door.view(), 'delivery');
    assert.ok(h.door.rows().map(strip).some((r) => r.includes('Push needs the web terminal')));
  } finally { h.door.stop(); }
}

export async function doorDeclaredEventsScrollIntoViewAndSaveAt80And40(): Promise<void> {
  for (const [w, h2] of [[80, 25], [40, 25]] as const) {
    const h = await open(w, h2, true, 14);
    try {
      const board = NOTIFY_EVENTS.filter((e) => !e.sysopOnly).length;
      assert.strictEqual(h.door.rows().length, board + 14);
      for (const r of h.door.rows()) assert.ok(strip(r).length <= w - 1, `${w}: row too wide: ${strip(r)}`);
      const mine = h.door.rows().map(strip).filter((r) => r.includes('Door event'));
      assert.strictEqual(mine.length, 14);
      assert.ok(mine.every((r) => r.includes('~')), `${w}: a long door label is clipped, not folded`);
      // walk to the last row, past the visible window, and choose a cell on it
      for (let i = 0; i < board + 13; i++) await h.key(DOWN);
      await h.key(' ');
      const saved = h.fake.sets.at(-1)!.prefs['door.d13.update'];
      assert.ok(saved && Object.values(saved).includes('instant'), `${w}: the last door event saved ${JSON.stringify(saved)}`);
    } finally { h.door.stop(); }
  }
}
