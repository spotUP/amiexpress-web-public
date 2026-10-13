/**
 * COMPOSING A STORY INTO TELETEXT.
 *
 * §6 is the whole brief in one section and it is not optional:
 *
 *   "Do not paste long web articles into Teletext. Do not simply truncate an
 *    article until it fits. Instead, distil the story into its essential
 *    information and write for scanning, browsing and compact reading."
 *
 * So this is a COMPOSER, not a formatter. A feed gives us a headline and a
 * paragraph of description; the composer's job is to decide what the four
 * things of §6's "Summaries" are - what happened, who, why it matters, where
 * to read it - and lay them out in that order at forty columns.
 *
 * It emits a structured page (rows with a role) rather than a finished
 * PETSCII frame. The role is what lets the display layer scale a headline to
 * double height, colour a rule, or drop to plain text for a caller who asked
 * for no colour - without this file guessing which of those a given screen
 * wants.
 */

/** Teletext is 40x24; the board's generated-screen budget has the last word. */
export const PAGE_WIDTH = 40;

export type RowRole =
  | 'masthead'
  | 'kicker'
  | 'rule'
  | 'headline'
  | 'body'
  | 'quote'
  | 'source'
  | 'nav'
  | 'blank';

export interface PageRow {
  role: RowRole;
  /** Exactly PAGE_WIDTH visible columns, before any colour. */
  text: string;
}

export interface ComposedStory {
  headline: string;
  /** The distilled summary. Never a truncated article. */
  summary: string;
  format: string;
  source: string;
  url?: string;
  date?: string;
}

export interface ComposedPage {
  number: number;
  /** The page's own name, shown when a caller arrives mid-section (§6). */
  title: string;
  deskLabel: string;
  rows: PageRow[];
}

/** Pad or clip to the screen, so a row can never wrap and break the grid. */
export function toWidth(text: string, width = PAGE_WIDTH): string {
  if (text.length === width) return text;
  if (text.length < width) return text.padEnd(width, ' ');
  return text.slice(0, width);
}

/**
 * Wrap into rows at the screen width, breaking on spaces.
 *
 * A word longer than the width is cut rather than allowed to overflow: a feed
 * hands us URLs and unbroken handles, and a line that overflows silently eats
 * the column to its right.
 *
 * A cut word is marked with a trailing hyphen so a reader knows it ran past the
 * screen - EXCEPT a URL, where the hyphen would be a character that is not in
 * the address. A mangled link that looks plausible is worse than an obviously
 * truncated one, so a URL is cut bare.
 */
const IS_URL = /^(https?:\/\/|www\.)\S+$/i;

export function wrap(text: string, width = PAGE_WIDTH): string[] {
  const rows: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      rows.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (w.length > width) {
        if (line) rows.push(line);
        line = '';
        rows.push(IS_URL.test(w) ? w.slice(0, width) : `${w.slice(0, width - 1)}-`);
        w = IS_URL.test(w) ? w.slice(width) : w.slice(width - 1);
      }
      if (!line) {
        line = w;
      } else if (line.length + 1 + w.length <= width) {
        line += ` ${w}`;
      } else {
        rows.push(line);
        line = w;
      }
    }
    if (line) rows.push(line);
  }
  return rows;
}

/**
 * The masthead. A caller arriving on any page must know what publication this
 * is and where they are (§12: "the reader can understand where they are").
 */
export function masthead(page: number, deskLabel: string): PageRow[] {
  const left = 'UNDERGROUND MAG';
  const right = String(page);
  const gap = Math.max(1, PAGE_WIDTH - left.length - right.length);
  return [
    { role: 'masthead', text: toWidth(`${left}${' '.repeat(gap)}${right}`) },
    { role: 'kicker', text: toWidth(deskLabel.toUpperCase()) },
    { role: 'rule', text: toWidth('=') },
  ];
}

/**
 * One story as a page: headline, then the distilled summary, then where it
 * came from. This order is §6's "Put the most important information first",
 * and the source last because §6 also says an attribution should never be the
 * thing that gets dropped to save a row.
 */
