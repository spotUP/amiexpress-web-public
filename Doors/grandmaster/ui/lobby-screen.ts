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
  private localPlayerId: string;
  /** Monotonic id source for locally-originated chat messages. */
  private chatSeq = 0;

  constructor(network: GrandmasterNetworkManager, localPlayerId: string) {
    super();
    this.network = network;
    this.localPlayerId = localPlayerId;
    this.setupEventForwarding();
  }

  /**
   * Handlers registered on the SHARED GrandmasterNetworkManager, kept so
   * dispose() can take them off again. A new adapter is built every time the
   * lobby is entered (app.ts loops back to it after each match), so without
   * this they piled up on the same emitter: every event then also ran the
   * handlers of long-dead adapters, and a throw from one - touching widgets
   * that were already destroyed - aborts the emit before the LIVE adapter's
   * handler gets to run.
   */
  private forwarded: Array<[string, (...args: any[]) => void]> = [];

  private setupEventForwarding(): void {
    // Forward network events to lobby adapter events
    // These come from the SDK lobby system via the broker
    const on = (event: string, handler: (...args: any[]) => void) => {
      this.forwarded.push([event, handler]);
      this.network.on(event, handler);
    };

    on('player:joined', (player: PlayerInfo) => {
      this.emit('player:joined', this.convertPlayer(player));
      this.emit('state:updated');
    });

    on('player:left', (playerId: string) => {
      this.emit('player:left', playerId);
      this.emit('state:updated');
    });

    on('player:ready', (data: { playerId: string; ready: boolean }) => {
      this.emit('player:ready', data);
      this.emit('state:updated');
    });

    on('match:starting', () => {
      this.emit('match:starting');
    });

    on('match:started', () => {
      this.emit('match:started');
    });

    on('lobby:updated', () => {
      this.emit('state:updated');
    });
  }

  /**
   * Detach from the shared network manager. Call when the lobby closes.
   */
  dispose(): void {
    for (const [event, handler] of this.forwarded) {
      this.network.off(event, handler);
    }
    this.forwarded = [];
    this.removeAllListeners();
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
    console.log(`[GrandmasterLobbyAdapter] getState called, matchState=`, matchState ? { matchId: matchState.matchId, playerCount: matchState.players.length, status: matchState.status } : null);
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
    console.log(`[GrandmasterLobbyAdapter] joinQueue called, mode=${mode}`);
    await this.network.joinQueue(mode as MultiplayerMode);
    console.log(`[GrandmasterLobbyAdapter] joinQueue complete, emitting state:updated`);
    this.emit('state:updated');
  }

  async createLobby(mode: string, isPrivate?: boolean): Promise<string> {
    console.log(`[GrandmasterLobbyAdapter] createLobby called, mode=${mode}`);
    const lobbyId = await this.network.createLobby(mode as MultiplayerMode, isPrivate);
    console.log(`[GrandmasterLobbyAdapter] createLobby complete, lobbyId=${lobbyId}, emitting state:updated`);
    this.emit('state:updated');
    return lobbyId;
  }

  async joinLobby(lobbyId: string): Promise<void> {
    await this.network.joinLobby(lobbyId);
  }

  async leaveLobby(): Promise<void> {
    await this.network.leaveLobby();
  }

  async setReady(ready: boolean): Promise<void> {
    await this.network.setReady(ready);
  }

  async startMatch(): Promise<void> {
    const state = this.getState();
    const matchState = this.network.getMatchState();
    if (!state || !matchState) return;

    const localPlayerId = matchState.players.find(p => !p.isBot)?.id;
    const isHost = !state.hostId || localPlayerId === state.hostId;

    if (!isHost) return; // Non-host never initiates — waits for broker game:start

    // Auto-fill with bots if not enough humans
    const humanCount = matchState.players.filter(p => !p.isBot).length;
    if (humanCount < 2) {
      // (count, difficulty) - undefined count means "the mode's minimum".
      await this.fillWithBots(undefined, this.botDifficulty);
    }

    // Host triggers countdown via broker — fires game:starting + game:start on ALL nodes,
    // which the network manager re-emits as match:starting + match:started for every lobby.
    await this.network.startMatch();
  }

  /**
   * Fill lobby with bots to meet a target player count.
   *
   * Argument order follows the SDK's LobbyNetworkAdapter.fillWithBots
   * contract - (count, difficulty). It previously took (difficulty) alone,
   * so the SDK's Bots button, which correctly passes (count, difficulty),
   * handed the player count in as the difficulty.
   *
   * @param count Target number of players (defaults to the mode's minimum)
   * @param difficulty Bot difficulty level (1-10)
   */
  async fillWithBots(count?: number, difficulty?: number): Promise<void> {
    const matchState = this.network.getMatchState();
    if (!matchState) return;

    // Get min players for current mode
    const modeMinPlayers: Record<string, number> = {
      versus_1v1: 2,
      team_2v2: 4,
      battle_royale: 2,
    };
    const minPlayers = count ?? modeMinPlayers[matchState.mode] ?? 2;

    const diff = (difficulty ?? this.botDifficulty) as BotDifficulty;
    matchState.players = fillLobbyWithBots(matchState.players, minPlayers, diff);

    console.log(`[GrandmasterLobbyAdapter] fillWithBots: mode=${matchState.mode}, minPlayers=${minPlayers}, now have ${matchState.players.length} players`);
    this.emit('state:updated');
  }

  removeBots(): void {
    const matchState = this.network.getMatchState();
    if (!matchState) return;

    matchState.players = removeBots(matchState.players);
    this.emit('state:updated');
  }

  sendChat(message: string, isAction?: boolean): void {
    // The SDK widget does NOT echo sent messages into its own chat log - it
    // forwards them here and then renders whatever comes back on the
    // adapter's 'chat:message' event. This used to be a bare console.log
    // with a "handled by the SDK widget locally for now" note, so nothing
    // ever appended the message on either side and typing in the lobby chat
    // silently did nothing (reported live 2026-08-25).
    const state = this.network.getMatchState();
    const me = state?.players?.find((p: { id: string }) => p.id === this.localPlayerId);

    this.emit('chat:message', {
      id: `chat-${this.chatSeq++}`,
      playerId: this.localPlayerId,
      playerName: me?.name ?? 'you',
      text: message,
      timestamp: Date.now(),
      isAction: !!isAction,
    });
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
    const adapter = new GrandmasterLobbyAdapter(this.network, this.localPlayerId);

    // Create lobby widget
    this.lobby = new MultiplayerLobby({
      parent: this.screen,
      adapter,
      localPlayerId: this.localPlayerId,
      title: 'GRANDMASTER LOBBY',
      features: {
        bots: true,
        settingsEditor: true,
        chat: true,
        leaderboard: true,
        readyFlow: false,
        // Start already bot-fills and launches on its own, and the
        // "waiting for other players" countdown auto-launches when it
        // expires - so a Force Start button would just be a second button
        // doing what Start does.
        forceStart: false,
      },
      autoStartTimeout: 60,
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
        const hostBadge = isHost ? '{yellow-fg}[HOST]{/yellow-fg} ' : '';
        const youBadge = isLocal ? '{cyan-fg}(You){/cyan-fg} ' : '';
        const botBadge = player.isBot
          ? `{magenta-fg}[CPU-${player.botDifficulty}]{/magenta-fg} `
          : '';

        return `${hostBadge}${youBadge}${botBadge}{white-fg}${player.name}{/white-fg}`;
      },
    });

    // Convert lobby mode to entry mode
    const entryMode: LobbyEntryMode = mode === 'matchmaking' ? 'matchmaking' : 'custom';

    // Show and return result. Always detach the adapter afterwards: app.ts
    // loops back into the lobby after every match, building a new adapter
    // each time, so leaving the old one attached to the shared network
    // manager leaks a full set of handlers per visit.
    try {
      return await this.lobby.show(entryMode, selectedMode || 'versus_1v1');
    } finally {
      adapter.dispose();
    }
  }
}
