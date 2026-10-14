/**
 * NOTIFY's screens as rows of text, pure.
 *
 * Nothing here knows about blessed, a theme or a socket: a view is built from
 * the caller's state and a screen width into plain strings, so the three
 * screens are proven without a terminal (door-three-screens skill).
 *
 *   80       one row per event: name, then Email / Push / Board cells in full
 *            words (Instant, Digest, Off, Unavailable)
 *   wider    the columns grow with the width and a description column appears
 *            when it fits
 *   40       one event per row with a compact summary `E:Inst P:Off B:Dig`;
 *            the three channels are one per row in the detail view
 *
 * The widths come from `columnPlan(width)` and nothing else.
 */
import { modeWord } from '@amiexpress/bbs-door-sdk/formats/notify';
import type {
  NotifyCatalogue, NotifyChannel, NotifyEventDef, NotifyMode, NotifyPrefs, NotifySettings,
} from '@amiexpress/bbs-door-sdk/formats/notify';

export const CHANNELS: readonly NotifyChannel[] = ['email', 'push', 'board'];
export const CHANNEL_WORD: Record<NotifyChannel, string> = { email: 'Email', push: 'Push', board: 'Board' };
const CHANNEL_LETTER: Record<NotifyChannel, string> = { email: 'E', push: 'P', board: 'B' };

/** A cell is a mode the caller chose, or 'na': the event does not offer it or the board cannot deliver it now. */
export type Cell = NotifyMode | 'na';

export interface EventRow {
  id: string;
  label: string;
  blurb: string;
  followsConference: boolean;
  cells: Record<NotifyChannel, Cell>;
  /** Why a channel is 'na' for this event, in words. */
  why: Partial<Record<NotifyChannel, string>>;
}

const BLURB: Record<string, string> = {
  'mail.private': 'Tells you who wrote; never the message',
  'msg.reply': 'Someone answers a message you posted',
  'file.new': 'A file goes live where you follow',
  'page.sysop': 'A caller pages the sysop',
  'mag.story': 'New stories in the magazine',
  'ach.unlock': 'You unlock an achievement',
};

export const blurbOf = (id: string): string => BLURB[id] ?? '';

/** Clip to a width, never fold: a folded row eats the row under it. */
export function clip(text: string, width: number): string {
  return text.length > width ? text.slice(0, Math.max(0, width - 1)) + '~' : text;
}

export function buildEventRows(events: readonly NotifyEventDef[], prefs: NotifyPrefs, can: NotifyCatalogue['deliverable']): EventRow[] {
  return events.map((e) => {
    const cells = {} as Record<NotifyChannel, Cell>;
    const why: Partial<Record<NotifyChannel, string>> = {};
    for (const c of CHANNELS) {
      if (!e.channels.includes(c)) { cells[c] = 'na'; why[c] = `${e.label} is not sent by ${CHANNEL_WORD[c].toLowerCase()}.`; continue; }
      if (!can[c]) { cells[c] = 'na'; why[c] = `${CHANNEL_WORD[c]} is not available on this board yet.`; continue; }
      cells[c] = prefs[e.id]?.[c] ?? 'off';
    }
    return { id: e.id, label: e.label, blurb: e.description ?? blurbOf(e.id), followsConference: e.followsConference === true, cells, why };
  });
}

/** The prefs that follow from the rows: only delivering and explicit cells are kept. */
export function prefsFromRows(rows: readonly EventRow[]): NotifyPrefs {
  const out: NotifyPrefs = {};
  for (const r of rows) {
    for (const c of CHANNELS) {
      const cell = r.cells[c];
      if (cell !== 'na') (out[r.id] ??= {})[c] = cell;
    }
  }
  return out;
}

export const cellWord = (cell: Cell): string => (cell === 'na' ? 'Unavailable' : modeWord(cell));

const SHORT: Record<NotifyMode, string> = { instant: 'Inst', digest: 'Dig', off: 'Off' };

/** `E:Inst P:Off B:Dig`; a channel that cannot be used shows `-`. */
export function compactSummary(row: EventRow, active?: NotifyChannel): string {
  return CHANNELS.map((c) => {
    const tok = `${CHANNEL_LETTER[c]}:${row.cells[c] === 'na' ? '-' : SHORT[row.cells[c] as NotifyMode]}`;
    return c === active ? `{inverse}${tok}{/inverse}` : tok;
  }).join(' ');
}

// ---------------------------------------------------------------- geometry

/** The list draws a two character selection marker (`>>`, `> `, blank) in front of every item. */
export const MARKER_W = 2;

/** The longest cell word; every cell is at least this plus its two marker slots. */
const WIDEST_WORD = cellWord('na').length;

export interface ColumnPlan {
  compact: boolean;
  nameW: number;
  /** One cell: a slot, the word, a slot. The slots hold the `[` `]` of the active cell. */
  cellW: number;
  /** 0 = no description column. */
  descW: number;
}

