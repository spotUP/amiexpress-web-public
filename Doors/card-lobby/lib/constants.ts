/**
 * Card Lobby - Constants and Configuration
 * All constants, themes, catalogs, and configuration data
 */

import type { Colors } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/core/types';
import { themeById, type Theme } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import type { GameDefinition, AchievementDefinition, BulletinEntry } from './types';

export type ActionButtonKey = 'fold' | 'check' | 'call' | 'raise' | 'quit';
export type UnoActionButtonKey = 'play' | 'draw' | 'uno' | 'challenge' | 'quit';

export const CHIP_NAME = 'BBS Chips';
export const STARTING_CHIPS = 1000;
export const DAILY_BONUS = 200;
export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const ENTRY_FEE_RATE = 0.02;
export const ACTIVITY_REWARD = 5;
export const WIN_REWARD = 10;
export const WEEKLY_BULLETIN_NUMBER = 20;
export const REFRESH_INTERVAL_MS = 5000;
export const MAX_ACTIVITY_EVENTS = 200;

export const BOT_NAMES = [
  'Atlas',
  'Nova',
  'Pixel',
  'Echo',
  'Orion',
  'Vega',
  'Juno',
  'Quark',
  'Sable',
  'Rogue',
];

export const PokerAction = {
  SIT: 'SIT',
  STAND: 'STAND',
  ADD_CHIPS: 'ADD_CHIPS',
  RESERVE_SEAT: 'RESERVE_SEAT',
  DEAL: 'DEAL',
  FOLD: 'FOLD',
  CHECK: 'CHECK',
  CALL: 'CALL',
  BET: 'BET',
  RAISE: 'RAISE',
  SHOW: 'SHOW',
  MUCK: 'MUCK',
  TIMEOUT: 'TIMEOUT',
  TIME_BANK: 'TIME_BANK',
  UNCALLED_BET_RETURNED: 'UNCALLED_BET_RETURNED',
  NEXT_BLIND_LEVEL: 'NEXT_BLIND_LEVEL',
} as const;

export const ANSI_TAGS: Record<string, string> = {
  '0': '{/}',
  '30': '{black-fg}',
  '31': '{red-fg}',
  '32': '{green-fg}',
  '33': '{yellow-fg}',
  '34': '{blue-fg}',
  '35': '{magenta-fg}',
  '36': '{cyan-fg}',
  '37': '{white-fg}',
  '40': '{black-bg}',
  '41': '{red-bg}',
  '42': '{green-bg}',
  '43': '{yellow-bg}',
  '44': '{blue-bg}',
  '45': '{magenta-bg}',
  '46': '{cyan-bg}',
  '47': '{white-bg}',
};

/**
 * The door's palette, DERIVED from the board's theme.
 *
 * It used to be a frozen literal, so CARD LOBBY looked the same whichever
 * theme the sysop had chosen - cyan frames and a blue bar on a board running
 * Quiet Phosphor. The SDK's themes carry exactly the tokens this needs
 * (sdk/engines/ui/theme/tokens.ts); applyTheme() copies them in once at
 * startup, before any widget is built.
 *
 * The object is mutated rather than replaced because the whole door imports
 * this one binding. The theme stays the source of truth; this is a cache of
 * it in the shape the widgets want.
 */
export const UI_THEME = {
  topBar: { fg: 'white', bg: 'blue', item: { fg: 'gray' }, selected: { fg: 'white' } },
  statusBar: { fg: 'white', bg: 'blue' },
  windowBorder: { fg: 'cyan' },
  windowBg: 'black',
  ink: 'white',
  dim: 'gray',
  accent: 'cyan',
  accentAlt: 'yellow',
  highlightBg: 'lightcyan',
  highlightInk: 'black',
  warning: 'yellow',
  ok: 'green',
  error: 'red',
  /**
   * The theme's branding mark - the "//////" chrome every other themed door
   * draws. This door mapped every token except this one, so its masthead was
   * bare in a theme that has one ("the theme colors are correct but the
   * chrome is missing", 2026-09-02).
   */
  rail: '',
};

