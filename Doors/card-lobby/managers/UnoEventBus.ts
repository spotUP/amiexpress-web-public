/**
 * Card Lobby - the UNO event queue and the poll that drains it
 *
 * UNO runs across nodes: a move made on one node reaches the others through
 * an event list stored on the table's hand, and each node polls the shared
 * state on a timer and replays what it has not seen. The timer and the queue
 * are one mechanism, so they live in one place.
 *
 * Extracted from index.ts (2808 lines against a 2000 ceiling, under
 * `// @ts-nocheck`), where the socket emit named `this.rpc` - a property the
 * door does not have - so every event was announced to nobody.
 */

import type { DoorSession, LobbyState, LobbyTable, PlayerProfile } from '../lib';

export interface UnoEventHost {
  readonly session: DoorSession;
  readonly lobby: LobbyState | null;
  readonly currentProfile: PlayerProfile | null;
  readonly modalActive: boolean;
  findTableById(tableId: number): LobbyTable | undefined;
  persistState(): Promise<void>;
  reloadState(): Promise<void>;
  pushEvent(message: string): void;
  updateAllPanels(): void;
}

export class UnoEventBus {
  private refreshTimer: NodeJS.Timeout | null = null;
  private lastSeenUnoEventId: string | null = null;

  constructor(private host: UnoEventHost, private refreshIntervalMs: number) {}

  async broadcastUnoEvent(tableId: number, type: string, data: any): Promise<void> {
    if (!this.host.lobby) return;

    const table = this.host.findTableById(tableId);
    if (!table || !table.hand) return;

    // Cast to UnoTableHandState to access events array
    const hand = table.hand as any;
    if (!hand.events) {
      hand.events = [];
    }

    // Create event with unique ID
    const event = {
      id: `${tableId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: type as any,
      playerId: data.playerId,
      data,
      timestamp: Date.now(),
    };

    // Add event to queue
    hand.events.push(event);

    // Keep only last 50 events to prevent unbounded growth
    if (hand.events.length > 50) {
      hand.events = hand.events.slice(-50);
    }

    // Persist state so other nodes can see the event
    await this.host.persistState();

    // Emit via socket for connected clients on this node
    const socket = this.host.session.socket;
    if (socket?.emit) {
      socket.emit('unoEvent', { tableId, event });
    }
  }

  startRefreshTimer(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => {
      if (this.host.modalActive) return;
      this.host.reloadState()
        .then(() => {
          this.processNewUnoEvents();
          this.host.updateAllPanels();
        })
        .catch(() => undefined);
    }, this.refreshIntervalMs);
  }

  processNewUnoEvents(): void {
    if (!this.host.currentProfile || !this.host.lobby) return;
    const table = this.host.currentProfile.currentTableId
      ? this.host.findTableById(this.host.currentProfile.currentTableId)
      : null;
    if (!table || !table.hand) return;

    // Only process events for UNO tables
    if (table.gameId !== 'uno' && table.gameId !== 'uno-house') return;

    const hand = table.hand as any;
    if (!hand.events || !Array.isArray(hand.events)) return;

    // Find new events since last seen
    const newEvents = this.lastSeenUnoEventId
      ? hand.events.filter((e: any) => e.timestamp > this.getEventTimestamp(this.lastSeenUnoEventId))
      : hand.events;

    if (newEvents.length === 0) return;

    // Update last seen event ID
    if (hand.events.length > 0) {
      this.lastSeenUnoEventId = hand.events[hand.events.length - 1].id;
    }

    // Process each new event
    for (const event of newEvents) {
      this.handleUnoEvent(event);
    }
  }

  getEventTimestamp(eventId: string | null): number {
    if (!eventId) return 0;
    // Event ID format: tableId-timestamp-random
    const parts = eventId.split('-');
    if (parts.length >= 2) {
      return parseInt(parts[1], 10) || 0;
    }
    return 0;
  }

  handleUnoEvent(event: any): void {
    // Play sound or visual feedback based on event type
    switch (event.type) {
      case 'cardPlayed':
        // Visual feedback handled by updateTablePanel
        break;
      case 'cardDrawn':
        // Visual feedback handled by updateTablePanel
        break;
      case 'unoCalled':
        this.host.pushEvent(`${event.data.playerName || 'Player'} called UNO!`);
        break;
      case 'challengeOpened':
        this.host.pushEvent(`Challenge window opened! Press QUIT to challenge.`);
        break;
      case 'challengeClosed':
        this.host.pushEvent(event.data.message || 'Challenge window closed.');
        break;
      case 'gameStarted':
        this.host.pushEvent('UNO game started!');
        break;
      case 'gameEnded':
        this.host.pushEvent(event.data.message || 'Game ended!');
        break;
    }
  }

  stopRefreshTimer(): void {
    if (!this.refreshTimer) return;
    clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }
}
