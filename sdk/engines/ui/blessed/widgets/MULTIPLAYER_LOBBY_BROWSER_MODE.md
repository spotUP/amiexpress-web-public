# MultiplayerLobby Browser Mode - SDK Features

## Overview

The SDK's `MultiplayerLobby` widget now includes comprehensive browser mode support with many built-in features, minimizing custom code needed in doors.

## Built-in Features

### 1. Auto-Refresh
Tables automatically refresh at configurable intervals.

```typescript
const lobby = new MultiplayerLobby({
  features: { browserMode: true },
  autoRefreshInterval: 5000, // Refresh every 5 seconds (default)
  // Set to 0 to disable auto-refresh
});
```

### 2. Search Box
Full-text search across table names, hosts, and IDs.

```typescript
const lobby = new MultiplayerLobby({
  features: { browserMode: true },
  enableSearch: true, // Shows search box at top
});
```

**Keyboard shortcuts:**
- `/` or `F` - Focus search box
- `ESC` - Clear search and return to list

**Search matches:**
- Game name
- Host name
- Table ID

### 3. Quick Filters
Pre-configured filter buttons for common use cases.

```typescript
const lobby = new MultiplayerLobby({
  features: { browserMode: true },
  enableQuickFilters: true, // Shows filter buttons
});
```

**Keyboard shortcuts:**
- `A` - Show all tables
- `O` - Show only open tables (with available seats)
- `P` - Show only tables currently playing

### 4. Table Sorting
Sort tables by any column with visual indicators.

```typescript
const lobby = new MultiplayerLobby({
  features: { browserMode: true },
  initialSortBy: 'players',     // 'game' | 'players' | 'status' | 'stakes' | 'age'
  initialSortOrder: 'desc',     // 'asc' | 'desc'
});
```

**Keyboard shortcut:**
- `S` - Cycle through sort options

**Sort indicator:**
- Column headers show ↑ (ascending) or ↓ (descending) arrow

### 5. Join Validation
Built-in and custom validation before joining tables.

```typescript
const lobby = new MultiplayerLobby({
  features: { browserMode: true },
  validateJoin: (table, localPlayerId) => {
    // Built-in: Checks if table is full
    // Custom validation:
    if (table.isPrivate && !hasInvite(localPlayerId, table.id)) {
      return 'This is a private table';
    }
    if (playerBankroll < table.buyIn) {
      return 'Insufficient chips to join';
    }
    return null; // OK to join
  },
});
```

### 6. Table Age Display
Show how long ago tables were created/updated.

```typescript
const lobby = new MultiplayerLobby({
  features: { browserMode: true },
  showTableAge: true, // Adds 'Age' column showing "5m ago", "1h ago", etc.
});
```

### 7. Custom Empty State
Customize message when no tables are available.

```typescript
const lobby = new MultiplayerLobby({
  features: { browserMode: true },
  emptyStateMessage: 'No poker tables found. Create one to get started!',
});
```

### 8. Status Color Coding
Tables automatically color-coded by status:
- **Green**: Waiting (accepting players)
- **Yellow**: Starting (countdown/setup)
- **Red**: In Progress (game active)

### 9. Observe Mode
Allow players to spectate games without playing.

```typescript
const lobby = new MultiplayerLobby({
  features: {
    browserMode: true,
    observe: true, // Adds "Observe" button
  },
});
```

**Keyboard shortcut:**
- `O` - Observe selected table

### 10. Advanced Filtering
Combine multiple filters programmatically.

```typescript
const lobby = new MultiplayerLobby({
  features: { browserMode: true },
  initialFilters: {
    gameId: 'holdem',           // Show only specific game
    openSeatsOnly: true,        // Only tables with open seats
    status: 'waiting',          // Only waiting tables
    searchText: 'tournament',   // Pre-fill search
  },
});
```

## Complete Example