/**
 * The resolved theme itself, not just the tokens copied out of it.
 *
 * The chrome - the animated rail and the theme's glitches - is driven from
 * the Theme object, and the widgets that carry it are built in UIManager.
 * This module already owns "what the board asked this door to look like",
 * so the theme is cached HERE rather than threaded through one more
 * constructor.
 */
let activeThemeValue: Theme | null = null;

/** The theme applyTheme() was last given; Classic until it has been called. */
export function activeTheme(): Theme {
  return activeThemeValue ?? themeById('classic');
}

/** Fill UI_THEME from a resolved SDK theme. Call before building the UI. */
export function applyTheme(theme: Theme): void {
  activeThemeValue = theme;
  const t = theme.tokens;

  UI_THEME.topBar = { fg: t.barInk, bg: t.bar, item: { fg: t.dim }, selected: { fg: t.barInk } };
  UI_THEME.statusBar = { fg: t.barInk, bg: t.bar };
  UI_THEME.windowBorder = { fg: t.chrome };
  UI_THEME.windowBg = t.ground;
  UI_THEME.ink = t.ink;
  UI_THEME.dim = t.dim;
  UI_THEME.accent = t.accent;
  UI_THEME.accentAlt = t.accentAlt;
  UI_THEME.highlightBg = t.selectionBg;
  UI_THEME.highlightInk = t.selectionInk;
  UI_THEME.warning = t.warn;
  UI_THEME.ok = t.ok;
  UI_THEME.error = t.alert;
  UI_THEME.rail = theme.rail ?? '';

  // The action buttons follow the theme as well - except the UNO row, whose
  // colours ARE the game (a red card is red in every theme).
  ACTION_BUTTON_STYLES.fold.base = { fg: t.ink, bg: t.alert };
  ACTION_BUTTON_STYLES.fold.focus = { fg: t.ink, bg: t.accent };
  ACTION_BUTTON_STYLES.check.base = { fg: t.ground, bg: t.ok };
  ACTION_BUTTON_STYLES.call.base = { fg: t.ground, bg: t.dim };
  ACTION_BUTTON_STYLES.raise.base = { fg: t.barInk, bg: t.bar };
  ACTION_BUTTON_STYLES.raise.focus = { fg: t.ink, bg: t.accent };
  ACTION_BUTTON_STYLES.quit.base = { fg: t.ink, bg: t.alert };
  ACTION_BUTTON_STYLES.quit.focus = { fg: t.ink, bg: t.accent };
}

export type ButtonStyleSet = {
  base: Colors;
  hover: Colors;
  focus: Colors;
  active: Colors;
};

export const ACTION_BUTTON_STYLES: Record<ActionButtonKey, ButtonStyleSet> = {
  fold: {
    base: { fg: 'white', bg: UI_THEME.error },
    hover: { fg: 'white', bg: 'light-red' },
    focus: { fg: 'white', bg: 'yellow' },
    active: { fg: 'white', bg: 'red' },
  },
  check: {
    base: { fg: 'black', bg: UI_THEME.ok },
    hover: { fg: 'black', bg: 'light-green' },
    focus: { fg: 'black', bg: 'green' },
    active: { fg: 'black', bg: 'lime' },
  },
  call: {
    base: { fg: 'black', bg: 'gray' },
    hover: { fg: 'black', bg: 'white' },
    focus: { fg: 'black', bg: 'white' },
    active: { fg: 'black', bg: 'light-white' },
  },
  raise: {
    base: { fg: 'white', bg: 'blue' },
    hover: { fg: 'white', bg: 'light-blue' },
    focus: { fg: 'white', bg: 'cyan' },
    active: { fg: 'white', bg: 'blue' },
  },
  quit: {
    base: { fg: 'white', bg: UI_THEME.error },
    hover: { fg: 'white', bg: 'light-red' },
    focus: { fg: 'white', bg: 'yellow' },
    active: { fg: 'white', bg: 'red' },
  },
};

export const ACTION_BUTTON_ORDER: ActionButtonKey[] = ['fold', 'check', 'call', 'raise', 'quit'];

