"use strict";
/**
 * Card Lobby - Utility Functions
 * Helper functions for rendering, formatting, and calculations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWeeklyBulletin = exports.getPlayerBet = exports.getCurrentBet = exports.calculateRake = exports.calculateEntryFee = exports.buildBotName = exports.buildBotId = exports.isBotId = exports.isBotPlayer = exports.getGameById = exports.formatChips = exports.formatAge = exports.pad = exports.safeNumber = exports.initProfile = exports.initStatsBucket = exports.initLobbyState = exports.renderCardLines = exports.mergeColumns = exports.padColumn = exports.appendReset = exports.sliceVisible = exports.visibleWidth = exports.stripAnsiCodes = exports.stripBlessedTags = exports.ansiToBlessedTags = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const constants_1 = require("./constants");
const cardEngine = new bbs_door_sdk_1.CardEngine();
const ansiToBlessedTags = (value) => value.replace(/\x1b\[([0-9;]+)m/g, (_match, codes) => {
    const parts = String(codes).split(';');
    return parts.map((code) => constants_1.ANSI_TAGS[code] ?? '').join('');
});
exports.ansiToBlessedTags = ansiToBlessedTags;
const stripBlessedTags = (value) => value.replace(/\{[^}]*\}/g, '');
exports.stripBlessedTags = stripBlessedTags;
const stripAnsiCodes = (value) => value.replace(/\x1b\[[0-9;]*m/g, '');
exports.stripAnsiCodes = stripAnsiCodes;
const visibleWidth = (value) => (0, exports.stripAnsiCodes)((0, exports.stripBlessedTags)(value)).length;
exports.visibleWidth = visibleWidth;
const sliceVisible = (value, width) => {
    if (width <= 0)
        return '';
    let visible = 0;
    let i = 0;
    let out = '';
    while (i < value.length && visible < width) {
        const ch = value[i];
        if (ch === '\x1b' && value[i + 1] === '[') {
            let end = i + 2;
            while (end < value.length && !/[mK]/.test(value[end])) {
                end += 1;
            }
            if (end < value.length) {
                out += value.slice(i, end + 1);
                i = end + 1;
                continue;
            }
        }
        if (ch === '{') {
            const close = value.indexOf('}', i);
            if (close !== -1) {
                out += value.slice(i, close + 1);
                i = close + 1;
                continue;
            }
        }
        out += ch;
        i += 1;
        visible += 1;
    }
    return out;
};
exports.sliceVisible = sliceVisible;
const appendReset = (value) => {
    let out = value;
    if (/\{[^}]*\}/.test(value) && !/\{\/\}$/.test(value)) {
        out += '{/}';
    }
    if (/\x1b\[[0-9;]*m/.test(value) && !/\x1b\[0m$/.test(value)) {
        out += '\x1b[0m';
    }
    return out;
};
exports.appendReset = appendReset;
const padColumn = (value, width) => {
    const length = (0, exports.visibleWidth)(value);
    if (length >= width) {
        return (0, exports.appendReset)((0, exports.sliceVisible)(value, width));
    }
    return `${(0, exports.appendReset)(value)}${' '.repeat(width - length)}`;
};
exports.padColumn = padColumn;
const mergeColumns = (left, right, leftWidth, rightWidth, gap) => {
    const rows = Math.max(left.length, right.length);
    const spacer = ' '.repeat(gap);
    const merged = [];
    for (let i = 0; i < rows; i += 1) {
        const leftLine = left[i] ?? '';
        const rightLine = right[i] ?? '';
        merged.push(`${(0, exports.padColumn)(leftLine, leftWidth)}${spacer}${(0, exports.padColumn)(rightLine, rightWidth)}`);
    }
    return merged;
};
exports.mergeColumns = mergeColumns;
const renderCardLines = (cards, options) => cardEngine.renderHandLines(cards, options).map(exports.ansiToBlessedTags);
exports.renderCardLines = renderCardLines;
const initLobbyState = () => ({
    tables: [],
    lastTableId: 0,
    lastWeeklyReset: Date.now(),
    lastDailyReset: Date.now(),
    lastBulletinAt: 0,
    events: [],
});
exports.initLobbyState = initLobbyState;
const initStatsBucket = () => ({
    hands: 0,
    wins: 0,
    net: 0,
});
exports.initStatsBucket = initStatsBucket;
const initProfile = (session) => ({
    userId: String(session.user.id),
    username: session.user.username,
    wallet: {
        chips: constants_1.STARTING_CHIPS,
        lifetimeEarned: constants_1.STARTING_CHIPS,
        lifetimeSpent: 0,
        lastDailyGrant: 0,
    },
    stats: {
        handsPlayed: 0,
        wins: 0,
        losses: 0,
        net: 0,
        biggestPot: 0,
        winStreak: 0,
        bestWinStreak: 0,
        daily: (0, exports.initStatsBucket)(),
        weekly: (0, exports.initStatsBucket)(),
    },
    achievements: [],
    status: 'lobby',
});
exports.initProfile = initProfile;
const safeNumber = (value) => {
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const num = Number(trimmed);
    if (!Number.isFinite(num))
        return null;
    return Math.floor(num);
};
exports.safeNumber = safeNumber;
const pad = (value, width) => {
    if (value.length >= width)
        return value.slice(0, width);
    return value + ' '.repeat(width - value.length);
};
exports.pad = pad;
const formatAge = (timestamp) => {
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (minutes < 60)
        return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
};
exports.formatAge = formatAge;
const formatChips = (value) => {
    const sign = value >= 0 ? '+' : '-';
    return `${sign}${Math.abs(value)}`;
};
exports.formatChips = formatChips;
const getGameById = (id) => {
    return constants_1.GAME_CATALOG.find((game) => game.id === id);
};
exports.getGameById = getGameById;
const isBotPlayer = (player) => {
    return Boolean(player.isBot || player.userId.startsWith('cpu:'));
};
exports.isBotPlayer = isBotPlayer;
const isBotId = (playerId) => {
    return Boolean(playerId && playerId.startsWith('cpu:'));
};
exports.isBotId = isBotId;
const buildBotId = (tableId, seat) => {
    return `cpu:${tableId}:${seat}`;
};
exports.buildBotId = buildBotId;
const buildBotName = (seat) => {
    const base = constants_1.BOT_NAMES[seat % constants_1.BOT_NAMES.length];
    return `${base}-${seat + 1}`;
};
exports.buildBotName = buildBotName;
const calculateEntryFee = (buyIn) => {
    return Math.max(1, Math.floor(buyIn * constants_1.ENTRY_FEE_RATE));
};
exports.calculateEntryFee = calculateEntryFee;
const calculateRake = (bigBlind) => {
    if (bigBlind >= 50) {
        return { percent: 5, cap: 20 };
    }
    if (bigBlind >= 20) {
        return { percent: 3, cap: 12 };
    }
    return { percent: 2, cap: 8 };
};
exports.calculateRake = calculateRake;
const getCurrentBet = (engine) => {
    return Array.from(engine.state.currentBets.values()).reduce((max, value) => Math.max(max, value), 0);
};
exports.getCurrentBet = getCurrentBet;
const getPlayerBet = (engine, seat) => {
    return engine.state.currentBets.get(seat) ?? 0;
};
exports.getPlayerBet = getPlayerBet;
const buildWeeklyBulletin = (state, data) => {
    const now = new Date();
    const rows = Object.values(data)
        .map((profile) => ({
        username: profile.username,
        wins: profile.stats.weekly.wins,
        hands: profile.stats.weekly.hands,
        net: profile.stats.weekly.net,
    }))
        .filter((row) => row.hands > 0 || row.wins > 0)
        .sort((a, b) => b.net - a.net)
        .slice(0, 10);
    const lines = [];
    lines.push('CARD LOBBY WEEKLY LEADERS');
    lines.push('==============================');
    lines.push(`Updated: ${now.toISOString().slice(0, 19).replace('T', ' ')}`);
    lines.push('');
    lines.push('RANK NAME           WINS  HANDS  NET');
    lines.push('---- -------------- ----- ------ -----');
    rows.forEach((row, index) => {
        const line = (0, exports.pad)(String(index + 1), 4) +
            ' ' +
            (0, exports.pad)(row.username, 14) +
            ' ' +
            (0, exports.pad)(String(row.wins), 5) +
            ' ' +
            (0, exports.pad)(String(row.hands), 6) +
            ' ' +
            (0, exports.pad)((0, exports.formatChips)(row.net), 5);
        lines.push(line);
    });
    if (rows.length === 0) {
        lines.push('No hands played yet this week.');
    }
    lines.push('');
    lines.push('Generated by Card Lobby');
    return lines.join('\r\n') + '\r\n';
};
exports.buildWeeklyBulletin = buildWeeklyBulletin;
