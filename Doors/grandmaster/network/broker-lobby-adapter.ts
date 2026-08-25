/**
 * Broker-backed lobby adapter
 *
 * Wraps GrandmasterNetworkManager for the SDK MultiplayerLobby widget. Lives
 * here rather than inside lobby-screen.ts because TetriNET's internal
 * multiplayer lobby needs exactly this plumbing - broker forwarding, chat,
 * ready, host-only start, bot fill - and only differs in the slot/team/
 * settings/winlist decoration it adds on top.
 */

import { EventEmitter } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type {
  LobbyNetworkAdapter,
  LobbyPlayerInfo,
  LobbyState,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { GrandmasterNetworkManager, PlayerInfo, MultiplayerMode } from './network-manager';
import { fillLobbyWithBots, removeBots, type BotDifficulty } from './bot-lobby';

/**
 * Adapter that wraps GrandmasterNetworkManager for the SDK MultiplayerLobby
 */
export class BrokerLobbyAdapter extends EventEmitter implements LobbyNetworkAdapter {
  protected network: GrandmasterNetworkManager;
  protected botDifficulty: BotDifficulty = 5;
  protected localPlayerId: string;
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

  protected setupEventForwarding(): void {
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

    on('chat:message', (msg: any) => {
      this.emit('chat:message', msg);
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

  protected convertPlayer(player: PlayerInfo): LobbyPlayerInfo {
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
    console.log(`[BrokerLobbyAdapter] getState called, matchState=`, matchState ? { matchId: matchState.matchId, playerCount: matchState.players.length, status: matchState.status } : null);
    if (!matchState) return null;

    return {
      lobbyId: matchState.matchId,
      mode: matchState.mode,
      players: matchState.players.map(p => this.convertPlayer(p)),
      status: matchState.status === 'countdown' ? 'starting' : matchState.status === 'playing' ? 'in_progress' : 'waiting',
      hostId: matchState.players[0]?.id,
    };
  }

  /** Seats in this game's lobby. Undefined uses the versus mode map. */
  protected lobbySize(): number | undefined {
    return undefined;
  }

  async joinQueue(mode: string): Promise<void> {
    console.log(`[BrokerLobbyAdapter] joinQueue called, mode=${mode}`);
    await this.network.joinQueue(mode as MultiplayerMode, this.lobbySize());
    console.log(`[BrokerLobbyAdapter] joinQueue complete, emitting state:updated`);
    this.emit('state:updated');
  }

  async createLobby(mode: string, isPrivate?: boolean): Promise<string> {
    console.log(`[BrokerLobbyAdapter] createLobby called, mode=${mode}`);
    const lobbyId = await this.network.createLobby(mode as MultiplayerMode, isPrivate, this.lobbySize());
    console.log(`[BrokerLobbyAdapter] createLobby complete, lobbyId=${lobbyId}, emitting state:updated`);
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

    console.log(`[BrokerLobbyAdapter] fillWithBots: mode=${matchState.mode}, minPlayers=${minPlayers}, now have ${matchState.players.length} players`);
    this.emit('state:updated');
  }

  removeBots(): void {
    const matchState = this.network.getMatchState();
    if (!matchState) return;

    matchState.players = removeBots(matchState.players);
    this.emit('state:updated');
  }

  sendChat(message: string, isAction?: boolean): void {
    // Through the broker, which has routed 'lobby:chat' all along - the old
    // implementation only echoed locally, so the other player never saw
    // anything typed here. The echo comes back to the sender too (the
    // broker broadcasts to all members), so no local append is needed.
    this.network.sendLobbyChat(isAction ? `* ${message}` : message);
  }
}

