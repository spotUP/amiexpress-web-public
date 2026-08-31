/**
 * The arcade main menu, shared by every arcade door.
 *
 * Modelled on Arkanoid's: a centred block title, the options centred beneath
 * it with the selected one picked out as `> OPTION <`, and a hint line saying
 * how to drive it. Arkanoid draws that in raw ANSI from its browser client;
 * every other arcade door is server-side blessed, so this produces blessed
 * tagged lines instead of escape codes. Same layout, different medium.
 *
 * Deliberately NOT ported: Arkanoid's strip of coloured blocks under the
 * title. Those are its bricks - they mean something in Arkanoid and read as
 * clutter anywhere else. Frogger carried a copy of them and it was reported
 * as "a leftover from arkanoid", so a door that wants an accent supplies its
 * own `accent` lines rather than inheriting somebody else's game.
 *
 * This module exists because the same menu was written nine times. Three
 * separate hand-sweeps over those copies - ghost borders, arrow keys, and
 * the wrap fix - each missed doors, because a fix applied nine times by hand
 * is a fix that will be applied eight times by hand.
 *
 * Pure and I/O-free: it returns lines. The door owns the box they go in, so
 * a door with an unusual layout is not fighting this to place it.
 */

/** One row of the menu. */
export interface MenuOption {
  /** What the row says. */
  label: string;
  /**
   * A value shown after the label, for settings-style rows - "MEDIUM" on a
   * Difficulty row. Arkanoid renders these inline as "DIFFICULTY: MEDIUM".
   */
  value?: string;
}

export interface ArcadeMenuSpec {
  /**
   * The title, one entry per line. Two short lines read better than one long
   * one at this size, which is why Arkanoid splits its own.
   */
  title: string[];
  options: Array<MenuOption | string>;
  /** Which row is selected, 0-based. */
  selection: number;
  /** How wide the menu is drawn, in columns. */
  width: number;
  /** Optional accent rows under the title - the door's own, not Arkanoid's. */
  accent?: string[];
  /** The line under the options. Defaults to the standard hint. */
  hint?: string;
  /** An optional line under the hint, for a tagline. */
  subtitle?: string;
}

export const DEFAULT_HINT = 'UP/DOWN to choose, ENTER to confirm';

/**
 * The hint for a menu too narrow for the full one.
 *
 * The default is 35 columns. A menu narrower than that would have wrapped it
 * onto a second line, and a wrapped line in a fixed-height box is how the
 * arcade boards ended up drawing on every other row.
 */
export const SHORT_HINT = 'UP/DOWN, ENTER';

/** Colours, named so a door can read what it is changing. */
export const MENU_COLORS = {
  title: 'lightyellow',
  titleBg: 'blue',
  selected: 'lightyellow',
  selectedBg: 'blue',
  option: 'white',
  hint: 'gray',
  subtitle: 'lightcyan',
};

/** Visible width, ignoring blessed's colour tags. */
export function visibleLength(text: string): number {
  return text.replace(/\{[^}]*\}/g, '').length;
}

/**
 * Centre a plain string in `width` columns, never exceeding them.
 *
 * The clamp is not decoration: every line here goes into a fixed-width box,
 * and one line a column too long wraps and pushes everything below it down.
 */
function centre(text: string, width: number): string {
  const fitted = text.length > width ? text.slice(0, width) : text;
  const pad = Math.max(0, Math.floor((width - fitted.length) / 2));
  return ' '.repeat(pad) + fitted;
}

/**
 * Centre a string and colour ONLY the string.
 *
 * The padding that centres a line is layout, not content, so it must sit
 * outside the colour span. Wrapping the centred line as a whole put the
 * padding inside the tag, and on the selected row - the one with a
 * background colour - that painted the blue from the left edge of the box up
 * to the text: reported as "the dark blue selection bleeds to the left". It
 * bled to the left ONLY because `centre` pads on the left alone, so the
 * asymmetry was the tell.
 *
 * A foreground-only row hides the same fault, since colouring spaces looks
 * like colouring nothing. Every row goes through here regardless, so the
 * next row that gains a background does not reintroduce it.
 */
function centreTagged(text: string, width: number, tags: string): string {
  const fitted = text.length > width ? text.slice(0, width) : text;
  const pad = Math.max(0, Math.floor((width - fitted.length) / 2));
  return `${' '.repeat(pad)}${tags}${fitted}{/}`;
}

/** The widest hint that fits, preferring the caller's own. */
function hintFor(width: number, given?: string): string {
  if (given) return given;
  return DEFAULT_HINT.length <= width ? DEFAULT_HINT : SHORT_HINT;
}

/** The text of one option row, before centring. */
export function optionText(option: MenuOption | string, selected: boolean): string {
  const opt: MenuOption = typeof option === 'string' ? { label: option } : option;
  const body = opt.value ? `${opt.label}: ${opt.value}` : opt.label;
  return selected ? `> ${body} <` : `  ${body}  `;
}

/**
 * Build the menu as blessed-tagged lines.
 *
 * Every returned line is at most `width` painted columns, so a door can drop
 * them straight into a box of that width without wrapping - which is the
 * fault that put arcade boards on every other row earlier today.
 */
export function arcadeMenu(spec: ArcadeMenuSpec): string[] {
  const { title, options, selection, width } = spec;
  const lines: string[] = [];

  for (const line of title) {
    lines.push(centreTagged(
      line, width,
      `{${MENU_COLORS.titleBg}-bg}{${MENU_COLORS.title}-fg}`
    ));
  }

  if (spec.accent && spec.accent.length) {
    lines.push('');
    for (const line of spec.accent) lines.push(line);
  }

  lines.push('');

  options.forEach((option, index) => {
    const selected = index === selection;
    lines.push(centreTagged(
      optionText(option, selected), width,
      selected
        ? `{${MENU_COLORS.selectedBg}-bg}{${MENU_COLORS.selected}-fg}`
        : `{${MENU_COLORS.option}-fg}`
    ));
  });

  lines.push('');
  lines.push(centreTagged(
    hintFor(width, spec.hint), width, `{${MENU_COLORS.hint}-fg}`
  ));

  if (spec.subtitle) {
    lines.push(centreTagged(
      spec.subtitle, width, `{${MENU_COLORS.subtitle}-fg}`
    ));
  }

  return lines;
}

/**
 * Move the selection, wrapping at both ends.
 *
 * Wrapping is what Arkanoid does, and it is the behaviour a player expects
 * from a cabinet: holding down on the last row returns to the first rather
 * than sticking. Several doors clamped instead, so the last option felt
 * broken when it was merely last.
 */
export function moveSelection(selection: number, count: number, delta: number): number {
  if (count <= 0) return 0;
  return (selection + delta + count) % count;
}
