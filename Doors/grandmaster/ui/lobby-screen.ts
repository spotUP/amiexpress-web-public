/**
 * Lobby Screen
 *
 * Multiplayer lobby for matchmaking and custom games
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList, createButton } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { GrandmasterNetworkManager, PlayerInfo, MatchState, MultiplayerMode } from '../network/network-manager';
import type { AppState } from '../core/types';
import type { SoundEngine } from '../audio/sounds';
import { fillLobbyWithBots, removeBots, getBotDifficultyName, type BotDifficulty } from '../network/bot-lobby';

/**
 * Lobby mode
 */
export type LobbyMode = 'matchmaking' | 'custom' | 'browse';

/**
 * Lobby result
 */
export interface LobbyResult {
  action: 'start' | 'cancel';
  mode?: MultiplayerMode;
  lobbyId?: string;
}

/**
 * Lobby Screen
 *
 * Handles multiplayer lobby UI and player management
 */
export class LobbyScreen {
  private screen: Screen;
  private state: AppState;
  private sounds: SoundEngine;
  private network: GrandmasterNetworkManager;
  private matchState: MatchState | null = null;
  private localPlayerId: string;
  private isHost: boolean = false;
  private localReady: boolean = false;

  // UI Elements
  private container: any;
  private titleBox: any;
  private playerList: any;
  private settingsBox: any;
  private statusBox: any;
  private readyButton: any;
  private startButton: any;
  private leaveButton: any;
  private fillBotsButton: any;

  // Bot settings
  private botDifficulty: BotDifficulty = 5;  // Default: Skilled

  private running: boolean = false;
  private result: LobbyResult | null = null;

  constructor(
    screen: Screen,
    state: AppState,
    sounds: SoundEngine,
    network: GrandmasterNetworkManager,
    localPlayerId: string
  ) {
    this.screen = screen;
    this.state = state;
    this.sounds = sounds;
    this.network = network;
    this.localPlayerId = localPlayerId;

    this.setupUI();
    this.setupEventListeners();
  }

