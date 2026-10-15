/**
 * Teletext service index: the page graph, in memory.
 *
 * A recovered teletext service is a bag of pages keyed by their teletext
 * page number (magazine 1-8 + two hex digits, so 0x100-0x8FF), each with
 * one or more subpages that rotate on air. Browsing one is three
 * questions - which page, which subpage, and where do the coloured keys
 * go - and this module answers all three over the existing page model.
 *
 * Pure: no fs, no network, no timers. The caller owns the clock; this
 * only says how long a subpage wants to be up (see dwellMsFor).
 *
 * Nothing here parses anything. `.tti` and `.t42` are already handled by
 * the vendored packet engine under `marco/`; `library.ts` reads them off
 * disk and hands the assembled service here.
 */
import type {
  TeletextService,
  TeletextPage,
  TeletextSubpage,
  PageNumber,
  FastextLinks,
} from './marco/model/types';

/** The lowest and highest real teletext page numbers. */
export const FIRST_PAGE: PageNumber = 0x100;
export const LAST_PAGE: PageNumber = 0x8ff;

/**
 * Packet 27 writes 0x8FF into a link slot that is not used, so a page with
 * no red button still carries a red link. Treating it as a page would send
 * a caller to magazine 8 page FF - which is also the filler/null header the
 * t42 importer drops. One sentinel, two reasons to never follow it.
 */
export const NO_LINK: PageNumber = 0x8ff;

/** The fastext keys a caller can press, in packet 27 order. */
export type FastextKey = 'red' | 'green' | 'yellow' | 'cyan' | 'link' | 'index';

export const FASTEXT_KEYS: readonly FastextKey[] = [
  'red',
  'green',
  'yellow',
  'cyan',
  'link',
  'index',
] as const;

export interface ServiceIndex {
  /** The service this indexes, unmodified. */
  readonly service: TeletextService;
  /** Every page number the service holds, ascending. */
  readonly pageNumbers: readonly PageNumber[];
  /** Where a caller starts: the manifest's choice, else the lowest page. */
  readonly homePage: PageNumber;
  /** True when the service holds this page. */
  has(page: PageNumber): boolean;
  /** The page, or null when the service never captured it. */
  get(page: PageNumber): TeletextPage | null;
  /** The next page the service actually holds, wrapping at the end. */
  nextPage(from: PageNumber): PageNumber;
  /** The previous page the service actually holds, wrapping at the start. */
  prevPage(from: PageNumber): PageNumber;
}

export interface BuildIndexOptions {
  /**
   * The page a caller lands on. Ignored when the service does not hold it,
   * because an index that opens on a missing page is worse than one that
   * opens on the first page it has.
   */
  homePage?: PageNumber;
}

export function buildServiceIndex(
  service: TeletextService,
  options: BuildIndexOptions = {},
): ServiceIndex {
  const pages = new Map<PageNumber, TeletextPage>();
  for (const page of service.pages ?? []) {
    if (!isRealPage(page.pageNumber)) continue;

    const seen = pages.get(page.pageNumber);
    if (!seen) {
      pages.set(page.pageNumber, { ...page, subpages: [...(page.subpages ?? [])] });
      continue;
    }
    mergeInto(seen, page);
  }

  // Subpages rotate in subcode order, whatever order the files arrived in.
  for (const page of pages.values()) {
    page.subpages.sort((a, b) => a.subcode - b.subcode);
  }

  const pageNumbers = [...pages.keys()].sort((a, b) => a - b);
  const wanted = options.homePage;
  const homePage =
    wanted !== undefined && pages.has(wanted)
      ? wanted
      : (pageNumbers[0] ?? FIRST_PAGE);

  const indexOf = (from: PageNumber): number => {
    // A caller can ask from a page the service does not hold (they typed it,
    // or a fastext link pointed off the edge of the recovery). Step from
    // where that page WOULD sit, so next/prev stay monotonic.
    let lo = 0;
    let hi = pageNumbers.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pageNumbers[mid] < from) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  return {
    service,
    pageNumbers,
    homePage,
    has: (page) => pages.has(page),
    get: (page) => pages.get(page) ?? null,
    nextPage(from) {
      if (pageNumbers.length === 0) return from;
      const at = indexOf(from);
      // indexOf lands ON `from` when it exists, so step past it.
      const next = pageNumbers[at] === from ? at + 1 : at;
      return pageNumbers[next % pageNumbers.length] ?? pageNumbers[0];
    },
    prevPage(from) {
      if (pageNumbers.length === 0) return from;
      const at = indexOf(from);
      const prev = at - 1;
      return prev >= 0 ? pageNumbers[prev] : pageNumbers[pageNumbers.length - 1];
    },
  };
}

/**
 * Fold one recovery of a page into another.
 *
 * A page number turns up many times in a real archive, and there are two
 * different reasons for it. The restoration project writes ONE FILE PER
 * SUBPAGE - `P152-0001`, `P152-0002` and so on - so the same page number
 * arriving repeatedly is usually the carousel arriving a screen at a time.
 * Only when two files carry the SAME subcode are they rival recoveries of
 * one screen, and then the fuller one wins.
 *
 * Treating every repeat as a rival is what this replaced, and it quietly
 * threw away the whole of Bamboozle: its questions are its subpages, so a
 * nine-subpage quiz loaded as a single title screen with nothing behind it.
 */