export function composeStoryPage(
  story: ComposedStory,
  page: number,
  deskLabel: string,
  budget: number,
): ComposedPage {
  const rows: PageRow[] = [...masthead(page, deskLabel)];
  const budgetForBody = Math.max(3, budget - rows.length - 3);

  // The headline gets the rows that the summary cannot use: a headline cut in
  // half is unreadable, a summary tail is merely lost.
  const headLines = wrap(story.headline.toUpperCase());
  const summaryLines = wrap(story.summary);
  const sourceLines = wrap(`Source: ${story.source}${story.url ? `\n${story.url}` : ''}`);

  const summaryRoom = Math.max(1, budgetForBody - headLines.length - sourceLines.length);
  const keptSummary = summaryLines.slice(0, summaryRoom);
  // A cut mid-sentence is worse than a cut at one: keep whole sentences.
  while (
    keptSummary.length > 1 &&
    keptSummary[keptSummary.length - 1].trim() &&
    !/[.!?:]$/.test(keptSummary[keptSummary.length - 1].trim())
  ) {
    keptSummary.pop();
  }
  if (keptSummary.length < summaryLines.length) keptSummary.push('...');

  for (const line of headLines) rows.push({ role: 'headline', text: toWidth(line) });
  rows.push({ role: 'blank', text: '' });
  for (const line of keptSummary) rows.push({ role: 'body', text: toWidth(line) });
  rows.push({ role: 'blank', text: '' });
  for (const line of sourceLines) rows.push({ role: 'source', text: toWidth(line) });

  return {
    number: page,
    title: story.headline,
    deskLabel,
    rows: rows.slice(0, budget),
  };
}

/**
 * An index page: what is on this desk, newest first.
 *
 * This is the front page (100-119) and every section's first page. §5.A's
 * "latest transmissions" is exactly this, and it is deliberately NOT the
 * magazine's editorial front page - that one a human approves.
 */
export function composeIndexPage(
  entries: Array<{ headline: string; format: string; page?: number }>,
  page: number,
  deskLabel: string,
  title: string,
  budget: number,
): ComposedPage {
  const rows: PageRow[] = [
    ...masthead(page, deskLabel),
    { role: 'headline', text: toWidth(title.toUpperCase()) },
    { role: 'rule', text: toWidth('-') },
  ];
  for (const entry of entries) {
    if (rows.length >= budget - 1) break;
    const label = entry.format.padEnd(9).slice(0, 9);
    const body = wrap(entry.headline, PAGE_WIDTH - label.length - 1);
    rows.push({ role: 'body', text: toWidth(`${label} ${body[0] ?? ''}`) });
    for (const cont of body.slice(1)) {
      if (rows.length >= budget - 1) break;
      rows.push({ role: 'body', text: toWidth(`${' '.repeat(label.length)} ${cont}`) });
    }
  }
  return { number: page, title, deskLabel, rows: rows.slice(0, budget) };
}

const ROLE_COLOUR: Record<RowRole, string> = {
  masthead: '\x1b[1;37m',
  kicker: '\x1b[1;33m',
  rule: '\x1b[0;34m',
  headline: '\x1b[1;36m',
  body: '\x1b[0;37m',
  quote: '\x1b[1;32m',
  source: '\x1b[0;33m',
  nav: '\x1b[0;36m',
  blank: '',
};

/**
 * The page as ANSI, forty columns, one line per row.
 *
 * `^N`/`^O` bracket a double-height line - the teletext design language §6
 * asks us to use for hierarchy - and the SGR colours are the ANSI path the 80
 * column callers read. Both are in one string because a caller does not know
 * which terminal it is talking to until it is already connected.
 */
export function renderPage(page: ComposedPage, doubleHeight: boolean[] = []): string {
  return page.rows
    .map((row, i) => {
      if (row.role === 'blank') return '';
      const colour = ROLE_COLOUR[row.role];
      const body = `${colour}${row.text}\x1b[0m`;
      return doubleHeight[i] && row.role === 'masthead' ? `\x0e${body}\x0f` : body;
    })
    .join('\r\n');
}