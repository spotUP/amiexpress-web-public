/**
 * Multiplayer Lobby Widget
 *
 * Universal multiplayer lobby UI for any game. Supports:
 * - Player list with ready states (list or slot-based)
 * - Teams (optional)
 * - In-lobby chat (optional)
 * - Custom game settings editor (optional)
 * - Leaderboard/winlist (optional)
 * - Bot management (optional)
 *
 * Usage:
 * ```typescript
 * import { MultiplayerLobby } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
 *
 * const lobby = new MultiplayerLobby({
 *   parent: screen,
 *   adapter: myNetworkAdapter,
 *   localPlayerId: 'player-123',
 *   modes: {
 *     '1v1': { name: '1v1 Match', maxPlayers: 2 },
 *     'team': { name: 'Team Battle', maxPlayers: 6, teamBased: true },
 *   },
 *   features: {
 *     chat: true,
 *     teams: true,
 *     settingsEditor: true,
 *     leaderboard: true,
 *   },
 *   gameSettings: [
 *     { key: 'startLevel', label: 'Starting Level', type: 'number', min: 1, max: 20, default: 1 },
 *     { key: 'ruleSet', label: 'Rule Set', type: 'select', options: ['Classic', 'Standard'], default: 'Standard' },
 *   ],
 * });
 * ```
 */

import { Box } from './box';
import { List } from './list';
import { Button } from './button';
import { Textbox } from './textbox';
import { DockablePanel } from './dockable-panel';
import { ListTable } from './listtable';
import { EventEmitter } from '../core/events';
import type { Screen } from '../core/screen';
import type { ElementOptions } from '../core/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Player information for the lobby
 */
export interface LobbyPlayerInfo {
  id: string;
  name: string;
  ready: boolean;
  slot?: number;          // For slot-based games (1-6 for TetriNET)
  team?: string;          // Team name (optional)
  isBot?: boolean;
  botDifficulty?: number;
  /** Custom data for game-specific info */
  extra?: Record<string, unknown>;
}

/**
 * Chat message
 */
export interface LobbyChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
  isAction?: boolean;     // /me style action
  isSystem?: boolean;     // System message
}

/**
 * Leaderboard entry
 */
export interface LobbyLeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  isTeam?: boolean;
  extra?: string;         // Additional info like "3 wins"
}

/**
 * Game setting definition
 */
export interface LobbyGameSetting {
  key: string;
  label: string;
  type: 'number' | 'select' | 'checkbox' | 'text';
  default: number | string | boolean;
  // For number type
  min?: number;
  max?: number;
  step?: number;
  // For select type
  options?: Array<{ value: string | number; label: string } | string>;
  // Host only?
  hostOnly?: boolean;
  // Description
  description?: string;
}

/**
 * Mode configuration
 */
export interface LobbyModeConfig {
  name: string;
  maxPlayers: number;
  minPlayers?: number;
  maxSlots?: number;      // For slot-based games
  teamBased?: boolean;    // Enable team selection
  teams?: string[];       // Available team names
  description?: string;
}

/**
 * Table/Lobby entry for browser mode
 */
export interface LobbyTableEntry {
  id: string | number;
  gameId?: string;
  gameName: string;
  mode?: string;
  stakes?: string;
  players: number;
  maxPlayers: number;
  status: 'waiting' | 'starting' | 'in_progress';
  hostName?: string;
  isPrivate?: boolean;
  age?: string;  // e.g., "5m ago"
  extra?: Record<string, unknown>;
}

/**
 * Lobby state
 */
export interface LobbyState {
  lobbyId?: string;
  mode: string;
  players: LobbyPlayerInfo[];
  status: 'waiting' | 'starting' | 'in_progress';
  hostId?: string;
  isPrivate?: boolean;
  settings?: Record<string, unknown>;
  chatMessages?: LobbyChatMessage[];
  leaderboard?: LobbyLeaderboardEntry[];
  // Browser mode: list of available tables
  tables?: LobbyTableEntry[];
}

/**
 * Feature flags for lobby
 */
export interface LobbyFeatures {
  /** Enable in-lobby chat */
  chat?: boolean;
  /** Enable team selection */
  teams?: boolean;
  /** Enable game settings editor */
  settingsEditor?: boolean;
  /** Enable leaderboard/winlist display */
  leaderboard?: boolean;
  /** Use slot-based player display (1-6) instead of list */
  slotBased?: boolean;
  /** Enable bot management */
  bots?: boolean;
  /** Enable table browser mode (show list of tables to join) */
  browserMode?: boolean;
  /** Enable table filtering (by game, open seats, etc.) */
  filters?: boolean;
  /** Enable observe mode (watch without playing) */
  observe?: boolean;
  /**
   * Disable the ready/start split — shows a single "Start" button for all
   * players and skips the "all players ready" gate. Default: true (ready flow on).
   * Set to false for single-player-vs-bot scenarios where the ready dance is noise.
   */
  readyFlow?: boolean;
}

/**
 * Filter options for browser mode
 */
export interface LobbyBrowserFilters {
  gameId?: string;
  openSeatsOnly?: boolean;
  status?: 'waiting' | 'starting' | 'in_progress';
  searchText?: string;
}

/**
 * Sort options for browser mode
 */
export type LobbyBrowserSortBy = 'game' | 'players' | 'status' | 'age' | 'stakes';
export type LobbyBrowserSortOrder = 'asc' | 'desc';

/**
 * Network adapter interface - implement this for your game
 */
export interface LobbyNetworkAdapter extends EventEmitter {
  // State
  getState(): LobbyState | null;

  // Actions
  joinQueue(mode: string): Promise<void>;
  createLobby(mode: string, isPrivate?: boolean): Promise<string>;
  joinLobby(lobbyId: string | number): Promise<void>;
  leaveLobby(): Promise<void>;
  setReady(ready: boolean): Promise<void>;
  startMatch(): Promise<void>;

  // Optional: Chat
  sendChat?(message: string, isAction?: boolean): void;

  // Optional: Teams
  setTeam?(team: string): Promise<void>;

  // Optional: Settings (host)
  updateSettings?(settings: Record<string, unknown>): Promise<void>;

  // Optional: Bot management
  fillWithBots?(count: number, difficulty?: number): void;
  removeBots?(): void;

  // Optional: Browser mode - table list management
  getTables?(): LobbyTableEntry[];
  refreshTables?(): Promise<void>;
  observeTable?(tableId: string | number): Promise<void>;
  filterTables?(filters: LobbyBrowserFilters): void;
}

/**
 * Lobby entry type
 */
export type LobbyEntryMode = 'matchmaking' | 'custom' | 'join';

/**
 * Lobby result
 */
export interface LobbyResult {
  action: 'start' | 'cancel';
  mode?: string;
  lobbyId?: string;
  players?: LobbyPlayerInfo[];
  settings?: Record<string, unknown>;
}

/**
 * MultiplayerLobby options
 */
export interface MultiplayerLobbyOptions extends ElementOptions {
  /** Network adapter implementing LobbyNetworkAdapter */
  adapter: LobbyNetworkAdapter;
  /** Local player's ID */
  localPlayerId: string;
  /** Available game modes */
  modes: Record<string, LobbyModeConfig>;
  /** Title to display */
  title?: string;
  /** Feature flags */
  features?: LobbyFeatures;
  /** Game settings schema (for settings editor) */
  gameSettings?: LobbyGameSetting[];
  /** Default bot difficulty (1-10) */
  defaultBotDifficulty?: number;
  /** Callback when a sound effect should play */
  onSound?: (sound: 'select' | 'error' | 'countdown' | 'join' | 'leave' | 'chat') => void;
  /** Custom player list formatter */
  formatPlayer?: (player: LobbyPlayerInfo, isLocal: boolean, isHost: boolean) => string;
  /** Custom settings formatter */
  formatSettings?: (state: LobbyState, modeConfig: LobbyModeConfig) => string;
  /** Custom leaderboard formatter */
  formatLeaderboard?: (entries: LobbyLeaderboardEntry[]) => string;
  /** Browser mode: Custom table row formatter (returns [id, game, stakes, players, status]) */
  formatTableRow?: (table: LobbyTableEntry) => string[];
  /** Browser mode: Table column headers */
  tableHeaders?: string[];
  /** Browser mode: Initial filters */
  initialFilters?: LobbyBrowserFilters;
  /** Browser mode: Auto-refresh interval in ms (0 = disabled, default: 5000) */
  autoRefreshInterval?: number;
  /** Browser mode: Initial sort field */
  initialSortBy?: LobbyBrowserSortBy;
  /** Browser mode: Initial sort order */
  initialSortOrder?: LobbyBrowserSortOrder;
  /** Browser mode: Enable search box */
  enableSearch?: boolean;
  /** Browser mode: Enable quick filter buttons */
  enableQuickFilters?: boolean;
  /** Browser mode: Custom empty state message */
  emptyStateMessage?: string;
  /** Browser mode: Show table age (created/updated time) */
  showTableAge?: boolean;
  /** Browser mode: Validate before join (returns error message or null if valid) */
  validateJoin?: (table: LobbyTableEntry, localPlayerId: string) => string | null;
  /**
   * Seconds to wait for all players to press Start before bot-filling and
   * auto-launching. Only used when readyFlow is false. Default: 60.
   */
  autoStartTimeout?: number;
}

// ============================================================================
// MultiplayerLobby Widget
// ============================================================================

/**
 * Universal MultiplayerLobby widget
 */
export class MultiplayerLobby extends EventEmitter {
  private parent: Screen;
  private options: MultiplayerLobbyOptions;
  private adapter: LobbyNetworkAdapter;
  private localPlayerId: string;
  private modes: Record<string, LobbyModeConfig>;
  private features: LobbyFeatures;
  private gameSettings: LobbyGameSetting[];