  /**
   * Setup UI layout
   */
  private setupUI(): void {
    // Clear screen
    this.screen.children.forEach(child => child.destroy());

    // Main container
    this.container = createBox({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
    });

    // Title
    this.titleBox = createBox({
      parent: this.container,
      top: 0,
      left: 'center',
      width: 60,
      height: 3,
      content: '{bold}{yellow-fg}MULTIPLAYER LOBBY{/yellow-fg}{/bold}',
    });

    // Player list
    this.playerList = createList({
      parent: this.container,
      top: 4,
      left: 2,
      width: 40,
      height: 16,
      border: { type: 'line' },
      label: ' Players ',
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'white' },
      },
      items: [],
      mouse: true,
      keys: true,
      vi: true,
    });

    // Room settings
    this.settingsBox = createBox({
      parent: this.container,
      top: 4,
      left: 44,
      width: 34,
      height: 10,
      border: { type: 'line' },
      label: ' Room Settings ',
      style: { border: { fg: 'green' } },
      content: '',
    });

    // Status/instructions
    this.statusBox = createBox({
      parent: this.container,
      top: 14,
      left: 44,
      width: 34,
      height: 6,
      border: { type: 'line' },
      label: ' Status ',
      style: { border: { fg: 'gray' } },
      content: '',
    });

    // Ready button
    this.readyButton = createButton({
      parent: this.container,
      top: 21,
      left: 2,
      width: 18,
      height: 3,
      content: 'Ready',
      style: {
        bg: 'green',
        fg: 'white',
        focus: { bg: 'blue' },
      },
      mouse: true,
    });

    // Start button (host only)
    this.startButton = createButton({
      parent: this.container,
      top: 21,
      left: 22,
      width: 18,
      height: 3,
      content: 'Start Match',
      style: {
        bg: 'yellow',
        fg: 'black',
        focus: { bg: 'blue' },
      },
      mouse: true,
      hidden: true,  // Show only for host
    });

    // Leave button
    this.leaveButton = createButton({
      parent: this.container,
      top: 21,
      left: 42,
      width: 18,
      height: 3,
      content: 'Leave Lobby',
      style: {
        bg: 'red',
        fg: 'white',
        focus: { bg: 'blue' },
      },
      mouse: true,
    });

    // Fill Bots button (host only)
    this.fillBotsButton = createButton({
      parent: this.container,
      top: 21,
      left: 62,
      width: 16,
      height: 3,
      content: 'Fill Bots',
      style: {
        bg: 'cyan',
        fg: 'black',
        focus: { bg: 'blue' },
      },
      mouse: true,
      hidden: true,  // Show only for host
    });

    // Setup button handlers
    this.readyButton.on('press', () => this.toggleReady());
    this.startButton.on('press', () => this.startMatch());
    this.leaveButton.on('press', () => this.leaveLobby());
    this.fillBotsButton.on('press', () => this.toggleBots());

    // Keyboard shortcuts
    this.screen.key(['r'], () => this.toggleReady());
    this.screen.key(['s'], () => this.startMatch());
    this.screen.key(['escape', 'q'], () => this.leaveLobby());

    this.readyButton.focus();
  }

  /**
   * Setup network event listeners
   */
  private setupEventListeners(): void {
    // Player joined
    this.network.on('player:joined', (player: PlayerInfo) => {
      this.sounds.playSfx('menu_select');
      this.updatePlayerList();
      this.updateStatus(`${player.name} joined the lobby`);
    });

    // Player left
    this.network.on('player:left', (playerId: string) => {
      this.updatePlayerList();
      this.updateStatus('A player left the lobby');
    });

    // Player ready state changed
    this.network.on('player:ready', (data: { playerId: string; ready: boolean }) => {
      this.updatePlayerList();
    });

    // Match starting
    this.network.on('match:starting', () => {
      this.updateStatus('Match starting in 3...');
      this.sounds.playSfx('countdown');
    });

    // Match started
    this.network.on('match:started', () => {
      this.result = {
        action: 'start',
        mode: this.matchState?.mode,
      };
      this.running = false;
    });
  }

  /**
   * Show lobby and wait for result
   */
  async show(mode: LobbyMode, selectedMode?: MultiplayerMode): Promise<LobbyResult> {
    this.running = true;
    this.result = null;

    // Setup lobby based on mode
    if (mode === 'matchmaking') {
      await this.joinMatchmaking(selectedMode || 'versus_1v1');
    } else if (mode === 'custom') {
      await this.createCustomLobby(selectedMode || 'versus_1v1');
    }

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
  private async joinMatchmaking(mode: MultiplayerMode): Promise<void> {
    this.updateStatus('Joining matchmaking queue...');

    try {
      await this.network.joinQueue(mode);
      this.updateStatus('Searching for opponents...');
    } catch (err) {
      this.updateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Create custom lobby
   */
  private async createCustomLobby(mode: MultiplayerMode, isPrivate: boolean = false): Promise<void> {
    this.updateStatus('Creating lobby...');

    try {
      const lobbyId = await this.network.createLobby(mode, isPrivate);
      this.isHost = true;
      this.startButton.hidden = false;
      this.fillBotsButton.hidden = false;  // Show bot controls for host
      this.updateStatus(`Lobby created. Code: ${lobbyId}`);
      this.updateSettings(mode, lobbyId);
    } catch (err) {
      this.updateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Toggle ready state
   */
  private async toggleReady(): Promise<void> {
    if (this.isHost) {
      // Host is always ready
      return;
    }

    this.localReady = !this.localReady;

    try {
      await this.network.setReady(this.localReady);

      // Update button appearance
      if (this.localReady) {
        this.readyButton.setContent('{bold}READY!{/bold}');
        this.readyButton.style.bg = 'blue';
      } else {
        this.readyButton.setContent('Ready');
        this.readyButton.style.bg = 'green';
      }

      this.sounds.playSfx('menu_select');
      this.screen.render();
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

    const matchState = this.network.getMatchState();
    if (!matchState) {
      this.updateStatus('No active lobby');
      return;
    }

    // Check if all players are ready
    const allReady = matchState.players.every(p => p.ready);
    if (!allReady) {
      this.updateStatus('Not all players are ready');
      this.sounds.playSfx('error');
      return;
    }

    // Check minimum players
    const minPlayers = matchState.mode === 'versus_1v1' ? 2 : 2;
    if (matchState.players.length < minPlayers) {
      this.updateStatus(`Need at least ${minPlayers} players`);
      this.sounds.playSfx('error');
      return;
    }

    this.updateStatus('Starting match...');

    try {
      await this.network.startMatch();
      this.sounds.playSfx('countdown');
    } catch (err) {
      this.updateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Toggle bots (fill/remove)
   */
  private toggleBots(): void {
    if (!this.isHost) {
      this.updateStatus('Only the host can manage bots');
      return;
    }

    const matchState = this.network.getMatchState();
    if (!matchState) return;

    // Check if we have bots currently
    const hasBots = matchState.players.some(p => p.isBot);

    if (hasBots) {
      // Remove all bots
      matchState.players = removeBots(matchState.players);
      this.fillBotsButton.setContent('Fill Bots');
      this.updateStatus('Bots removed');
    } else {
      // Fill with bots (target 4 players for small modes, 6 for battle royale)
      const targetCount = matchState.mode === 'battle_royale' ? 6 : 4;
      matchState.players = fillLobbyWithBots(matchState.players, targetCount, this.botDifficulty);
      this.fillBotsButton.setContent('Remove Bots');
      this.updateStatus(`Added ${matchState.players.filter(p => p.isBot).length} bots (${getBotDifficultyName(this.botDifficulty)})`);
    }

    // Update the UI
    this.updatePlayerList();
    this.sounds.playSfx('menu_select');
    this.screen.render();
  }

  /**
   * Leave lobby
   */
  private async leaveLobby(): Promise<void> {
    this.result = { action: 'cancel' };
    this.running = false;

    try {
      await this.network.leaveQueue();
    } catch (err) {
      // Ignore errors when leaving
    }
  }

  /**
   * Update player list display
   */
  private updatePlayerList(): void {
    const matchState = this.network.getMatchState();
    if (!matchState) {
      this.playerList.setItems([]);
      this.screen.render();
      return;
    }

    const items = matchState.players.map((player, index) => {
      const isLocal = player.id === this.localPlayerId;
      const isHost = index === 0;  // First player is host
      const readyStatus = player.ready ? '{green-fg}[READY]{/green-fg}' : '{gray-fg}[NOT READY]{/gray-fg}';
      const hostBadge = isHost ? '{yellow-fg}[HOST]{/yellow-fg} ' : '';
      const youBadge = isLocal ? '{cyan-fg}(You){/cyan-fg} ' : '';
      const botBadge = player.isBot
        ? `{magenta-fg}[CPU-${player.botDifficulty}]{/magenta-fg} `
        : '';

      return `${hostBadge}${youBadge}${botBadge}{white-fg}${player.name}{/white-fg} ${readyStatus}`;
    });

    this.playerList.setItems(items);
    this.screen.render();
  }

  /**
   * Update room settings display
   */
  private updateSettings(mode: MultiplayerMode, lobbyId?: string): void {
    const matchState = this.network.getMatchState();
    if (!matchState) return;

    const modeNames = {
      versus_1v1: '1v1 Versus',
      team_2v2: '2v2 Team Battle',
      battle_royale: 'Battle Royale (99)',
    };

    const content =
      `  Mode:        {yellow-fg}${modeNames[mode]}{/yellow-fg}\n` +
      `  Max Players: {cyan-fg}${matchState.players.length}/${mode === 'battle_royale' ? 99 : mode === 'team_2v2' ? 4 : 2}{/cyan-fg}\n` +
      (lobbyId ? `  Room Code:   {magenta-fg}${lobbyId}{/magenta-fg}\n` : '') +
      `  Status:      {green-fg}${matchState.status.toUpperCase()}{/green-fg}`;

    this.settingsBox.setContent(content);
    this.screen.render();
  }

  /**
   * Update status message
   */
  private updateStatus(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.statusBox.setContent(`\n  {gray-fg}[${timestamp}]{/gray-fg}\n  ${message}`);
    this.screen.render();
  }

  /**
   * Cleanup
   */
  private cleanup(): void {
    this.container.destroy();
  }
}
