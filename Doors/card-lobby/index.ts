// @ts-nocheck
/**
 * Card Lobby - Neo-Blessed Desktop UI
 *
 * Full-featured multi-window lobby for card games with PokerEngine support.
 */

import blessed, {
  Screen,
  Box,
  List,
  Button,
  Log,
  Listbar,
  Prompt,
  Question,
  ScrollableText,
  type MouseEvent,
} from '../../sdk/engines/ui/blessed';
import { createBox, createList, createButton, createText, createLog } from '../../sdk/utils/blessed-helpers';
import {
  CardEngine,
  PokerEngine,
  ActionType,
  pokerCardsToCards,
  Storage,
} from '../../sdk';
import type { Snapshot } from '../../sdk';
import type { Colors } from '../../sdk/engines/ui/blessed/core/types';

interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params: string[];
}

export const metadata = {
  name: 'Card Lobby',
  version: '2.0.0',
  description: 'Desktop-style card lobby with PokerEngine tables',
  author: 'AmiExpress Team',
  command: 'CARDLOBBY',
};

const CHIP_NAME = 'BBS Chips';
const STARTING_CHIPS = 1000;
const DAILY_BONUS = 200;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ENTRY_FEE_RATE = 0.02;
const ACTIVITY_REWARD = 5;
const WIN_REWARD = 10;
const WEEKLY_BULLETIN_NUMBER = 20;
const REFRESH_INTERVAL_MS = 5000;
const MAX_ACTIVITY_EVENTS = 200;

