/**
 * TetriNET transport over the BBS's in-process lobby broker.
 *
 * Internal TetriNET multiplayer had no transport at all: every lobby result
 * started a purely local game against three bots with no network passed, so
 * the other BBS users who joined the lobby were simply not in the match.
 * This is the missing wire - the same broker Grandmaster's versus mode
 * already uses (GrandmasterNetworkManager -> NetworkEngine -> LobbyBroker),
 * carrying the three things a TetriNET match needs: fields, specials and
 * classic garbage.
 *
 * The broker broadcasts unrecognised events to every other member of the
 * lobby, so no server-side support is needed for the TetriNET-specific
 * packets; addressing is done by the `to` field and filtered by receivers.
 */

import type { GrandmasterNetworkManager } from './network-manager';
import type { TetriNetGameState } from '../core/tetrinet/tetrinet-engine';
import type {
  TetriNetTransport,
  TetriNetFieldUpdate,
  TetriNetSpecialPacket,
  TetriNetGarbagePacket,
  TetriNetUpdateListener,
} from './tetrinet-transport';

// The broker client only forwards events in its protocol namespaces
// (lobby:, game:, match:, state:, input:) - anything else stays a local
// EventEmitter event and never reaches the other node. These are game
// events, so they live under game:.
const FIELD_EVENT = 'game:tnet_field';
const SPECIAL_EVENT = 'game:tnet_special';
const GARBAGE_EVENT = 'game:tnet_garbage';

export class TetriNetBrokerTransport implements TetriNetTransport {
  private network: GrandmasterNetworkManager;
  private playerId: string;
  private playerName: string;
  private unsubscribers: Array<() => void> = [];

  constructor(network: GrandmasterNetworkManager, playerName: string) {
    this.network = network;
    this.playerId = network.getLocalPlayerId() ?? 'local';
    this.playerName = playerName;
  }

  localId(): string {
    return this.playerId;
  }

  onUpdate(listener: TetriNetUpdateListener): () => void {
    return this.subscribe(FIELD_EVENT, (packet: TetriNetFieldUpdate) => {
      if (packet.playerId === this.playerId) return;  // never mirror ourselves
      listener(packet);
    });
  }

  sendUpdate(state: TetriNetGameState): void {
    this.sendField({
      playerId: this.playerId,
      name: this.playerName,
      board: state.board,
      level: state.level,
      alive: state.status !== 'gameover',
      hasImmunity: state.activeEffects?.includes('immunity') ?? false,
    });
  }

  /** Publish a field this node owns but does not play - the host's bots. */
  sendField(update: TetriNetFieldUpdate): void {
    this.network.sendGameEvent(FIELD_EVENT, update);
  }

  sendSpecial(packet: TetriNetSpecialPacket): void {
    this.network.sendGameEvent(SPECIAL_EVENT, packet);
  }

  onSpecial(listener: (packet: TetriNetSpecialPacket) => void): () => void {
    return this.subscribe(SPECIAL_EVENT, listener);
  }

  sendGarbage(packet: TetriNetGarbagePacket): void {
    this.network.sendGameEvent(GARBAGE_EVENT, packet);
  }

  onGarbage(listener: (packet: TetriNetGarbagePacket) => void): () => void {
    return this.subscribe(GARBAGE_EVENT, listener);
  }

  /** Drop every broker subscription. Call when the match screen closes. */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
  }

  private subscribe(event: string, listener: (packet: any) => void): () => void {
    const unsubscribe = this.network.onGameEvent(event, listener);
    this.unsubscribers.push(unsubscribe);
    return () => {
      unsubscribe();
      const index = this.unsubscribers.indexOf(unsubscribe);
      if (index >= 0) this.unsubscribers.splice(index, 1);
    };
  }
}