export const UNO_ACTION_BUTTON_STYLES: Record<UnoActionButtonKey, ButtonStyleSet> = {
  play: {
    base: { fg: 'black', bg: 'green' },
    hover: { fg: 'black', bg: 'light-green' },
    focus: { fg: 'black', bg: 'lime' },
    active: { fg: 'black', bg: 'green' },
  },
  draw: {
    base: { fg: 'white', bg: 'blue' },
    hover: { fg: 'white', bg: 'light-blue' },
    focus: { fg: 'white', bg: 'cyan' },
    active: { fg: 'white', bg: 'blue' },
  },
  uno: {
    base: { fg: 'black', bg: 'yellow' },
    hover: { fg: 'black', bg: 'light-yellow' },
    focus: { fg: 'black', bg: 'white' },
    active: { fg: 'black', bg: 'yellow' },
  },
  challenge: {
    base: { fg: 'white', bg: 'red' },
    hover: { fg: 'white', bg: 'light-red' },
    focus: { fg: 'white', bg: 'yellow' },
    active: { fg: 'white', bg: 'red' },
  },
  quit: {
    base: { fg: 'white', bg: UI_THEME.error },
    hover: { fg: 'white', bg: 'light-red' },
    focus: { fg: 'white', bg: 'yellow' },
    active: { fg: 'white', bg: 'red' },
  },
};

export const UNO_ACTION_BUTTON_ORDER: UnoActionButtonKey[] = ['play', 'draw', 'uno', 'challenge', 'quit'];

export const GAME_CATALOG: GameDefinition[] = [
  {
    id: 'holdem',
    name: "Texas Hold'em",
    description: 'No-limit Hold\'em using the SDK PokerEngine.',
    minPlayers: 2,
    maxPlayers: 6,
    stakes: [
      { label: '5/10', smallBlind: 5, bigBlind: 10, buyIn: 500 },
      { label: '10/20', smallBlind: 10, bigBlind: 20, buyIn: 1000 },
      { label: '25/50', smallBlind: 25, bigBlind: 50, buyIn: 2500 },
    ],
    enabled: true,
  },
  {
    id: 'blackjack',
    name: 'Blackjack',
    description: 'Dealer showdown, coming soon.',
    minPlayers: 1,
    maxPlayers: 5,
    stakes: [{ label: '10', smallBlind: 0, bigBlind: 10, buyIn: 200 }],
    enabled: false,
  },
  {
    id: 'uno',
    name: 'UNO',
    description: 'Classic UNO with ASCII cards. First to 500 points wins.',
    minPlayers: 2,
    maxPlayers: 4,
    stakes: [
      { label: '10', smallBlind: 0, bigBlind: 10, buyIn: 200 },
      { label: '25', smallBlind: 0, bigBlind: 25, buyIn: 500 },
      { label: '50', smallBlind: 0, bigBlind: 50, buyIn: 1000 },
    ],
    enabled: true,
  },
  {
    id: 'uno-house',
    name: 'UNO: House Rules',
    description: 'UNO with customizable house rules. Create your own chaos!',
    minPlayers: 2,
    maxPlayers: 4,
    stakes: [
      { label: '10', smallBlind: 0, bigBlind: 10, buyIn: 200 },
      { label: '25', smallBlind: 0, bigBlind: 25, buyIn: 500 },
    ],
    enabled: false,  // Enable after House Rules implementation
  },
];

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first_hand',
    name: 'First Shuffle',
    description: 'Play your first hand.',
    reward: 25,
  },
  {
    id: 'first_win',
    name: 'First Win',
    description: 'Win a hand.',
    reward: 50,
  },
  {
    id: 'hot_streak',
    name: 'Hot Streak',
    description: 'Win 3 hands in a row.',
    reward: 100,
  },
  {
    id: 'big_pot',
    name: 'Big Pot',
    description: 'Win a pot of 500+ chips.',
    reward: 150,
  },
  {
    id: 'grinder',
    name: 'Grinder',
    description: 'Play 25 hands.',
    reward: 200,
  },
];

export const LOBBY_BULLETINS: BulletinEntry[] = [
  {
    number: WEEKLY_BULLETIN_NUMBER,
    title: 'Card Lobby Weekly Leaders',
    description: 'Top 10 chip winners from the lobby.',
  },
];

export const LOBBY_KEY = 'lobby';
export const PROFILES_KEY = 'profiles';