  // State
  private isHost: boolean = false;
  private localReady: boolean = false;
  private running: boolean = false;
  private result: LobbyResult | null = null;
  private hasBots: boolean = false;
  private botDifficulty: number;
  private currentSettings: Record<string, unknown> = {};
  private chatMessages: LobbyChatMessage[] = [];

  // Auto-start countdown (readyFlow: false)
  private autoStartTimer: NodeJS.Timeout | null = null;
  private autoStartCountdown: number = 60;
  private forceStartButton: Button | null = null;

  // Browser mode state
  private browserMode: boolean = false;
  private browserFilters: LobbyBrowserFilters = {};
  private selectedTableId: string | number | null = null;
  private browserSortBy: LobbyBrowserSortBy = 'players';
  private browserSortOrder: LobbyBrowserSortOrder = 'desc';
  private browserAutoRefreshTimer: NodeJS.Timeout | null = null;
  private browserSearchText: string = '';

  // UI Elements
  private container!: Box;
  private titleBox!: Box;
  private playerList!: List;
  private settingsBox!: Box;
  private statusBox!: Box;
  private readyButton!: Button;
  private startButton!: Button;
  private leaveButton!: Button;
  private fillBotsButton: Button | null = null;

  // Optional UI Elements
  private chatBox: Box | null = null;
  private chatLog: List | null = null;
  private chatInput: Textbox | null = null;
  private leaderboardBox: Box | null = null;
  private settingsEditorBox: Box | null = null;
  private settingsEditorList: List | null = null;
  private selectedSettingIndex: number = 0;
  private teamSelector: List | null = null;

  // Browser mode UI elements
  private tableBrowserBox: Box | null = null;
  private tableListWidget: any | null = null; // ListTable
  private browserActionsBox: Box | null = null;
  private filterBox: Box | null = null;
  private browserSearchInput: Textbox | null = null;
  private browserQuickFilterBox: Box | null = null;

  constructor(options: MultiplayerLobbyOptions) {
    super();

    if (!options.parent) {
      throw new Error('MultiplayerLobby requires a parent screen');
    }

    this.parent = options.parent as Screen;
    this.options = options;
    this.adapter = options.adapter;
    this.localPlayerId = options.localPlayerId;
    this.modes = options.modes;
    this.features = options.features || {};
    this.gameSettings = options.gameSettings || [];
    this.botDifficulty = options.defaultBotDifficulty ?? 5;
    this.browserMode = this.features.browserMode || false;
    this.browserFilters = options.initialFilters || {};
    this.browserSortBy = options.initialSortBy || 'players';
    this.browserSortOrder = options.initialSortOrder || 'desc';

    // Initialize default settings
    this.gameSettings.forEach(setting => {
      this.currentSettings[setting.key] = setting.default;
    });

    if (this.browserMode) {
      this.setupBrowserUI();
    } else {
      this.setupUI();
    }
    this.setupEventListeners();
  }

  /**
   * Setup UI layout - adapts based on features
   */
  // Tab state
  private currentTab: number = 0;
  private tabButtons: Button[] = [];
  private tab1Container: Box | null = null;
  private tab2Container: Box | null = null;

