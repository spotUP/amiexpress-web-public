/**
 * Card Lobby - Constants and Configuration
 * All constants, themes, catalogs, and configuration data
 */

import type { Colors } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/core/types';
import type { GameDefinition, AchievementDefinition, BulletinEntry } from './types';

export type ActionButtonKey = 'fold' | 'check' | 'call' | 'raise' | 'quit';

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

export const UI_THEME = {
  topBar: { fg: 'gray', bg: 'blue', item: { fg: 'gray' }, selected: { fg: 'white' } },
  statusBar: { fg: 'white', bg: 'blue' },
  windowBorder: { fg: 'cyan' },
  windowBg: 'black',
  accent: 'cyan',
  highlightBg: 'lightcyan',
  warning: 'yellow',
  ok: 'green',
  error: 'red',
};

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
    description: 'Classic UNO with ASCII cards, coming soon.',
    minPlayers: 2,
    maxPlayers: 4,
    stakes: [{ label: '10', smallBlind: 0, bigBlind: 10, buyIn: 200 }],
    enabled: false,
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
