/**
 * Ready-made blessed styles, so a door names a ROLE instead of a colour.
 *
 * The rule this exists to serve: a door should say "this is a panel" or
 * "this text is secondary", not `{ fg: 'white', bg: 'black' }`. A sample
 * across three doors found 45 hardcoded `bg: 'black'` and 44 `fg: 'white'` -
 * every one of those is a decision that cannot be themed, and a place the
 * board's look can drift.
 *
 * Migrating a door is meant to be dull:
 *
 *     const s = themeStyles(theme);
 *     createBox({ ...s.panel, label: ' REPO ' });      // was fg/bg/border
 *     box.setContent(s.dim('4096 archives'));          // was {gray-fg}...
 *
 * On `classic` these produce exactly the strings the doors pass today, so a
 * migration is verifiable: the output should be identical until somebody
 * chooses a different theme.
 */
import type { Theme } from './tokens';

/** The border types blessed's own character table offers. */
export type BlessedBorderType = 'line' | 'double' | 'bg';

/** A blessed style block, as the widgets expect it. */
export interface BlessedStyle {
  fg?: string;
  bg?: string;
  border?: { fg?: string; bg?: string };
  label?: { fg?: string; bg?: string };
  selected?: { fg?: string; bg?: string; bold?: boolean };
  item?: { fg?: string; bg?: string };
  focus?: { border?: { fg?: string } };
}

export interface ThemeStyles {
  /** A bordered panel: the default container. */
  panel: { border: { type: BlessedBorderType }; style: BlessedStyle };
  /** A header or footer bar. */
  bar: { style: BlessedStyle };
  /** A list, with its selection and its focus border. */
  list: { border: { type: BlessedBorderType }; style: BlessedStyle };
  /** Plain content with no chrome of its own. */
  plain: { style: BlessedStyle };

  /** Inline tag helpers. Each wraps text and closes what it opened. */
  ink(text: string): string;
  dim(text: string): string;
  accent(text: string): string;
  accentAlt(text: string): string;
  ok(text: string): string;
  warn(text: string): string;
  alert(text: string): string;
  /** A key cap: the letter a hint tells the user to press. */
  key(text: string): string;

  /** The theme's branding mark, or '' when it has none. */
  rail: string;
  /** The border characters this theme wants, for doors drawing their own. */
  borderStyle: Theme['border'];
}

/**
 * blessed's tag syntax takes a colour name or a hex value, so a token can be
 * dropped straight in. Closing tags must match what was opened, which is why
 * this is one function rather than string concatenation at each call site.
 */
function tag(colour: string, text: string, bold = false): string {
  const open = bold ? `{bold}{${colour}-fg}` : `{${colour}-fg}`;
  const close = bold ? `{/${colour}-fg}{/bold}` : `{/${colour}-fg}`;
  return `${open}${text}${close}`;
}

/**
 * The styles for one theme.
 *
 * Cheap to call and free of state - a door may call it once at startup or
 * per redraw, whichever reads better where it is used.
 */
export function themeStyles(theme: Theme): ThemeStyles {
  const t = theme.tokens;

  // The theme's own choice, passed through rather than thrown away - a
  // theme that asks for double rules was getting single ones.
  //
  // blessed's `double` is ASCII (`+===+`), not Unicode `╔═╗`: the border
  // table is deliberately "Amiga ASCII only" so a real board can draw it.
  // The mockups drew box characters because they were a web page; this is
  // the honest equivalent.
  //
  // 'none' still uses `line`: a door that wants no border at all sets its
  // own `border: undefined`. What changes here is the COLOUR, which sinks
  // the rule into the ground rather than removing the widget's box model
  // and shifting every child by a column.
  const borderType: BlessedBorderType = theme.border === 'double' ? 'double' : 'line';

  return {
    panel: {
      border: { type: borderType },
      style: {
        fg: t.ink,
        bg: t.ground,
        border: { fg: theme.border === 'none' ? t.ground : t.chrome },
        label: { fg: t.accent, bg: t.ground },
        focus: { border: { fg: t.accent } },
      },
    },

    bar: {
      style: { fg: t.barInk, bg: t.bar },
    },

    list: {
      border: { type: borderType },
      style: {
        fg: t.ink,
        bg: t.ground,
        border: { fg: theme.border === 'none' ? t.ground : t.chrome },
        label: { fg: t.accent, bg: t.ground },
        item: { fg: t.dim, bg: t.ground },
        selected: { fg: t.selectionInk, bg: t.selectionBg, bold: true },
        focus: { border: { fg: t.accent } },
      },
    },

    plain: {
      style: { fg: t.ink, bg: t.ground },
    },

    ink: (text) => tag(t.ink, text),
    dim: (text) => tag(t.dim, text),
    accent: (text) => tag(t.accent, text),
    accentAlt: (text) => tag(t.accentAlt, text),
    ok: (text) => tag(t.ok, text),
    warn: (text) => tag(t.warn, text),
    alert: (text) => tag(t.alert, text),
    key: (text) => tag(t.accent, text, true),

    rail: theme.rail,
    borderStyle: theme.border,
  };
}
