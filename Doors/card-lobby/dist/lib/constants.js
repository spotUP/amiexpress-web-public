"use strict";
/**
 * Card Lobby - Constants and Configuration
 * All constants, themes, catalogs, and configuration data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROFILES_KEY = exports.LOBBY_KEY = exports.LOBBY_BULLETINS = exports.ACHIEVEMENTS = exports.GAME_CATALOG = exports.ACTION_BUTTON_ORDER = exports.ACTION_BUTTON_STYLES = exports.UI_THEME = exports.ANSI_TAGS = exports.PokerAction = exports.BOT_NAMES = exports.MAX_ACTIVITY_EVENTS = exports.REFRESH_INTERVAL_MS = exports.WEEKLY_BULLETIN_NUMBER = exports.WIN_REWARD = exports.ACTIVITY_REWARD = exports.ENTRY_FEE_RATE = exports.WEEK_MS = exports.DAILY_COOLDOWN_MS = exports.DAILY_BONUS = exports.STARTING_CHIPS = exports.CHIP_NAME = void 0;
exports.CHIP_NAME = 'BBS Chips';
exports.STARTING_CHIPS = 1000;
exports.DAILY_BONUS = 200;
exports.DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
exports.WEEK_MS = 7 * 24 * 60 * 60 * 1000;
exports.ENTRY_FEE_RATE = 0.02;
exports.ACTIVITY_REWARD = 5;
exports.WIN_REWARD = 10;
exports.WEEKLY_BULLETIN_NUMBER = 20;
exports.REFRESH_INTERVAL_MS = 5000;
exports.MAX_ACTIVITY_EVENTS = 200;
exports.BOT_NAMES = [
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
exports.PokerAction = {
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
};
exports.ANSI_TAGS = {
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
exports.UI_THEME = {
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
exports.ACTION_BUTTON_STYLES = {
    fold: {
        base: { fg: 'white', bg: exports.UI_THEME.error },
        hover: { fg: 'white', bg: 'light-red' },
        focus: { fg: 'white', bg: 'yellow' },
        active: { fg: 'white', bg: 'red' },
    },
    check: {
        base: { fg: 'black', bg: exports.UI_THEME.ok },
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
        base: { fg: 'white', bg: exports.UI_THEME.error },
        hover: { fg: 'white', bg: 'light-red' },
        focus: { fg: 'white', bg: 'yellow' },
        active: { fg: 'white', bg: 'red' },
    },
};
exports.ACTION_BUTTON_ORDER = ['fold', 'check', 'call', 'raise', 'quit'];
exports.GAME_CATALOG = [
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
exports.ACHIEVEMENTS = [
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
exports.LOBBY_BULLETINS = [
    {
        number: exports.WEEKLY_BULLETIN_NUMBER,
        title: 'Card Lobby Weekly Leaders',
        description: 'Top 10 chip winners from the lobby.',
    },
];
exports.LOBBY_KEY = 'lobby';
exports.PROFILES_KEY = 'profiles';
