import type { NotifyCatalogue, NotifyChannel, NotifyEventDef, NotifyMode, NotifyPrefs, NotifySettings } from '@amiexpress/bbs-door-sdk/formats/notify';
export declare const CHANNELS: readonly NotifyChannel[];
export declare const CHANNEL_WORD: Record<NotifyChannel, string>;
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
export declare const blurbOf: (id: string) => string;
/** Clip to a width, never fold: a folded row eats the row under it. */
export declare function clip(text: string, width: number): string;
export declare function buildEventRows(events: readonly NotifyEventDef[], prefs: NotifyPrefs, can: NotifyCatalogue['deliverable']): EventRow[];
/** The prefs that follow from the rows: only delivering and explicit cells are kept. */
export declare function prefsFromRows(rows: readonly EventRow[]): NotifyPrefs;
export declare const cellWord: (cell: Cell) => string;
/** Three tokens and the four slots around and between them, which hold the active token's `[` and `]`. */
export declare const COMPACT_SUMMARY_W: number;
/** ` E:Inst  P:-    B:Dig `; the active token reads `[E:Inst]`. A channel that cannot be used shows `-`. */
export declare function compactSummary(row: EventRow, active?: NotifyChannel): string;
/** The list draws a two character selection marker (`>>`, `> `, blank) in front of every item. */
export declare const MARKER_W = 2;
export interface ColumnPlan {
    compact: boolean;
    nameW: number;
    /** One cell: a slot, the word, a slot. The slots hold the `[` `]` of the active cell. */
    cellW: number;
    /** 0 = no description column. */
    descW: number;
}
/** Every width the Events view uses, from the screen width alone. */
export declare function columnPlan(width: number): ColumnPlan;
/** One Events row. `active` is the channel the cursor is on, drawn `[Word]`. */
export declare function eventRowText(row: EventRow, plan: ColumnPlan, active?: NotifyChannel): string;
/** The column heads, over the words of the rows: indented by the list's marker; empty at 40, where each row says what its tokens mean. */
export declare function headerText(plan: ColumnPlan): string;
/** The channel rows of one event's detail view. */
export declare function detailRows(row: EventRow, width: number, active?: NotifyChannel): string[];
export declare function followRows(conferences: readonly {
    id: number;
    name: string;
}[], follows: readonly number[], width: number): string[];
export declare const DAYS: readonly ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export declare const quietWords: (s: NotifySettings) => string;
export declare const digestWords: (s: NotifySettings) => string;
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
export declare function pushWords(f: Pick<DeliveryFacts, 'pushDeliverable' | 'web' | 'pushBrowsers'>): string;
/** The Delivery view's rows. At 40 the label and the value stack on one row each, clipped. */
export declare function deliveryRows(f: DeliveryFacts, width: number): Array<{
    id: DeliveryId;
    text: string;
}>;
export interface Parsed<T> {
    ok: true;
    value: T;
}
export interface Refused {
    ok: false;
    error: string;
}
/** `22:00 to 07:00`, `22:00-07:00`, or blank/`none` to switch quiet hours off. */
export declare function parseQuiet(text: string): Parsed<Pick<NotifySettings, 'quietFrom' | 'quietTo'>> | Refused;
/** `daily 8`, `daily 08:00`, `weekly monday 18`. */
export declare function parseDigest(text: string): Parsed<Pick<NotifySettings, 'digestKind' | 'digestHour' | 'digestWeekday'>> | Refused;
export declare function explainVerify(reason: string, attemptsLeft?: number): string;
export interface Hint {
    key: string;
    does: string;
}
/** The footer: F1 Help  F2 Address  F3 Quiet Hours  F4 Test  Esc Exit. */
export declare const HINTS: Hint[];
/** At 40 columns the row cannot hold five; the letters F-keys stand for work as well. */
export declare const COMPACT_HINTS: Hint[];
export declare const HELP_LINES: string[];
//# sourceMappingURL=layout.d.ts.map