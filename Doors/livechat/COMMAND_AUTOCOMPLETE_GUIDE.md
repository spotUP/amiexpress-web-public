# Command Autocomplete System

**Version**: 1.0
**Feature Status**: Complete
**Date**: 2024-12-24

## Overview

LiveChat v3.2 includes an intelligent command autocomplete system that provides real-time suggestions when users type slash commands. Similar to modern CLI tools like Claude CLI, the system shows a dropdown list of matching commands with descriptions, usage examples, and keyboard navigation.

## User Experience

### Triggering Autocomplete

When a user types `/` in the chat input, the autocomplete dropdown automatically appears above the input box showing all available commands.

```
┌─ Commands ─────────────────────────────────────────────┐
│ /join           /join <channel>                         │
│ /leave          /leave                                  │
│ /msg            /msg <user> <message>                   │
│ /who            /who                                    │
│ /help           /help                                   │
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```

### Filtering Commands

As the user continues typing, the list filters to show only matching commands:

**Example 1**: User types `/e`
```
┌─ Commands ─────────────────────────────────────────────┐
│ /events         /events [type]          Manage event... │
│ /emoji          /emoji [search]         Open emoji...   │
│ /edit           /edit                   Edit last...    │
└─────────────────────────────────────────────────────────┘
```

**Example 2**: User types `/ev`
```
┌─ Commands ─────────────────────────────────────────────┐
│ /events         /events [type]          Manage event... │
└─────────────────────────────────────────────────────────┘
```

### Selecting Commands

Users can select a command using:

**1. Keyboard Navigation**:
- `↓` or `Tab` - Move down to next command
- `↑` or `Shift+Tab` - Move up to previous command
- `Enter` - Select highlighted command
- `Esc` - Close autocomplete and continue typing

**2. Mouse**:
- Click on any command to select it

When a command is selected, it's inserted into the input box with a trailing space, ready for arguments.

## Display Format

Each command entry shows:
```
/name           /usage                      Description
│               │                           │
│               │                           └─ Brief description of what the command does
│               └───────────────────────────── Example usage pattern
└───────────────────────────────────────────── Command name
```

**Example**:
```
/events         /events [type]              Manage event notifications
```

## Filtering Logic

Commands are filtered using two criteria:

1. **Name Matching** (primary): Command name starts with the typed text
2. **Description Matching** (secondary): Description contains the typed text

**Prioritization**:
- Commands with name matches appear first
- Within each group, commands are sorted alphabetically

