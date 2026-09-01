/**
 * Door themes.
 *
 * Doors hardcode their colours today - a sample across LIVECHAT, DOORMAN and
 * GRANDMASTER found `bg: 'black'` 45 times, `fg: 'white'` 44, `fg: 'cyan'` 29
 * (borders), `bg: 'blue'` 20 (bars), `fg: 'yellow'` 12 (labels) and
 * `fg: 'gray'` 8 (dim). The token names below are those roles, not an
 * invented vocabulary: they were read off what the doors already do, so
 * `classic` can reproduce today's screens exactly.
 *
 * **`classic` is the default and is not a redesign.** A sysop who wants the
 * board to look as it always has changes nothing and sees nothing change.
 * The other themes are opt-in, per user.
 *
 * **Backgrounds are NAMED colours, foregrounds may be hex.** Not taste - a
 * measurement. blessed resolves a dark hex background to the 256-colour
 * greyscale ramp (#0A0D14 becomes index 232) and emits a correct
 * `ESC[48;5;232m`, but on this board those backgrounds render LIGHT while
 * 256-colour foregrounds render exactly right. The board has drawn on the
 * sixteen named backgrounds since it existed, and they are known to work,
 * so that is what the themes use. Foregrounds carry the palette.
 *
 * Colour values are blessed colour names in `classic` - the same strings the
 * doors pass today, so the theme cannot shift a shade by accident - and hex
 * in the others, which xterm.js renders directly. These themes are for
 * TypeScript doors on the web board; a 68K door draws its own ANSI and is
 * not affected by any of this.
 */

/**
 * One theme's colours, by the role each plays on screen.
 *
 * Deliberately small. Every entry here earns its place by appearing in the
 * sample above; a token nobody sets is a token nobody maintains.
 */
export interface ThemeTokens {
  /** The screen behind everything. */
  ground: string;
  /** Body text at full brightness. */
  ink: string;
  /** Borders and frames. */
  chrome: string;
  /** Text that is present but not the point: hints, inactive rows, units. */
  dim: string;
  /** Header and footer bars. */
  bar: string;
  /** Text on a bar. */
  barInk: string;
  /** The one colour that means "this". Labels, the active border, key caps. */
  accent: string;
  /** A second accent, for a value beside a label. Use sparingly. */
  accentAlt: string;
  /** The highlighted row's background and its text. */
  selectionBg: string;
  selectionInk: string;
  /** Semantic, and separate from the accent: these mean something. */
  ok: string;
  warn: string;
  alert: string;
}

/** A theme: its tokens, plus how it wants to be drawn. */
export interface Theme {
  /** Stable id, used in the user's setting and in a door's config. */
  id: string;
  /** What a person picks from a list. */
  name: string;
  /** One line, shown beside the name. */
  blurb: string;
  tokens: ThemeTokens;
  /**
   * Border style. `line` is single, `double` is the demoscene look, `none`
   * draws no border at all and leans on spacing instead.
   */
  border: 'line' | 'double' | 'none';
  /**
   * The branding mark a door may draw in its footer or masthead. Pure ASCII
   * on purpose: it survives Topaz, a real Amiga, and a 2400 baud line.
   */
  rail: string;
  /** Whether this theme wants the optional glitch effects. */
  glitches: boolean;
}

/**
 * The board as it is today.
 *
 * Values are the blessed colour NAMES the doors already pass, not hex
 * equivalents, so switching a door onto tokens cannot change a single pixel
 * for anyone still on this theme.
 */
export const CLASSIC: Theme = {
  id: 'classic',
  name: 'Classic',
  blurb: 'The board as it has always looked.',
  border: 'line',
  rail: '',
  glitches: false,
  tokens: {
    ground: 'black',
    ink: 'white',
    chrome: 'cyan',
    dim: 'gray',
    bar: 'blue',
    barInk: 'white',
    accent: 'yellow',
    accentAlt: 'cyan',
    selectionBg: 'blue',
    selectionInk: 'white',
    ok: 'green',
    warn: 'yellow',
    alert: 'red',
  },
};

/** Direction A: Crush read straight. Quiet chrome, one accent. */
export const SLATE_SLASH: Theme = {
  id: 'slate-slash',
  name: 'Slate & Slash',
  blurb: 'Quiet slate chrome, one magenta accent, room to breathe.',
  border: 'line',
  rail: '///',
  glitches: true,
  tokens: {
    ground: 'black',
    ink: '#C9D4E8',
    chrome: '#48566E',
    dim: '#48566E',
    bar: 'black',
    barInk: '#C9D4E8',
    accent: '#FF3D9A',
    accentAlt: '#4DE0F0',
    selectionBg: 'magenta',
    selectionInk: 'black',
    ok: '#57E389',
    warn: '#F5C451',
    alert: '#FF5C7A',
  },
};

/** Direction B: demoscene magenta and cyan. Looks like a BBS, not an editor. */
export const UPROUGH_NEON: Theme = {
  id: 'uprough-neon',
  name: 'Uprough Neon',
  blurb: 'Demoscene magenta and cyan, double-ruled, masthead slashes.',
  border: 'double',
  rail: '/////',
  glitches: true,
  tokens: {
    ground: 'black',
    ink: '#E4ECFA',
    chrome: '#4DE0F0',
    dim: '#48566E',
    // The masthead sits ON the ground, not in a filled bar. The mockup for
    // this direction is magenta text and slashes over black; a blue bar was
    // borrowed from CLASSIC while converting backgrounds to named colours
    // and is not part of the design.
    bar: 'black',
    barInk: '#FF3D9A',
    accent: '#FF3D9A',
    accentAlt: '#F5C451',
    // The selection is the accent, not a second colour. A dark blue block
    // read as a different idea from the magenta the rest of the theme is
    // built on; black on magenta is the same idea, louder.
    selectionBg: 'magenta',
    selectionInk: 'black',
    ok: '#57E389',
    warn: '#F5C451',
    alert: '#FF5C7A',
  },
};