/** Every width the Events view uses, from the screen width alone. */
export function columnPlan(width: number): ColumnPlan {
  if (width < 80) return { compact: true, nameW: Math.max(8, width - 1 - 1 - 18 - 1), cellW: 0, descW: 0 };
  const grow = width >= 100;
  const cellW = WIDEST_WORD + (grow ? 4 : 2);
  const nameW = grow ? 36 : 34;
  const used = MARKER_W + 1 + nameW + 3 * cellW;
  const spare = width - used - 3;
  return { compact: false, nameW, cellW, descW: spare >= 24 ? Math.min(spare, 60) : 0 };
}

const OPEN = '{inverse}';
const SHUT = '{/inverse}';

/**
 * One cell of a wide row, and its title in the header, from the same plan.
 * The word starts one character into the cell, after the slot; the active
 * cell shows `[Word]` in those slots. No colour tag: the selected row is one
 * bar, and a tag inside it cuts the bar in two.
 */
function cellText(word: string, plan: ColumnPlan, active: boolean): string {
  return (active ? `[${word}]` : ` ${word}`).padEnd(plan.cellW);
}

/** One Events row. `active` is the channel the cursor is on, drawn `[Word]`. */
export function eventRowText(row: EventRow, plan: ColumnPlan, active?: NotifyChannel): string {
  if (plan.compact) return ` ${clip(row.label, plan.nameW).padEnd(plan.nameW)} ${compactSummary(row, active)}`;
  const cells = CHANNELS.map((c) => cellText(cellWord(row.cells[c]), plan, c === active)).join('');
  const desc = plan.descW > 0 ? ` ${clip(row.blurb, plan.descW)}` : '';
  return ` ${clip(row.label, plan.nameW).padEnd(plan.nameW)}${cells}${desc}`;
}

/** The column heads, over the words of the rows: indented by the list's marker; empty at 40, where each row says what its tokens mean. */
export function headerText(plan: ColumnPlan): string {
  if (plan.compact) return '';
  const heads = CHANNELS.map((c) => cellText(CHANNEL_WORD[c], plan, false)).join('');
  return `${' '.repeat(MARKER_W)} ${'Event'.padEnd(plan.nameW)}${heads}${plan.descW > 0 ? ' About' : ''}`;
}

// ---------------------------------------------------------------- detail

/** The channel rows of one event's detail view. */
export function detailRows(row: EventRow, width: number, active?: NotifyChannel): string[] {
  return CHANNELS.map((c) => {
    const cell = ` ${CHANNEL_WORD[c].padEnd(7)}${cellWord(row.cells[c])}`;
    return clip(c === active ? `${OPEN}${cell}${SHUT}` : cell, width + (c === active ? OPEN.length + SHUT.length : 0));
  });
}

export function followRows(conferences: readonly { id: number; name: string }[], follows: readonly number[], width: number): string[] {
  return conferences.map((c) => clip(` [${follows.includes(c.id) ? 'x' : ' '}] ${c.id} ${c.name}`, width));
}

// ---------------------------------------------------------------- delivery

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const hh = (h: number): string => `${String(h).padStart(2, '0')}:00`;

export const quietWords = (s: NotifySettings): string => (s.quietFrom && s.quietTo ? `${s.quietFrom} to ${s.quietTo}` : 'None');
export const digestWords = (s: NotifySettings): string =>
  s.digestKind === 'weekly' && s.digestWeekday !== null ? `Weekly on ${DAYS[s.digestWeekday]} at ${hh(s.digestHour)}` : `Daily at ${hh(s.digestHour)}`;

export interface DeliveryFacts {
  address: string | null;
  verified: boolean;
  emailDeliverable: boolean;
  pushDeliverable: boolean;
  /** Browsers of this caller that receive push. */
  pushBrowsers?: number;
  /** The caller is on the web terminal (the only place push can be turned on). */
  web: boolean;
  settings: NotifySettings;
  boardZone: string;
}

export type DeliveryId = 'email' | 'push' | 'quiet' | 'zone' | 'digest' | 'pause' | 'test';

export function pushWords(f: Pick<DeliveryFacts, 'pushDeliverable' | 'web' | 'pushBrowsers'>): string {
  if (!f.web) return 'Push needs the web terminal';
  if (!f.pushDeliverable) return 'Not available on this board yet';
  const n = f.pushBrowsers ?? 0;
  return n > 0 ? `On in ${n} browser${n === 1 ? '' : 's'}  (Enter turns it off)` : 'Off  (Enter turns it on here)';
}

/** The Delivery view's rows. At 40 the label and the value stack on one row each, clipped. */
export function deliveryRows(f: DeliveryFacts, width: number): Array<{ id: DeliveryId; text: string }> {
  const email = !f.emailDeliverable ? 'Not set up on this board'
    : !f.address ? 'No address yet'
    : `${f.address}${f.verified ? '  (verified)' : '  (not verified)'}`;
  const lines: Array<[DeliveryId, string, string]> = [
    ['email', 'Email', email],
    ['push', 'Push', pushWords(f)],
    ['quiet', 'Quiet hours', quietWords(f.settings)],
    ['zone', 'Time zone', f.settings.timeZone ?? `${f.boardZone} (board)`],
    ['digest', 'Digest', digestWords(f.settings)],
    ['pause', 'Pause everything', f.settings.paused ? 'Yes' : 'No'],
    ['test', 'Send a test', 'Press Enter'],
  ];
  return lines.map(([id, name, value]) => ({ id, text: clip(` ${name.padEnd(width < 80 ? 6 : 17)} ${value}`, width) }));
}