  private setupUI(): void {
    // Clear screen
    this.parent.children.forEach((child: { destroy: () => void }) => child.destroy());

    // Main container
    this.container = new Box({
      parent: this.parent,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      tags: true,
      z: 1,
    } as any);

    // Calculate layout
    const hasChat = this.features.chat;
    const hasLeaderboard = this.features.leaderboard;
    const hasSettingsEditor = this.features.settingsEditor && this.gameSettings.length > 0;
    const hasTeams = this.features.teams;
    const hasSocialTab = hasChat || hasLeaderboard;

    const screenWidth = typeof this.parent.width === 'number' ? this.parent.width : 80;
    const screenHeight = typeof this.parent.height === 'number' ? this.parent.height : 24;

    // Row 0: Title (centered) + Tab buttons (right side)
    const titleText = this.options.title || 'MULTIPLAYER LOBBY';
    this.titleBox = new Box({
      parent: this.container,
      top: 0,
      left: 'center',
      width: titleText.length + 6,
      height: 1,
      content: `{bold}{cyan-fg}[ ${titleText} ]{/cyan-fg}{/bold}`,
      tags: true,
    });

    // Tab buttons on same row as title (if social features exist)
    if (hasSocialTab) {
      const tab1Btn = new Button({
        parent: this.container,
        top: 0,
        left: screenWidth - 24,
        width: 10,
        height: 1,
        content: '[1] Game',
        style: { bg: 'blue', fg: 'white', focus: { bg: 'cyan' } },
        border: 'none',
        mouse: true,
        tags: true,
      } as any);
      const tab2Btn = new Button({
        parent: this.container,
        top: 0,
        left: screenWidth - 13,
        width: 12,
        height: 1,
        content: '[2] Social',
        style: { bg: 'black', fg: 'gray', focus: { bg: 'cyan' } },
        border: 'none',
        mouse: true,
        tags: true,
      } as any);
      this.tabButtons = [tab1Btn, tab2Btn];

      tab1Btn.on('press', () => this.switchTab(0));
      tab2Btn.on('press', () => this.switchTab(1));

      // Tab keyboard shortcuts (only if no input widget has focus)
      this.parent.key(['1'], () => {
        if (!this.widgetHasFocus()) this.switchTab(0);
      });
      this.parent.key(['2'], () => {
        if (!this.widgetHasFocus()) this.switchTab(1);
      });
    }

    // Layout constants - content starts at row 1 (right after title)
    const contentTop = 1;
    const buttonRowHeight = 3;  // Row for buttons + 1 row margin
    const availableHeight = screenHeight - contentTop - buttonRowHeight;
    const panelContentTop = 1;
    const panelContentWidth = (panelWidth: number) => Math.max(1, panelWidth - 4);  // Extra space to prevent scrollbar bleed
    const panelContentHeight = (panelHeight: number) => Math.max(1, panelHeight - 3);

    // ============ TAB 1: GAME (Players, Team, Settings, Options) ============
    this.tab1Container = new Box({
      parent: this.container,
      top: contentTop,
      left: 0,
      width: '100%',
      height: availableHeight,
      tags: true,
    });

    // Two-column layout for Tab 1
    const leftColWidth = Math.floor((screenWidth - 6) / 2);
    const rightColWidth = screenWidth - leftColWidth - 6;
    const leftColLeft = 2;
    const rightColLeft = leftColWidth + 4;

    // Player list (left column, full height)
    const playerListHeight = availableHeight;
    const playerPanel = new DockablePanel({
      parent: this.tab1Container,
      top: 0,
      left: leftColLeft,
      width: leftColWidth,
      height: playerListHeight,
      label: this.features.slotBased ? 'Players (Slots)' : 'Players',
      style: { border: { fg: 'cyan' }, bg: 'black' },
      fitContent: false,
      allowAutoDock: false,
      resizable: false,
      draggable: false,
      showMinimizeButton: false,
    });
    this.playerList = new List({
      parent: playerPanel,
      top: panelContentTop,
      left: 0,
      width: panelContentWidth(leftColWidth),
      height: panelContentHeight(playerListHeight),
      items: [],
      mouse: true,
      keys: true,
      vi: true,
      tags: true,
      style: {
        fg: 'white',
        selected: { bg: 'blue', fg: 'white' },
      },
    });

    console.log('[MultiplayerLobby] playerList created, keys:', (this.playerList as any).options?.keys, 'mouse:', (this.playerList as any).options?.mouse);

    this.playerList.on('focus', () => {
      console.log('[MultiplayerLobby] playerList FOCUSED');
    });

    this.playerList.on('blur', () => {
      console.log('[MultiplayerLobby] playerList BLURRED');
    });

    this.playerList.on('click', () => {
      console.log('[MultiplayerLobby] playerList CLICKED');
    });

    this.playerList.on('keypress', (ch: any, key: any) => {
      console.log('[MultiplayerLobby] playerList keypress:', { ch, keyName: key?.name, keyFull: key?.full });
    });

    this.playerList.on('select item', (_item: any, index: number) => {
      console.log('[MultiplayerLobby] playerList select item:', index);
    });

    // Right column panels (stacked: Team, Room Settings, Game Options)
    let rightTop = 0;
    const rightPanelCount = (hasTeams ? 1 : 0) + 1 + (hasSettingsEditor ? 1 : 0);
    const basePanelHeight = Math.floor(availableHeight / rightPanelCount);

    // Team selector (if enabled)
    if (hasTeams) {
      const teamSelectorHeight = Math.max(4, Math.min(basePanelHeight, 6));
      const teamPanel = new DockablePanel({
        parent: this.tab1Container,
        top: rightTop,
        left: rightColLeft,
        width: rightColWidth,
        height: teamSelectorHeight,
        label: 'Select Team',
        style: { border: { fg: 'magenta' }, bg: 'black' },
        fitContent: false,
        allowAutoDock: false,
        resizable: false,
        draggable: false,
        showMinimizeButton: false,
      });
      this.teamSelector = new List({
        parent: teamPanel,
        top: panelContentTop,
        left: 0,
        width: panelContentWidth(rightColWidth),
        height: panelContentHeight(teamSelectorHeight),
        items: ['No Team'],
        mouse: true,
        keys: true,
        vi: true,
        tags: true,
        style: {
          fg: 'white',
          selected: { bg: 'magenta', fg: 'white' },
        },
      });

      this.teamSelector.on('select', (_item: unknown, index: number) => {
        void this.selectTeam(index);
      });
      rightTop += teamSelectorHeight;
    }

    // Room settings panel
    const roomSettingsHeight = Math.max(4, Math.min(basePanelHeight, 6));
    const settingsPanel = new DockablePanel({
      parent: this.tab1Container,
      top: rightTop,
      left: rightColLeft,
      width: rightColWidth,
      height: roomSettingsHeight,
      label: 'Room Settings',
      style: { border: { fg: 'green' }, bg: 'black' },
      fitContent: false,
      allowAutoDock: false,
      resizable: false,
      draggable: false,
      showMinimizeButton: false,
    });
    this.settingsBox = new Box({
      parent: settingsPanel,
      top: panelContentTop,
      left: 0,
      width: panelContentWidth(rightColWidth),
      height: panelContentHeight(roomSettingsHeight),
      content: '',
      tags: true,
    });
    rightTop += roomSettingsHeight;

    // Settings editor (if enabled)
    if (hasSettingsEditor) {
      const remainingHeight = availableHeight - rightTop;
      const settingsEditorHeight = Math.max(4, remainingHeight);
      this.settingsEditorBox = new DockablePanel({
        parent: this.tab1Container,
        top: rightTop,
        left: rightColLeft,
        width: rightColWidth,
        height: settingsEditorHeight,
        label: 'Game Options (O)',
        style: { border: { fg: 'yellow' }, bg: 'black' },
        fitContent: false,
        allowAutoDock: false,
        resizable: false,
        draggable: false,
        showMinimizeButton: false,
      });

      this.settingsEditorList = new List({
        parent: this.settingsEditorBox,
        top: panelContentTop,
        left: 0,
        width: panelContentWidth(rightColWidth),
        height: panelContentHeight(settingsEditorHeight),
        items: [],
        mouse: true,
        keys: true,
        vi: true,
        style: {
          fg: 'white',
          selected: { bg: 'blue', fg: 'white' },
        },
        tags: true,
      });

      console.log('[MultiplayerLobby] settingsEditorList created, keys:', (this.settingsEditorList as any).options?.keys, 'mouse:', (this.settingsEditorList as any).options?.mouse);

      this.settingsEditorList.key(['left', 'h'], () => {
        console.log('[MultiplayerLobby] settingsEditorList LEFT key pressed');
        this.changeSettingValue(-1);
      });
      this.settingsEditorList.key(['right', 'l'], () => {
        console.log('[MultiplayerLobby] settingsEditorList RIGHT key pressed');
        this.changeSettingValue(1);
      });
      this.settingsEditorList.key(['enter', 'space'], () => {
        console.log('[MultiplayerLobby] settingsEditorList ENTER/SPACE key pressed');
        this.changeSettingValue(1);
      });

      this.settingsEditorList.on('select item', (_item: unknown, index: number) => {
        console.log('[MultiplayerLobby] settingsEditorList select item:', index);
        this.selectedSettingIndex = index;
      });

      this.settingsEditorList.on('focus', () => {
        console.log('[MultiplayerLobby] settingsEditorList FOCUSED');
      });

      this.settingsEditorList.on('blur', () => {
        console.log('[MultiplayerLobby] settingsEditorList BLURRED');
      });

      this.settingsEditorList.on('click', () => {
        console.log('[MultiplayerLobby] settingsEditorList CLICKED');
      });

      this.settingsEditorList.on('keypress', (ch: any, key: any) => {
        console.log('[MultiplayerLobby] settingsEditorList keypress:', { ch, keyName: key?.name, keyFull: key?.full });
      });

      this.updateSettingsEditor();
    }

    // ============ TAB 2: SOCIAL (Leaderboard + Chat) ============
    if (hasSocialTab) {
      this.tab2Container = new Box({
        parent: this.container,
        top: contentTop,
        left: 0,
        width: '100%',
        height: availableHeight,
        tags: true,
        hidden: true,  // Start hidden
      });

      // Two columns for social tab
      const socialLeftWidth = Math.floor((screenWidth - 6) / 2);
      const socialRightWidth = screenWidth - socialLeftWidth - 6;

      // Leaderboard (left column, full height)
      if (hasLeaderboard) {
        const leaderboardPanel = new DockablePanel({
          parent: this.tab2Container,
          top: 0,
          left: 2,
          width: socialLeftWidth,
          height: availableHeight,
          label: 'Leaderboard / Winlist',
          style: { border: { fg: 'cyan' }, bg: 'black' },
          fitContent: false,
          allowAutoDock: false,
          resizable: false,
          draggable: false,
          showMinimizeButton: false,
        });
        this.leaderboardBox = new Box({
          parent: leaderboardPanel,
          top: panelContentTop,
          left: 0,
          width: panelContentWidth(socialLeftWidth),
          height: panelContentHeight(availableHeight),
          content: '{gray-fg}No leaderboard data{/gray-fg}',
          tags: true,
          scrollable: true,
        });
      }

      // Chat (right column, full height)
      if (hasChat) {
        const chatLeft = hasLeaderboard ? socialLeftWidth + 4 : 2;
        const chatWidth = hasLeaderboard ? socialRightWidth : screenWidth - 4;

        this.chatBox = new DockablePanel({
          parent: this.tab2Container,
          top: 0,
          left: chatLeft,
          width: chatWidth,
          height: availableHeight,
          label: 'Chat (T to type)',
          style: { border: { fg: 'white' }, bg: 'black' },
          fitContent: false,
          allowAutoDock: false,
          resizable: false,
          draggable: false,
          showMinimizeButton: false,
        });

        const chatContentHeight = panelContentHeight(availableHeight);
        const chatLogHeight = Math.max(1, chatContentHeight - 2);
        this.chatLog = new List({
          parent: this.chatBox,
          top: panelContentTop,
          left: 0,
          width: panelContentWidth(chatWidth),
          height: chatLogHeight,
          items: [],
          mouse: true,
          scrollable: true,
          tags: true,
        });

        this.chatInput = new Textbox({
          parent: this.chatBox,
          bottom: 0,
          left: 0,
          width: panelContentWidth(chatWidth),
          height: 1,
          style: {
            fg: 'white',
            bg: 'black',
            focus: { bg: 'blue' },
          },
          inputOnFocus: true,
          tags: true,
        });

        this.chatInput.on('submit', (text: string) => {
          if (text.trim()) {
            this.sendChatMessage(text.trim());
          }
          this.chatInput?.clearValue();
          this.chatInput?.focus();
        });
      }
    }

    // Status box (completely hidden when chat or social tab exists)
    // Status messages go to chat instead
    this.statusBox = new Box({
      parent: this.container,
      top: 0,
      left: 0,
      width: 1,
      height: 1,
      content: '',
      tags: true,
      hidden: true,  // Always hidden - we use chat for status now
    });

    // ============ BUTTONS ROW ============
    const hasReadyFlow = this.features.readyFlow !== false;
    const buttonTop = screenHeight - 3;
    let buttonLeft = 2;
    console.log('[MultiplayerLobby] Creating buttons at row', buttonTop, 'screenHeight=', screenHeight);

    // Ready button — hidden permanently when readyFlow is disabled
    this.readyButton = new Button({
      parent: this.container,
      top: buttonTop,
      left: buttonLeft,
      width: 10,
      height: 1,
      content: ' Ready ',
      style: {
        bg: 'green',
        fg: 'white',
        focus: { bg: 'blue' },
      },
      border: 'none',
      mouse: true,
      hidden: !hasReadyFlow,
      tags: true,
    } as any);
    if (hasReadyFlow) buttonLeft += 12;

    // Start button — always visible when readyFlow is disabled; host-only otherwise.
    // Only ghost it when readyFlow is on: in that mode it's a pure "launch the
    // match" trigger for the host. When readyFlow is off, startMatch() repaints
    // it blue/" Ready! " as a persistent status readout (see below) - that must
    // stay visible even when focus has moved elsewhere, so it can't be ghosted.
    this.startButton = new Button({
      parent: this.container,
      top: buttonTop,
      left: buttonLeft,
      width: 10,
      height: 1,
      content: ' Start ',
      style: {
        bg: 'yellow',
        fg: 'black',
        focus: { bg: 'blue' },
      },
      border: 'none',
      mouse: true,
      hidden: hasReadyFlow,  // setAsHost() will un-hide for host when readyFlow is on
      ghostWhenIdle: hasReadyFlow,
      tags: true,
    } as any);
    buttonLeft += 12;

    // Leave button — pure action, safe to ghost when not focused.
    this.leaveButton = new Button({
      parent: this.container,
      top: buttonTop,
      left: buttonLeft,
      width: 10,
      height: 1,
      content: ' Leave ',
      style: {
        bg: 'red',
        fg: 'white',
        focus: { bg: 'blue' },
      },
      border: 'none',
      mouse: true,
      ghostWhenIdle: true,
      tags: true,
    } as any);
    buttonLeft += 12;

    // Fill Bots button (optional, host only) — pure action, safe to ghost.
    if (this.features.bots !== false && this.adapter.fillWithBots) {
      this.fillBotsButton = new Button({
        parent: this.container,
        top: buttonTop,
        left: buttonLeft,
        width: 10,
        height: 1,
        content: ' Bots ',
        style: {
          bg: 'cyan',
          fg: 'black',
          focus: { bg: 'blue' },
        },
        border: 'none',
        mouse: true,
        hidden: true,
        ghostWhenIdle: true,
        tags: true,
      } as any);

      this.fillBotsButton.on('press', () => this.toggleBots());
    }

    // Force Start button (readyFlow:false, host only, shown after host presses
    // Start) — pure action, safe to ghost.
    if (!hasReadyFlow) {
      this.forceStartButton = new Button({
        parent: this.container,
        top: buttonTop,
        left: buttonLeft,
        width: 14,
        height: 1,
        content: ' Force Start ',
        style: {
          bg: 'red',
          fg: 'white',
          focus: { bg: 'blue' },
        },
        border: 'none',
        mouse: true,
        hidden: true,
        ghostWhenIdle: true,
        tags: true,
      } as any);
      this.forceStartButton.on('press', () => void this.forceStart());
    }

    // Setup button handlers
    this.readyButton.on('press', () => void this.toggleReady());
    this.startButton.on('press', () => void this.startMatch());
    this.leaveButton.on('press', () => void this.leaveLobby());

    // Footer hint - TAB-to-switch-panel is not discoverable otherwise;
    // there's no visual cue that focus can move between the player list,
    // the settings list, and the button row.
    new Box({
      parent: this.container,
      top: buttonTop + 1,
      left: 2,
      width: screenWidth - 4,
      height: 1,
      content: '{gray-fg}TAB{/gray-fg} switch panel   {gray-fg}↑↓{/gray-fg} navigate   {gray-fg}ENTER{/gray-fg} select   {gray-fg}ESC{/gray-fg} leave',
      tags: true,
    });

    // Log ALL screen-level keypresses for debugging
    this.parent.on('keypress', (ch: any, key: any) => {
      console.log('[MultiplayerLobby] SCREEN keypress:', {
        ch,
        keyName: key?.name,
        keyFull: key?.full,
        focused: this.parent.focused ? {
          type: (this.parent.focused as any).type,
          name: (this.parent.focused as any).name
        } : null
      });
    });

    // Keyboard shortcuts (only trigger if no input widget has focus)
    if (hasReadyFlow) {
      this.parent.key(['r'], () => {
        console.log('[MultiplayerLobby] R key handler triggered');
        if (!this.widgetHasFocus()) void this.toggleReady();
      });
    }
    this.parent.key(['s'], () => {
      console.log('[MultiplayerLobby] S key handler triggered');
      if (!this.widgetHasFocus()) void this.startMatch();
    });
    this.parent.key(['escape', 'q'], () => {
      console.log('[MultiplayerLobby] ESC/Q key handler triggered');
      void this.leaveLobby();
    });
    if (hasChat) {
      this.parent.key(['t'], () => {
        if (!this.widgetHasFocus()) {
          if (this.currentTab !== 1) this.switchTab(1);
          this.chatInput?.focus();
        }
      });
    }
    if (hasSettingsEditor) {
      this.parent.key(['o'], () => {
        if (!this.widgetHasFocus()) {
          if (this.currentTab !== 0) this.switchTab(0);
          this.settingsEditorList?.focus();
        }
      });
    }

    // Tab key cycles focus between panels and buttons (skip hidden ones).
    const allFocusTargets = [
      this.playerList,
      this.teamSelector,
      this.settingsEditorList,
      hasReadyFlow ? this.readyButton : null,
      this.startButton,
      this.leaveButton,
    ].filter(Boolean) as any[];

    const getVisibleFocusTargets = () => allFocusTargets.filter(t => !t.hidden);

    let focusIndex = 0;
    this.parent.key(['tab'], () => {
      const focusTargets = getVisibleFocusTargets();
      if (focusTargets.length === 0) return;
      focusIndex = (focusIndex + 1) % focusTargets.length;
      focusTargets[focusIndex]?.focus();
      this.parent.render();
    });
    this.parent.key(['S-tab'], () => {
      const focusTargets = getVisibleFocusTargets();
      if (focusTargets.length === 0) return;
      focusIndex = (focusIndex - 1 + focusTargets.length) % focusTargets.length;
      focusTargets[focusIndex]?.focus();
      this.parent.render();
    });

    // P key to focus player list
    this.parent.key(['p'], () => {
      if (!this.widgetHasFocus()) {
        if (this.currentTab !== 0) this.switchTab(0);
        this.playerList?.focus();
      }
    });

    // Start with player list focused so user can navigate immediately
    console.log('[MultiplayerLobby] Focusing player list, exists:', !!this.playerList, 'keys:', (this.playerList as any)?.options?.keys, 'mouse:', (this.playerList as any)?.options?.mouse);
    this.playerList?.focus();
    console.log('[MultiplayerLobby] After focus, screen.focused:', this.parent.focused ? {
      type: (this.parent.focused as any).type,
      name: (this.parent.focused as any).name
    } : null);
  }