/** Direction C: one hue, no boxes, hierarchy by brightness. Cheapest to send. */
export const QUIET_PHOSPHOR: Theme = {
  id: 'quiet-phosphor',
  name: 'Quiet Phosphor',
  blurb: 'One phosphor hue, no borders, hierarchy by brightness alone.',
  border: 'none',
  rail: '////',
  // The pitch said this direction had no motion at all, on the argument
  // that it was the calm one. The sysop overruled it, and rightly: a
  // phosphor screen is exactly the thing that ought to glitch.
  glitches: true,
  tokens: {
    ground: 'black',
    ink: '#57E389',
    chrome: '#2E4A3C',
    dim: '#2E4A3C',
    bar: 'black',
    barInk: '#57E389',
    accent: '#8CFFB4',
    accentAlt: '#F5C451',
    selectionBg: 'green',
    selectionInk: 'black',
    ok: '#57E389',
    warn: '#F5C451',
    alert: '#FF8B6B',
  },
};


/**
 * Slate & Slash with the colour spent in one place.
 *
 * The mockups were near-monochrome: dim rows, one accent, and nothing else
 * competing. The implementation drifted louder because the token set offers
 * accent, accentAlt, ok, warn and alert, and a door that uses all five gets
 * five hues on screen at once - "there are too many colors in the themes,
 * your designs was much more toned down".
 *
 * So this collapses the secondary roles onto the neutrals: a value beside a
 * label is DIM rather than gold, and "ok" is simply text. Only two things
 * are ever coloured - the selection and the accent - which is what made the
 * mockup read as designed rather than as decorated. `alert` keeps the
 * accent because it still has to mean something.
 */
export const SLATE_MUTED: Theme = {
  id: 'slate-muted',
  name: 'Slate & Slash (muted)',
  blurb: 'Near-monochrome. One accent, spent on the selection.',
  border: 'line',
  rail: '///',
  glitches: true,
  tokens: {
    ground: 'black',
    ink: '#95A0B4',
    chrome: '#3A4354',
    dim: '#5A6474',
    bar: 'black',
    barInk: '#FF3D9A',
    accent: '#FF3D9A',
    accentAlt: '#5A6474',   // a value beside a label: dim, not a second hue
    selectionBg: 'magenta',
    selectionInk: 'black',
    ok: '#95A0B4',          // "fine" is not news, so it is just text
    warn: '#95A0B4',
    alert: '#FF3D9A',       // this one still has to mean something
  },
};

/** Uprough Neon with the same restraint: cyan chrome, one accent, no gold. */
export const NEON_MUTED: Theme = {
  id: 'neon-muted',
  name: 'Uprough Neon (muted)',
  blurb: 'The neon frame, but the colour spent only where it counts.',
  border: 'double',
  rail: '/////',
  glitches: true,
  tokens: {
    ground: 'black',
    ink: '#A8B4C8',
    chrome: '#2E6E7A',
    dim: '#5A6474',
    bar: 'black',
    barInk: '#FF3D9A',
    accent: '#FF3D9A',
    accentAlt: '#5A6474',
    selectionBg: 'magenta',
    selectionInk: 'black',
    ok: '#A8B4C8',
    warn: '#A8B4C8',
    alert: '#FF3D9A',
  },
};


/**
 * Quiet Phosphor with nothing but phosphor.
 *
 * The original is not actually one hue: accentAlt is gold, and so are warn
 * and alert, so a door that shows a value beside a label puts green text
 * and a gold number on the same row. That is what the sysop was looking at
 * when this was asked for.
 *
 * Here everything is the one colour and hierarchy is carried entirely by
 * BRIGHTNESS - which is what a phosphor screen actually did. The selection
 * has no block at all: the row simply brightens and the marker sits beside
 * it, which is what Direction C described before the implementation
 * reached for a highlight.
 */
export const PHOSPHOR_MUTED: Theme = {
  id: 'phosphor-muted',
  name: 'Quiet Phosphor (muted)',
  blurb: 'One hue and nothing else. Brightness alone carries the hierarchy.',
  border: 'none',
  rail: '////',
  glitches: true,
  tokens: {
    ground: 'black',
    ink: '#57E389',
    chrome: '#1E3A28',
    dim: '#2E4A3C',
    bar: 'black',
    barInk: '#8CFFB4',
    accent: '#8CFFB4',
    accentAlt: '#2E4A3C',   // a value beside a label: dimmer, not gold
    // No highlight block. The row brightens and the marker says where it
    // is - a block would be the one loud thing on an otherwise calm screen.
    selectionBg: 'black',
    selectionInk: '#C8FFDC',
    ok: '#57E389',
    warn: '#8CFFB4',
    alert: '#C8FFDC',
  },
};

/** Every theme, in the order a picker should show them. Classic leads. */
export const THEMES: readonly Theme[] = [
  CLASSIC,
  SLATE_SLASH,
  SLATE_MUTED,
  UPROUGH_NEON,
  NEON_MUTED,
  QUIET_PHOSPHOR,
  PHOSPHOR_MUTED,
];

export const DEFAULT_THEME_ID = CLASSIC.id;

/**
 * The theme with this id, or CLASSIC.
 *
 * Never throws and never returns undefined: an unknown id is a stale
 * setting or a typo in a config, and the answer to both is the board's
 * normal appearance rather than a door that will not start.
 */
export function themeById(id: string | null | undefined): Theme {
  if (!id) return CLASSIC;
  const wanted = id.trim().toLowerCase();
  return THEMES.find(t => t.id === wanted) ?? CLASSIC;
}
