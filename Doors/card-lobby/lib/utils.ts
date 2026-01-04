/**
 * Card Lobby - Utility Functions
 * Helper functions for rendering, formatting, and calculations
 */

import { CardEngine, PokerEngine, pokerCardsToCards } from '@amiexpress/bbs-door-sdk';
import type { DoorSession, LobbyState, PlayerProfile, StatBucket, TablePlayer, GameDefinition } from './types';
import {
  ANSI_TAGS,
  STARTING_CHIPS,
  BOT_NAMES,
  ENTRY_FEE_RATE,
  GAME_CATALOG,
  LOBBY_BULLETINS,
  WEEKLY_BULLETIN_NUMBER,
} from './constants';

const cardEngine = new CardEngine();

export const ansiToBlessedTags = (value: string): string =>
  value.replace(/\x1b\[([0-9;]+)m/g, (_match, codes) => {
    const parts = String(codes).split(';');
    return parts.map((code) => ANSI_TAGS[code] ?? '').join('');
  });

export const stripBlessedTags = (value: string): string => value.replace(/\{[^}]*\}/g, '');
export const stripAnsiCodes = (value: string): string => value.replace(/\x1b\[[0-9;]*m/g, '');
export const visibleWidth = (value: string): number => stripAnsiCodes(stripBlessedTags(value)).length;

export const sliceVisible = (value: string, width: number): string => {
  if (width <= 0) return '';
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

export const appendReset = (value: string): string => {
  let out = value;
  if (/\{[^}]*\}/.test(value) && !/\{\/\}$/.test(value)) {
    out += '{/}';
  }
  if (/\x1b\[[0-9;]*m/.test(value) && !/\x1b\[0m$/.test(value)) {
    out += '\x1b[0m';
  }
  return out;
};

export const padColumn = (value: string, width: number): string => {
  const length = visibleWidth(value);
  if (length >= width) {
    return appendReset(sliceVisible(value, width));
  }
  return `${appendReset(value)}${' '.repeat(width - length)}`;
};

export const mergeColumns = (left: string[], right: string[], leftWidth: number, rightWidth: number, gap: number): string[] => {
  const rows = Math.max(left.length, right.length);
  const spacer = ' '.repeat(gap);
  const merged: string[] = [];
  for (let i = 0; i < rows; i += 1) {
    const leftLine = left[i] ?? '';
    const rightLine = right[i] ?? '';
    merged.push(`${padColumn(leftLine, leftWidth)}${spacer}${padColumn(rightLine, rightWidth)}`);
  }
  return merged;
};

export const renderCardLines = (
  cards: ReturnType<typeof pokerCardsToCards>,
  options: { layout?: string; size?: string; face?: 'front' | 'back'; backStyle?: string },
) => cardEngine.renderHandLines(cards, options as any).map(ansiToBlessedTags);

export const initLobbyState = (): LobbyState => ({
  tables: [],
  lastTableId: 0,
  lastWeeklyReset: Date.now(),
  lastDailyReset: Date.now(),
  lastBulletinAt: 0,
  events: [],
});

export const initStatsBucket = (): StatBucket => ({
  hands: 0,
  wins: 0,
  net: 0,
});

export const initProfile = (session: DoorSession): PlayerProfile => ({
  userId: String(session.user.id),
  username: session.user.username,
  wallet: {
    chips: STARTING_CHIPS,
    lifetimeEarned: STARTING_CHIPS,
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
    daily: initStatsBucket(),
    weekly: initStatsBucket(),
  },
  achievements: [],
  status: 'lobby',
});

export const safeNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return null;
  return Math.floor(num);
};

export const pad = (value: string, width: number): string => {
  if (value.length >= width) return value.slice(0, width);
  return value + ' '.repeat(width - value.length);
};

export const formatAge = (timestamp: number): string => {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

export const formatChips = (value: number): string => {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${Math.abs(value)}`;
};

export const getGameById = (id: string): GameDefinition | undefined => {
  return GAME_CATALOG.find((game) => game.id === id);
};

export const isBotPlayer = (player: TablePlayer): boolean => {
  return Boolean(player.isBot || player.userId.startsWith('cpu:'));
};

export const isBotId = (playerId?: string | null): boolean => {
  return Boolean(playerId && playerId.startsWith('cpu:'));
};

export const buildBotId = (tableId: number, seat: number): string => {
  return `cpu:${tableId}:${seat}`;
};

export const buildBotName = (seat: number): string => {
  const base = BOT_NAMES[seat % BOT_NAMES.length];
  return `${base}-${seat + 1}`;
};

export const calculateEntryFee = (buyIn: number): number => {
  return Math.max(1, Math.floor(buyIn * ENTRY_FEE_RATE));
};

export const calculateRake = (bigBlind: number): { percent: number; cap: number } => {
  if (bigBlind >= 50) {
    return { percent: 5, cap: 20 };
  }
  if (bigBlind >= 20) {
    return { percent: 3, cap: 12 };
  }
  return { percent: 2, cap: 8 };
};

export const getCurrentBet = (engine: PokerEngine): number => {
  return Array.from(engine.state.currentBets.values()).reduce((max, value) => Math.max(max, value), 0);
};

export const getPlayerBet = (engine: PokerEngine, seat: number): number => {
  return engine.state.currentBets.get(seat) ?? 0;
};

export const buildWeeklyBulletin = (state: LobbyState, data: Record<string, PlayerProfile>): string => {
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

  const lines: string[] = [];
  lines.push('CARD LOBBY WEEKLY LEADERS');
  lines.push('==============================');
  lines.push(`Updated: ${now.toISOString().slice(0, 19).replace('T', ' ')}`);
  lines.push('');
  lines.push('RANK NAME           WINS  HANDS  NET');
  lines.push('---- -------------- ----- ------ -----');

  rows.forEach((row, index) => {
    const line =
      pad(String(index + 1), 4) +
      ' ' +
      pad(row.username, 14) +
      ' ' +
      pad(String(row.wins), 5) +
      ' ' +
      pad(String(row.hands), 6) +
      ' ' +
      pad(formatChips(row.net), 5);
    lines.push(line);
  });

  if (rows.length === 0) {
    lines.push('No hands played yet this week.');
  }

  lines.push('');
  lines.push('Generated by Card Lobby');

  return lines.join('\r\n') + '\r\n';
};
