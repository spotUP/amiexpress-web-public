/**
 * TETRIS ATTACK netplay over the BBS's in-process lobby broker.
 *
 * The same broker GRANDMASTER's versus mode and TETRINET already use
 * (GrandmasterNetworkManager -> NetworkEngine -> LobbyBroker), carrying the two
 * things a panel match needs: the setup at the start, then a character per
 * frame.
 *
 * THE EVENT NAMES MUST START WITH `game:`. The broker client only forwards
 * events in its protocol namespaces - lobby:, game:, match:, state:, input: -
 * and anything else stays a local EventEmitter event that never leaves the
 * process. A packet sent under the wrong prefix does not error; it silently
 * fails to arrive, which would look exactly like a desync.
 */

import type { GrandmasterNetworkManager } from './network-manager';
import type {
  PanelTransport, PanelInputPacket, PanelMatchSetup, PanelMatchEndPacket,
} from './panel-transport';

const SETUP_EVENT = 'game:pa_setup';
const INPUT_EVENT = 'game:pa_input';
const END_EVENT = 'game:pa_end';

export class PanelBrokerTransport implements PanelTransport {
  private readonly network: GrandmasterNetworkManager;
  private readonly playerId: string;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(network: GrandmasterNetworkManager) {
    this.network = network;
    this.playerId = network.getLocalPlayerId() ?? 'local';
  }

  localId(): string {
    return this.playerId;
  }

  sendInput(packet: PanelInputPacket): void {
    this.network.sendGameEvent(INPUT_EVENT, packet);
  }

  onInput(listener: (packet: PanelInputPacket) => void): () => void {
    return this.subscribe(INPUT_EVENT, (packet: PanelInputPacket) => {
      // Never feed our own input back into our own stack: it is already there,
      // and replaying it would advance the local board twice per frame.
      if (packet.from === this.playerId) return;
      listener(packet);
    });
  }

  sendSetup(setup: PanelMatchSetup): void {
    this.network.sendGameEvent(SETUP_EVENT, setup);
  }

  onSetup(listener: (setup: PanelMatchSetup) => void): () => void {
    return this.subscribe(SETUP_EVENT, listener);
  }

  sendMatchEnd(packet: PanelMatchEndPacket): void {
    this.network.sendGameEvent(END_EVENT, packet);
  }

  onMatchEnd(listener: (packet: PanelMatchEndPacket) => void): () => void {
    return this.subscribe(END_EVENT, (packet: PanelMatchEndPacket) => {
      if (packet.from === this.playerId) return;
      listener(packet);
    });
  }

  /** Drop every subscription this transport made. */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;
  }

  private subscribe<T>(event: string, handler: (packet: T) => void): () => void {
    const unsubscribe = this.network.onGameEvent(event, handler as (payload: unknown) => void);
    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
  }
}
