# Using SDK MultiplayerLobby Browser Mode in Card Lobby

## Overview

The SDK's `MultiplayerLobby` widget now supports **browser mode** - a table browser UI for showing multiple available tables that users can join, observe, or create.

This is perfect for card-lobby's use case where users browse a list of active tables before joining one.

## Browser Mode vs Standard Mode

**Standard Mode** (like Grandmaster):
- Single lobby room where players gather before match starts
- Players ready up, host starts the match
- Used for: Fighting games, TetriNET, puzzle games

**Browser Mode** (card-lobby):
- Shows list of available tables/rooms
- Players can join any open table, create new tables, or observe
- Used for: Card games, poker rooms, chess lobbies

## Example Adapter for Card-Lobby

Here's how card-lobby could use browser mode:

```typescript
import {
  MultiplayerLobby,
  type LobbyNetworkAdapter,
  type LobbyTableEntry,
  type LobbyBrowserFilters,
  type LobbyState,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { EventEmitter } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

/**
 * Adapter that wraps card-lobby state for SDK MultiplayerLobby browser mode
 */
class CardLobbyBrowserAdapter extends EventEmitter implements LobbyNetworkAdapter {
  private lobby: LobbyState;
  private profiles: Record<string, PlayerProfile>;
  private filters: LobbyBrowserFilters = {};

  constructor(lobby: LobbyState, profiles: Record<string, PlayerProfile>) {
    super();
    this.lobby = lobby;
    this.profiles = profiles;
  }

  // Standard adapter methods (required for all adapters)
  getState(): LobbyState | null {
    return this.lobby;
  }

  async joinQueue(_mode: string): Promise<void> {
    // Not used in browser mode
    throw new Error('Browser mode does not support matchmaking');
  }

  async createLobby(mode: string, isPrivate?: boolean): Promise<string> {
    // Create new table logic here
    // Return table ID
    return 'new-table-id';
  }

  async joinLobby(lobbyId: string | number): Promise<void> {
    // Join existing table logic
    const tableId = Number(lobbyId);
    const table = this.lobby.tables.find(t => t.id === tableId);
    if (!table) throw new Error('Table not found');

    // Add player to table, update state, etc.
  }

  async leaveLobby(): Promise<void> {
    // Leave current table/lobby
  }

  async setReady(_ready: boolean): Promise<void> {
    // Not used in browser mode (no ready-up phase)
  }

  async startMatch(): Promise<void> {
    // Not used in browser mode (games start automatically when table is full or host starts)
  }

  // Browser mode specific methods (optional)
  getTables(): LobbyTableEntry[] {
    // Convert lobby tables to SDK format
    return this.lobby.tables.map(table => {
      const game = getGameById(table.gameId);
      const humanCount = this.getHumanPlayers(table).length;

      return {
        id: table.id,
        gameId: table.gameId,
        gameName: game?.name || 'Unknown',
        stakes: table.stakesLabel,
        players: humanCount,
        maxPlayers: table.maxPlayers,
        status: table.status === 'waiting' ? 'waiting' : 'in_progress',
        hostName: table.hostId ? this.profiles[table.hostId]?.name : undefined,
      };
    });
  }

  async refreshTables(): Promise<void> {
    // Reload tables from storage
    const stored = await Storage.get<LobbyState>(LOBBY_KEY);
    if (stored) {
      this.lobby = stored;
      this.emit('tables:updated');
    }
  }

  async observeTable(tableId: string | number): Promise<void> {
    // Join table in observer mode
    // Emit 'match:started' with observe mode
  }

  filterTables(filters: LobbyBrowserFilters): void {
    this.filters = filters;
    this.emit('tables:updated');
  }

  private getHumanPlayers(table: LobbyTable): TablePlayer[] {
    return table.seats.filter(p => p && !isBotPlayer(p));
  }
}

/**
 * Example: Show browser UI in card-lobby
 */
async function showBrowserUI(
  screen: Screen,
  lobby: LobbyState,
  profiles: Record<string, PlayerProfile>,
  localPlayerId: string
): Promise<void> {
  const adapter = new CardLobbyBrowserAdapter(lobby, profiles);

  const browser = new MultiplayerLobby({
    parent: screen,
    adapter,
    localPlayerId,
    title: 'CARD LOBBY - TABLE BROWSER',
    features: {
      browserMode: true,  // Enable browser mode
      observe: true,      // Enable observe button
      filters: true,      // Enable filtering
    },
    tableHeaders: ['ID', 'Game', 'Stakes', 'Players', 'Status'],
    formatTableRow: (table) => {
      // Custom formatting for card-lobby tables
      const playerCount = `${table.players}/${table.maxPlayers}`;
      const status = table.status === 'waiting' ? 'OPEN' : 'PLAYING';
      return [
        String(table.id),
        table.gameName,
        table.stakes || '-',
        playerCount,
        status,
      ];
    },
  });

  // Listen for create table event
  browser.on('browser:create-table', () => {
    // Show game/stakes selection dialog
    // Then call adapter.createLobby()
  });

  // Show browser and wait for user action
  const result = await browser.show('custom'); // Entry mode doesn't matter in browser mode

  if (result.action === 'start') {
    // User joined a table, transition to game UI
    console.log('Joined table:', result.lobbyId);
  }
}
```

## Integration Options

Card-lobby has two options:

### Option 1: Hybrid Approach (Recommended)
- Use SDK MultiplayerLobby browser mode for the **table list view**
- Keep existing custom UI for **active game table view**
- Benefits: Clean table browser, less code to maintain
- Trade-offs: Need to integrate browser widget with existing state management

### Option 2: Keep Custom Implementation
- Continue using current ListTable-based implementation
- Browser mode added to SDK for future doors or optional migration
- Benefits: No disruption to working code
- Trade-offs: More custom code to maintain

## Current Status

- ✅ Browser mode implemented in SDK MultiplayerLobby widget
- ✅ 100% backward compatible (Grandmaster and other doors unaffected)
- ✅ SDK rebuilt with new features
- ⚠️ Card-lobby still uses custom implementation (not yet migrated)

## Next Steps (Optional)

If you want to migrate card-lobby to use the SDK browser mode:

1. Create `CardLobbyBrowserAdapter` implementing `LobbyNetworkAdapter`
2. Replace lobby list view with `MultiplayerLobby` in browser mode
3. Keep existing game table view (when user joins a table)
4. Test table creation, joining, observing
5. Ensure state persistence still works

The browser mode is ready to use whenever you want to integrate it!