```typescript
import {
  MultiplayerLobby,
  type LobbyNetworkAdapter,
  type LobbyTableEntry,
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

// Create adapter (your game-specific implementation)
const adapter: LobbyNetworkAdapter = {
  getTables: () => myTables,
  refreshTables: async () => { /* reload from storage */ },
  joinLobby: async (id) => { /* join logic */ },
  observeTable: async (id) => { /* observe logic */ },
  // ... other required methods
};

// Create browser with all features
const lobby = new MultiplayerLobby({
  parent: screen,
  adapter,
  localPlayerId: 'player-123',
  modes: { holdem: { name: 'Texas Holdem', maxPlayers: 9 } },

  // Enable browser mode
  features: {
    browserMode: true,
    observe: true,
    filters: true,
  },

  // Search and filtering
  enableSearch: true,
  enableQuickFilters: true,

  // Sorting
  initialSortBy: 'players',
  initialSortOrder: 'desc',

  // Auto-refresh
  autoRefreshInterval: 5000, // 5 seconds

  // Display options
  showTableAge: true,
  tableHeaders: ['ID', 'Game', 'Stakes', 'Players', 'Status', 'Age'],
  emptyStateMessage: 'No tables available. Press C to create one.',

  // Custom formatting
  formatTableRow: (table) => {
    return [
      String(table.id),
      table.gameName,
      table.stakes || '-',
      `${table.players}/${table.maxPlayers}`,
      table.status.toUpperCase(),
      table.age || '-',
    ];
  },

  // Join validation
  validateJoin: (table, localPlayerId) => {
    if (table.players >= table.maxPlayers) {
      return 'Table is full';
    }
    if (table.isPrivate) {
      return 'Private table';
    }
    return null; // OK to join
  },
});

// Handle create table event
lobby.on('browser:create-table', () => {
  // Show your game/stakes selection dialog
  // Then call adapter.createLobby()
});

// Show browser and wait for result
const result = await lobby.show('custom');

if (result.action === 'start') {
  // User joined/observed a table
  console.log('Table ID:', result.lobbyId);
  console.log('Mode:', result.mode);
}
```

## Keyboard Reference

| Key | Action |
|-----|--------|
| `C` | Create new table |
| `J` | Join selected table |
| `O` | Observe selected table (if enabled) |
| `R` | Refresh table list manually |
| `S` | Cycle sort options |
| `/` or `F` | Focus search box |
| `A` | Show all tables (clear filters) |
| `O` | Show only open tables |
| `P` | Show only playing tables |
| `Q` or `ESC` | Exit browser |

## Adapter Methods

Implement these in your `LobbyNetworkAdapter`:

### Required
- `getState()` - Get current lobby state
- `joinLobby(id)` - Join a table
- `leaveLobby()` - Leave current table
- `createLobby(mode, isPrivate)` - Create new table
- `setReady(ready)` - Set ready state (not used in browser mode)
- `startMatch()` - Start match (not used in browser mode)

### Optional (Browser Mode)
- `getTables()` - Return array of `LobbyTableEntry[]`
- `refreshTables()` - Reload tables from storage/server
- `observeTable(id)` - Join table as spectator
- `filterTables(filters)` - Apply filters server-side

## Benefits

### For Door Developers
- ✅ Minimal code - most features built-in
- ✅ Consistent UX across all doors
- ✅ Auto-refresh and real-time updates
- ✅ Professional search/filter UI
- ✅ Keyboard shortcuts work out of the box

### For Users
- ✅ Familiar interface across all games
- ✅ Fast table browsing with search
- ✅ Visual indicators (colors, sort arrows)
- ✅ Quick filters for common needs
- ✅ Responsive keyboard navigation

## Migration from Custom Implementation

**Before (Custom Code):**
```typescript
// 200+ lines of custom table list code
// Manual filtering
// Manual sorting
// Manual search
// Manual refresh timer
// Custom keyboard handlers
```

**After (SDK Browser Mode):**
```typescript
// 50 lines - adapter + configuration
// Everything built-in and tested
const lobby = new MultiplayerLobby({ ... });
lobby.on('browser:create-table', handleCreate);
await lobby.show('custom');
```

**Savings:** ~150+ lines of code per door, plus automatic updates when SDK improves.
