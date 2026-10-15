/**
 * TetriNET lobby adapter (BBS-internal multiplayer)
 *
 * Rewritten 2026-08-25. The previous version kept its own private lobby
 * state and pushed every action through `network.emitNetwork('tetrinet:*')`,
 * which goes to the NetworkEngine's local EventEmitter and never leaves the
 * process - it then listened for those same events coming back. Nothing
 * crossed a node boundary, so two BBS users each sat in their own private
 * lobby and a "multiplayer" match was always one human plus bots.
 *
 * It now extends BrokerLobbyAdapter - the same broker plumbing Grandmaster's
 * versus lobby uses (players, ready, chat, host-only start, bot fill) - and
 * adds only what TetriNET needs on top: six numbered slots, teams, the game
 * options editor and the winlist. Team and settings changes travel over the
 * broker's game channel so every node's lobby agrees.
 */

import type {
  LobbyLeaderboardEntry,
  LobbyPlayerInfo,
  LobbyState,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { BrokerLobbyAdapter } from './broker-lobby-adapter';
import type { GrandmasterNetworkManager } from './network-manager';
import type { TetriNetGameOptions, TetriNetRule } from '../core/tetrinet/game-rules';
import { getDefaultOptions, optionsFromLobbySettings } from '../core/tetrinet/game-rules';

/** Slot numbers a TetriNET lobby offers. */
export type PlayerSlot = 1 | 2 | 3 | 4 | 5 | 6;

// Must sit in a broker protocol namespace or it never leaves this node -
// see TetriNetBrokerTransport for the same constraint.
const LOBBY_EVENT = 'game:tnet_lobby';
const MAX_SLOTS = 6;

interface LobbySyncPacket {
  kind: 'team' | 'settings';
  playerId?: string;
  team?: string;
  settings?: Record<string, unknown>;
}

export class TetriNetLobbyAdapter extends BrokerLobbyAdapter {
  private rule: TetriNetRule;
  private options: TetriNetGameOptions;
  private winlist: LobbyLeaderboardEntry[] = [];
  private teams: Map<string, string> = new Map();
  private unsubscribeSync: (() => void) | null = null;

  constructor(
    network: GrandmasterNetworkManager,
    localPlayerId?: string,
    rule: TetriNetRule = 'standard'
  ) {
    super(network, localPlayerId ?? network.getLocalPlayerId() ?? 'local');
    this.rule = rule;
    this.options = getDefaultOptions(rule);
    this.unsubscribeSync = network.onGameEvent(LOBBY_EVENT, (packet: LobbySyncPacket) => {
      this.applySync(packet);
    });
  }

  /** TetriNET seats six players. */
  protected lobbySize(): number | undefined {
    return MAX_SLOTS;
  }

  /** Rule set the lobby was opened with. */
  getRule(): TetriNetRule {
    return this.rule;
  }

  /** Options the match should start with, after any host edits. */
  getGameOptions(): TetriNetGameOptions {
    return this.options;
  }

  /**
   * Seed the Winlist tab.
   *
   * The old adapter wrote state.winlist in exactly one place: the handler
   * for an external server's 'tetrinet:winlist' message, which nothing on
   * the in-process bus ever emits. Local lobbies showed an empty tab for
   * ever. app.ts now seeds it from the door's own TetriNET high scores.
   */
  setLocalWinlist(entries: LobbyLeaderboardEntry[]): void {
    this.winlist = entries;
    this.emit('state:updated');
  }

  /**
   * Kept for callers that announced the local player before the lobby
   * existed. The broker seats the local player itself when the lobby is
   * created or joined, so this only refreshes the widget.
   */
  addLocalPlayer(_name: string, _slot: PlayerSlot): void {
    this.emit('state:updated');
  }

  getState(): LobbyState | null {
    const base = super.getState();
    if (!base) return null;

    return {
      ...base,
      players: base.players.map((player, index) => this.decorate(player, index)),
      settings: this.options as unknown as Record<string, unknown>,
      leaderboard: this.winlist,
    };
  }

  async setTeam(team: string): Promise<void> {
    this.teams.set(this.localPlayerId, team);
    const packet: LobbySyncPacket = { kind: 'team', playerId: this.localPlayerId, team };
    this.network.sendGameEvent(LOBBY_EVENT, packet);
    this.emit('state:updated');
  }

  async updateSettings(settings: Record<string, unknown>): Promise<void> {
    this.options = optionsFromLobbySettings(this.rule, settings);
    const packet: LobbySyncPacket = { kind: 'settings', settings };
    this.network.sendGameEvent(LOBBY_EVENT, packet);
    this.emit('settings:updated', this.options as unknown as Record<string, unknown>);
    this.emit('state:updated');
  }

  dispose(): void {
    this.unsubscribeSync?.();
    this.unsubscribeSync = null;
    super.dispose();
  }

  /** Slot numbers and team names are TetriNET's, not the broker's. */
  private decorate(player: LobbyPlayerInfo, index: number): LobbyPlayerInfo {
    return {
      ...player,
      slot: (index + 1) as PlayerSlot,
      team: this.teams.get(player.id) ?? '',
    };
  }

  private applySync(packet: LobbySyncPacket): void {
    if (packet.kind === 'team' && packet.playerId) {
      this.teams.set(packet.playerId, packet.team ?? '');
      this.emit('state:updated');
      return;
    }

    if (packet.kind === 'settings' && packet.settings) {
      this.options = optionsFromLobbySettings(this.rule, packet.settings);
      this.emit('settings:updated', this.options as unknown as Record<string, unknown>);
      this.emit('state:updated');
    }
  }
}