  /**
   * Switch between tabs
   */
  private switchTab(tabIndex: number): void {
    if (tabIndex === this.currentTab) return;
    this.currentTab = tabIndex;

    // Update tab button styles
    this.tabButtons.forEach((btn, idx) => {
      if (idx === tabIndex) {
        btn.style.bg = 'blue';
        btn.style.fg = 'white';
      } else {
        btn.style.bg = 'black';
        btn.style.fg = 'gray';
      }
    });

    // Show/hide tab containers
    if (this.tab1Container) {
      this.tab1Container.hidden = tabIndex !== 0;
    }
    if (this.tab2Container) {
      this.tab2Container.hidden = tabIndex !== 1;
    }

    this.parent.render();
  }

  /**
   * Setup browser mode UI (table list for joining games)
   */
  private setupBrowserUI(): void {
    // Clear screen
    this.parent.children.forEach((child: { destroy: () => void }) => child.destroy());

    // Main container
    this.container = new Box({
      parent: this.parent,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      tags: true,
    });

    // Title
    this.titleBox = new Box({
      parent: this.container,
      top: 0,
      left: 'center',
      width: 60,
      height: 1,
      content: `{bold}{yellow-fg}${this.options.title || 'GAME BROWSER'}{/yellow-fg}{/bold}`,
      tags: true,
    });

    let currentTop = 1;
    const screenHeight = typeof this.parent.height === 'number' ? this.parent.height : 24;

    // Search box (if enabled)
    if (this.options.enableSearch) {
      const searchBox = new Box({
        parent: this.container,
        top: currentTop,
        left: 2,
        width: 76,
        height: 3,
        border: { type: 'line' },
        label: ' Search ',
        style: { border: { fg: 'white' } },
        tags: true,
      });

      this.browserSearchInput = new Textbox({
        parent: searchBox,
        top: 0,
        left: 0,
        width: '100%-2',
        height: 1,
        style: {
          fg: 'white',
          bg: 'black',
          focus: { bg: 'blue' },
        },
        inputOnFocus: true,
        tags: true,
      });

      this.browserSearchInput.on('submit', (text: string) => {
        this.browserSearchText = text.trim();
        this.updateBrowserTableList();
      });

      this.browserSearchInput.key(['escape'], () => {
        this.browserSearchInput?.clearValue();
        this.browserSearchText = '';
        this.updateBrowserTableList();
        this.tableListWidget?.focus();
      });

      currentTop += 3;
    }

    // Quick filters (if enabled)
    if (this.options.enableQuickFilters) {
      this.browserQuickFilterBox = new Box({
        parent: this.container,
        top: currentTop,
        left: 2,
        width: 76,
        height: 1,
        content: '{cyan-fg}Filters:{/cyan-fg} [A]ll  [O]pen Seats  [P]laying',
        style: { fg: 'white', bg: 'black' },
        tags: true,
      });
      currentTop += 1;

      // Filter keyboard shortcuts
      this.parent.key(['a'], () => {
        this.browserFilters.openSeatsOnly = false;
        this.browserFilters.status = undefined;
        this.updateBrowserTableList();
      });
      this.parent.key(['o'], () => {
        this.browserFilters.openSeatsOnly = true;
        this.updateBrowserTableList();
      });
      this.parent.key(['p'], () => {
        this.browserFilters.status = 'in_progress';
        this.updateBrowserTableList();
      });
    }

    const tableListHeight = screenHeight - currentTop - 6; // Reserve space for buttons (1) + gap (1) + status (3) + margin (1)

    // Table browser panel
    this.tableBrowserBox = new DockablePanel({
      parent: this.container,
      top: currentTop,
      left: 2,
      width: 76,
      height: tableListHeight,
      label: 'Available Tables',
      style: { border: { fg: 'cyan' }, bg: 'black' },
      fitContent: false,
      allowAutoDock: true,
      resizable: true,
      draggable: true,
      dockPosition: 'float',
      persistenceKey: 'multiplayer-lobby.browser',
      showMinimizeButton: false,
    });

    // Table list widget using ListTable
    // Headers will be set dynamically in updateBrowserTableList() with sort indicators
    const initialHeaders = this.options.tableHeaders || ['ID', 'Game', 'Stakes', 'Players', 'Status'];

    this.tableListWidget = new ListTable({
      parent: this.tableBrowserBox,
      top: 1,
      left: 0,
      width: 74,
      height: tableListHeight - 3,
      headers: initialHeaders,
      rows: [],
      interactive: true,
      keys: true,
      mouse: true,
      vi: true,
      style: {
        fg: 'white',
        selected: { fg: 'black', bg: 'cyan' },
        header: { fg: 'yellow', bold: true },
      } as any,
    });

    // Track selected table
    this.tableListWidget.on('select', (_item: unknown, index: number) => {
      const tables = this.adapter.getTables?.() || [];
      if (tables[index]) {
        this.selectedTableId = tables[index].id;
      }
    });

    // Allow action keys to bubble up to screen handlers
    // The table list should only handle navigation (arrows, enter, vi keys)
    // but pass through shortcut keys (c, j, r, etc.) to screen-level handlers
    this.tableListWidget.key(['c', 'j', 'r', 'o', 's', '/', 'f'], () => {
      // Return false to not consume the key - let it bubble to screen handlers
      return false;
    });

    // Action buttons row (inline style - 1 row, no borders)
    const buttonTop = currentTop + tableListHeight;
    let buttonLeft = 2;

    // Create button
    const createButton = new Button({
      parent: this.container,
      top: buttonTop,
      left: buttonLeft,
      width: 10,
      height: 1,
      inline: true,
      content: 'Create',
      style: {
        bg: 'green',
        fg: 'white',
        focus: { bg: 'cyan', fg: 'black' },
        hover: { bg: 'cyan', fg: 'black' },
      },
      mouse: true,
      ghostWhenIdle: true,
      tags: true,
    });
    buttonLeft += 11;

    // Join button
    const joinButton = new Button({
      parent: this.container,
      top: buttonTop,
      left: buttonLeft,
      width: 8,
      height: 1,
      inline: true,
      content: 'Join',
      style: {
        bg: 'yellow',
        fg: 'black',
        focus: { bg: 'cyan', fg: 'black' },
        hover: { bg: 'cyan', fg: 'black' },
      },
      mouse: true,
      ghostWhenIdle: true,
      tags: true,
    });
    buttonLeft += 9;

    // Observe button (if feature enabled)
    let observeButton: Button | null = null;
    if (this.features.observe && this.adapter.observeTable) {
      observeButton = new Button({
        parent: this.container,
        top: buttonTop,
        left: buttonLeft,
        width: 11,
        height: 1,
        inline: true,
        content: 'Observe',
        style: {
          bg: 'cyan',
          fg: 'black',
          focus: { bg: 'white', fg: 'black' },
          hover: { bg: 'white', fg: 'black' },
        },
        mouse: true,
        ghostWhenIdle: true,
        tags: true,
      });
      buttonLeft += 12;
    }

    // Refresh button
    const refreshButton = new Button({
      parent: this.container,
      top: buttonTop,
      left: buttonLeft,
      width: 11,
      height: 1,
      inline: true,
      content: 'Refresh',
      style: {
        bg: 'magenta',
        fg: 'white',
        focus: { bg: 'cyan', fg: 'black' },
        hover: { bg: 'cyan', fg: 'black' },
      },
      mouse: true,
      ghostWhenIdle: true,
      tags: true,
    });
    buttonLeft += 12;

    // Leave button
    this.leaveButton = new Button({
      parent: this.container,
      top: buttonTop,
      left: buttonLeft,
      width: 8,
      height: 1,
      inline: true,
      content: 'Back',
      style: {
        bg: 'red',
        fg: 'white',
        focus: { bg: 'yellow', fg: 'black' },
        hover: { bg: 'yellow', fg: 'black' },
      },
      ghostWhenIdle: true,
      mouse: true,
      tags: true,
    });

    // Status box at bottom (2 rows below buttons for clear separation)
    this.statusBox = new Box({
      parent: this.container,
      top: buttonTop + 2,
      left: 2,
      width: 76,
      height: 3,
      border: { type: 'line' },
      label: ' Status ',
      style: { border: { fg: 'gray' } },
      content: '',
      tags: true,
    });

    // Setup button handlers
    createButton.on('press', () => {
      console.log('[MultiplayerLobby] Create button pressed!');
      void this.browserCreateTable();
    });
    joinButton.on('press', () => void this.browserJoinTable());
    if (observeButton) {
      observeButton.on('press', () => void this.browserObserveTable());
    }
    refreshButton.on('press', () => void this.browserRefreshTables());
    this.leaveButton.on('press', () => void this.leaveLobby());

    // Keyboard shortcuts
    this.parent.key(['c'], () => void this.browserCreateTable());
    this.parent.key(['j'], () => void this.browserJoinTable());
    if (this.features.observe && this.adapter.observeTable) {
      this.parent.key(['o'], () => void this.browserObserveTable());
    }
    this.parent.key(['r'], () => void this.browserRefreshTables());
    this.parent.key(['escape', 'q'], () => void this.leaveLobby());
    if (this.browserSearchInput) {
      this.parent.key(['/', 'f'], () => this.browserSearchInput?.focus());
    }
    // Sort cycling with S key
    this.parent.key(['s'], () => this.cycleBrowserSort());

    console.log('[MultiplayerLobby] Browser mode key handlers registered');
    console.log('[MultiplayerLobby] parent.grabKeys:', (this.parent.screen?.program as any)?.grabKeys);

    // Focus on table list initially (or search if enabled)
    if (this.browserSearchInput) {
      this.browserSearchInput.focus();
    } else {
      this.tableListWidget.focus();
    }

    // Initial table load
    this.updateBrowserTableList();

    // Start auto-refresh timer if enabled
    const refreshInterval = this.options.autoRefreshInterval ?? 5000;
    if (refreshInterval > 0) {
      this.browserAutoRefreshTimer = setInterval(() => {
        void this.browserRefreshTables();
      }, refreshInterval);
    }
  }

