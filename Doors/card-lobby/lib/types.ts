/**
 * Card Lobby - Type Definitions
 * All interfaces and types for the card lobby system
 */

import type { Snapshot } from '@amiexpress/bbs-door-sdk';

export interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params: string[];
}
export type PlayerRole = 'player' | 'observer';
export type TableStatus = 'open' | 'in-progress';
export type LeaderboardMode = 'daily' | 'weekly' | 'all';

export interface Wallet {
  chips: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  lastDailyGrant: number;
}

export interface StatBucket {
  hands: number;
  wins: number;
  net: number;
}

export interface PlayerStats {
  handsPlayed: number;
  wins: number;
  losses: number;
  net: number;
  biggestPot: number;
  winStreak: number;
  bestWinStreak: number;
  daily: StatBucket;
  weekly: StatBucket;
}

export interface PlayerProfile {
  userId: string;
  username: string;
  wallet: Wallet;
  stats: PlayerStats;
  achievements: string[];
  status: 'lobby' | 'table' | 'away';
  currentTableId?: number;
}

export interface TablePlayer {
  userId: string;
  username: string;
  seat: number;
  stack: number;
  buyIn: number;
  role: PlayerRole;
  joinedAt: number;
  isBot?: boolean;
}

export interface TableObserver {
  userId: string;
  username: string;
  joinedAt: number;
}

export interface LastHandSummary {
  board: string[];
  hands: Record<string, string[]>;
  pot: number;
  winners: Array<{ userId: string; username: string; amount: number }>;
  playedAt: number;
}

export interface TableHandState {
  snapshot: Snapshot;
  beforeStacks: Record<string, number>;
  startedAt: number;
  updatedAt: number;
}

export interface LobbyTable {
  id: number;
  gameId: string;
  gameName: string;
  stakesLabel: string;
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  entryFee: number;
  minPlayers: number;
  maxPlayers: number;
  status: TableStatus;
  createdAt: number;
  updatedAt: number;
  hostUserId: string;
  autoStart: boolean;
  isPrivate: boolean;
  inviteCode?: string;
  players: TablePlayer[];
  observers: TableObserver[];
  lastHand?: LastHandSummary;
  hand?: TableHandState;
}

export interface LobbyEvent {
  message: string;
  createdAt: number;
}

export interface LobbyFilters {
  gameId: string | null;
  openSeatsOnly: boolean;
}

export interface LobbyState {
  tables: LobbyTable[];
  lastTableId: number;
  lastWeeklyReset: number;
  lastDailyReset: number;
  lastBulletinAt: number;
  events: LobbyEvent[];
}

export interface GameStake {
  label: string;
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
}

export interface GameDefinition {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  stakes: GameStake[];
  enabled: boolean;
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  reward: number;
}

export interface BulletinEntry {
  number: number;
  title: string;
  description: string;
}
