/**
 * Lobby Screen
 *
 * Multiplayer lobby using the SDK's generic MultiplayerLobby widget
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  MultiplayerLobby,
  type LobbyNetworkAdapter,
  type LobbyPlayerInfo,
  type LobbyState,
  type LobbyResult,
  type LobbyEntryMode,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { EventEmitter } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { GrandmasterNetworkManager, PlayerInfo, MultiplayerMode } from '../network/network-manager';
import type { AppState } from '../core/types';
import type { SoundEngine, SoundEffect } from '../audio/sounds';
import { fillLobbyWithBots, removeBots, type BotDifficulty } from '../network/bot-lobby';

/**
 * Lobby mode
 */
export type LobbyMode = 'matchmaking' | 'custom' | 'browse';

/**
 * Adapter that wraps GrandmasterNetworkManager for the SDK MultiplayerLobby
 */
class GrandmasterLobbyAdapter extends EventEmitter implements LobbyNetworkAdapter {
  private network: GrandmasterNetworkManager;
  private botDifficulty: BotDifficulty = 5;

  constructor(network: GrandmasterNetworkManager) {
    super();
    this.network = network;
    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    // Forward network events to lobby adapter events
    this.network.on('player:joined', (player: PlayerInfo) => {
      this.emit('player:joined', this.convertPlayer(player));
    });

    this.network.on('player:left', (playerId: string) => {
      this.emit('player:left', playerId);
    });

    this.network.on('player:ready', (data: { playerId: string; ready: boolean }) => {
      this.emit('player:ready', data);
    });

    this.network.on('match:starting', () => {
      this.emit('match:starting');
    });

    this.network.on('match:started', () => {
      this.emit('match:started');
    });
  }

  private convertPlayer(player: PlayerInfo): LobbyPlayerInfo {
    return {
      id: player.id,
      name: player.name,
      ready: player.ready,
      isBot: player.isBot,
      botDifficulty: player.botDifficulty,
      extra: {
        rank: player.rank,
        rating: player.rating,
      },
    };
  }

  getState(): LobbyState | null {
    const matchState = this.network.getMatchState();
    if (!matchState) return null;

    return {
      lobbyId: matchState.matchId,
      mode: matchState.mode,
      players: matchState.players.map(p => this.convertPlayer(p)),
      status: matchState.status === 'countdown' ? 'starting' : matchState.status === 'playing' ? 'in_progress' : 'waiting',
      hostId: matchState.players[0]?.id,
    };
  }

  async joinQueue(mode: string): Promise<void> {
    await this.network.joinQueue(mode as MultiplayerMode);
  }

  async createLobby(mode: string, isPrivate?: boolean): Promise<string> {
    return await this.network.createLobby(mode as MultiplayerMode, isPrivate);
  }

  async joinLobby(lobbyId: string): Promise<void> {
    await this.network.joinLobby(lobbyId);
  }

  async leaveLobby(): Promise<void> {
    await this.network.leaveQueue();
  }

  async setReady(ready: boolean): Promise<void> {
    await this.network.setReady(ready);
  }

  async startMatch(): Promise<void> {
    // Check if local player is the host
    const state = this.getState();
    const matchState = this.network.getMatchState();
    if (!state || !matchState) return;

    const localPlayerId = matchState.players.find(p => !p.isBot)?.id;
    if (state.hostId && localPlayerId !== state.hostId) {
      // Not the host, can't start match
      return;
    }

    // Notify network (in case there's a real server)
    await this.network.startMatch();

    // Local fallback: emit match events directly (like TetriNET pattern)
    // This ensures the game starts even without server acknowledgment
    this.emit('match:starting');
    setTimeout(() => {
      this.emit('match:started');
    }, 500);
  }

  fillWithBots(count: number, difficulty?: number): void {
    const matchState = this.network.getMatchState();
    if (!matchState) return;

    const diff = (difficulty ?? this.botDifficulty) as BotDifficulty;
    matchState.players = fillLobbyWithBots(matchState.players, count, diff);
    this.emit('state:updated');
  }