const BOT_NAMES = [
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

const cardEngine = new CardEngine();
const PokerAction = ActionType ?? {
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

const ANSI_TAGS: Record<string, string> = {
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

const ansiToBlessedTags = (value: string): string =>
  value.replace(/\x1b\[([0-9;]+)m/g, (_match, codes) => {
    const parts = String(codes).split(';');
    return parts.map((code) => ANSI_TAGS[code] ?? '').join('');
  });

const stripBlessedTags = (value: string): string => value.replace(/\{[^}]*\}/g, '');
const stripAnsiCodes = (value: string): string => value.replace(/\x1b\[[0-9;]*m/g, '');
const visibleWidth = (value: string): number => stripAnsiCodes(stripBlessedTags(value)).length;
const sliceVisible = (value: string, width: number): string => {
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
const appendReset = (value: string): string => {
  let out = value;
  if (/\{[^}]*\}/.test(value) && !/\{\/\}$/.test(value)) {
    out += '{/}';
  }
  if (/\x1b\[[0-9;]*m/.test(value) && !/\x1b\[0m$/.test(value)) {
    out += '\x1b[0m';
  }
  return out;
};
const padColumn = (value: string, width: number): string => {
  const length = visibleWidth(value);
  if (length >= width) {
    return appendReset(sliceVisible(value, width));
  }
  return `${appendReset(value)}${' '.repeat(width - length)}`;
};

const mergeColumns = (left: string[], right: string[], leftWidth: number, rightWidth: number, gap: number): string[] => {
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

const renderCardLines = (
  cards: ReturnType<typeof pokerCardsToCards>,
  options: { layout?: string; size?: string; face?: 'front' | 'back'; backStyle?: string },
) => cardEngine.renderHandLines(cards, options as any).map(ansiToBlessedTags);

const UI_THEME = {
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

type ActionButtonKey = 'fold' | 'check' | 'call' | 'raise' | 'quit';
type ButtonStyleSet = {
  base: Colors;
  hover: Colors;
  focus: Colors;
  active: Colors;
};

const ACTION_BUTTON_STYLES: Record<ActionButtonKey, ButtonStyleSet> = {
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

const ACTION_BUTTON_ORDER: ActionButtonKey[] = ['fold', 'check', 'call', 'raise', 'quit'];

const GAME_CATALOG: GameDefinition[] = [
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

const ACHIEVEMENTS: AchievementDefinition[] = [
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

const LOBBY_BULLETINS: BulletinEntry[] = [
  {
    number: WEEKLY_BULLETIN_NUMBER,
    title: 'Card Lobby Weekly Leaders',
    description: 'Top 10 chip winners from the lobby.',
  },
];

const LOBBY_KEY = 'lobby';
const PROFILES_KEY = 'profiles';

interface Wallet {
  chips: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  lastDailyGrant: number;
}

interface StatBucket {
  hands: number;
  wins: number;
  net: number;
}

interface PlayerStats {
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

interface PlayerProfile {
  userId: string;
  username: string;
  wallet: Wallet;
  stats: PlayerStats;
  achievements: string[];
  status: 'lobby' | 'table' | 'away';
  currentTableId?: number;
}

interface TablePlayer {
  userId: string;
  username: string;
  seat: number;
  stack: number;
  buyIn: number;
  role: PlayerRole;
  joinedAt: number;
  isBot?: boolean;
}

interface TableObserver {
  userId: string;
  username: string;
  joinedAt: number;
}

interface LastHandSummary {
  board: string[];
  hands: Record<string, string[]>;
  pot: number;
  winners: Array<{ userId: string; username: string; amount: number }>;
  playedAt: number;
}

interface TableHandState {
  snapshot: Snapshot;
  beforeStacks: Record<string, number>;
  startedAt: number;
  updatedAt: number;
}

interface LobbyTable {
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

interface LobbyEvent {
  message: string;
  createdAt: number;
}

interface LobbyFilters {
  gameId: string | null;
  openSeatsOnly: boolean;
}

interface LobbyState {
  tables: LobbyTable[];
  lastTableId: number;
  lastWeeklyReset: number;
  lastDailyReset: number;
  lastBulletinAt: number;
  events: LobbyEvent[];
}

interface GameStake {
  label: string;
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
}

interface GameDefinition {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  stakes: GameStake[];
  enabled: boolean;
}

interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  reward: number;
}

interface BulletinEntry {
  number: number;
  title: string;
  description: string;
}

type PlayerRole = 'player' | 'observer';
type TableStatus = 'open' | 'in-progress';
type LeaderboardMode = 'daily' | 'weekly' | 'all';


const initLobbyState = (): LobbyState => ({
  tables: [],
  lastTableId: 0,
  lastWeeklyReset: Date.now(),
  lastDailyReset: Date.now(),
  lastBulletinAt: 0,
  events: [],
});

const initStatsBucket = (): StatBucket => ({
  hands: 0,
  wins: 0,
  net: 0,
});

const initProfile = (session: DoorSession): PlayerProfile => ({
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

const safeNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return null;
  return Math.floor(num);
};

const pad = (value: string, width: number): string => {
  if (value.length >= width) return value.slice(0, width);
  return value + ' '.repeat(width - value.length);
};

const formatAge = (timestamp: number): string => {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const formatChips = (value: number): string => {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${Math.abs(value)}`;
};

const getGameById = (id: string): GameDefinition | undefined => {
  return GAME_CATALOG.find((game) => game.id === id);
};

const isBotPlayer = (player: TablePlayer): boolean => {
  return Boolean(player.isBot || player.userId.startsWith('cpu:'));
};

const isBotId = (playerId?: string | null): boolean => {
  return Boolean(playerId && playerId.startsWith('cpu:'));
};

const buildBotId = (tableId: number, seat: number): string => {
  return `cpu:${tableId}:${seat}`;
};

const buildBotName = (seat: number): string => {
  const base = BOT_NAMES[seat % BOT_NAMES.length];
  return `${base}-${seat + 1}`;
};

const calculateEntryFee = (buyIn: number): number => {
  return Math.max(1, Math.floor(buyIn * ENTRY_FEE_RATE));
};

const calculateRake = (bigBlind: number): { percent: number; cap: number } => {
  if (bigBlind >= 50) {
    return { percent: 5, cap: 20 };
  }
  if (bigBlind >= 20) {
    return { percent: 3, cap: 12 };
  }
  return { percent: 2, cap: 8 };
};

const getCurrentBet = (engine: PokerEngine): number => {
  return Array.from(engine.state.currentBets.values()).reduce((max, value) => Math.max(max, value), 0);
};

const getPlayerBet = (engine: PokerEngine, seat: number): number => {
  return engine.state.currentBets.get(seat) ?? 0;
};

const buildWeeklyBulletin = (state: LobbyState, data: Record<string, PlayerProfile>): string => {
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

const buildBullHelpContent = (): string => {
  const lines: string[] = [];
  lines.push('CARD LOBBY BULLETINS');
  lines.push('---------------------');
  lines.push('');
  LOBBY_BULLETINS.forEach((entry) => {
    const number = `#${entry.number}`;
    lines.push(`${pad(number, 5)} ${entry.title}`);
    lines.push(`     ${entry.description}`);
  });
  lines.push('');
  lines.push('Use the Card Lobby bulletin window to read bulletin numbers.');
  return lines.join('\r\n') + '\r\n';
};

class CardLobbyApp {
  private session: DoorSession;
  private screen!: Screen;
  private desktop!: Box;
  private topBar!: Listbar;
  private topInfoBar!: Box;
  private statusBar!: Box;
  private logWindow!: Log;
  private lobbyWindow!: Box;
  private tableWindow!: Box;
  private lobbyList!: List;
  private lobbyActions!: Listbar;
  private tableActions!: Box;
  private tableContent!: ScrollableText;
  private flopPanel!: Box;
  private flopContent!: Box;
  private playersPanel!: Box;
  private playersContent!: ScrollableText;
  private handPanel!: Box;
  private handContent!: Box;
  private activityPanel!: Box;
  private activityContent!: Log;
  private actionButtons!: {
    fold: Button;
    check: Button;
    call: Button;
    raise: Button;
    quit: Button;
  };
  private overlayShade!: Box;
  private viewMode: 'lobby' | 'table' = 'lobby';
  private layout: {
    width: number;
    height: number;
    topOffset: number;
    statusHeight: number;
    logHeight: number;
    mainHeight: number;
    tableHeight: number;
    leftWidth: number;
    rightWidth: number;
  } | null = null;
  private autoDealInProgress = false;
  private dealAnimationInProgress = false;
  private lastAnimatedHandStartedAt: number | null = null;

  private lobby: LobbyState | null = null;
  private profiles: Record<string, PlayerProfile> = {};
  private currentProfile: PlayerProfile | null = null;
  private lobbyFilters: LobbyFilters = { gameId: null, openSeatsOnly: false };
  private leaderboardMode: LeaderboardMode = 'weekly';
  private notices: string[] = [];
  private refreshTimer: NodeJS.Timeout | null = null;
  private tableListMap: number[] = [];
  private selectedTableId: number | null = null;
  private modalActive = false;

  constructor(session: DoorSession) {
    this.session = session;
  }

  async run(): Promise<void> {
    this.setupScreen();
    await this.reloadState();
    await this.writeBullHelpFile();
    await this.writeWeeklyBulletinIfNeeded();
    await this.persistState();

    this.updateAllPanels();
    this.lobbyList.focus();
    this.screen.render();
    this.startRefreshTimer();

    await new Promise<void>((resolve) => {
      this.screen.on('destroy', () => resolve());
    });

    this.cleanup();
  }

  private setupScreen(): void {
    const height = this.session.bbsSession?.screenHeight || 24;

    this.screen = blessed.screen({
      height,
      smartCSR: true,
      dockBorders: true,
      fullUnicode: false,
      title: 'Card Lobby',
      output: (data: string) => this.session.bbs.write(data),
    });

    if (this.session.bbsSession) {
      this.session.bbsSession.mouseEventsEnabled = true;
      this.session.bbsSession.doorInputHandler = (data: string) => {
        if (typeof data === 'string' && data.trim().startsWith('{')) {
          try {
            const payload = JSON.parse(data);
            if (payload?.type?.startsWith('mouse-')) {
              const buttonMap: Record<number, MouseEvent['button']> = {
                0: 'left',
                1: 'middle',
                2: 'right',
              };
              const event: MouseEvent = {
                x: Number(payload.x) || 0,
                y: Number(payload.y) || 0,
                action: 'mousemove',
                button: buttonMap[payload.button] ?? 'left',
                shift: Boolean(payload.shift),
                ctrl: Boolean(payload.ctrl),
                meta: Boolean(payload.alt),
              };

              if (payload.type === 'mouse-click') {
                event.action = 'mousedown';
              } else if (payload.type === 'mouse-up') {
                event.action = 'mouseup';
              } else if (payload.type === 'mouse-wheel') {
                event.action = payload.deltaY < 0 ? 'wheelup' : 'wheeldown';
              } else if (payload.type === 'mouse-drag' || payload.type === 'mouse-hover') {
                event.action = 'mousemove';
              }

              this.screen.program.emit('mouse', event);
              return;
            }
          } catch {
            // Fall through to normal input handling.
          }
        }
        this.screen._handleData(data);
      };
      this.session.bbsSession.doorReconnectHandler = () => {
        this.screen.clear();
        this.screen.render();
      };
    }

    this.screen.enableMouse();

    this.screen.key(['C-c'], () => {
      if (this.modalActive) return;
      this.exitDoor();
    });

    this.screen.key(['q'], () => {
      if (this.modalActive) return;
      this.exitDoor();
    });

    this.screen.key(['tab'], () => {
      if (this.modalActive) return;
      this.cycleFocus(1);
    });

    this.screen.key(['S-tab'], () => {
      if (this.modalActive) return;
      this.cycleFocus(-1);
    });

    this.screen.key(['f'], () => {
      if (this.modalActive || this.viewMode !== 'table') return;
      this.triggerFold();
    });

    this.screen.key(['x'], () => {
      if (this.modalActive || this.viewMode !== 'table') return;
      this.triggerCheck();
    });

    this.screen.key(['c'], () => {
      if (this.modalActive || this.viewMode !== 'table') return;
      this.triggerCall();
    });

    this.screen.key(['r'], () => {
      if (this.modalActive || this.viewMode !== 'table') return;
      this.triggerRaise();
    });

    this.screen.key(['l'], () => {
      if (this.modalActive || this.viewMode !== 'table') return;
      this.runAction(() => this.leaveCurrentTable());
    });

    this.screen.key(['d'], () => {
      if (this.modalActive || this.viewMode !== 'table') return;
      this.runAction(() => this.dealHand());
    });

    this.desktop = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      ch: ' ',
      style: {
        bg: 'black',
      },
    });

    this.buildTopBar();
    this.buildStatusBar();
    this.buildWindows();
    this.buildOverlay();
  }

  private buildTopBar(): void {
    const runAction = this.runAction.bind(this);
    const focusLobby = this.focusLobby.bind(this);
    const focusTable = this.focusTable.bind(this);
    const showProfileWindow = this.showProfileWindow.bind(this);
    const showLeaderboardWindow = this.showLeaderboardWindow.bind(this);
    const showAchievementsWindow = this.showAchievementsWindow.bind(this);
    const showBulletinsWindow = this.showBulletinsWindow.bind(this);
    const exitDoor = this.exitDoor.bind(this);

    this.topBar = blessed.listbar({
      parent: this.desktop,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      hidden: true,
      style: UI_THEME.topBar,
      commands: {
        Lobby: { callback: () => runAction(focusLobby) },
        Table: { callback: () => runAction(focusTable) },
        Profile: { callback: () => runAction(showProfileWindow) },
        Leaders: { callback: () => runAction(showLeaderboardWindow) },
        Achieve: { callback: () => runAction(showAchievementsWindow) },
        Bulls: { callback: () => runAction(showBulletinsWindow) },
        Quit: { callback: () => runAction(exitDoor) },
      },
    });

    this.topInfoBar = createBox({
      parent: this.desktop,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      hidden: false,
      style: { fg: 'white', bg: 'blue' },
      content: ' Card Lobby ',
    });
  }

  private buildStatusBar(): void {
    this.statusBar = createBox({
      parent: this.desktop,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      tags: true,
      style: UI_THEME.statusBar,
      content: ' Loading Card Lobby... ',
    });
  }

  private buildWindows(): void {
    const runAction = this.runAction.bind(this);
    const manualRefresh = this.manualRefresh.bind(this);

    const height = (this.screen.height as number) || 24;
    const width = (this.screen.width as number) || 80;
    const topOffset = 1;
    const statusHeight = 1;
    const logHeight = 4;
    const tableHeight = height - topOffset - statusHeight;
    const mainHeight = tableHeight - logHeight;

    const minLobbyWidth = 22;
    const minTableWidth = 40;
    let leftWidth = Math.floor(width * 0.35);
    leftWidth = Math.max(minLobbyWidth, leftWidth);
    leftWidth = Math.min(leftWidth, width - minTableWidth);
    if (leftWidth < 10) {
      leftWidth = Math.max(10, width - minTableWidth);
    }
    const rightWidth = Math.max(minTableWidth, width - leftWidth);
    this.layout = {
      width,
      height,
      topOffset,
      statusHeight,
      logHeight,
      mainHeight,
      tableHeight,
      leftWidth,
      rightWidth,
    };

    this.lobbyWindow = createBox({
      parent: this.desktop,
      top: topOffset,
      left: 0,
      width: leftWidth,
      height: mainHeight,
      label: ' Lobby ',
      border: { type: 'ascii' },
      style: { border: UI_THEME.windowBorder, bg: UI_THEME.windowBg },
    });

    this.tableWindow = createBox({
      parent: this.desktop,
      top: topOffset,
      left: leftWidth,
      width: rightWidth,
      height: mainHeight,
      border: 'none',
      style: { bg: UI_THEME.windowBg },
    });

    this.lobbyList = createList({
      parent: this.lobbyWindow,
      top: 1,
      left: 1,
      right: 1,
      bottom: 2,
      wrapItems: false,
      keys: true,
      mouse: true,
      vi: true,
      tags: true,
      style: {
        fg: 'white',
        selected: { fg: 'black', bg: UI_THEME.highlightBg },
      } as any,
      scrollbar: {
        ch: '|',
        track: { ch: '|', bg: 'black' },
        style: { fg: UI_THEME.accent, bg: UI_THEME.accent },
      } as any,
      items: [],
    });

    this.lobbyList.on('select', (_: any, index: number) => {
      this.selectedTableId = this.tableListMap[index] ?? null;
      this.updateTablePanel();
      this.screen.render();
    });

    this.lobbyActions = blessed.listbar({
      parent: this.lobbyWindow,
      bottom: 0,
      left: 1,
      right: 1,
      height: 1,
      itemPadding: 0,
      itemGap: 1,
      style: { fg: 'white', bg: 'black' },
      items: {
        Create: { callback: () => runAction(this.createTableFlow.bind(this)), keys: ['c'] },
        Join: { callback: () => runAction(this.joinSelectedTable.bind(this)), keys: ['j'] },
        Observe: { callback: () => runAction(this.observeSelectedTable.bind(this)), keys: ['o'] },
        Filter: { callback: () => runAction(this.toggleFilters.bind(this)), keys: ['f'] },
        Refresh: { callback: () => runAction(manualRefresh), keys: ['r'] },
      },
    });

    this.tableContent = blessed.scrollabletext({
      parent: this.tableWindow,
      top: 1,
      left: 1,
      right: 1,
      bottom: 1,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      mouse: true,
      style: {
        fg: 'white',
      },
      content: 'Select a table to view details.',
    });

    this.tableActions = createBox({
      parent: this.tableWindow,
      top: 0,
      left: 1,
      right: 1,
      height: 1,
      style: { fg: 'white', bg: 'black' },
      hidden: true,
    });

    this.actionButtons = {
      fold: createButton({
        parent: this.tableActions,
        mouse: true,
        keys: true,
        shrink: false,
        height: 1,
        top: 0,
        left: 0,
        border: 'none',
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
        content: 'FOLD',
      }),
      check: createButton({
        parent: this.tableActions,
        mouse: true,
        keys: true,
        shrink: false,
        height: 1,
        top: 0,
        left: 0,
        border: 'none',
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
        content: 'CHECK',
      }),
      call: createButton({
        parent: this.tableActions,
        mouse: true,
        keys: true,
        shrink: false,
        height: 1,
        top: 0,
        left: 0,
        border: 'none',
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
        content: 'CALL',
      }),
      raise: createButton({
        parent: this.tableActions,
        mouse: true,
        keys: true,
        shrink: false,
        height: 1,
        top: 0,
        left: 0,
        border: 'none',
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
        content: 'RAISE',
      }),
      quit: createButton({
        parent: this.tableActions,
        mouse: true,
        keys: true,
        shrink: false,
        height: 1,
        top: 0,
        left: 0,
        border: 'none',
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
        content: 'QUIT',
      }),
    };

    this.registerActionButtonEvents();
    this.logWindow = createLog({
      parent: this.desktop,
      bottom: statusHeight,
      left: 0,
      width: '100%',
      height: logHeight,
      border: { type: 'ascii', labelStyle: { fg: 'yellow' } },
      label: ' Activity ',
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      style: { fg: 'white', border: UI_THEME.windowBorder, bg: 'black' },
      scrollbar: {
        ch: '|',
        track: { ch: '|', bg: 'black' },
        style: { fg: UI_THEME.accent, bg: UI_THEME.accent },
      } as any,
    });

    this.buildTablePanels();
    this.applyViewMode(this.viewMode);
  }

  private buildTablePanels(): void {
    const panelStyle = { border: UI_THEME.windowBorder, bg: UI_THEME.windowBg };
    const contentStyle = { fg: 'white', bg: 'black' };
    const scrollbarStyle = { fg: UI_THEME.accent, bg: UI_THEME.accent };

    this.flopPanel = createBox({
      parent: this.tableWindow,
      top: 1,
      left: 1,
      width: 10,
      height: 6,
      label: ' FLOP ',
      tags: true,
      hidden: true,
      border: { type: 'ascii', labelStyle: { fg: 'yellow' } },
      style: panelStyle,
    });

    this.flopContent = createBox({
      parent: this.flopPanel,
      top: 1,
      left: 1,
      right: 1,
      bottom: 1,
      tags: true,
      style: contentStyle,
      content: '',
    });

    this.playersPanel = createBox({
      parent: this.tableWindow,
      top: 1,
      left: 1,
      width: 10,
      height: 6,
      label: ' PLAYERS ',
      tags: true,
      hidden: true,
      border: { type: 'ascii', labelStyle: { fg: 'yellow' } },
      style: panelStyle,
    });

    this.playersContent = blessed.scrollabletext({
      parent: this.playersPanel,
      top: 1,
      left: 1,
      right: 1,
      bottom: 1,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      mouse: true,
      style: contentStyle,
      scrollbar: {
        ch: '|',
        track: { ch: '|', bg: 'black' },
        style: scrollbarStyle,
      } as any,
      content: '',
    });

    this.handPanel = createBox({
      parent: this.tableWindow,
      top: 1,
      left: 1,
      width: 10,
      height: 6,
      label: ' YOUR HAND ',
      tags: true,
      hidden: true,
      border: { type: 'ascii', labelStyle: { fg: 'yellow' } },
      style: panelStyle,
    });

    this.handContent = createBox({
      parent: this.handPanel,
      top: 1,
      left: 1,
      right: 1,
      bottom: 1,
      tags: true,
      style: contentStyle,
      content: '',
    });

    this.activityPanel = createBox({
      parent: this.tableWindow,
      top: 1,
      left: 1,
      width: 10,
      height: 6,
      label: ' ACTIVITY ',
      tags: true,
      hidden: true,
      border: { type: 'ascii', labelStyle: { fg: 'yellow' } },
      style: panelStyle,
    });

    this.activityContent = createLog({
      parent: this.activityPanel,
      top: 1,
      left: 1,
      right: 1,
      bottom: 1,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      mouse: true,
      wrap: true,
      scrollOnInput: false,
      scrollback: 200,
      style: contentStyle,
      scrollbar: {
        ch: '|',
        track: { ch: '|', bg: 'black' },
        style: scrollbarStyle,
      } as any,
      content: '',
    });

    this.actionButtons.fold.on('press', () => this.triggerFold());
    this.actionButtons.check.on('press', () => this.triggerCheck());
    this.actionButtons.call.on('press', () => this.triggerCall());
    this.actionButtons.raise.on('press', () => this.triggerRaise());
    this.actionButtons.quit.on('press', () => this.triggerQuit());

    this.layoutTablePanels();
  }

  private layoutTablePanels(): void {
    if (!this.layout) return;
    const tableWidth = Number(this.tableWindow.width) || this.layout.width;
    const tableHeight = Number(this.tableWindow.height) || this.layout.mainHeight;
    const innerWidth = Math.max(20, tableWidth - 2);
    const innerHeight = Math.max(6, tableHeight - 2);
    const colGap = innerWidth >= 70 ? 2 : 1;
    const minLeftWidth = 26;
    const minRightWidth = 18;
    let leftWidth = Math.floor((innerWidth - colGap) * 0.58);
    leftWidth = Math.max(minLeftWidth, leftWidth);
    leftWidth = Math.min(leftWidth, innerWidth - colGap - minRightWidth);
    let rightWidth = innerWidth - leftWidth - colGap;
    if (rightWidth < minRightWidth) {
      rightWidth = Math.max(12, innerWidth - colGap - minLeftWidth);
      leftWidth = Math.max(10, innerWidth - colGap - rightWidth);
    }
    const actionHeight = 1;
    const rowGap = 1;
    const usableHeight = Math.max(4, innerHeight - actionHeight - rowGap);
    const minFullPanelHeight = 9;
    let topHeight = Math.floor(usableHeight / 2) + (usableHeight % 2);
    let bottomHeight = Math.max(4, usableHeight - topHeight);
    if (usableHeight >= minFullPanelHeight) {
      if (usableHeight >= minFullPanelHeight * 2) {
        topHeight = Math.max(topHeight, minFullPanelHeight);
        bottomHeight = Math.max(bottomHeight, minFullPanelHeight);
        if (topHeight + bottomHeight > usableHeight) {
          bottomHeight = Math.max(4, usableHeight - topHeight);
        }
      } else {
        topHeight = minFullPanelHeight;
        bottomHeight = Math.max(4, usableHeight - topHeight);
      }
    }

    const top = 1;
    const left = 1;
    const rightStart = left + leftWidth + colGap;
    const bottomTop = top + topHeight + rowGap;
    const actionTop = top + innerHeight - actionHeight;

    this.flopPanel.options.top = top;
    this.flopPanel.options.left = left;
    this.flopPanel.options.width = leftWidth;
    this.flopPanel.options.height = topHeight;

    this.playersPanel.options.top = top;
    this.playersPanel.options.left = rightStart;
    this.playersPanel.options.width = rightWidth;
    this.playersPanel.options.height = topHeight;

    this.handPanel.options.top = bottomTop;
    this.handPanel.options.left = left;
    this.handPanel.options.width = leftWidth;
    this.handPanel.options.height = bottomHeight;

    this.activityPanel.options.top = bottomTop;
    this.activityPanel.options.left = rightStart;
    this.activityPanel.options.width = rightWidth;
    this.activityPanel.options.height = bottomHeight;

    this.tableActions.options.top = actionTop;
    this.tableActions.options.left = left;
    this.tableActions.options.width = innerWidth;
    this.tableActions.options.height = actionHeight;

    this.layoutActionButtons();
  }

  private layoutActionButtons(): void {
    const rawWidth = Number(this.tableActions.width);
    const width = Number.isFinite(rawWidth) ? rawWidth : Number(this.tableActions.options.width) || 0;
    const buttonHeight = 1;
    const buttonTop = 0;
    const gap = width >= 58 ? 2 : 1;
    const order: Array<ActionButtonKey> = ACTION_BUTTON_ORDER;
    const available = Math.max(0, width - gap * Math.max(0, order.length - 1));
    const buttonWidth = Math.max(6, Math.floor(available / order.length));
    const totalButtonsWidth = buttonWidth * order.length + gap * Math.max(0, order.length - 1);
    let left = Math.max(0, Math.floor((width - totalButtonsWidth) / 2));

    order.forEach((key) => {
      const button = this.actionButtons[key];
      button.options.top = buttonTop;
      button.options.height = buttonHeight;
      button.options.left = left;
      button.options.width = buttonWidth;
      button.setContent(this.formatButtonLabel(button.getContent(), buttonWidth));
      left += buttonWidth + gap;
    });
  }

  private applyActionButtonPalette(key: ActionButtonKey): void {
    const palette = ACTION_BUTTON_STYLES[key];
    const button = this.actionButtons[key];
    button.setStyle({
      ...palette.base,
      hover: palette.hover,
      focus: palette.focus,
    });
  }

  private registerActionButtonEvents(): void {
    ACTION_BUTTON_ORDER.forEach((key) => {
      const palette = ACTION_BUTTON_STYLES[key];
      const button = this.actionButtons[key];
      button.on('mousedown', () => {
        button.setStyle({
          ...palette.active,
          hover: palette.hover,
          focus: palette.focus,
        });
      });
      button.on('mouseup', () => {
        button.setStyle({
          ...palette.base,
          hover: palette.hover,
          focus: palette.focus,
        });
      });
      button.on('mouseleave', () => {
        button.setStyle({
          ...palette.base,
          hover: palette.hover,
          focus: palette.focus,
        });
      });
    });
  }

  private formatButtonLabel(label: string, width: number): string {
    const clean = stripBlessedTags(String(label)).trim();
    const text = ` ${clean} `;
    if (text.length >= width) return text.slice(0, width);
    const padLeft = Math.floor((width - text.length) / 2);
    const padRight = width - text.length - padLeft;
    return `${' '.repeat(padLeft)}${text}${' '.repeat(padRight)}`;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private emitSfx(id: string, params?: Record<string, unknown>): void {
    if (!this.screen?.program) return;
    const payload = JSON.stringify({ id, params });
    this.screen.program.write(`\x1b]9999;sfx;${payload}\x07`);
  }

  private renderBoardAndHand(
    boardCards: ReturnType<typeof pokerCardsToCards>,
    playerHand: ReturnType<typeof pokerCardsToCards>,
    flopCardSize: string,
    handCardSize: string,
    hasLiveHand: boolean,
  ): void {
    if (boardCards.length > 0) {
      this.flopContent.setContent(
        renderCardLines(boardCards, { layout: 'flat-condensed', size: flopCardSize }).join('\n'),
      );
    } else {
      this.flopContent.setContent('Board not dealt yet.');
    }

    if (playerHand.length > 0) {
      this.handContent.setContent(
        renderCardLines(playerHand, { layout: 'flat-condensed', size: handCardSize }).join('\n'),
      );
    } else {
      this.handContent.setContent(hasLiveHand ? 'Waiting for cards...' : 'No hand on record.');
    }
  }

  private async runDealAnimation(
    boardCards: ReturnType<typeof pokerCardsToCards>,
    playerHand: ReturnType<typeof pokerCardsToCards>,
    flopCardSize: string,
    handCardSize: string,
  ): Promise<void> {
    if (!this.screen || this.dealAnimationInProgress) return;
    this.dealAnimationInProgress = true;

    const drawDelay = 180;
    const flipDelay = 220;
    const phasePause = 350;

    const renderMixedHand = (
      cards: ReturnType<typeof pokerCardsToCards>,
      flipped: number,
      size: string,
    ): void => {
      if (cards.length === 0) return;
      const framed = cards.map((card, index) => ({
        ...card,
        face: index < flipped ? 'front' as const : 'back' as const,
      }));
      this.flopContent.setContent(
        renderCardLines(framed, { layout: 'flat-condensed', size }).join('\n'),
      );
    };

    const renderMixedPlayerHand = (
      cards: ReturnType<typeof pokerCardsToCards>,
      flipped: number,
      size: string,
    ): void => {
      if (cards.length === 0) return;
      const framed = cards.map((card, index) => ({
        ...card,
        face: index < flipped ? 'front' as const : 'back' as const,
      }));
      this.handContent.setContent(
        renderCardLines(framed, { layout: 'flat-condensed', size }).join('\n'),
      );
    };

    try {
      if (boardCards.length > 0) {
        for (let i = 1; i <= boardCards.length; i += 1) {
          const partial = boardCards.slice(0, i);
          this.flopContent.setContent(
            renderCardLines(partial, { layout: 'flat-condensed', size: flopCardSize, face: 'back' }).join('\n'),
          );
          this.emitSfx('card-flap');
          this.screen.render();
          await this.sleep(drawDelay);
        }

        await this.sleep(phasePause);

        for (let i = 1; i <= boardCards.length; i += 1) {
          renderMixedHand(boardCards, i, flopCardSize);
          this.emitSfx('card-flap');
          this.screen.render();
          await this.sleep(flipDelay);
        }

        await this.sleep(phasePause);
      }

      if (playerHand.length > 0) {
        for (let i = 1; i <= playerHand.length; i += 1) {
          const partial = playerHand.slice(0, i);
          this.handContent.setContent(
            renderCardLines(partial, { layout: 'flat-condensed', size: handCardSize, face: 'back' }).join('\n'),
          );
          this.emitSfx('card-flap');
          this.screen.render();
          await this.sleep(drawDelay);
        }

        await this.sleep(phasePause);

        for (let i = 1; i <= playerHand.length; i += 1) {
          renderMixedPlayerHand(playerHand, i, handCardSize);
          this.emitSfx('card-flap');
          this.screen.render();
          await this.sleep(flipDelay);
        }
      }
    } finally {
      this.dealAnimationInProgress = false;
    }
  }

  private buildOverlay(): void {
    this.overlayShade = createBox({
      parent: this.desktop,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      hidden: true,
      style: {
        bg: 'black',
      },
    });
  }

  private runAction(action: () => void | Promise<void>): void {
    void (async () => {
      try {
        await action();
      } catch (error) {
        console.error('[CardLobby] Action failed:', error);
        this.pushNotice('Action failed. Please try again.');
        this.screen.render();
      }
    })();
  }

  private exitDoor(): void {
    void this.shutdown();
  }

  private async shutdown(): Promise<void> {
    this.stopRefreshTimer();
    if (this.currentProfile?.currentTableId) {
      await this.leaveCurrentTable();
    }
    this.screen.disableMouse();
    this.screen.destroy();
  }

  private cleanup(): void {
    if (this.session.bbsSession) {
      delete this.session.bbsSession.doorInputHandler;
      delete this.session.bbsSession.doorReconnectHandler;
    }
  }

  private async reloadState(): Promise<void> {
    const globalStore = new Storage({
      doorName: 'card_lobby',
      global: true,
    });

    const lobby = (await globalStore.load<LobbyState>(LOBBY_KEY)) ?? initLobbyState();
    const profiles = (await globalStore.load<Record<string, PlayerProfile>>(PROFILES_KEY)) ?? {};

    const userId = String(this.session.user.id);
    const profile = profiles[userId] ?? initProfile(this.session);
    profile.username = this.session.user.username;
    profiles[userId] = profile;

    this.lobby = lobby;
    this.profiles = profiles;
    this.currentProfile = profile;

    let changed = false;
    lobby.tables.forEach((table) => {
      const updateResult = this.syncBotsForTable(table);
      if (updateResult) changed = true;
      this.updateTableStatus(table);
    });

    if (this.currentProfile.currentTableId) {
      const table = this.findTableById(this.currentProfile.currentTableId);
      const userId = this.currentProfile.userId;
      const stillSeated = table
        ? table.players.some((player) => player.userId === userId)
        : false;
      const stillObserving = table
        ? table.observers.some((observer) => observer.userId === userId)
        : false;
      if (!table || (!stillSeated && !stillObserving)) {
        this.currentProfile.currentTableId = undefined;
        this.currentProfile.status = 'lobby';
        changed = true;
      }
    }

    this.maybeResetBuckets();
    this.maybeGrantDailyBonus();

    if (changed) {
      await this.persistState();
    }
  }

  private async persistState(): Promise<void> {
    if (!this.lobby || !this.currentProfile) return;

    const globalStore = new Storage({
      doorName: 'card_lobby',
      global: true,
    });

    await globalStore.save(LOBBY_KEY, this.lobby);
    await globalStore.save(PROFILES_KEY, this.profiles);
  }

  private findTableById(tableId: number): LobbyTable | undefined {
    return this.lobby?.tables.find((table) => table.id === tableId);
  }

  private loadTableHand(table: LobbyTable): { engine: PokerEngine; beforeStacks: Record<string, number> } | null {
    if (!table.hand) return null;
    try {
      const engine = PokerEngine.restore(table.hand.snapshot) as PokerEngine;
      return { engine, beforeStacks: table.hand.beforeStacks ?? {} };
    } catch (error) {
      console.error('[CardLobby] Failed to restore hand snapshot:', error);
      return null;
    }
  }

  private saveTableHand(
    table: LobbyTable,
    engine: PokerEngine,
    beforeStacks: Record<string, number>,
    startedAt?: number,
  ): void {
    table.hand = {
      snapshot: engine.snapshot as Snapshot,
      beforeStacks,
      startedAt: startedAt ?? table.hand?.startedAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    table.updatedAt = Date.now();
  }

  private clearTableHand(table: LobbyTable): void {
    table.hand = undefined;
    table.updatedAt = Date.now();
  }

  private getHumanPlayers(table: LobbyTable): TablePlayer[] {
    return table.players.filter((player) => player.role === 'player' && !isBotPlayer(player));
  }

  private getOpenHumanSeats(table: LobbyTable): number {
    const humans = this.getHumanPlayers(table).length;
    return Math.max(0, table.maxPlayers - humans);
  }

  private syncBotsForTable(table: LobbyTable): boolean {
    const humans = this.getHumanPlayers(table);
    const bustedBots = table.players.filter((player) => player.role === 'player' && isBotPlayer(player) && player.stack <= 0);
    if (bustedBots.length > 0) {
      const bustedIds = new Set(bustedBots.map((bot) => bot.userId));
      table.players = table.players.filter((player) => !bustedIds.has(player.userId));
    }

    const bots = table.players.filter((player) => player.role === 'player' && isBotPlayer(player));
    const targetBots = Math.max(0, table.maxPlayers - humans.length);

    let changed = false;

    if (bustedBots.length > 0) changed = true;

    if (bots.length > targetBots) {
      const removeCount = bots.length - targetBots;
      const botIds = bots.slice(-removeCount).map((bot) => bot.userId);
      table.players = table.players.filter((player) => !botIds.includes(player.userId));
      changed = true;
    }

    if (bots.length < targetBots) {
      const takenSeats = new Set(table.players.map((player) => player.seat));
      for (let seat = 0; seat < table.maxPlayers; seat += 1) {
        if (table.players.filter((p) => p.role === 'player' && isBotPlayer(p)).length >= targetBots) {
          break;
        }
        if (takenSeats.has(seat)) continue;

        const botId = buildBotId(table.id, seat);
        table.players.push({
          userId: botId,
          username: buildBotName(seat),
          seat,
          stack: table.buyIn,
          buyIn: table.buyIn,
          role: 'player',
          joinedAt: Date.now(),
          isBot: true,
        });
        takenSeats.add(seat);
        changed = true;
      }
    }

    return changed;
  }

  private updateTableStatus(table: LobbyTable): void {
    if (table.hand) {
      table.status = 'in-progress';
      return;
    }
    const seated = table.players.filter((player) => player.role === 'player').length;
    if (table.autoStart && seated >= table.minPlayers) {
      table.status = 'in-progress';
    } else {
      table.status = 'open';
    }
  }

  private maybeGrantDailyBonus(): void {
    if (!this.currentProfile) return;
    const now = Date.now();
    if (now - this.currentProfile.wallet.lastDailyGrant < DAILY_COOLDOWN_MS) return;

    this.currentProfile.wallet.chips += DAILY_BONUS;
    this.currentProfile.wallet.lifetimeEarned += DAILY_BONUS;
    this.currentProfile.wallet.lastDailyGrant = now;
    this.pushNotice(`Daily bonus: +${DAILY_BONUS} ${CHIP_NAME}`);
  }

  private maybeResetBuckets(): void {
    if (!this.lobby) return;
    const now = Date.now();
    if (now - this.lobby.lastDailyReset >= DAILY_COOLDOWN_MS) {
      Object.values(this.profiles).forEach((profile) => {
        profile.stats.daily = initStatsBucket();
      });
      this.lobby.lastDailyReset = now;
    }

    if (now - this.lobby.lastWeeklyReset >= WEEK_MS) {
      Object.values(this.profiles).forEach((profile) => {
        profile.stats.weekly = initStatsBucket();
      });
      this.lobby.lastWeeklyReset = now;
    }
  }

  private pushNotice(message: string): void {
    this.notices.push(message);
    if (this.notices.length > 3) this.notices.shift();
    this.updateStatusBar();
  }

  private pushEvent(message: string): void {
    if (!this.lobby) return;
    this.lobby.events.unshift({ message, createdAt: Date.now() });
    if (this.lobby.events.length > MAX_ACTIVITY_EVENTS) {
      this.lobby.events = this.lobby.events.slice(0, MAX_ACTIVITY_EVENTS);
    }
    this.logWindow.log(message);
    this.updateActivityPanel();
  }

  private emitLiveChat(message: string): void {
    const socket = this.session.socket;
    if (!socket?.emit) return;
    socket.emit('bbs:event', {
      type: 'system_announcement',
      details: { message },
      visibility: 'all',
      timestamp: new Date(),
      userId: Number(this.session.user.id) || undefined,
      username: this.session.user.username,
      nodeId: this.session.bbsSession?.nodeId || 1,
    });
  }

  private updateStatusBar(): void {
    if (!this.currentProfile) return;
    const statusLabel = this.currentProfile.currentTableId
      ? `Table #${this.currentProfile.currentTableId}`
      : this.currentProfile.status;
    const noticeText = this.notices.join(' | ');
    const label = ` ${this.currentProfile.username} | Chips: ${this.currentProfile.wallet.chips} | ${statusLabel} `;
    const padded = noticeText ? `${label} - ${noticeText}` : label;
    this.statusBar.setContent(padded.slice(0, 80));
    this.screen.render();
  }

  private updateTopInfoBar(): void {
    if (!this.currentProfile || !this.lobby) return;
    const tableId = this.currentProfile.currentTableId ?? this.selectedTableId;
    if (!tableId) {
      this.topInfoBar.setContent(' Card Lobby ');
      return;
    }

    const table = this.findTableById(tableId);
    if (!table) {
      this.topInfoBar.setContent(' Card Lobby ');
      return;
    }

    let pot = 0;
    const handState = this.loadTableHand(table);
    if (handState) {
      pot = handState.engine.state.pots.reduce((sum, potItem) => sum + potItem.amount, 0);
    }

    let turnLabel = '';
    if (handState) {
      const actionSeat = handState.engine.state.actionTo;
      if (actionSeat !== null && actionSeat !== undefined) {
        const actor = handState.engine.state.players[actionSeat];
        if (actor?.name) {
          turnLabel = actor.id === this.currentProfile.userId ? 'Your turn' : `Turn: ${actor.name}`;
        }
      }
    }

    const infoSegments = [
      `{cyan-fg}${table.gameName}{/}`,
      `{yellow-fg}Pot: ${pot}{/}`,
      `{cyan-fg}Stakes: ${table.stakesLabel}{/}`,
      `{green-fg}Buy-in: ${table.buyIn}{/}`,
    ];
    if (turnLabel) {
      infoSegments.push(`{white-fg}${turnLabel}{/}`);
    }
    const width = Number(this.topInfoBar.width) || 80;
    const line = ` ${infoSegments.join('   ')} `;
    this.topInfoBar.setContent(padColumn(line, width));
  }

  private updateActivityPanel(tableOverride?: LobbyTable | null, engineOverride?: PokerEngine | null): void {
    if (!this.lobby) return;

    let table: LobbyTable | null = tableOverride ?? null;
    if (!table && this.currentProfile?.currentTableId) {
      table = this.findTableById(this.currentProfile.currentTableId) ?? null;
    }

    const hintLines: string[] = [];
    if (this.viewMode === 'table' && table && this.currentProfile) {
      const engine = engineOverride ?? this.loadTableHand(table)?.engine ?? null;
      if (!engine) {
        const seatedPlayers = table.players.filter((player) => player.role === 'player' && player.stack > 0);
        if (seatedPlayers.length < table.minPlayers) {
          hintLines.push('{yellow-fg}Waiting for players to join...{/}');
        } else {
          hintLines.push('{yellow-fg}Ready to deal. Press D or use Deal to start.{/}');
        }
      } else {
        const actionSeat = engine.state.actionTo;
        if (actionSeat === null || actionSeat === undefined) {
          hintLines.push('{yellow-fg}Dealing in progress...{/}');
        } else {
          const actor = engine.state.players[actionSeat];
          if (actor?.id === this.currentProfile.userId) {
            hintLines.push('{yellow-fg}Your turn. Choose an action below.{/}');
          } else if (actor?.name) {
            hintLines.push(`{yellow-fg}Waiting for ${actor.name} to act...{/}`);
          }
        }
      }

      hintLines.push('{gray-fg}Keys: F Fold  X Check  C Call  R Raise  L Leave  D Deal{/}');
    }

    const eventLines = this.lobby.events.length > 0
      ? [...this.lobby.events].reverse().map((event) => event.message)
      : ['No activity yet.'];
    const lines = hintLines.length > 0 ? [...hintLines, '', ...eventLines] : eventLines;

    const previousScroll = this.activityContent.getScroll();
    const previousHeight = this.activityContent.getScrollHeight();
    const isAtBottom = previousHeight === 0 || previousScroll >= Math.max(0, previousHeight - 1);
    this.activityContent.setContent(lines.join('\n'));
    const newHeight = this.activityContent.getScrollHeight();
    if (isAtBottom) {
      this.activityContent.setScroll(newHeight);
    } else {
      this.activityContent.setScroll(Math.min(previousScroll, newHeight));
    }
  }

  private updateAllPanels(): void {
    if (this.viewMode === 'table' && !this.currentProfile?.currentTableId) {
      this.applyViewMode('lobby');
    } else if (this.viewMode === 'table') {
      this.syncViewMode();
    } else {
      this.applyViewMode('lobby');
    }
    this.updateLobbyPanel();
    this.updateTablePanel();
    this.updateStatusBar();
    this.updateTopInfoBar();
    this.updateActivityPanel();
    this.screen.render();
    void this.maybeAutoDealCurrentTable();
  }

  private async maybeAutoDealCurrentTable(): Promise<void> {
    if (!this.currentProfile || !this.lobby) return;
    if (!this.currentProfile.currentTableId) return;
    const table = this.findTableById(this.currentProfile.currentTableId);
    if (!table) return;
    await this.maybeAutoDeal(table);
  }

  private async maybeAutoDeal(table: LobbyTable): Promise<void> {
    if (this.autoDealInProgress || this.modalActive || !this.currentProfile) return;
    if (table.gameId !== 'holdem') return;
    if (this.isObserverForTable(table, this.currentProfile.userId)) return;
    const seatedPlayers = table.players.filter((player) => player.role === 'player' && player.stack > 0);
    if (seatedPlayers.length < table.minPlayers) return;
    if (table.hand) return;

    this.autoDealInProgress = true;
    try {
      await this.startHoldemHand(table);
    } finally {
      this.autoDealInProgress = false;
    }
  }

  private updateLobbyPanel(): void {
    if (!this.lobby) return;
    const filterName = this.lobbyFilters.gameId
      ? getGameById(this.lobbyFilters.gameId)?.name ?? 'Unknown'
      : 'All Games';
    const openOnly = this.lobbyFilters.openSeatsOnly ? 'Open Seats' : 'All Seats';
    this.lobbyWindow.setLabel(` Lobby - ${filterName} / ${openOnly} `);

    const rows: string[] = [];
    const map: number[] = [];

    const filtered = this.lobby.tables.filter((table) => {
      if (this.lobbyFilters.gameId && table.gameId !== this.lobbyFilters.gameId) return false;
      if (this.lobbyFilters.openSeatsOnly && this.getOpenHumanSeats(table) === 0) return false;
      return true;
    });

    filtered.forEach((table) => {
      const humanCount = this.getHumanPlayers(table).length;
      const seats = `${humanCount}/${table.maxPlayers}`;
      const line =
        pad(String(table.id), 3) +
        ' ' +
        pad(table.gameName, 12) +
        pad(table.stakesLabel, 6) +
        pad(seats, 6) +
        pad(table.status.toUpperCase(), 10) +
        formatAge(table.createdAt);
      rows.push(line);
      map.push(table.id);
    });

    if (rows.length === 0) {
      rows.push('No tables. Create one with the Create button.');
    }

    this.tableListMap = map;
    this.lobbyList.setWrapItems(rows.length === 1 && map.length === 0);
    this.lobbyList.setItems(rows);

    if (map.length === 0) {
      this.selectedTableId = null;
    } else if (this.selectedTableId === null && map.length > 0) {
      this.selectedTableId = map[0];
      this.lobbyList.select(0);
    }
  }

  private updateTablePanel(): void {
    if (!this.lobby || !this.currentProfile) return;
    const tableId = this.currentProfile.currentTableId ?? this.selectedTableId;
    if (!tableId) {
      this.flopPanel.hide();
      this.playersPanel.hide();
      this.handPanel.hide();
      this.activityPanel.hide();
      this.tableActions.hide();
      this.tableContent.show();
      this.tableContent.setContent([
        'Select a table to view details.',
        '',
        '{yellow-fg}Quick start{/}:',
        'Use the lobby list to highlight a table.',
        'Press {cyan-fg}J{/} to join, {cyan-fg}O{/} to observe, or {cyan-fg}C{/} to create a table.',
      ].join('\n'));
      this.updateTableActions();
      return;
    }

    const table = this.findTableById(tableId);
    if (!table) {
      this.flopPanel.hide();
      this.playersPanel.hide();
      this.handPanel.hide();
      this.activityPanel.hide();
      this.tableActions.hide();
      this.tableContent.show();
      this.tableContent.setContent('Table not found. Press {cyan-fg}R{/} to refresh the lobby.');
      this.updateTableActions();
      return;
    }

    const isObserver = this.isObserverForTable(table, this.currentProfile.userId);
    const showGameView = this.viewMode === 'table' && this.currentProfile?.currentTableId === table.id;

    if (showGameView) {
      this.tableContent.hide();
      this.flopPanel.show();
      this.playersPanel.show();
      this.handPanel.show();
      this.activityPanel.show();
      this.tableActions.show();
      this.layoutTablePanels();

      const flopInnerHeight = Math.max(0, Number(this.flopPanel.height) - 2);
      const handInnerHeight = Math.max(0, Number(this.handPanel.height) - 2);
      const flopCardSize = flopInnerHeight >= 7 ? 'full' : 'mini';
      const handCardSize = handInnerHeight >= 7 ? 'full' : 'mini';

      const handState = this.loadTableHand(table);
      const boardCards = handState
        ? pokerCardsToCards(handState.engine.state.board)
        : pokerCardsToCards(table.lastHand?.board ?? []);

      const playerSeat = handState?.engine.state.players.find((seat) => seat?.id === this.currentProfile?.userId);
      const playerHand = pokerCardsToCards(
        playerSeat?.hand ?? table.lastHand?.hands[this.currentProfile.userId] ?? [],
      );

      const handStartedAt = table.hand?.startedAt ?? null;
      const shouldAnimate = Boolean(
        handState &&
        handStartedAt &&
        handStartedAt !== this.lastAnimatedHandStartedAt &&
        !this.dealAnimationInProgress,
      );

      if (shouldAnimate) {
        this.lastAnimatedHandStartedAt = handStartedAt;
        void this.runDealAnimation(boardCards, playerHand, flopCardSize, handCardSize);
      } else if (!this.dealAnimationInProgress) {
        this.renderBoardAndHand(boardCards, playerHand, flopCardSize, handCardSize, Boolean(handState));
      }

      const seated = table.players
        .filter((player) => player.role === 'player')
        .sort((a, b) => a.seat - b.seat);
      const playersWidth = Math.max(20, Number(this.playersPanel.width) - 2);
      const seatWidth = 2;
      const stackWidth = Math.min(8, Math.max(5, Math.floor(playersWidth * 0.35)));
      const nameWidth = Math.max(8, playersWidth - seatWidth - stackWidth - 2);
      const playersLines = seated.map((player) => {
        const tag = isBotPlayer(player) ? '*' : ' ';
        const name = `${player.username}${tag}`.slice(0, nameWidth);
        const nameValue = padColumn(`{cyan-fg}${name}{/}`, nameWidth);
        const stackValue = padColumn(`{yellow-fg}${player.stack}{/}`, stackWidth);
        return `${pad(String(player.seat + 1), seatWidth)} ${nameValue} ${stackValue}`;
      });

      if (playersLines.length === 0) {
        playersLines.push('No players seated.');
      }
      this.playersContent.setContent(playersLines.join('\n'));
      this.playersContent.resetScroll();

      this.updateTableActions();
      this.updateActivityPanel(table, handState?.engine ?? null);
      this.updateTopInfoBar();
      this.screen.render();
      return;
    }

    this.flopPanel.hide();
    this.playersPanel.hide();
    this.handPanel.hide();
    this.activityPanel.hide();
    this.tableActions.hide();
    this.tableContent.show();

    const contentWidth = Math.max(40, (this.tableContent as any).iwidth ?? 78);
    const gap = 2;
    const minLeftWidth = 24;
    const minRightWidth = 20;

    const leftLines: string[] = [];
    const rightLines: string[] = [];

    rightLines.push(`{${UI_THEME.accent}-fg}Table #${table.id}{/} - ${table.gameName}`);
    rightLines.push(`Stakes: ${table.stakesLabel}  Buy-in: ${table.buyIn}`);
    rightLines.push(`Status: ${table.status}  Players: ${table.players.filter((p) => p.role === 'player').length}/${table.maxPlayers}`);
    if (table.isPrivate && table.inviteCode) {
      rightLines.push(`Invite: ${table.inviteCode}`);
    }
    if (isObserver) {
      rightLines.push('Mode: Observer');
    }

    if (table.lastHand) {
      const winners = table.lastHand.winners.map((winner) => `${winner.username} (${winner.amount})`).join(', ');
      rightLines.push('');
      rightLines.push(`Last hand pot: ${table.lastHand.pot}`);
      rightLines.push(`Last winners: ${winners || 'TBD'}`);
    }

    rightLines.push('');
    rightLines.push('Seats:');
    const seated = table.players
      .filter((player) => player.role === 'player')
      .sort((a, b) => a.seat - b.seat);
    seated.forEach((player) => {
      const tag = isBotPlayer(player) ? '*' : ' ';
      const name = `${player.username}${tag}`.slice(0, 10);
      rightLines.push(`${pad(String(player.seat + 1), 2)} ${pad(name, 10)} ${pad(String(player.stack), 5)}`);
    });

    if (table.observers.length > 0) {
      rightLines.push('');
      rightLines.push(`Observers: ${table.observers.map((obs) => obs.username).join(', ')}`);
    }

    rightLines.push('');
    rightLines.push('{yellow-fg}Actions{/}: J Join  O Observe');
    rightLines.push('{yellow-fg}More{/}: C Create  R Refresh  F Filter');
    rightLines.push('{gray-fg}Auto-deal starts when enough players are seated.{/}');

    let lines: string[] = [];
    if (leftLines.length === 0) {
      lines = rightLines;
    } else {
      const maxLeftWidth = Math.max(minLeftWidth, ...leftLines.map(visibleWidth));
      const canUseColumns = maxLeftWidth + gap + minRightWidth <= contentWidth;
      if (canUseColumns) {
        const leftWidth = Math.min(maxLeftWidth, contentWidth - minRightWidth - gap);
        const rightWidth = Math.max(minRightWidth, contentWidth - leftWidth - gap);
        lines = mergeColumns(leftLines, rightLines, leftWidth, rightWidth, gap);
      } else {
        lines = [...leftLines, '', ...rightLines];
      }
    }
    this.tableContent.setContent(lines.join('\n'));
    this.tableContent.resetScroll();
    this.updateTableActions();
    this.screen.render();
  }

  private getActionContext(): { table: LobbyTable | null; isObserver: boolean; canAct: boolean; toCall: number } {
    if (!this.currentProfile || !this.lobby) {
      return { table: null, isObserver: false, canAct: false, toCall: 0 };
    }

    const table = this.currentProfile.currentTableId ? this.findTableById(this.currentProfile.currentTableId) : null;
    if (!table) {
      return { table: null, isObserver: false, canAct: false, toCall: 0 };
    }

    const isObserver = this.isObserverForTable(table, this.currentProfile.userId);
    let toCall = 0;
    const handState = this.loadTableHand(table);
    let canAct = false;
    if (handState) {
      const actionSeat = handState.engine.state.actionTo;
      if (actionSeat !== null && actionSeat !== undefined) {
        const actor = handState.engine.state.players[actionSeat];
        if (actor?.id === this.currentProfile.userId) {
          const currentBet = getCurrentBet(handState.engine);
          const playerBet = getPlayerBet(handState.engine, actionSeat);
          toCall = Math.max(0, currentBet - playerBet);
          canAct = !isObserver;
        }
      }
    }

    return { table, isObserver, canAct, toCall };
  }

  private triggerFold(): void {
    if (this.modalActive) return;
    const { canAct } = this.getActionContext();
    if (!canAct) return;
    this.runAction(() => this.handlePlayerAction('fold'));
  }

  private triggerCheck(): void {
    if (this.modalActive) return;
    if (this.currentProfile?.currentTableId && this.lobby) {
      const table = this.findTableById(this.currentProfile.currentTableId);
      const handState = table ? this.loadTableHand(table) : null;
      if (!handState) {
        this.runAction(() => this.dealHand());
        return;
      }
    }
    const { canAct, toCall } = this.getActionContext();
    if (!canAct) return;
    if (toCall > 0) {
      this.pushNotice(`Cannot check. Call ${toCall} or fold.`);
      return;
    }
    this.runAction(() => this.handlePlayerAction('call'));
  }

  private triggerCall(): void {
    if (this.modalActive) return;
    const { canAct } = this.getActionContext();
    if (!canAct) return;
    this.runAction(() => this.handlePlayerAction('call'));
  }

  private triggerRaise(): void {
    if (this.modalActive) return;
    const { canAct } = this.getActionContext();
    if (!canAct) return;
    this.runAction(() => this.handlePlayerAction('bet'));
  }

  private triggerQuit(): void {
    if (this.modalActive) return;
    this.exitDoor();
  }

  private updateTableActions(): void {
    if (!this.currentProfile || !this.lobby) return;
    if (this.viewMode !== 'table' || !this.currentProfile.currentTableId) {
      this.tableActions.hide();
      return;
    }

    this.tableActions.show();

    this.actionButtons.fold.setContent('FOLD');
    const table = this.findTableById(this.currentProfile.currentTableId);
    const handState = table ? this.loadTableHand(table) : null;
    this.actionButtons.check.setContent(handState ? 'CHECK' : 'DEAL');
    this.actionButtons.call.setContent('CALL');
    this.actionButtons.raise.setContent('RAISE');
    this.actionButtons.quit.setContent('QUIT');

    this.applyActionButtonPalette('fold');
    this.applyActionButtonPalette('check');
    this.applyActionButtonPalette('call');
    this.applyActionButtonPalette('raise');
    this.applyActionButtonPalette('quit');

    this.layoutActionButtons();
  }

  private focusLobby(): void {
    this.applyViewMode('lobby');
    this.lobbyList.focus();
    this.screen.render();
  }

  private focusTable(): void {
    const wantsTable = Boolean(this.currentProfile?.currentTableId);
    this.applyViewMode(wantsTable ? 'table' : 'lobby');
    if (this.viewMode === 'table') {
      this.playersContent.focus();
    } else {
      this.tableContent.focus();
    }
    this.screen.render();
  }

  private cycleFocus(direction: 1 | -1): void {
    const focusOrder: Array<any> = this.viewMode === 'table'
      ? [
        this.playersContent,
        this.activityContent,
        this.actionButtons.fold,
        this.actionButtons.check,
        this.actionButtons.call,
        this.actionButtons.raise,
        this.actionButtons.quit,
      ]
      : [this.lobbyList, this.lobbyActions, this.tableContent];
    const current = this.screen.focused;
    const currentIndex = focusOrder.findIndex((item) => item === current);
    const nextIndex = currentIndex === -1
      ? 0
      : (currentIndex + direction + focusOrder.length) % focusOrder.length;
    const next = focusOrder[nextIndex];
    if (next?.focus) {
      next.focus();
      this.screen.render();
    }
  }

  private syncViewMode(): void {
    const wantsTable = Boolean(this.currentProfile?.currentTableId);
    this.applyViewMode(wantsTable ? 'table' : 'lobby');
  }

  private applyViewMode(mode: 'lobby' | 'table'): void {
    if (!this.layout) return;
    if (this.viewMode === mode) return;
    this.viewMode = mode;

    const { width, leftWidth, rightWidth, mainHeight, tableHeight } = this.layout;

    if (mode === 'table') {
      this.lobbyWindow.hide();
      this.tableWindow.show();
      this.tableWindow.options.left = 0;
      this.tableWindow.options.width = width;
      this.tableWindow.options.height = tableHeight;
      this.logWindow.hide();
      this.topBar.hide();
      this.topInfoBar.show();
    } else {
      this.lobbyWindow.show();
      this.lobbyWindow.options.width = leftWidth;
      this.tableWindow.show();
      this.tableWindow.options.left = leftWidth;
      this.tableWindow.options.width = rightWidth;
      this.tableWindow.options.height = mainHeight;
      this.logWindow.show();
      this.topBar.hide();
      this.topInfoBar.show();
    }

    this.layoutTablePanels();
    this.screen.render();
  }

  private toggleFilters(): void {
    if (this.modalActive) return;
    if (!this.lobbyFilters.gameId) {
      const firstGame = GAME_CATALOG.find((game) => game.enabled);
      this.lobbyFilters.gameId = firstGame?.id ?? null;
    } else if (!this.lobbyFilters.openSeatsOnly) {
      this.lobbyFilters.openSeatsOnly = true;
    } else {
      this.lobbyFilters.gameId = null;
      this.lobbyFilters.openSeatsOnly = false;
    }
    this.updateLobbyPanel();
    this.screen.render();
  }

  private async manualRefresh(): Promise<void> {
    if (this.modalActive) return;
    await this.reloadState();
    this.updateAllPanels();
  }

  private isObserverForTable(table: LobbyTable, userId: string): boolean {
    const seated = table.players.find((player) => player.userId === userId && player.role === 'player');
    if (seated) return false;
    return table.observers.some((obs) => obs.userId === userId);
  }

  private async createTableFlow(): Promise<void> {
    if (this.modalActive) return;

    const enabledGames = GAME_CATALOG.filter((game) => game.enabled);
    const gameIndex = await this.showListDialog(
      'Select Game',
      enabledGames.map((game) => `${game.name}`),
    );
    if (gameIndex === null) return;

    const game = enabledGames[gameIndex];
    const stakeIndex = await this.showListDialog(
      'Select Stakes',
      game.stakes.map((stake) => `${stake.label} (Buy-in ${stake.buyIn})`),
    );
    if (stakeIndex === null) return;

    const maxPlayersStr = await this.showPromptDialog(
      'Table Size',
      `Max players (${game.minPlayers}-${game.maxPlayers})`,
      String(game.maxPlayers),
    );
    if (maxPlayersStr === null) return;

    const maxPlayers = safeNumber(maxPlayersStr);
    if (maxPlayers === null || maxPlayers < game.minPlayers || maxPlayers > game.maxPlayers) {
      await this.showMessageDialog('Invalid player count.', 'Max players must be within game limits.');
      return;
    }

    const isPrivate = await this.showYesNoDialog('Private Table?', 'Create a private table?');
    if (isPrivate === null) return;

    const autoStart = await this.showYesNoDialog('Auto Start?', 'Auto-start when table is full?');
    if (autoStart === null) return;

    await this.finalizeCreateTable(game, stakeIndex, maxPlayers, isPrivate, autoStart);
  }

  private async finalizeCreateTable(
    game: GameDefinition,
    stakeIndex: number,
    maxPlayers: number,
    isPrivate: boolean,
    autoStart: boolean,
  ): Promise<void> {
    await this.reloadState();
    if (!this.lobby || !this.currentProfile) return;

    const stake = game.stakes[stakeIndex];
    const buyIn = stake.buyIn;
    const entryFee = calculateEntryFee(buyIn);

    if (this.currentProfile.wallet.chips < buyIn + entryFee) {
      this.pushNotice('Not enough chips for buy-in + entry fee.');
      return;
    }

    this.currentProfile.wallet.chips -= buyIn + entryFee;
    this.currentProfile.wallet.lifetimeSpent += entryFee;

    const tableId = this.lobby.lastTableId + 1;
    this.lobby.lastTableId = tableId;

    const table: LobbyTable = {
      id: tableId,
      gameId: game.id,
      gameName: game.name,
      stakesLabel: stake.label,
      smallBlind: stake.smallBlind,
      bigBlind: stake.bigBlind,
      buyIn,
      entryFee,
      minPlayers: game.minPlayers,
      maxPlayers,
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      hostUserId: this.currentProfile.userId,
      autoStart,
      isPrivate,
      inviteCode: isPrivate ? String(Math.floor(Math.random() * 9000) + 1000) : undefined,
      players: [],
      observers: [],
    };

    table.players.push({
      userId: this.currentProfile.userId,
      username: this.currentProfile.username,
      seat: 0,
      stack: buyIn,
      buyIn,
      role: 'player',
      joinedAt: Date.now(),
      isBot: false,
    });

    this.syncBotsForTable(table);
    this.updateTableStatus(table);
    if (table.status === 'in-progress') {
      this.emitLiveChat(`TABLE START: ${table.gameName} ${table.stakesLabel} (#${table.id})`);
    }

    this.currentProfile.status = 'table';
    this.currentProfile.currentTableId = tableId;

    this.lobby.tables.unshift(table);
    this.pushEvent(`Table #${table.id} opened: ${table.gameName} ${table.stakesLabel}`);
    this.emitLiveChat(`TABLE OPEN: ${table.gameName} ${table.stakesLabel} (#${table.id}) - /JOIN ${table.id}`);

    await this.persistState();
    this.selectedTableId = table.id;
    this.applyViewMode('table');
    this.updateAllPanels();
  }

  private async joinSelectedTable(): Promise<void> {
    if (this.modalActive || !this.lobby || !this.currentProfile) return;
    if (!this.selectedTableId) {
      this.pushNotice('Select a table first.');
      return;
    }

    await this.reloadState();
    if (!this.lobby) return;

    const table = this.findTableById(this.selectedTableId);
    if (!table) {
      this.pushNotice('Table not found.');
      return;
    }

    if (this.currentProfile.currentTableId && this.currentProfile.currentTableId !== table.id) {
      this.pushNotice('Leave your current table first.');
      return;
    }

    if (this.getOpenHumanSeats(table) <= 0) {
      this.pushNotice('Table is full of players.');
      return;
    }

    const buyIn = table.buyIn;
    const entryFee = table.entryFee;
    if (this.currentProfile.wallet.chips < buyIn + entryFee) {
      this.pushNotice('Not enough chips for buy-in + entry fee.');
      return;
    }

    const existingSeat = table.players.find((player) => player.userId === this.currentProfile?.userId && player.role === 'player');
    if (existingSeat) {
      this.currentProfile.currentTableId = table.id;
      this.currentProfile.status = 'table';
      this.applyViewMode('table');
      this.updateAllPanels();
      return;
    }

    const seat = this.findSeatForHuman(table);
    if (seat === null) {
      this.pushNotice('No seat available.');
      return;
    }

    table.players = table.players.filter((player) => !(player.seat === seat && isBotPlayer(player)));

    this.currentProfile.wallet.chips -= buyIn + entryFee;
    this.currentProfile.wallet.lifetimeSpent += entryFee;

    table.players.push({
      userId: this.currentProfile.userId,
      username: this.currentProfile.username,
      seat,
      stack: buyIn,
      buyIn,
      role: 'player',
      joinedAt: Date.now(),
      isBot: false,
    });

    table.observers = table.observers.filter((observer) => observer.userId !== this.currentProfile?.userId);
    table.updatedAt = Date.now();

    this.currentProfile.status = 'table';
    this.currentProfile.currentTableId = table.id;

    const previousStatus = table.status;
    this.syncBotsForTable(table);
    this.updateTableStatus(table);
    if (previousStatus !== 'in-progress' && table.status === 'in-progress') {
      this.emitLiveChat(`TABLE START: ${table.gameName} ${table.stakesLabel} (#${table.id})`);
    }

    this.pushEvent(`${this.currentProfile.username} joined table #${table.id}`);

    await this.persistState();
    this.applyViewMode('table');
    this.updateAllPanels();
  }

  private async observeSelectedTable(): Promise<void> {
    if (this.modalActive || !this.lobby || !this.currentProfile) return;
    if (!this.selectedTableId) {
      this.pushNotice('Select a table first.');
      return;
    }

    await this.reloadState();
    if (!this.lobby) return;

    const table = this.findTableById(this.selectedTableId);
    if (!table) {
      this.pushNotice('Table not found.');
      return;
    }

    const seated = table.players.find((player) => player.userId === this.currentProfile?.userId && player.role === 'player');
    if (seated) {
      this.currentProfile.currentTableId = table.id;
      this.currentProfile.status = 'table';
      this.applyViewMode('table');
      this.updateAllPanels();
      return;
    }

    const alreadyObserver = table.observers.find((obs) => obs.userId === this.currentProfile?.userId);
    if (!alreadyObserver) {
      table.observers.push({
        userId: this.currentProfile.userId,
        username: this.currentProfile.username,
        joinedAt: Date.now(),
      });
    }

    this.currentProfile.status = 'table';
    this.currentProfile.currentTableId = table.id;

    this.pushEvent(`${this.currentProfile.username} is observing table #${table.id}`);

    await this.persistState();
    this.applyViewMode('table');
    this.updateAllPanels();
  }

  private findSeatForHuman(table: LobbyTable): number | null {
    const humanSeats = new Set(this.getHumanPlayers(table).map((player) => player.seat));
    for (let seat = 0; seat < table.maxPlayers; seat += 1) {
      if (!humanSeats.has(seat)) return seat;
    }
    return null;
  }

  private async leaveCurrentTable(): Promise<void> {
    if (!this.currentProfile || !this.lobby) return;
    const tableId = this.currentProfile.currentTableId;
    if (!tableId) {
      this.pushNotice('You are not at a table.');
      return;
    }

    await this.reloadState();
    if (!this.lobby) return;

    const table = this.findTableById(tableId);
    if (!table) {
      this.currentProfile.currentTableId = undefined;
      this.currentProfile.status = 'lobby';
      this.applyViewMode('lobby');
      await this.persistState();
      this.updateAllPanels();
      return;
    }

    const playerIndex = table.players.findIndex((player) => player.userId === this.currentProfile?.userId && player.role === 'player');
    if (playerIndex >= 0 && table.hand) {
      this.pushNotice('Hand in progress. Wait for it to finish before leaving.');
      return;
    }
    if (playerIndex >= 0) {
      const player = table.players[playerIndex];
      const net = player.stack - player.buyIn;
      this.currentProfile.wallet.chips += player.stack;
      if (net > 0) this.currentProfile.wallet.lifetimeEarned += net;
      if (net < 0) this.currentProfile.wallet.lifetimeSpent += Math.abs(net);
      table.players.splice(playerIndex, 1);
    }

    const observerIndex = table.observers.findIndex((obs) => obs.userId === this.currentProfile?.userId);
    if (observerIndex >= 0) {
      table.observers.splice(observerIndex, 1);
    }

    this.currentProfile.status = 'lobby';
    this.currentProfile.currentTableId = undefined;
    table.updatedAt = Date.now();

    const remainingHumans = this.getHumanPlayers(table);
    if (remainingHumans.length === 0) {
      this.lobby.tables = this.lobby.tables.filter((item) => item.id !== table.id);
      this.pushEvent(`Table #${table.id} closed.`);
    } else {
      this.syncBotsForTable(table);
      if (table.hostUserId === this.currentProfile.userId && remainingHumans[0]) {
        table.hostUserId = remainingHumans[0].userId;
      }
      this.updateTableStatus(table);
    }

    await this.persistState();
    this.applyViewMode('lobby');
    this.updateAllPanels();
  }

  private async dealHand(): Promise<void> {
    if (this.modalActive || !this.currentProfile || !this.lobby) return;
    const tableId = this.currentProfile.currentTableId ?? this.selectedTableId;
    if (!tableId) {
      this.pushNotice('Select a table first.');
      return;
    }

    await this.reloadState();
    const table = this.findTableById(tableId);
    if (!table) {
      this.pushNotice('Table not found.');
      return;
    }

    const isObserver = this.isObserverForTable(table, this.currentProfile.userId);
    if (isObserver) {
      this.pushNotice('Observers cannot deal hands.');
      return;
    }

    if (table.gameId !== 'holdem') {
      this.pushNotice('Only Hold\'em is playable right now.');
      return;
    }

    if (table.hand) {
      this.pushNotice('Hand already in progress.');
      return;
    }

    await this.startHoldemHand(table);
    this.updateAllPanels();
  }

  private handleAchievementUnlocks(profile: PlayerProfile): void {
    const unlocked = new Set(profile.achievements);

    const addAchievement = (id: string): void => {
      if (unlocked.has(id)) return;
      const def = ACHIEVEMENTS.find((achievement) => achievement.id === id);
      if (!def) return;
      unlocked.add(id);
      profile.achievements.push(id);
      profile.wallet.chips += def.reward;
      profile.wallet.lifetimeEarned += def.reward;
      this.pushNotice(`Achievement unlocked: ${def.name} (+${def.reward})`);
    };

    if (profile.stats.handsPlayed >= 1) addAchievement('first_hand');
    if (profile.stats.wins >= 1) addAchievement('first_win');
    if (profile.stats.bestWinStreak >= 3) addAchievement('hot_streak');
    if (profile.stats.biggestPot >= 500) addAchievement('big_pot');
    if (profile.stats.handsPlayed >= 25) addAchievement('grinder');
  }

  private updateStatsAfterHand(profile: PlayerProfile, delta: number, pot: number): void {
    profile.stats.handsPlayed += 1;
    profile.stats.net += delta;
    profile.stats.daily.hands += 1;
    profile.stats.weekly.hands += 1;
    profile.stats.daily.net += delta;
    profile.stats.weekly.net += delta;

    if (delta > 0) {
      profile.stats.wins += 1;
      profile.stats.daily.wins += 1;
      profile.stats.weekly.wins += 1;
      profile.stats.winStreak += 1;
      profile.stats.bestWinStreak = Math.max(profile.stats.bestWinStreak, profile.stats.winStreak);
    } else if (delta < 0) {
      profile.stats.losses += 1;
      profile.stats.winStreak = 0;
    }

    profile.stats.biggestPot = Math.max(profile.stats.biggestPot, pot);
  }

  private async finalizeHoldemHand(
    table: LobbyTable,
    engine: PokerEngine,
    beforeStacks: Record<string, number>,
  ): Promise<void> {
    if (!this.lobby || !this.currentProfile) return;

    const pot = engine.state.pots.reduce((sum, potItem) => sum + potItem.amount, 0);
    const lastHand: LastHandSummary = {
      board: engine.state.board.slice(),
      hands: {},
      pot,
      winners: (engine.state.winners ?? []).map((winner) => {
        const seat = winner.seat;
        const player = engine.state.players[seat];
        return {
          userId: player?.id ?? 'unknown',
          username: player?.name ?? 'Unknown',
          amount: winner.amount,
        };
      }),
      playedAt: Date.now(),
    };

    engine.state.players.forEach((player) => {
      if (!player?.hand) return;
      lastHand.hands[player.id] = [...player.hand];
    });

    table.players = table.players.map((player) => {
      if (player.role !== 'player') return player;
      const enginePlayer = engine.state.players[player.seat];
      if (!enginePlayer) return player;
      return {
        ...player,
        stack: enginePlayer.stack,
      };
    });

    table.lastHand = lastHand;
    this.clearTableHand(table);
    this.updateTableStatus(table);

    table.players.forEach((player) => {
      if (player.role !== 'player' || isBotPlayer(player)) return;
      const profile = this.profiles[player.userId];
      if (!profile) return;
      if (beforeStacks[player.userId] === undefined) return;
      const before = beforeStacks[player.userId] ?? player.stack;
      const delta = player.stack - before;
      this.updateStatsAfterHand(profile, delta, pot);
      profile.wallet.chips += ACTIVITY_REWARD;
      profile.wallet.lifetimeEarned += ACTIVITY_REWARD;
      if (delta > 0) {
        profile.wallet.chips += WIN_REWARD;
        profile.wallet.lifetimeEarned += WIN_REWARD;
      }
      this.handleAchievementUnlocks(profile);
    });

    const currentDelta = (table.players.find((p) => p.userId === this.currentProfile?.userId)?.stack ?? 0) -
      (beforeStacks[this.currentProfile.userId] ?? 0);
    if (currentDelta > 0) {
      this.pushNotice(`You won ${currentDelta} ${CHIP_NAME}.`);
      this.emitLiveChat(`BIG WIN: ${this.currentProfile.username} won ${currentDelta} in ${table.gameName} (#${table.id})`);
    }

    this.pushEvent(`Hand played at table #${table.id} (${table.gameName} ${table.stakesLabel}).`);

    await this.writeWeeklyBulletinIfNeeded();
    await this.persistState();
  }

  private async startHoldemHand(table: LobbyTable): Promise<void> {
    try {
      await this.reloadState();
      if (!this.lobby || !this.currentProfile) return;

      const freshTable = this.findTableById(table.id);
      if (!freshTable) {
        this.pushNotice('Table not found.');
        return;
      }

      if (freshTable.hand) {
        this.pushNotice('Hand already in progress.');
        return;
      }

      const rake = calculateRake(freshTable.bigBlind);
      const engine = new PokerEngine({
        smallBlind: freshTable.smallBlind,
        bigBlind: freshTable.bigBlind,
        maxPlayers: freshTable.maxPlayers,
        rakePercent: rake.percent,
        rakeCap: rake.cap,
      }, { cardEngine });

      const seatedPlayers = freshTable.players.filter((player) => player.role === 'player' && player.stack > 0);
      if (seatedPlayers.length < freshTable.minPlayers) {
        this.pushNotice('Not enough players to deal a hand.');
        return;
      }

      seatedPlayers.forEach((player) => {
        engine.sit(player.seat, player.userId, player.username, player.stack);
      });

      try {
        engine.deal();
      } catch (error) {
        console.error('[CardLobby] Holdem deal failed:', error);
        this.pushNotice('Failed to deal a hand.');
        return;
      }

      const beforeStacks: Record<string, number> = {};
      seatedPlayers.forEach((player) => {
        if (!isBotPlayer(player)) {
          beforeStacks[player.userId] = player.stack;
        }
      });
      this.saveTableHand(freshTable, engine, beforeStacks, Date.now());
      this.updateTableStatus(freshTable);
      this.pushEvent(`Hand started at table #${freshTable.id} (${freshTable.gameName} ${freshTable.stakesLabel}).`);
      await this.persistState();
      await this.advanceHoldemHand(freshTable, engine, beforeStacks);
    } catch (error) {
      console.error('[CardLobby] Holdem hand setup failed:', error);
      if (this.lobby) {
        const freshTable = this.findTableById(table.id);
        if (freshTable) {
          this.clearTableHand(freshTable);
          this.updateTableStatus(freshTable);
          await this.persistState();
        }
      }
      this.pushNotice('Hand failed to start.');
    }
  }

  private async advanceHoldemHand(
    table: LobbyTable,
    engineOverride?: PokerEngine,
    beforeStacksOverride?: Record<string, number>,
  ): Promise<void> {
    if (!this.lobby || !this.currentProfile) return;

    try {
      const handState = engineOverride
        ? { engine: engineOverride, beforeStacks: beforeStacksOverride ?? table.hand?.beforeStacks ?? {} }
        : this.loadTableHand(table);
      if (!handState) return;

      let safety = 0;
      while (!handState.engine.state.winners && safety < 400) {
        const state = handState.engine.state;
        const actionSeat = state.actionTo;
        if (actionSeat === null || actionSeat === undefined) break;
        const actor = state.players[actionSeat];
        if (!actor) break;

        if (!isBotId(actor.id)) {
          this.saveTableHand(table, handState.engine, handState.beforeStacks);
          await this.persistState();
          this.updateTablePanel();
          return;
        }

        await this.performBotAction(handState.engine, actionSeat, actor.id);
        this.saveTableHand(table, handState.engine, handState.beforeStacks);
        await this.persistState();
        safety += 1;
      }

      if (!handState.engine.state.winners) {
        this.saveTableHand(table, handState.engine, handState.beforeStacks);
        await this.persistState();
        this.updateTablePanel();
        return;
      }

      await this.finalizeHoldemHand(table, handState.engine, handState.beforeStacks);
      this.updateTablePanel();
      void this.maybeAutoDeal(table);
    } catch (error) {
      console.error('[CardLobby] Holdem hand error:', error);
      this.pushNotice('Hand error. Returning to lobby.');
      this.updateTablePanel();
    }
  }

  private async performBotAction(engine: PokerEngine, seat: number, playerId: string): Promise<void> {
    const actorSeat = engine.state.players[seat];
    if (!actorSeat) return;

    const currentBet = getCurrentBet(engine);
    const playerBet = getPlayerBet(engine, seat);
    const toCall = Math.max(0, currentBet - playerBet);
    const stack = actorSeat.stack;

    const aggression = 0.35;
    const random = Math.random();

    try {
      if (toCall === 0) {
        if (random < aggression && stack > 0) {
          const minBet = stack <= engine.state.bigBlind ? stack : engine.state.bigBlind;
          const maxBet = stack;
          const target = Math.min(maxBet, minBet + Math.floor(engine.state.bigBlind * (2 + Math.random() * 3)));
          engine.act({ type: PokerAction.BET, playerId, amount: target });
          this.pushEvent(`${actorSeat.name} bets ${target}`);
        } else {
          engine.act({ type: PokerAction.CHECK, playerId });
          this.pushEvent(`${actorSeat.name} checks`);
        }
        return;
      }

      if (stack <= toCall) {
        if (random < 0.2) {
          engine.act({ type: PokerAction.FOLD, playerId });
          this.pushEvent(`${actorSeat.name} folds`);
        } else {
          engine.act({ type: PokerAction.CALL, playerId });
          this.pushEvent(`${actorSeat.name} calls ${toCall}`);
        }
        return;
      }

      if (random < 0.15 && toCall > engine.state.bigBlind * 2) {
        engine.act({ type: PokerAction.FOLD, playerId });
        this.pushEvent(`${actorSeat.name} folds`);
        return;
      }

      if (random < aggression) {
        const maxRaise = playerBet + stack;
        const minRaise = Math.min(engine.state.minRaise, maxRaise);
        const raiseLimit = Math.min(maxRaise, minRaise + engine.state.bigBlind * 4);
        const raiseTo = minRaise + Math.floor(Math.random() * Math.max(1, raiseLimit - minRaise + 1));
        engine.act({ type: PokerAction.RAISE, playerId, amount: raiseTo });
        this.pushEvent(`${actorSeat.name} raises to ${raiseTo}`);
        return;
      }

      engine.act({ type: PokerAction.CALL, playerId });
      this.pushEvent(`${actorSeat.name} calls ${toCall}`);
    } catch (error) {
      try {
        if (toCall === 0) {
          engine.act({ type: PokerAction.CHECK, playerId });
        } else {
          engine.act({ type: PokerAction.CALL, playerId });
        }
      } catch {
        engine.act({ type: PokerAction.FOLD, playerId });
      }
    }
  }

  private async handlePlayerAction(action: 'call' | 'bet' | 'fold'): Promise<void> {
    if (!this.currentProfile || !this.lobby) return;
    const tableId = this.currentProfile.currentTableId;
    if (!tableId) return;

    await this.reloadState();
    const table = this.findTableById(tableId);
    if (!table || !table.hand) {
      this.pushNotice('No active hand to act on.');
      return;
    }

    const handState = this.loadTableHand(table);
    if (!handState) {
      this.pushNotice('Failed to load hand state.');
      return;
    }

    const engine = handState.engine;
    const actionSeat = engine.state.actionTo;
    if (actionSeat === null || actionSeat === undefined) {
      this.pushNotice('Waiting for the next action.');
      return;
    }
    const actor = engine.state.players[actionSeat];
    if (!actor || actor.id !== this.currentProfile.userId) {
      this.pushNotice('Waiting for the next player to act.');
      return;
    }

    const currentBet = getCurrentBet(engine);
    const playerBet = getPlayerBet(engine, actionSeat);
    const toCall = Math.max(0, currentBet - playerBet);

    if (action === 'fold') {
      try {
        engine.act({ type: PokerAction.FOLD, playerId: actor.id });
      } catch (error) {
        this.pushNotice('Action rejected.');
        return;
      }
      this.saveTableHand(table, engine, handState.beforeStacks);
      await this.persistState();
      await this.advanceHoldemHand(table, engine, handState.beforeStacks);
      return;
    }

    if (action === 'call') {
      try {
        engine.act({ type: toCall === 0 ? PokerAction.CHECK : PokerAction.CALL, playerId: actor.id });
      } catch (error) {
        this.pushNotice('Action rejected.');
        return;
      }
      this.saveTableHand(table, engine, handState.beforeStacks);
      await this.persistState();
      await this.advanceHoldemHand(table, engine, handState.beforeStacks);
      return;
    }

    if (action === 'bet') {
      const stack = actor.stack;
      if (stack <= 0) {
        this.pushNotice('No chips left.');
        return;
      }

      const maxAmount = playerBet + stack;
      let minAmount = engine.state.bigBlind;
      if (currentBet > 0) {
        minAmount = engine.state.minRaise;
      }
      if (maxAmount < minAmount) {
        minAmount = maxAmount;
      }
      const label = currentBet > 0 ? 'Raise to (min/max)' : 'Bet amount (min/max)';
      const amountValue = await this.showPromptDialog(
        'Bet/Raise',
        `${label}: ${minAmount}-${maxAmount}`,
        String(minAmount),
      );
      if (amountValue === null) return;

      const amount = safeNumber(amountValue);
      if (amount === null || amount < minAmount || amount > maxAmount) {
        this.pushNotice(`Amount must be ${minAmount}-${maxAmount}.`);
        return;
      }

      const actionType = currentBet > 0 ? PokerAction.RAISE : PokerAction.BET;
      try {
        engine.act({ type: actionType, playerId: actor.id, amount });
      } catch (error) {
        this.pushNotice('Action rejected.');
        return;
      }

      this.saveTableHand(table, engine, handState.beforeStacks);
      await this.persistState();
      await this.advanceHoldemHand(table, engine, handState.beforeStacks);
    }
  }

  private showProfileWindow(): void {
    if (!this.currentProfile) return;
    const stats = this.currentProfile.stats;
    const lines = [
      `Player: ${this.currentProfile.username}`,
      '',
      `Chips: ${this.currentProfile.wallet.chips}`,
      `Lifetime Earned: ${this.currentProfile.wallet.lifetimeEarned}`,
      `Hands: ${stats.handsPlayed}  Wins: ${stats.wins}  Losses: ${stats.losses}`,
      `Net: ${formatChips(stats.net)}  Biggest Pot: ${stats.biggestPot}`,
      `Best Streak: ${stats.bestWinStreak}`,
    ];
    this.showTextWindow('Player Profile', lines.join('\n'));
  }

  private showAchievementsWindow(): void {
    if (!this.currentProfile) return;
    const lines: string[] = [];
    lines.push(`Unlocked: ${this.currentProfile.achievements.length}/${ACHIEVEMENTS.length}`);
    lines.push('');
    ACHIEVEMENTS.forEach((achievement) => {
      const unlocked = this.currentProfile?.achievements.includes(achievement.id);
      const status = unlocked ? '[X]' : '[ ]';
      lines.push(`${status} ${achievement.name} - ${achievement.description}`);
    });
    this.showTextWindow('Achievements', lines.join('\n'));
  }

  private showLeaderboardWindow(): void {
    const content = this.buildLeaderboardContent();
    this.showTextWindow('Leaderboard', content, {
      footer: 'Keys: 1 Daily  2 Weekly  3 All-Time',
      onKey: (key) => {
        if (key === '1') this.leaderboardMode = 'daily';
        if (key === '2') this.leaderboardMode = 'weekly';
        if (key === '3') this.leaderboardMode = 'all';
        return this.buildLeaderboardContent();
      },
    });
  }

  private async showBulletinsWindow(): Promise<void> {
    const entries = LOBBY_BULLETINS.map((entry) => `#${entry.number} ${entry.title}`);
    const selection = await this.showListDialog('Bulletins', entries);
    if (selection === null) return;

    const entry = LOBBY_BULLETINS[selection];
    if (!entry) return;

    const content = await this.readBulletin(entry.number);
    this.showTextWindow(`Bulletin #${entry.number}`, content || 'Bulletin not found.');
  }

  private buildLeaderboardContent(): string {
    const modeLabel = this.leaderboardMode === 'all' ? 'ALL-TIME' : this.leaderboardMode.toUpperCase();
    const rows = Object.values(this.profiles)
      .map((profile) => {
        const stats = this.leaderboardMode === 'daily'
          ? profile.stats.daily
          : this.leaderboardMode === 'weekly'
            ? profile.stats.weekly
            : { hands: profile.stats.handsPlayed, wins: profile.stats.wins, net: profile.stats.net };
        return {
          username: profile.username,
          wins: stats.wins,
          hands: stats.hands,
          net: stats.net,
        };
      })
      .filter((row) => row.hands > 0 || row.wins > 0)
      .sort((a, b) => b.net - a.net)
      .slice(0, 10);

    const lines: string[] = [];
    lines.push(`Mode: ${modeLabel}`);
    lines.push('');
    lines.push('RANK NAME           WINS  HANDS  NET');
    lines.push('---- -------------- ----- ------ -----');

    if (rows.length === 0) {
      lines.push('No stats yet. Play a hand to get on the board.');
    } else {
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
    }

    return lines.join('\n');
  }

  private async readBulletin(number: number): Promise<string | null> {
    if (!this.session.bbs?.readFile) return null;
    const content = await this.session.bbs.readFile(`Bulletins/bull${number}.txt`);
    if (!content) return null;
    return content.replace(/\r\n/g, '\n');
  }

  private async writeBullHelpFile(): Promise<void> {
    if (!this.session.bbs?.writeFile) return;
    const content = buildBullHelpContent();
    await this.session.bbs.writeFile('Bulletins/BullHelp.txt', content);
  }

  private async writeWeeklyBulletinIfNeeded(): Promise<void> {
    if (!this.lobby) return;
    const now = Date.now();
    if (now - this.lobby.lastBulletinAt < WEEK_MS) return;

    const content = buildWeeklyBulletin(this.lobby, this.profiles);
    if (this.session.bbs?.writeFile) {
      await this.session.bbs.writeFile(`Bulletins/bull${WEEKLY_BULLETIN_NUMBER}.txt`, content);
      this.lobby.lastBulletinAt = now;
    }
  }

  private showTextWindow(title: string, content: string, opts?: { footer?: string; onKey?: (key: string) => string | void }): void {
    if (this.modalActive) return;
    this.modalActive = true;

    this.overlayShade.show();
    const modal = createBox({
      parent: this.overlayShade,
      top: 'center',
      left: 'center',
      width: 70,
      height: 18,
      border: { type: 'ascii' },
      label: ` ${title} `,
      style: { border: UI_THEME.windowBorder, bg: 'black' },
    });

    const textBottom = opts?.footer ? 4 : 3;
    const text = blessed.scrollabletext({
      parent: modal,
      top: 1,
      left: 1,
      right: 1,
      bottom: textBottom,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      mouse: true,
      content,
      style: { fg: 'white' },
    });

    if (opts?.footer) {
      createText({
        parent: modal,
        bottom: 3,
        left: 1,
        right: 1,
        height: 1,
        content: opts.footer,
        style: { fg: UI_THEME.accent },
      });
    }

    const backButton = createButton({
      parent: modal,
      bottom: 0,
      right: 2,
      width: 10,
      height: 3,
      content: '[Back]',
      mouse: true,
      style: { fg: 'white', bg: 'blue', border: { fg: 'blue' } },
    });

    const cleanup = (): void => {
      modal.destroy();
      this.overlayShade.hide();
      this.modalActive = false;
      this.screen.render();
    };

    backButton.on('press', cleanup);
    modal.key(['escape', 'q'], cleanup);
    modal.key(['1', '2', '3'], (ch: string) => {
      if (!opts?.onKey) return;
      const next = opts.onKey(ch);
      if (typeof next === 'string') {
        text.setContent(next);
        this.screen.render();
      }
    });

    text.focus();
    this.screen.render();
  }

  private async showListDialog(title: string, items: string[]): Promise<number | null> {
    if (this.modalActive) return null;
    this.modalActive = true;

    this.overlayShade.show();

    return new Promise((resolve) => {
      const modal = createBox({
        parent: this.overlayShade,
        top: 'center',
        left: 'center',
        width: 60,
        height: 16,
        border: { type: 'ascii' },
        label: ` ${title} `,
        style: { border: UI_THEME.windowBorder, bg: 'black' },
      });

      const list = createList({
        parent: modal,
        top: 1,
        left: 1,
        right: 1,
        bottom: 1,
        items,
        keys: true,
        mouse: true,
        vi: true,
        style: {
          fg: 'white',
          selected: { fg: 'black', bg: UI_THEME.highlightBg },
        } as any,
      });

      const cleanup = (value: number | null): void => {
        modal.destroy();
        this.overlayShade.hide();
        this.modalActive = false;
        this.screen.render();
        resolve(value);
      };

      list.on('select', (_: any, index: number) => cleanup(index));
      modal.key(['escape', 'q'], () => cleanup(null));
      list.focus();
      this.screen.render();
    });
  }

  private async showPromptDialog(title: string, text: string, value: string): Promise<string | null> {
    if (this.modalActive) return null;
    this.modalActive = true;

    return new Promise((resolve) => {
      this.overlayShade.show();
      const prompt = blessed.prompt({
        parent: this.desktop,
        title: ` ${title} `,
        text,
        value,
        border: { type: 'ascii' },
        style: { fg: 'white', bg: 'black', border: { fg: UI_THEME.windowBorder.fg } },
      });

      const cleanup = (result: string | null): void => {
        prompt.destroy();
        this.overlayShade.hide();
        this.modalActive = false;
        this.screen.render();
        resolve(result);
      };

      prompt.showInput(text, value, (err, result) => {
        if (err) {
          cleanup(null);
          return;
        }
        cleanup(result ?? null);
      });

      this.screen.render();
    });
  }

  private async showYesNoDialog(title: string, text: string): Promise<boolean | null> {
    if (this.modalActive) return null;
    this.modalActive = true;

    return new Promise((resolve) => {
      this.overlayShade.show();
      const question = blessed.question({
        parent: this.desktop,
        title: ` ${title} `,
        text,
        border: { type: 'ascii' },
        style: { fg: 'white', bg: 'black', border: { fg: UI_THEME.windowBorder.fg } },
      });

      const cleanup = (value: boolean | null): void => {
        question.destroy();
        this.overlayShade.hide();
        this.modalActive = false;
        this.screen.render();
        resolve(value);
      };

      question.once('answer', (answer: boolean) => cleanup(answer));
      question.ask(text);
      this.screen.render();
    });
  }

  private async showMessageDialog(title: string, text: string): Promise<void> {
    if (this.modalActive) return;
    this.modalActive = true;

    return new Promise((resolve) => {
      this.overlayShade.show();
      const message = blessed.message({
        parent: this.desktop,
        title: ` ${title} `,
        text,
        border: { type: 'ascii' },
        style: { fg: 'white', bg: 'black', border: { fg: UI_THEME.windowBorder.fg } },
      });

      const cleanup = (): void => {
        message.destroy();
        this.overlayShade.hide();
        this.modalActive = false;
        this.screen.render();
        resolve();
      };

      message.display(text, cleanup);
      this.screen.render();
    });
  }

  private startRefreshTimer(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => {
      if (this.modalActive) return;
      this.reloadState()
        .then(() => this.updateAllPanels())
        .catch(() => undefined);
    }, REFRESH_INTERVAL_MS);
  }

  private stopRefreshTimer(): void {
    if (!this.refreshTimer) return;
    clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }
}

export async function runDoor(session: DoorSession): Promise<void> {
  const app = new CardLobbyApp(session);
  await app.run();
}

export default { runDoor, metadata };