**Example**: Typing `/m` shows:
```
1. /msg    (name match - starts with 'm')
2. /me     (name match - starts with 'm')
3. /mute   (name match - starts with 'm')
4. /dm     (description match - contains 'message')
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Show autocomplete (when input is empty or starts with /) |
| `↓` | Select next command |
| `↑` | Select previous command |
| `Tab` | Select next command (cycles to first at end) |
| `Shift+Tab` | Select previous command (cycles to last at start) |
| `Enter` | Insert selected command |
| `Esc` | Close autocomplete |
| `Backspace` | Update filtering (hide if input no longer starts with /) |

## Implementation Details

### Component Structure

**UI Component** (app.ts:206-316):
```typescript
const commandSuggestions = blessed.list({
  parent: screen,
  bottom: INPUT_HEIGHT + STATUS_HEIGHT,  // Positioned above input
  left: 0,
  width: 60,
  height: 10,
  label: ' Commands ',
  border: { type: 'line' },
  hidden: true,
  scrollbar: { ch: ' ' },
  // ... styling
});
```

**Key Functions**:

1. **`showCommandSuggestions(input: string)`** (lines 232-272)
   - Gets all commands from registry
   - Filters based on input
   - Sorts with name matches first
   - Formats display items
   - Shows dropdown with selection

2. **`hideCommandSuggestions()`** (lines 274-280)
   - Hides dropdown
   - Updates visibility flag
   - Renders screen

3. **`selectCommandSuggestion()`** (lines 282-292)
   - Gets selected command
   - Inserts into input with trailing space
   - Hides dropdown
   - Refocuses input

### Event Handling

**Keypress Handler** (app.ts:2791-2831):
```typescript
inputBox.on('keypress', (ch: string, key: any) => {
  // 1. Handle navigation when dropdown is visible
  if (commandSuggestionsVisible) {
    if (key.name === 'down' || key.name === 'tab') {
      commandSuggestions.down(1);
      return;
    }
    // ... up, enter, escape
  }

  // 2. Keystroke transmission (typing indicators)
  // ...

  // 3. Update autocomplete based on input
  setTimeout(() => {
    const currentValue = inputBox.getValue();
    if (currentValue.startsWith('/')) {
      showCommandSuggestions(currentValue);
    } else {
      hideCommandSuggestions();
    }
  }, 0);
});
```

**Submit Handler** (app.ts:2624-2634):
```typescript
inputBox.on('submit', async (value: string) => {
  // Hide autocomplete when command is submitted
  hideCommandSuggestions();
  // ... process command
});
```

### Command Registry Integration

The autocomplete uses the existing `CommandRegistry` to get available commands:

```typescript
const allCommands = registry.getAll();  // Returns SlashCommand[]
```

Each command includes:
- `name`: Command name (e.g., "events")
- `description`: Brief description
- `usage`: Usage pattern (e.g., "/events [type]")
- `aliases`: Alternative names (also searchable)

## Accessibility

**Keyboard-First Design**:
- Full keyboard navigation (no mouse required)
- Tab/Shift+Tab for cycling
- Arrow keys for precise selection
- Enter to confirm, Esc to cancel

**Visual Feedback**:
- Selected command highlighted with cyan background
- Clear border styling (cyan)
- Scrollbar for long command lists
- Formatted text with color coding:
  - Command names: Cyan
  - Usage: Gray
  - Description: White

## Performance Considerations

**Efficient Filtering**:
- `O(n)` filtering where n = number of commands (~30-40)
- Negligible performance impact
- Real-time updates (no debouncing needed)

**Lazy Rendering**:
- Dropdown only created once on initialization
- Hidden by default, shown on demand
- Uses blessed's efficient rendering

## Integration with Existing Features

**Compatible With**:
- ✅ Emoji autocomplete (F4/Ctrl+E)
- ✅ Message history (Up/Down arrows when not in autocomplete)
- ✅ Command execution
- ✅ Typing indicators
- ✅ All keyboard shortcuts

**Conflicts Resolved**:
- Arrow keys prioritize autocomplete when dropdown is visible
- Tab key cycles through suggestions (doesn't focus next element)
- Enter key selects suggestion (doesn't submit)
- Esc key closes autocomplete (doesn't close other modals)

## Testing

### Manual Test Cases

- [ ] Type `/` - Dropdown appears with all commands
- [ ] Type `/e` - Only commands starting with 'e' shown
- [ ] Type `/events` - Only /events command shown
- [ ] Type `/xyz` - Dropdown hides (no matches)
- [ ] Press `↓` - Next command highlighted
- [ ] Press `↑` - Previous command highlighted
- [ ] Press `Tab` - Cycles to next command
- [ ] Press `Shift+Tab` - Cycles to previous command
- [ ] Press `Enter` - Selected command inserted with space
- [ ] Press `Esc` - Dropdown closes, input retains content
- [ ] Click command - Command inserted
- [ ] Delete `/` - Dropdown hides
- [ ] Submit command - Dropdown hides

### Integration Tests

- [ ] Autocomplete works with all 30+ registered commands
- [ ] Filtering works for command names and descriptions
- [ ] Keyboard navigation doesn't interfere with history
- [ ] Mouse selection works correctly
- [ ] Dropdown hides when switching focus
- [ ] No memory leaks or performance issues

## Future Enhancements

### Planned Features

1. **Argument Hints** - Show required/optional arguments inline
2. **Command History Search** - Filter by previously used commands
3. **Fuzzy Matching** - Match commands with typos (e.g., `/evnts` → `/events`)
4. **Parameter Autocomplete** - Suggest values for command arguments
5. **Command Aliases Display** - Show aliases in dropdown
6. **Help Preview** - Show detailed help on hover/selection
7. **Customizable Shortcuts** - Let users configure navigation keys

### Backend Integration

No backend changes required - feature is entirely client-side.

## Code Locations

| Component | File | Lines |
|-----------|------|-------|
| Autocomplete UI | `app.ts` | 206-316 |
| Keypress Handler | `app.ts` | 2791-2831 |
| Submit Handler | `app.ts` | 2624-2634 |
| Command Registry | `commands/types.ts` | 32-59 |
| SlashCommand Type | `types/index.ts` | - |

**Total Lines Added**: ~150 lines

## References

- Command Registry: `commands/types.ts`
- Event Filtering: `commands/events.ts`
- Emoji Commands: `commands/emoji.ts`
- Neo-Blessed List: `engines/ui/blessed/widgets/list.ts`

---

**Status**: ✅ COMPLETE
**Build Status**: Zero TypeScript errors
**Next Steps**: User testing and feedback collection

## Example Screenshots

### All Commands
```
Type: /

┌─ Commands ────────────────────────────────────────────────────┐
│ /away           /away [msg]             Set away status       │
│ /back           /back                   Return from away      │
│ /ban            /ban <user>             Ban user              │
│ /clear          /clear                  Clear chat window     │
│ /create         /create <name>          Create new channel    │
│ /delete         /delete                 Delete channel        │
│ /dm             /dm <user> <msg>        Send direct message   │
│ /edit           /edit                   Edit last message     │
│ /emoji          /emoji [search]         Open emoji picker     │
│ /events         /events [type]          Manage events         │
└────────────────────────────────────────────────────────────────┘
```

### Filtered Commands
```
Type: /event

┌─ Commands ────────────────────────────────────────────────────┐
│ /events         /events [type]          Manage event notif... │
└────────────────────────────────────────────────────────────────┘
```

### Selected Command
```
Type: /ev [Enter on /events]

Input: /events ▋
```

---

**Feature Complete**: Command autocomplete provides a modern, intuitive interface for discovering and using LiveChat commands, matching the UX quality of professional CLI tools like Claude CLI.