  /**
   * Browser mode: Update table list display
   */
  private updateBrowserTableList(): void {
    if (!this.tableListWidget) return;

    const tables = this.adapter.getTables?.() || [];

    // Apply filters
    let filtered = tables;

    // Game ID filter
    if (this.browserFilters.gameId) {
      filtered = filtered.filter(t => t.gameId === this.browserFilters.gameId);
    }

    // Open seats only filter
    if (this.browserFilters.openSeatsOnly) {
      filtered = filtered.filter(t => t.players < t.maxPlayers);
    }

    // Status filter
    if (this.browserFilters.status) {
      filtered = filtered.filter(t => t.status === this.browserFilters.status);
    }

    // Search text filter
    if (this.browserSearchText) {
      const search = this.browserSearchText.toLowerCase();
      filtered = filtered.filter(t =>
        t.gameName.toLowerCase().includes(search) ||
        (t.hostName && t.hostName.toLowerCase().includes(search)) ||
        String(t.id).includes(search)
      );
    }

    // Sort tables
    filtered.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (this.browserSortBy) {
        case 'game':
          aVal = a.gameName;
          bVal = b.gameName;
          break;
        case 'players':
          aVal = a.players;
          bVal = b.players;
          break;
        case 'stakes':
          aVal = a.stakes || '';
          bVal = b.stakes || '';
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'age':
          aVal = a.age || '';
          bVal = b.age || '';
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return this.browserSortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.browserSortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // Build headers with sort indicator
    let headers = this.options.tableHeaders || ['ID', 'Game', 'Stakes', 'Players', 'Status'];
    // Add Age header if enabled
    if (this.options.showTableAge) {
      headers = [...headers, 'Age'];
    }
    // Add sort indicator to current sort column
    const headerMap: Record<string, number> = {
      'game': 1,
      'stakes': 2,
      'players': 3,
      'status': 4,
      'age': 5,
    };
    const sortColumnIndex = headerMap[this.browserSortBy];
    if (sortColumnIndex !== undefined && sortColumnIndex < headers.length) {
      const arrow = this.browserSortOrder === 'asc' ? '↑' : '↓';
      headers = headers.map((h, i) => i === sortColumnIndex ? `${h} ${arrow}` : h);
    }

    // Format data rows
    const dataRows: string[][] = [];
    filtered.forEach(table => {
      if (this.options.formatTableRow) {
        // Use custom formatter
        dataRows.push(this.options.formatTableRow(table));
      } else {
        // Default format
        const playerCount = `${table.players}/${table.maxPlayers}`;
        const statusColor = table.status === 'waiting' ? 'green' : table.status === 'starting' ? 'yellow' : 'red';
        const status = `{${statusColor}-fg}${table.status.toUpperCase()}{/${statusColor}-fg}`;

        const row = [
          String(table.id),
          table.gameName,
          table.stakes || '-',
          playerCount,
          status,
        ];

        // Add age column if enabled
        if (this.options.showTableAge && table.age) {
          row.push(table.age);
        }

        dataRows.push(row);
      }
    });

    const emptyMessage = this.options.emptyStateMessage || 'No tables available. Press C to create one.';
    if (dataRows.length === 0) {
      dataRows.push(['', emptyMessage, '', '', '']);
    }

    // ListTable.setData() expects first row to be headers
    this.tableListWidget.setData([headers, ...dataRows]);
    this.parent.render();
  }

  /**
   * Browser mode: Cycle through sort options
   */
  private cycleBrowserSort(): void {
    const sortFields: LobbyBrowserSortBy[] = ['players', 'game', 'status', 'stakes'];
    if (this.options.showTableAge) {
      sortFields.push('age');
    }

    const currentIndex = sortFields.indexOf(this.browserSortBy);
    const nextIndex = (currentIndex + 1) % sortFields.length;

    // If same field, toggle order; otherwise set to desc
    if (this.browserSortBy === sortFields[nextIndex]) {
      this.browserSortOrder = this.browserSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.browserSortBy = sortFields[nextIndex];
      this.browserSortOrder = 'desc';
    }

    this.updateBrowserTableList();
    this.updateStatus(`Sorted by ${this.browserSortBy} (${this.browserSortOrder})`);
    this.playSound('select');
  }

  /**
   * Browser mode: Create new table
   */
  private async browserCreateTable(): Promise<void> {
    console.log('[MultiplayerLobby] browserCreateTable() called');
    // Emit event for door to handle mode selection and table creation
    console.log('[MultiplayerLobby] Emitting browser:create-table event');
    this.emit('browser:create-table');
    console.log('[MultiplayerLobby] Event emitted');
  }

  /**
   * Browser mode: Join selected table
   */
  private async browserJoinTable(): Promise<void> {
    if (!this.selectedTableId) {
      this.updateStatus('No table selected');
      this.playSound('error');
      return;
    }

    // Find the selected table
    const tables = this.adapter.getTables?.() || [];
    const selectedTable = tables.find(t => t.id === this.selectedTableId);
    if (!selectedTable) {
      this.updateStatus('Table not found');
      this.playSound('error');
      return;
    }

    // Validate join if validator provided
    if (this.options.validateJoin) {
      const error = this.options.validateJoin(selectedTable, this.localPlayerId);
      if (error) {
        this.updateStatus(error);
        this.playSound('error');
        return;
      }
    }

    // Built-in validation: check if table is full
    if (selectedTable.players >= selectedTable.maxPlayers) {
      this.updateStatus('Table is full');
      this.playSound('error');
      return;
    }

    this.updateStatus(`Joining table ${this.selectedTableId}...`);

    try {
      await this.adapter.joinLobby(this.selectedTableId);

      // Transition from browser mode to lobby mode
      this.browserMode = false;
      this.setupUI();

      const state = this.adapter.getState();
      if (state) {
        this.updateSettings(state.mode, String(this.selectedTableId));
      }

      this.updateStatus('Joined table');
      this.playSound('join');
    } catch (err) {
      this.updateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      this.playSound('error');
    }
  }

  /**
   * Browser mode: Observe selected table
   */
  private async browserObserveTable(): Promise<void> {
    if (!this.adapter.observeTable) {
      this.updateStatus('Observe mode not supported');
      this.playSound('error');
      return;
    }

    if (!this.selectedTableId) {
      this.updateStatus('No table selected');
      this.playSound('error');
      return;
    }

    this.updateStatus(`Observing table ${this.selectedTableId}...`);

    try {
      await this.adapter.observeTable(this.selectedTableId);
      this.result = { action: 'start', mode: 'observe', lobbyId: String(this.selectedTableId) };
      this.running = false;
      this.playSound('select');
    } catch (err) {
      this.updateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      this.playSound('error');
    }
  }

  /**
   * Browser mode: Refresh table list
   */
  private async browserRefreshTables(): Promise<void> {
    this.updateStatus('Refreshing tables...');

    try {
      if (this.adapter.refreshTables) {
        await this.adapter.refreshTables();
      }
      this.updateBrowserTableList();
      this.updateStatus('Tables refreshed');
      this.playSound('select');
    } catch (err) {
      this.updateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      this.playSound('error');
    }
  }

  /**
   * Setup network event listeners
   */
  private setupEventListeners(): void {
    console.log('[MultiplayerLobby] Setting up event listeners');
    // Player joined
    this.adapter.on('player:joined', (player: LobbyPlayerInfo) => {
      console.log('[MultiplayerLobby] player:joined event received:', player);
      this.playSound('join');
      this.updatePlayerList();
      this.updateStatus(`${player.name} joined the lobby`);
    });

    // Player left
    this.adapter.on('player:left', (_playerId: string) => {
      this.playSound('leave');
      this.updatePlayerList();
      this.updateStatus('A player left the lobby');
      // Host only: a disconnect may leave all remaining humans ready — launch if so
      if (this.features.readyFlow === false && this.isHost && this.localReady && this.autoStartTimer && this.checkAllHumansReady()) {
        void this.launchMatch();
      }
    });

    // Player ready state changed
    this.adapter.on('player:ready', (_data: { playerId: string; ready: boolean }) => {
      this.updatePlayerList();
      // Host only: check if all humans are now ready and launch
      if (this.features.readyFlow === false && this.isHost && this.localReady && this.autoStartTimer && this.checkAllHumansReady()) {
        void this.launchMatch();
      }
    });

    // Player team changed
    this.adapter.on('player:team', (_data: { playerId: string; team: string }) => {
      this.updatePlayerList();
    });

    // Chat message received
    this.adapter.on('chat:message', (message: LobbyChatMessage) => {
      this.chatMessages.push(message);
      this.updateChatLog();
      this.playSound('chat');
    });

    // Settings updated
    this.adapter.on('settings:updated', (settings: Record<string, unknown>) => {
      this.currentSettings = { ...this.currentSettings, ...settings };
      this.updateSettingsEditor();
    });

    // Leaderboard updated
    this.adapter.on('leaderboard:updated', (entries: LobbyLeaderboardEntry[]) => {
      this.updateLeaderboard(entries);
    });

    // Match starting
    this.adapter.on('match:starting', () => {
      this.updateStatus('Match starting in 3...');
      this.playSound('countdown');
    });

    // Match started
    this.adapter.on('match:started', () => {
      const state = this.adapter.getState();
      this.result = {
        action: 'start',
        mode: state?.mode,
        lobbyId: state?.lobbyId,
        players: state?.players,
        settings: this.currentSettings,
      };
      this.running = false;
    });

    // State updated (generic)
    this.adapter.on('state:updated', () => {
      console.log('[MultiplayerLobby] state:updated event received');
      const state = this.adapter.getState();
      console.log('[MultiplayerLobby] Current state from adapter:', state);
      this.updatePlayerList();
      if (state) {
        this.updateSettings(state.mode, state.lobbyId);
        if (state.leaderboard) {
          this.updateLeaderboard(state.leaderboard);
        }
      }
      // Host only: state:updated fires when player:ready propagates via lobby:updated —
      // use it as a fallback trigger for the auto-start check
      if (this.features.readyFlow === false && this.isHost && this.localReady && this.autoStartTimer && this.checkAllHumansReady()) {
        void this.launchMatch();
      }
    });

    // Browser mode: Tables updated
    this.adapter.on('tables:updated', () => {
      if (this.browserMode) {
        this.updateBrowserTableList();
      }
    });
  }

  /**
   * Show lobby and wait for result
   */
  async show(entryMode: LobbyEntryMode, selectedMode?: string, lobbyId?: string): Promise<LobbyResult> {
    this.running = true;
    this.result = null;

    // Setup lobby based on entry mode
    if (entryMode === 'matchmaking') {
      await this.joinMatchmaking(selectedMode || Object.keys(this.modes)[0]);
    } else if (entryMode === 'custom') {
      await this.createCustomLobby(selectedMode || Object.keys(this.modes)[0]);
    } else if (entryMode === 'join' && lobbyId) {
      await this.joinExistingLobby(lobbyId);
    }

    // Update team selector if mode has teams
    this.updateTeamSelector();

    // Wait for user action
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.running || this.result) {
          clearInterval(checkInterval);
          this.cleanup();
          resolve(this.result || { action: 'cancel' });
        }
      }, 100);
    });
  }

  /**
   * Join matchmaking queue
   */
  private async joinMatchmaking(mode: string): Promise<void> {
    this.updateStatus('Joining matchmaking queue...');

    try {
      await this.adapter.joinQueue(mode);
      // In local mode without server, first player is the host
      const state = this.adapter.getState();
      if (state && state.players.length === 1 && state.players[0]?.id === this.localPlayerId) {
        this.setAsHost(true);
        console.log('[MultiplayerLobby] joinMatchmaking: set as host (first player in local mode)');
      }
      this.updateStatus('Searching for opponents...');
    } catch (err) {
      this.updateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Create custom lobby
   */
  private async createCustomLobby(mode: string, isPrivate: boolean = false): Promise<void> {
    this.updateStatus('Creating lobby...');
    console.log('[MultiplayerLobby] createCustomLobby called, mode=', mode);

    try {
      const lobbyId = await this.adapter.createLobby(mode, isPrivate);
      console.log('[MultiplayerLobby] createLobby returned:', lobbyId);
      this.setAsHost(true);
      console.log('[MultiplayerLobby] setAsHost(true) called, isHost=', this.isHost);
      this.updateStatus(`Lobby created. Code: ${lobbyId}`);
      this.updateSettings(mode, lobbyId);
    } catch (err) {
      console.log('[MultiplayerLobby] createCustomLobby error:', err);
      this.updateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Join existing lobby
   */
  private async joinExistingLobby(lobbyId: string): Promise<void> {
    this.updateStatus(`Joining lobby ${lobbyId}...`);

    try {
      await this.adapter.joinLobby(lobbyId);
      this.setAsHost(false);  // Joiner is not host
      const state = this.adapter.getState();
      if (state) {
        this.updateSettings(state.mode, lobbyId);
      }
      this.updateStatus('Joined lobby');
    } catch (err) {
      this.updateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Set host status
   */
  private setAsHost(isHost: boolean): void {
    console.log('[MultiplayerLobby] setAsHost called with:', isHost);
    this.isHost = isHost;

    const hasReadyFlow = this.features.readyFlow !== false;

    if (hasReadyFlow) {
      // Only ONE of Ready / Start is visible at a time:
      //   - Host is implicitly ready, so Ready is hidden for host and Start is shown.
      //   - Non-host can never start, so Start is hidden and Ready is shown.
      this.readyButton.hidden = isHost;
      this.startButton.hidden = !isHost;
    } else {
      // Single Start button visible to all — no ready dance.
      this.readyButton.hidden = true;
      this.startButton.hidden = false;
    }

    // Reposition so Leave sits flush next to the active action button (no gap).
    const actionButton = (!hasReadyFlow || isHost) ? this.startButton : this.readyButton;
    (actionButton as any).left = 2;
    (this.leaveButton as any).left = 14;
    let nextLeft = 26;
    if (this.fillBotsButton) {
      this.fillBotsButton.hidden = !isHost;
      if (isHost) {
        (this.fillBotsButton as any).left = nextLeft;
        nextLeft += 12;
      }
    }

    // Enable settings editing for host
    this.updateSettingsEditor();
    this.parent.render();
  }

  /**
   * Toggle ready state
   */
  private async toggleReady(): Promise<void> {
    if (this.isHost) {
      return; // Host is always ready
    }

    this.localReady = !this.localReady;

    try {
      await this.adapter.setReady(this.localReady);

      if (this.localReady) {
        this.readyButton.setContent(' READY! ');
        this.readyButton.style.bg = 'blue';
      } else {
        this.readyButton.setContent(' Ready ');
        this.readyButton.style.bg = 'green';
      }

      this.playSound('select');
      this.parent.render();
    } catch (err) {
      this.updateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Start match (host only)
   */
  private async startMatch(): Promise<void> {
    console.log('[MultiplayerLobby] startMatch called, isHost=', this.isHost);
    const hasReadyFlow = this.features.readyFlow !== false;

    // ── readyFlow: false path ──────────────────────────────────────────────
    // Pressing Start marks the local player as ready.
    // Only the HOST drives launchMatch() — the broker fires match:started on
    // all nodes so non-host players transition via the network event, not locally.
    if (!hasReadyFlow) {
      if (this.localReady) return; // already waiting — ignore repeat presses

      this.localReady = true;
      try {
        await this.adapter.setReady(true);
      } catch (err) {
        this.updateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        this.localReady = false;
        return;
      }

      this.startButton.setContent(' Ready! ');
      this.startButton.style.bg = 'blue';
      this.parent.render();
      this.playSound('select');

      if (!this.isHost) {
        // Non-host: just wait — host's broker countdown will fire match:started here
        this.updateStatus('Waiting for host to start...');
        return;
      }

      // HOST only from here ─────────────────────────────────────────────────
      if (this.forceStartButton) {
        this.forceStartButton.hidden = false;
        this.parent.render();
      }

      // All humans already ready — launch immediately without countdown
      if (this.checkAllHumansReady()) {
        await this.launchMatch();
        return;
      }

      // Start countdown — fires forceStart() on expiry
      this.startAutoStartCountdown();
      return;
    }

    // ── original readyFlow: true path ─────────────────────────────────────
    if (!this.isHost) {
      this.updateStatus('Only the host can start the match');
      console.log('[MultiplayerLobby] Not host, returning');
      return;
    }

    const state = this.adapter.getState();
    console.log('[MultiplayerLobby] startMatch state=', state ? { playerCount: state.players.length, players: state.players.map(p => ({ id: p.id, ready: p.ready })) } : null);
    if (!state) {
      this.updateStatus('No active lobby');
      return;
    }

    const allReady = state.players.every(p => p.ready || p.id === this.localPlayerId);
    console.log('[MultiplayerLobby] allReady=', allReady, 'localPlayerId=', this.localPlayerId);
    if (!allReady) {
      this.updateStatus('Not all players are ready');
      this.playSound('error');
      return;
    }

    await this.launchMatch();
  }

  /**
   * Returns true when every non-bot human in the lobby has set ready=true,
   * treating the local player as ready if they just pressed Start.
   */
  private checkAllHumansReady(): boolean {
    const state = this.adapter.getState();
    if (!state) return false;
    const humans = state.players.filter(p => !p.isBot);
    return humans.every(p => p.ready || p.id === this.localPlayerId);
  }

  /**
   * Start the auto-start countdown (readyFlow: false only).
   */
  private startAutoStartCountdown(): void {
    if (this.autoStartTimer) return; // already running

    this.autoStartCountdown = this.options.autoStartTimeout ?? 60;
    this.updateStatus(`Waiting for other players... (${this.autoStartCountdown}s)`);

    this.autoStartTimer = setInterval(() => {
      this.autoStartCountdown--;

      if (this.autoStartCountdown <= 0) {
        void this.forceStart();
        return;
      }

      // Update Start button label with remaining seconds
      this.startButton.setContent(` Ready! ${this.autoStartCountdown}s `);
      this.updateStatus(`Waiting for other players... (${this.autoStartCountdown}s)`);
      this.parent.render();
    }, 1000);
  }

  /**
   * Stop the auto-start countdown without launching.
   */
  private stopAutoStartCountdown(): void {
    if (this.autoStartTimer) {
      clearInterval(this.autoStartTimer);
      this.autoStartTimer = null;
    }
  }

  /**
   * Force-start: bot-fill any unready/missing players and launch immediately.
   * Used by the host "Force Start" button and the countdown expiry.
   */
  private async forceStart(): Promise<void> {
    this.stopAutoStartCountdown();
    this.updateStatus('Force starting...');
    await this.launchMatch();
  }

  /**
   * Shared final launch: bot-fill minimum slots if needed, then start match.
   */
  private async launchMatch(): Promise<void> {
    this.stopAutoStartCountdown();

    const state = this.adapter.getState();
    if (!state) {
      this.updateStatus('No active lobby');
      return;
    }

    const modeConfig = this.modes[state.mode];
    const minPlayers = modeConfig?.minPlayers ?? 2;

    // Bot-fill unready human slots and any missing slots
    if (this.features.bots !== false && this.adapter.fillWithBots) {
      const humanCount = state.players.filter(p => !p.isBot).length;
      if (humanCount < minPlayers || state.players.length < minPlayers) {
        this.updateStatus(`Adding bots to fill ${minPlayers - state.players.length} slot(s)...`);
        await this.adapter.fillWithBots(this.botDifficulty);
        this.hasBots = true;
        this.updatePlayerList();
        this.parent.render();
      }
    } else if (state.players.length < minPlayers) {
      this.updateStatus(`Need at least ${minPlayers} players`);
      this.playSound('error');
      return;
    }

    this.updateStatus('Starting match...');

    try {
      await this.adapter.startMatch();
      this.playSound('countdown');
    } catch (err) {
      this.updateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Toggle bots (fill/remove)
   */
  private toggleBots(): void {
    if (!this.isHost || !this.adapter.fillWithBots || !this.adapter.removeBots) {
      this.updateStatus('Bot management not available');
      return;
    }

    const state = this.adapter.getState();
    if (!state) return;

    const modeConfig = this.modes[state.mode];

    if (this.hasBots) {
      this.adapter.removeBots();
      this.hasBots = false;
      if (this.fillBotsButton) {
        this.fillBotsButton.setContent(' Add Bots ');
      }
      this.updateStatus('Bots removed');
    } else {
      const targetCount = modeConfig?.maxPlayers ?? 4;
      this.adapter.fillWithBots(targetCount, this.botDifficulty);
      this.hasBots = true;
      if (this.fillBotsButton) {
        this.fillBotsButton.setContent(' Remove ');
      }
      this.updateStatus(`Added bots (difficulty ${this.botDifficulty})`);
    }

    this.updatePlayerList();
    this.playSound('select');
    this.parent.render();
  }

  /**
   * Select team
   */
  private async selectTeam(index: number): Promise<void> {
    if (!this.adapter.setTeam) return;

    const state = this.adapter.getState();
    const modeConfig = state ? this.modes[state.mode] : null;
    const teams = modeConfig?.teams || ['No Team'];

    const team = index === 0 ? '' : teams[index - 1] || '';

    try {
      await this.adapter.setTeam(team);
      this.playSound('select');
    } catch (err) {
      this.updateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Update team selector based on current mode
   */
  private updateTeamSelector(): void {
    if (!this.teamSelector) return;

    const state = this.adapter.getState();
    const modeConfig = state ? this.modes[state.mode] : null;

    if (modeConfig?.teamBased && modeConfig.teams) {
      this.teamSelector.hidden = false;
      this.teamSelector.setItems(['No Team', ...modeConfig.teams]);
    } else {
      this.teamSelector.hidden = true;
    }

    this.parent.render();
  }

  /**
   * Send chat message
   */
  private sendChatMessage(text: string): void {
    if (!this.adapter.sendChat) return;

    const isAction = text.startsWith('/me ');
    const messageText = isAction ? text.substring(4) : text;

    this.adapter.sendChat(messageText, isAction);
  }

  /**
   * Update chat log display
   */
  private updateChatLog(): void {
    if (!this.chatLog) return;

    // Show last N messages
    const maxMessages = 10;
    const recentMessages = this.chatMessages.slice(-maxMessages);

    const items = recentMessages.map(msg => {
      if (msg.isSystem) {
        return `{gray-fg}* ${msg.text}{/gray-fg}`;
      } else if (msg.isAction) {
        return `{magenta-fg}* ${msg.playerName} ${msg.text}{/magenta-fg}`;
      } else {
        return `{cyan-fg}${msg.playerName}:{/cyan-fg} ${msg.text}`;
      }
    });

    this.chatLog.setItems(items);
    this.chatLog.scrollTo(items.length);
    this.parent.render();
  }

  /**
   * Leave lobby
   */
  private async leaveLobby(): Promise<void> {
    this.result = { action: 'cancel' };
    this.running = false;

    try {
      await this.adapter.leaveLobby();
    } catch (_err) {
      // Ignore errors when leaving
    }
  }

  /**
   * Update player list display
   */
  private updatePlayerList(): void {
    console.log('[MultiplayerLobby] updatePlayerList called');
    const state = this.adapter.getState();
    console.log('[MultiplayerLobby] state for updatePlayerList:', state);
    if (!state) {
      console.log('[MultiplayerLobby] No state, clearing player list');
      this.playerList.setItems([]);
      this.parent.render();
      return;
    }
    console.log('[MultiplayerLobby] players in state:', state.players);

    const modeConfig = this.modes[state.mode];

    let items: string[];

    if (this.features.slotBased) {
      // Slot-based display (for TetriNET-style games)
      const maxSlots = modeConfig?.maxSlots || modeConfig?.maxPlayers || 6;
      items = [];

      for (let slot = 1; slot <= maxSlots; slot++) {
        const player = state.players.find(p => p.slot === slot);
        if (player) {
          items.push(this.formatPlayerLine(player, state.hostId));
        } else {
          items.push(`{gray-fg}Slot ${slot}: (empty){/gray-fg}`);
        }
      }
    } else {
      // Standard list display
      items = state.players.map(player => this.formatPlayerLine(player, state.hostId));
    }

    this.playerList.setItems(items);
    this.parent.render();
  }

  /**
   * Format a player line for display
   */
  private formatPlayerLine(player: LobbyPlayerInfo, hostId?: string): string {
    const isLocal = player.id === this.localPlayerId;
    const isHost = hostId ? player.id === hostId : false;

    // Use custom formatter if provided
    if (this.options.formatPlayer) {
      return this.options.formatPlayer(player, isLocal, isHost);
    }

    // Default formatting
    const parts: string[] = [];

    // Slot number (if slot-based)
    if (this.features.slotBased && player.slot) {
      parts.push(`{white-fg}${player.slot}.{/white-fg}`);
    }

    // Host badge
    if (isHost) {
      parts.push('{yellow-fg}[HOST]{/yellow-fg}');
    }

    // You badge
    if (isLocal) {
      parts.push('{cyan-fg}(You){/cyan-fg}');
    }

    // Bot badge
    if (player.isBot) {
      parts.push(`{magenta-fg}[CPU-${player.botDifficulty ?? '?'}]{/magenta-fg}`);
    }

    // Team
    if (player.team) {
      parts.push(`{blue-fg}[${player.team}]{/blue-fg}`);
    }

    // Name
    parts.push(`{white-fg}${player.name}{/white-fg}`);

    // Ready status (hidden when readyFlow is disabled)
    if (this.features.readyFlow !== false) {
      const readyStatus = player.ready
        ? '{green-fg}[READY]{/green-fg}'
        : '{gray-fg}[NOT READY]{/gray-fg}';
      parts.push(readyStatus);
    }

    return parts.join(' ');
  }

  /**
   * Update room settings display
   */
  private updateSettings(mode: string, lobbyId?: string): void {
    const state = this.adapter.getState();
    if (!state) return;

    const modeConfig = this.modes[mode];

    // Use custom formatter if provided
    if (this.options.formatSettings) {
      this.settingsBox.setContent(this.options.formatSettings(state, modeConfig));
      this.parent.render();
      return;
    }

    // Default formatting
    const lines: string[] = [];
    lines.push(`  Mode: {yellow-fg}${modeConfig?.name ?? mode}{/yellow-fg}`);
    lines.push(`  Players: {cyan-fg}${state.players.length}/${modeConfig?.maxPlayers ?? '?'}{/cyan-fg}`);
    if (lobbyId) {
      lines.push(`  Code: {magenta-fg}${lobbyId}{/magenta-fg}`);
    }
    lines.push(`  Status: {green-fg}${state.status.toUpperCase()}{/green-fg}`);

    this.settingsBox.setContent(lines.join('\n'));
    this.parent.render();
  }

  /**
   * Update settings editor display
   */
  private updateSettingsEditor(): void {
    if (!this.settingsEditorList || this.gameSettings.length === 0) return;

    // Save index before setItems() — it fires 'select item' which would
    // overwrite selectedSettingIndex with 0 (or last item).
    const savedIndex = this.selectedSettingIndex;

    const items = this.gameSettings.map(setting => {
      const value = this.currentSettings[setting.key] ?? setting.default;
      let displayValue: string;

      if (setting.type === 'select' && setting.options) {
        const opt = setting.options.find(o =>
          typeof o === 'string' ? o === value : o.value === value
        );
        displayValue = typeof opt === 'string' ? opt : opt?.label ?? String(value);
      } else if (setting.type === 'checkbox') {
        displayValue = value ? 'Yes' : 'No';
      } else {
        displayValue = String(value);
      }

      // Show arrows for editable settings (host only, or not hostOnly)
      const canEdit = this.isHost || !setting.hostOnly;
      const arrows = canEdit ? '{gray-fg}<{/gray-fg} ' : '  ';
      const arrowsEnd = canEdit ? ' {gray-fg}>{/gray-fg}' : '';
      return `${setting.label}: ${arrows}{cyan-fg}${displayValue}{/cyan-fg}${arrowsEnd}`;
    });

    this.settingsEditorList.setItems(items);
    // Restore index — setItems() may have fired 'select item' with 0/last
    this.selectedSettingIndex = savedIndex;
    this.settingsEditorList.select(savedIndex);
    this.parent.render();
  }

  /**
   * Change the value of the currently selected setting
   */
  private changeSettingValue(delta: number): void {
    if (!this.settingsEditorList || this.gameSettings.length === 0) return;

    // Only host can change settings (unless setting is not hostOnly)
    const setting = this.gameSettings[this.selectedSettingIndex];
    if (!setting) return;

    const canEdit = this.isHost || !setting.hostOnly;
    if (!canEdit) {
      this.playSound('error');
      return;
    }

    const currentValue = this.currentSettings[setting.key] ?? setting.default;
    let newValue: unknown = currentValue;

    switch (setting.type) {
      case 'number': {
        const step = setting.step ?? 1;
        const min = setting.min ?? 0;
        const max = setting.max ?? 100;
        let numValue = (currentValue as number) + (delta * step);
        // Clamp to range
        numValue = Math.max(min, Math.min(max, numValue));
        newValue = numValue;
        break;
      }

      case 'select': {
        if (!setting.options || setting.options.length === 0) break;
        const options = setting.options.map(o =>
          typeof o === 'string' ? o : o.value
        );
        const currentIndex = options.indexOf(currentValue as string | number);
        let newIndex = currentIndex + delta;
        // Wrap around
        if (newIndex < 0) newIndex = options.length - 1;
        if (newIndex >= options.length) newIndex = 0;
        newValue = options[newIndex];
        break;
      }

      case 'checkbox': {
        newValue = !currentValue;
        break;
      }

      case 'text': {
        // Text can't be easily changed with arrows, would need input
        this.playSound('error');
        return;
      }
    }

    // Update local settings
    this.currentSettings[setting.key] = newValue;
    this.updateSettingsEditor();

    // Notify adapter of settings change
    if (this.adapter.updateSettings) {
      void this.adapter.updateSettings({ [setting.key]: newValue });
    }

    this.playSound('select');
  }

  /**
   * Update leaderboard display
   */
  private updateLeaderboard(entries: LobbyLeaderboardEntry[]): void {
    if (!this.leaderboardBox) return;

    // Use custom formatter if provided
    if (this.options.formatLeaderboard) {
      this.leaderboardBox.setContent(this.options.formatLeaderboard(entries));
      this.parent.render();
      return;
    }

    if (entries.length === 0) {
      this.leaderboardBox.setContent('{gray-fg}No data{/gray-fg}');
      this.parent.render();
      return;
    }

    const lines = entries.slice(0, 5).map(entry => {
      const teamIndicator = entry.isTeam ? '{blue-fg}T{/blue-fg}' : ' ';
      const extra = entry.extra ? ` {gray-fg}${entry.extra}{/gray-fg}` : '';
      return `  ${entry.rank}. ${teamIndicator} {white-fg}${entry.name}{/white-fg} - {yellow-fg}${entry.score}{/yellow-fg}${extra}`;
    });

    this.leaderboardBox.setContent(lines.join('\n'));
    this.parent.render();
  }

  /**
   * Update status message
   */
  private updateStatus(message: string): void {
    const timestamp = new Date().toLocaleTimeString();

    // If we have chat, add status as a system message
    if (this.chatLog && this.features.chat) {
      const statusLine = `{gray-fg}[${timestamp}] ${message}{/gray-fg}`;
      this.chatMessages.push({
        id: `status-${Date.now()}`,
        playerId: 'system',
        playerName: 'System',
        text: message,
        timestamp: Date.now(),
        isSystem: true,
      });
      this.updateChatLog();
    } else {
      // Fall back to status box
      this.statusBox.setContent(`  {gray-fg}[${timestamp}]{/gray-fg}\n  ${message}`);
    }
    this.parent.render();
  }

  /**
   * Play sound effect
   */
  private playSound(sound: 'select' | 'error' | 'countdown' | 'join' | 'leave' | 'chat'): void {
    if (this.options.onSound) {
      this.options.onSound(sound);
    }
  }

  /**
   * Get the current lobby state
   */
  getState(): LobbyState | null {
    return this.adapter.getState();
  }

  /**
   * Get current settings
   */
  getSettings(): Record<string, unknown> {
    return { ...this.currentSettings };
  }

  /**
   * Check if local player is host
   */
  isLocalHost(): boolean {
    return this.isHost;
  }

  /**
   * Cleanup
   */
  /**
   * Check if a widget that needs keyboard input (List, Textbox, etc.) has focus
   * Used to prevent shortcut keys from interfering with widget navigation
   */
  private widgetHasFocus(): boolean {
    const focused = this.parent.focused;
    console.log('[MultiplayerLobby] widgetHasFocus check - focused:', focused ? {
      type: (focused as any).type,
      name: (focused as any).name,
      constructor: (focused as any).constructor?.name
    } : null);
    if (!focused || typeof focused !== 'object') return false;
    const type = (focused as any).type;
    const hasWidgetFocus = type === 'list' || type === 'listbar' || type === 'textbox' ||
           type === 'textarea' || type === 'input';
    console.log('[MultiplayerLobby] widgetHasFocus result:', hasWidgetFocus, 'type:', type);
    return hasWidgetFocus;
  }

  private cleanup(): void {
    // Clear timers
    this.stopAutoStartCountdown();
    if (this.browserAutoRefreshTimer) {
      clearInterval(this.browserAutoRefreshTimer);
      this.browserAutoRefreshTimer = null;
    }

    // CRITICAL: Remove event listeners to prevent memory leaks
    // Note: Key handlers are cleaned up when screen is destroyed
    // If we need manual cleanup, would need to store handler refs

    this.container.destroy();
  }

  /**
   * Destroy the lobby widget
   */
  destroy(): void {
    this.cleanup();
  }
}

/**
 * Factory function
 */
export function multiplayerLobby(options: MultiplayerLobbyOptions): MultiplayerLobby {
  return new MultiplayerLobby(options);
}