// ---------------------------------------------------------------- input

export interface Parsed<T> { ok: true; value: T }
export interface Refused { ok: false; error: string }

const HM = /^(\d{1,2})(?::(\d{2}))?$/;

function hourOf(text: string): number | null {
  const m = HM.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 && (m[2] === undefined || m[2] === '00') ? h : null;
}

/** `22:00 to 07:00`, `22:00-07:00`, or blank/`none` to switch quiet hours off. */
export function parseQuiet(text: string): Parsed<Pick<NotifySettings, 'quietFrom' | 'quietTo'>> | Refused {
  const t = text.trim().toLowerCase();
  if (t === '' || t === 'none' || t === 'off') return { ok: true, value: { quietFrom: null, quietTo: null } };
  const parts = t.split(/\s*(?:to|-)\s*|\s+/).filter(Boolean);
  const hm = (p: string): string | null => {
    const m = /^(\d{1,2}):?(\d{2})?$/.exec(p);
    if (!m) return null;
    const h = Number(m[1]);
    const mi = m[2] === undefined ? 0 : Number(m[2]);
    return h > 23 || mi > 59 ? null : `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  };
  const from = parts.length === 2 ? hm(parts[0]) : null;
  const to = parts.length === 2 ? hm(parts[1]) : null;
  if (!from || !to) return { ok: false, error: 'Type two times, like 22:00 to 07:00, or none.' };
  return { ok: true, value: { quietFrom: from, quietTo: to } };
}

/** `daily 8`, `daily 08:00`, `weekly monday 18`. */
export function parseDigest(text: string): Parsed<Pick<NotifySettings, 'digestKind' | 'digestHour' | 'digestWeekday'>> | Refused {
  const words = text.trim().toLowerCase().split(/\s+/).filter((w) => w !== 'at' && w !== 'on');
  const bad: Refused = { ok: false, error: 'Type daily 8, or weekly monday 18 (hour 0 to 23).' };
  if (words[0] === 'daily' && words.length === 2) {
    const h = hourOf(words[1]);
    return h === null ? bad : { ok: true, value: { digestKind: 'daily', digestHour: h, digestWeekday: null } };
  }
  if (words[0] === 'weekly' && words.length === 3) {
    const day = DAYS.findIndex((d) => d.toLowerCase().startsWith(words[1]) && words[1].length >= 3);
    const h = hourOf(words[2]);
    return day < 0 || h === null ? bad : { ok: true, value: { digestKind: 'weekly', digestHour: h, digestWeekday: day } };
  }
  return bad;
}

export function explainVerify(reason: string, attemptsLeft?: number): string {
  switch (reason) {
    case 'no-address': return 'Your account has no email address yet.';
    case 'too-soon': return 'A code was just sent; wait a minute before asking again.';
    case 'send-failed': return 'The board could not send the email.';
    case 'none': return 'No code is waiting. Ask for a new one.';
    case 'expired': return 'That code has expired. Ask for a new one.';
    case 'changed': return 'Your address changed; ask for a new code.';
    case 'locked': return 'Too many wrong tries. Ask for a new code.';
    case 'wrong': return `That is not the code${attemptsLeft !== undefined ? `; ${attemptsLeft} tries left` : ''}.`;
    default: return 'That did not work.';
  }
}

// ---------------------------------------------------------------- chrome

export interface Hint { key: string; does: string }

/** The footer: F1 Help  F2 Address  F3 Quiet Hours  F4 Test  Esc Exit. */
export const HINTS: Hint[] = [
  { key: 'F1', does: 'Help' }, { key: 'F2', does: 'Address' }, { key: 'F3', does: 'Quiet Hours' },
  { key: 'F4', does: 'Test' }, { key: 'Esc', does: 'Exit' },
];
/** At 40 columns the row cannot hold five; the letters F-keys stand for work as well. */
export const COMPACT_HINTS: Hint[] = [
  { key: 'F2', does: 'Address' }, { key: 'F3', does: 'Quiet' }, { key: 'F4', does: 'Test' },
];

export const HELP_LINES: string[] = [
  'Up/Down  move between rows',
  'Left/Right  pick Email, Push or Board',
  'Space  change Off, Instant, Digest',
  'Enter  open the event, or the row',
  'F2 or A  your email address',
  'F3 or Q  quiet hours',
  'F4 or T  send a test',
  'Esc or X  back, then leave',
  '',
  'Instant sends at once; Digest gathers',
  'what happened into one message.',
  'Nothing is sent until you turn it on.',
];