  removeBots(): void {
    const matchState = this.network.getMatchState();
    if (!matchState) return;

    matchState.players = removeBots(matchState.players);
    this.emit('state:updated');
  }
}

/**
 * Lobby Screen
 *
 * Thin wrapper around SDK's MultiplayerLobby widget
 */
export class LobbyScreen {
  private screen: Screen;
  private state: AppState;
  private sounds: SoundEngine;
  private network: GrandmasterNetworkManager;
  private localPlayerId: string;
  private lobby: MultiplayerLobby | null = null;

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
  }

  /**
   * Show lobby and wait for result
   */
  async show(mode: LobbyMode, selectedMode?: MultiplayerMode): Promise<LobbyResult> {
    // Enable mouse control for lobby interaction
    this.screen.program.enableMouse();

    // Create adapter
    const adapter = new GrandmasterLobbyAdapter(this.network);

    // Create lobby widget
    this.lobby = new MultiplayerLobby({
      parent: this.screen,
      adapter,
      localPlayerId: this.localPlayerId,
      title: 'GRANDMASTER LOBBY',
      features: {
        bots: true,
        settingsEditor: true,
      },
      gameSettings: [
        {
          key: 'startingLevel',
          label: 'Start Level',
          type: 'number',
          min: 1,
          max: 20,
          default: 1,
          hostOnly: true,
        },
        {
          key: 'rule',
          label: 'Rule Set',
          type: 'select',
          options: [
            { value: 'classic', label: 'Classic' },
            { value: 'standard', label: 'Standard' },
            { value: 'extended', label: 'Extended' },
          ],
          default: 'standard',
          hostOnly: true,
        },
        {
          key: 'suddenDeath',
          label: 'Sudden Death',
          type: 'number',
          min: 0,
          max: 15,
          default: 2,
          description: 'Minutes until sudden death (0=off)',
          hostOnly: true,
        },
        {
          key: 'garbage',
          label: 'Garbage Lines',
          type: 'checkbox',
          default: true,
          hostOnly: true,
        },
      ],
      defaultBotDifficulty: 5,
      modes: {
        versus_1v1: { name: '1v1 Versus', maxPlayers: 2, minPlayers: 2 },
        team_2v2: { name: '2v2 Team Battle', maxPlayers: 4, minPlayers: 4 },
        battle_royale: { name: 'Battle Royale (99)', maxPlayers: 99, minPlayers: 2 },
      },
      onSound: (sound) => {
        // Map SDK sound names to GRANDMASTER sound effects
        const soundMap: Record<string, SoundEffect> = {
          select: 'menu_select',
          error: 'error',
          countdown: 'countdown',
          join: 'menu_select',
          leave: 'menu_select',
          chat: 'menu_select',
        };
        const sfx = soundMap[sound];
        if (sfx) {
          this.sounds.playSfx(sfx);
        }
      },
      formatPlayer: (player, isLocal, isHost) => {
        const readyStatus = player.ready
          ? '{green-fg}[READY]{/green-fg}'
          : '{gray-fg}[NOT READY]{/gray-fg}';
        const hostBadge = isHost ? '{yellow-fg}[HOST]{/yellow-fg} ' : '';
        const youBadge = isLocal ? '{cyan-fg}(You){/cyan-fg} ' : '';
        const botBadge = player.isBot
          ? `{magenta-fg}[CPU-${player.botDifficulty}]{/magenta-fg} `
          : '';

        return `${hostBadge}${youBadge}${botBadge}{white-fg}${player.name}{/white-fg} ${readyStatus}`;
      },
    });

    // Convert lobby mode to entry mode
    const entryMode: LobbyEntryMode = mode === 'matchmaking' ? 'matchmaking' : 'custom';

    // Show and return result
    return await this.lobby.show(entryMode, selectedMode || 'versus_1v1');
  }
}
