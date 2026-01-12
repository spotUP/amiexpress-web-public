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
}

/**
 * Network adapter interface - implement this for your game
 */
export interface LobbyNetworkAdapter extends EventEmitter {
  // State
  getState(): LobbyState | null;

  // Actions
  joinQueue(mode: string): Promise<void>;
  createLobby(mode: string, isPrivate?: boolean): Promise<string>;
  joinLobby(lobbyId: string): Promise<void>;
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

    // Initialize default settings
    this.gameSettings.forEach(setting => {
      this.currentSettings[setting.key] = setting.default;
    });

    this.setupUI();
    this.setupEventListeners();
  }

  /**
   * Setup UI layout - adapts based on features
   */
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
    });

    // Title
    this.titleBox = new Box({
      parent: this.container,
      top: 0,
      left: 'center',
      width: 60,
      height: 1,
      content: `{bold}{yellow-fg}${this.options.title || 'MULTIPLAYER LOBBY'}{/yellow-fg}{/bold}`,
      tags: true,
    });

    // Calculate layout based on features
    const hasChat = this.features.chat;
    const hasLeaderboard = this.features.leaderboard;
    const hasSettingsEditor = this.features.settingsEditor && this.gameSettings.length > 0;
    const hasTeams = this.features.teams;

    // Determine column widths
    const playerListWidth = this.features.slotBased ? 30 : 40;
    const rightPanelWidth = 40;

    // Calculate heights for right panels to fit in available space
    const startRow = 1; // Start panels immediately below title
    let roomSettingsHeight = 6;
    let settingsEditorHeight = hasSettingsEditor ? Math.min(this.gameSettings.length + 2, 6) : 0;
    let chatHeight = hasChat ? 6 : 0;
    let leaderboardHeight = hasLeaderboard ? 4 : 0;
    const teamSelectorHeight = hasTeams ? 6 : 0;
    const playerListHeight = this.features.slotBased ? 6 : (hasTeams ? 12 : 14);
    const panelContentTop = 1;
    const panelContentWidth = (panelWidth: number) => Math.max(1, panelWidth - 2);
    const panelContentHeight = (panelHeight: number) => Math.max(1, panelHeight - 3);

    // Player list (left side) - reasonable height for typical lobbies
    const playerPanel = new DockablePanel({
      parent: this.container,
      top: startRow,
      left: 2,
      width: playerListWidth,
      height: playerListHeight,
      label: this.features.slotBased ? 'Players (Slots)' : 'Players',
      style: { border: { fg: 'cyan' }, bg: 'black' },
      fitContent: false,
      allowAutoDock: true,
      resizable: true,
      draggable: true,
      dockPosition: 'float',
      persistenceKey: 'multiplayer-lobby.players',
    });
    this.playerList = new List({
      parent: playerPanel,
      top: panelContentTop,
      left: 0,
      width: panelContentWidth(playerListWidth),
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

    // Team selector (below player list, if teams enabled)
    if (hasTeams) {
      const teamPanel = new DockablePanel({
        parent: this.container,
        top: startRow + playerListHeight,
        left: 2,
        width: playerListWidth,
        height: teamSelectorHeight,
        label: 'Select Team',
        style: { border: { fg: 'magenta' }, bg: 'black' },
        fitContent: false,
        allowAutoDock: true,
        resizable: true,
        draggable: true,
        dockPosition: 'float',
        persistenceKey: 'multiplayer-lobby.teams',
      });
      this.teamSelector = new List({
        parent: teamPanel,
        top: panelContentTop,
        left: 0,
        width: panelContentWidth(playerListWidth),
        height: panelContentHeight(teamSelectorHeight),
        items: ['No Team'],
        mouse: true,
        keys: true,
        tags: true,
        style: {
          fg: 'white',
          selected: { bg: 'magenta', fg: 'white' },
        },
      });

      this.teamSelector.on('select', (_item: unknown, index: number) => {
        void this.selectTeam(index);
      });
    }

    // Left column stack offset for panels below player list
    let leftTop = startRow + playerListHeight + teamSelectorHeight;

    // Right side panels - stack vertically (aligned with player list)
    let rightTop = startRow;
    const rightLeft = playerListWidth + 4;

    // Room settings panel (always visible) - move to left column
    const settingsPanel = new DockablePanel({
      parent: this.container,
      top: leftTop,
      left: 2,
      width: playerListWidth,
      height: roomSettingsHeight,
      label: 'Room Settings',
      style: { border: { fg: 'green' }, bg: 'black' },
      fitContent: false,
      allowAutoDock: true,
      resizable: true,
      draggable: true,
      dockPosition: 'float',
      persistenceKey: 'multiplayer-lobby.room-settings',
    });
    this.settingsBox = new Box({
      parent: settingsPanel,
      top: panelContentTop,
      left: 0,
      width: panelContentWidth(playerListWidth),
      height: panelContentHeight(roomSettingsHeight),
      content: '',
      tags: true,
    });
    leftTop += roomSettingsHeight;

    // Settings editor (if enabled) - uses a List for keyboard navigation
    if (hasSettingsEditor) {
      this.settingsEditorBox = new DockablePanel({
        parent: this.container,
        top: leftTop,
        left: 2,
        width: playerListWidth,
        height: settingsEditorHeight,
        label: 'Game Options (O)',
        style: { border: { fg: 'yellow' }, bg: 'black' },
        fitContent: false,
        allowAutoDock: true,
        resizable: true,
        draggable: true,
        dockPosition: 'float',
        persistenceKey: 'multiplayer-lobby.game-options',
      });

      // Create list for settings navigation
      this.settingsEditorList = new List({
        parent: this.settingsEditorBox,
        top: panelContentTop,
        left: 0,
        width: panelContentWidth(playerListWidth),
        height: panelContentHeight(settingsEditorHeight),
        items: [],
        mouse: true,
        keys: true,
        style: {
          fg: 'white',
          selected: { bg: 'blue', fg: 'white' },
        },
        tags: true,
      });

      // Left/Right arrows to change values
      this.settingsEditorList.key(['left', 'h'], () => this.changeSettingValue(-1));
      this.settingsEditorList.key(['right', 'l'], () => this.changeSettingValue(1));
      this.settingsEditorList.key(['enter', 'space'], () => this.changeSettingValue(1));

      // Track selected index
      this.settingsEditorList.on('select item', (_item: unknown, index: number) => {
        this.selectedSettingIndex = index;
      });

      leftTop += settingsEditorHeight;
      this.updateSettingsEditor();
    }

    const screenHeight = typeof this.parent.height === 'number' ? this.parent.height : 24;
    const rightAvailableHeight = screenHeight - 2 - startRow;

    // Leaderboard panel (if enabled) - standalone panel above chat
    if (hasLeaderboard) {
      const preferredLeaderboardHeight = Math.min(8, Math.max(4, Math.floor(rightAvailableHeight * 0.35)));
      leaderboardHeight = preferredLeaderboardHeight;
      const leaderboardPanel = new DockablePanel({
        parent: this.container,
        top: rightTop,
        left: rightLeft,
        width: rightPanelWidth,
        height: leaderboardHeight,
        label: 'Leaderboard',
        style: { border: { fg: 'cyan' }, bg: 'black' },
        fitContent: false,
        allowAutoDock: true,
        resizable: true,
        draggable: true,
        dockPosition: 'float',
        persistenceKey: 'multiplayer-lobby.leaderboard',
      });
      this.leaderboardBox = new Box({
        parent: leaderboardPanel,
        top: panelContentTop,
        left: 0,
        width: panelContentWidth(rightPanelWidth),
        height: panelContentHeight(leaderboardHeight),
        content: '{gray-fg}No data{/gray-fg}',
        tags: true,
      });
      rightTop += leaderboardHeight;
    }

    // Chat panel (if enabled)
    if (hasChat) {
      // Fill remaining space in right column
      const remainingHeight = rightAvailableHeight - (rightTop - startRow);
      chatHeight = Math.max(6, remainingHeight);

      this.chatBox = new DockablePanel({
        parent: this.container,
        top: rightTop,
        left: rightLeft,
        width: rightPanelWidth,
        height: chatHeight,
        label: 'Chat',
        style: { border: { fg: 'white' }, bg: 'black' },
        fitContent: false,
        allowAutoDock: true,
        resizable: true,
        draggable: true,
        dockPosition: 'float',
        persistenceKey: 'multiplayer-lobby.chat',
      });

      // Chat message log
      const chatContentHeight = panelContentHeight(chatHeight);
      const chatLogTop = panelContentTop;
      const chatLogHeight = Math.max(1, chatContentHeight - 1);
      this.chatLog = new List({
        parent: this.chatBox,
        top: chatLogTop,
        left: 0,
        width: panelContentWidth(rightPanelWidth),
        height: chatLogHeight,
        items: [],
        mouse: true,
        scrollable: true,
        tags: true,
      });

      // Chat input at bottom
      this.chatInput = new Textbox({
        parent: this.chatBox,
        bottom: 0,
        left: 0,
        width: panelContentWidth(rightPanelWidth),
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

      rightTop += chatHeight;
    }

    // Status box - hidden when chat is enabled (use chat for status messages)
    this.statusBox = new Box({
      parent: this.container,
      top: hasChat ? 0 : rightTop,
      left: hasChat ? 0 : rightLeft,
      width: hasChat ? 1 : rightPanelWidth,
      height: hasChat ? 1 : 4,
      border: hasChat ? undefined : { type: 'line' },
      label: hasChat ? undefined : ' Status ',
      style: { border: { fg: 'gray' } },
      content: '',
      tags: true,
      hidden: hasChat,
    });

    // Buttons row - position below the tallest panel
    const leftPanelBottom = leftTop;
    const buttonTop = Math.max(leftPanelBottom, rightTop);
    let buttonLeft = 2;

    // Ready button
    this.readyButton = new Button({
      parent: this.container,
      top: buttonTop,
      left: buttonLeft,
      width: 14,
      height: 1,
      content: ' Ready ',
      style: {
        bg: 'green',
        fg: 'white',
        focus: { bg: 'blue' },
      },
      mouse: true,
      tags: true,
    });
    buttonLeft += 16;

    // Start button (host only)
    this.startButton = new Button({
      parent: this.container,
      top: buttonTop,
      left: buttonLeft,
      width: 14,
      height: 1,
      content: ' Start ',
      style: {
        bg: 'yellow',
        fg: 'black',
        focus: { bg: 'blue' },
      },
      mouse: true,
      hidden: true,
      tags: true,
    });
    buttonLeft += 16;

    // Leave button
    this.leaveButton = new Button({
      parent: this.container,
      top: buttonTop,
      left: buttonLeft,
      width: 14,
      height: 1,
      content: ' Leave ',
      style: {
        bg: 'red',
        fg: 'white',
        focus: { bg: 'blue' },
      },
      mouse: true,
      tags: true,
    });
    buttonLeft += 16;

    // Fill Bots button (optional, host only)
    if (this.features.bots !== false && this.adapter.fillWithBots) {
      this.fillBotsButton = new Button({
        parent: this.container,
        top: buttonTop,
        left: buttonLeft,
        width: 14,
        height: 1,
        content: ' Add Bots ',
        style: {
          bg: 'cyan',
          fg: 'black',
          focus: { bg: 'blue' },
        },
        mouse: true,
        hidden: true,
        tags: true,
      });

      this.fillBotsButton.on('press', () => this.toggleBots());
    }

    // Setup button handlers
    this.readyButton.on('press', () => void this.toggleReady());
    this.startButton.on('press', () => void this.startMatch());
    this.leaveButton.on('press', () => void this.leaveLobby());

    // Keyboard shortcuts
    this.parent.key(['r'], () => void this.toggleReady());
    this.parent.key(['s'], () => void this.startMatch());
    this.parent.key(['escape', 'q'], () => void this.leaveLobby());
    if (hasChat) {
      this.parent.key(['t'], () => this.chatInput?.focus());
    }
    if (hasSettingsEditor) {
      this.parent.key(['o'], () => this.settingsEditorList?.focus());
    }

    this.readyButton.focus();
  }

  /**
   * Setup network event listeners
   */
  private setupEventListeners(): void {
    // Player joined
    this.adapter.on('player:joined', (player: LobbyPlayerInfo) => {
      this.playSound('join');
      this.updatePlayerList();
      this.updateStatus(`${player.name} joined the lobby`);
    });

    // Player left
    this.adapter.on('player:left', (_playerId: string) => {
      this.playSound('leave');
      this.updatePlayerList();
      this.updateStatus('A player left the lobby');
    });

    // Player ready state changed
    this.adapter.on('player:ready', (_data: { playerId: string; ready: boolean }) => {
      this.updatePlayerList();
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
      this.updatePlayerList();
      const state = this.adapter.getState();
      if (state) {
        this.updateSettings(state.mode, state.lobbyId);
        if (state.leaderboard) {
          this.updateLeaderboard(state.leaderboard);
        }
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

    try {
      const lobbyId = await this.adapter.createLobby(mode, isPrivate);
      this.setAsHost(true);
      this.updateStatus(`Lobby created. Code: ${lobbyId}`);
      this.updateSettings(mode, lobbyId);
    } catch (err) {
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
    this.isHost = isHost;
    this.startButton.hidden = !isHost;
    if (this.fillBotsButton) {
      this.fillBotsButton.hidden = !isHost;
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
    if (!this.isHost) {
      this.updateStatus('Only the host can start the match');
      return;
    }

    const state = this.adapter.getState();
    if (!state) {
      this.updateStatus('No active lobby');
      return;
    }

    // Check if all players are ready
    const allReady = state.players.every(p => p.ready || p.id === this.localPlayerId);
    if (!allReady) {
      this.updateStatus('Not all players are ready');
      this.playSound('error');
      return;
    }

    // Check minimum players
    const modeConfig = this.modes[state.mode];
    const minPlayers = modeConfig?.minPlayers ?? 2;
    if (state.players.length < minPlayers) {
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
    const state = this.adapter.getState();
    if (!state) {
      this.playerList.setItems([]);
      this.parent.render();
      return;
    }

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

    // Ready status
    const readyStatus = player.ready
      ? '{green-fg}[READY]{/green-fg}'
      : '{gray-fg}[NOT READY]{/gray-fg}';
    parts.push(readyStatus);

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
    this.settingsEditorList.select(this.selectedSettingIndex);
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
    this.statusBox.setContent(`  {gray-fg}[${timestamp}]{/gray-fg}\n  ${message}`);
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
  private cleanup(): void {
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