function mergeInto(into: TeletextPage, from: TeletextPage): void {
  for (const subpage of from.subpages ?? []) {
    const at = into.subpages.findIndex(existing => existing.subcode === subpage.subcode);
    if (at === -1) {
      into.subpages.push(subpage);
      continue;
    }
    if (subpageContent(subpage) > subpageContent(into.subpages[at])) {
      into.subpages[at] = subpage;
    }
  }
  // A page's coloured keys are carried in packet 27 on every subpage, but a
  // noisy recovery may only have caught them once.
  if (!into.fastext && from.fastext) into.fastext = from.fastext;
  if (!into.defaultCycle && from.defaultCycle) into.defaultCycle = from.defaultCycle;
  if (!into.description && from.description) into.description = from.description;
}

/** How much of one screen a recovery actually got. */
function subpageContent(subpage: TeletextSubpage): number {
  let filled = 0;
  for (const row of subpage.rows ?? []) {
    for (const token of row.tokens ?? []) {
      if (token.kind === 'char' && token.codepoint7 !== 0x20) filled++;
      else if (token.kind === 'mosaic' || token.kind === 'control') filled++;
      else if (token.kind === 'fill' && token.codepoint7 !== 0x20) filled += token.count;
    }
  }
  return filled;
}

/** True for a page number a teletext service can actually carry. */
export function isRealPage(page: number | null | undefined): page is PageNumber {
  return (
    typeof page === 'number' &&
    Number.isInteger(page) &&
    page >= FIRST_PAGE &&
    page <= LAST_PAGE
  );
}

/**
 * Where a coloured key goes, or null when this page does not offer it.
 *
 * Callers get null for an unused slot rather than 0x8FF, so "is there a red
 * button on this page" is one question, not two.
 */
export function resolveFastext(
  page: TeletextPage | null | undefined,
  key: FastextKey,
): PageNumber | null {
  const links: FastextLinks | null | undefined = page?.fastext;
  if (!links) return null;
  const target = links[key];
  if (target === null || target === undefined) return null;
  if (target === NO_LINK) return null;
  return isRealPage(target) ? target : null;
}

/** Every coloured key this page offers, in packet 27 order. */
export function fastextTargets(
  page: TeletextPage | null | undefined,
): Partial<Record<FastextKey, PageNumber>> {
  const out: Partial<Record<FastextKey, PageNumber>> = {};
  for (const key of FASTEXT_KEYS) {
    const target = resolveFastext(page, key);
    if (target !== null) out[key] = target;
  }
  return out;
}

// --- Subpages -----------------------------------------------------------

/** How many subpages rotate on this page. Always at least 1 for a real page. */
export function subpageCount(page: TeletextPage | null | undefined): number {
  return page?.subpages?.length ?? 0;
}

/** One subpage by rotation position, wrapping. Null when the page has none. */
export function subpageAt(
  page: TeletextPage | null | undefined,
  position: number,
): TeletextSubpage | null {
  const count = subpageCount(page);
  if (count === 0) return null;
  const at = ((position % count) + count) % count;
  return page!.subpages[at];
}

/** Step the carousel. Wraps in both directions. */
export function stepSubpage(
  page: TeletextPage | null | undefined,
  position: number,
  delta: number,
): number {
  const count = subpageCount(page);
  if (count === 0) return 0;
  return (((position + delta) % count) + count) % count;
}

/**
 * How long this page wants a subpage on screen, in milliseconds.
 *
 * TTI's CT record carries either a time in seconds or a cycle count. Only
 * the time form says anything about the clock; a cycle count is a count of
 * magazine rotations, which a BBS does not have, so that falls back to the
 * caller's dwell.
 */
export function dwellMsFor(
  page: TeletextPage | null | undefined,
  defaultMs: number,
): number {
  const cycle = page?.defaultCycle;
  if (cycle && cycle.mode === 'time' && cycle.value > 0) {
    return Math.round(cycle.value * 1000);
  }
  return defaultMs;
}

// --- Page numbers as typed ----------------------------------------------

/**
 * Parse what a caller typed into a page number.
 *
 * Teletext page numbers are hexadecimal: magazine 1-8 then two hex digits.
 * Most pages a human knows are decimal-looking (100, 302, 888), but real
 * services carry hex pages too, and a recovery hands them over as-is.
 */
export function parsePageNumber(text: string): PageNumber | null {
  const trimmed = text.trim().toUpperCase();
  if (!/^[1-8][0-9A-F]{2}$/.test(trimmed)) return null;
  const page = parseInt(trimmed, 16);
  return isRealPage(page) ? page : null;
}

/** A page number the way teletext prints it: three hex digits, upper case. */
export function formatPageNumber(page: PageNumber): string {
  return page.toString(16).toUpperCase().padStart(3, '0');
}
