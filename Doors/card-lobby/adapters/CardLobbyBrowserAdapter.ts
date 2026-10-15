/**
 * CardLobbyBrowserAdapter
 *
 * Adapts card-lobby state to SDK MultiplayerLobby browser mode interface
 */

import { EventEmitter } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type {
  LobbyNetworkAdapter,
  LobbyTableEntry,
  LobbyBrowserFilters,
  LobbyState as SDKLobbyState,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { Storage } from '@amiexpress/bbs-door-sdk';
import {
  type LobbyState,
  type LobbyTable,
  type PlayerProfile,
  getGameById,
  isBotPlayer,
  LOBBY_KEY,
} from '../lib';

export class CardLobbyBrowserAdapter extends EventEmitter implements LobbyNetworkAdapter {
  private lobby: LobbyState;
  private profiles: Record<string, PlayerProfile>;

  constructor(lobby: LobbyState, profiles: Record<string, PlayerProfile>) {
    super();
    this.lobby = lobby;
    this.profiles = profiles;
  }

  // Required methods (not used in browser mode, but required by interface)
  getState(): SDKLobbyState | null {
    // Browser mode doesn't use lobby state - returns null
    return null;
  }

  async joinQueue(_mode: string): Promise<void> {
    throw new Error('Matchmaking not supported in card lobby');
  }

  async createLobby(_mode: string, _isPrivate?: boolean): Promise<string> {
    // SDK emits 'browser:create-table' event instead
    // Door handles game/stakes dialogs
    throw new Error('Use browser:create-table event');
  }

  async joinLobby(lobbyId: string | number): Promise<void> {
    // Validate join request
    const tableId = Number(lobbyId);
    const table = this.lobby.tables.find(t => t.id === tableId);

    if (!table) {
      throw new Error('Table not found');
    }

    const humanPlayers = table.players.filter(p => !isBotPlayer(p));
    if (humanPlayers.length >= table.maxPlayers) {
      throw new Error('Table is full');
    }

    // Actual join handled by door after validation passes
  }

  async leaveLobby(): Promise<void> {
    // Exit browser mode - handled by SDK
  }

  async setReady(_ready: boolean): Promise<void> {
    // Not used in browser mode
  }

  async startMatch(): Promise<void> {
    // Not used in browser mode
  }

  // Browser mode specific methods
  getTables(): LobbyTableEntry[] {
    return this.lobby.tables.map(table => this.convertToTableEntry(table));
  }

  async refreshTables(): Promise<void> {
    // Reload from storage
    const globalStore = new Storage({
      doorName: 'card_lobby',
      global: true,
    });
    const stored = await globalStore.load<LobbyState>(LOBBY_KEY);
    if (stored) {
      this.lobby = stored;
      this.emit('tables:updated');
    }
  }

  async observeTable(_tableId: string | number): Promise<void> {
    // Observe mode not implemented yet
    throw new Error('Observe mode not yet implemented');
  }

  filterTables(_filters: LobbyBrowserFilters): void {
    // Filtering handled by SDK (client-side)
    // Could implement server-side filtering here if needed
  }

  // Helper methods
  private convertToTableEntry(table: LobbyTable): LobbyTableEntry {
    const game = getGameById(table.gameId);
    const humanPlayers = table.players.filter(p => !isBotPlayer(p));

    // Calculate table age
    const ageMs = Date.now() - table.createdAt;
    const ageMins = Math.floor(ageMs / 60000);
    const ageHours = Math.floor(ageMins / 60);
    const ageDays = Math.floor(ageHours / 24);

    let age: string;
    if (ageDays > 0) {
      age = `${ageDays}d ago`;
    } else if (ageHours > 0) {
      age = `${ageHours}h ago`;
    } else if (ageMins > 0) {
      age = `${ageMins}m ago`;
    } else {
      age = 'Just now';
    }

    // Map TableStatus to SDK status
    let status: 'waiting' | 'starting' | 'in_progress';
    if (table.status === 'open') {
      status = 'waiting';
    } else {
      status = 'in_progress';
    }

    return {
      id: table.id,
      gameId: table.gameId,
      gameName: game?.name || 'Unknown',
      stakes: table.stakesLabel,
      players: humanPlayers.length,
      maxPlayers: table.maxPlayers,
      status,
      hostName: table.hostUserId ? this.profiles[table.hostUserId]?.username : undefined,
      age,
      extra: {
        buyIn: game?.stakes.find(s => s.label === table.stakesLabel)?.buyIn || 0,
      },
    };
  }

  // Update methods for door to call
  updateLobby(lobby: LobbyState): void {
    this.lobby = lobby;
    this.emit('tables:updated');
  }

  updateProfiles(profiles: Record<string, PlayerProfile>): void {
    this.profiles = profiles;
    this.emit('tables:updated');
  }
}
