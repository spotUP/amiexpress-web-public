# LiveChat Custom Emoji System - Integration Guide

## Files Created

1. **`utils/emojis.ts`** - Emoji registry and replacement system
   - 50+ built-in ASCII emojis across 4 categories
   - Emoji search and autocomplete
   - Text replacement (`:smile:` → `:-)`  )

2. **`ui/emoji-picker.ts`** - Emoji picker dialog
   - Category browser (left pane)
   - Emoji list (center pane)
   - Preview with keywords (right pane)
   - Keyboard and mouse navigation

3. **`commands/emoji.ts`** - Emoji commands
   - `/emoji` - Open picker or search
   - `/emojis [category]` - List emojis
   - `/customemoji` - Placeholder for future custom emojis

## Integration Steps

### 1. Add to `app.ts` imports:

```typescript
import { EmojiPicker } from './ui/emoji-picker';
import { replaceEmojis } from './utils/emojis';
import { createEmojiCommand, emojiListCmd, customEmojiCmd } from './commands/emoji';
```

### 2. Create emoji picker instance (after screen setup):

```typescript
// Around line 100-200, after UI widgets are created
const emojiPicker = new EmojiPicker(screen);
```

### 3. Register emoji commands (in command registry):

```typescript
// In createCommandRegistry() or where commands are registered
registry.register(createEmojiCommand(screen, emojiPicker, inputBox));
registry.register(emojiListCmd);
registry.register(customEmojiCmd);
```

### 4. Add emoji replacement to message sending:

```typescript
// In sendMessage() or where messages are sent
socket.emit('room:message', {
  roomName: state.currentChannel,
  message: replaceEmojis(message.trim()) // <-- Add this
});
```

### 5. Add keyboard shortcut for emoji picker:

```typescript
// Around line 1800-2000, with other keyboard shortcuts
screen.key(['f4', 'C-e'], () => {
  if (!emojiPicker.isVisible()) {
    emojiPicker.show(
      screen,
      (emoji) => {
        const current = inputBox.getValue();
        inputBox.setValue(current + emoji.code + ' ');
        inputBox.focus();
        screen.render();
      },
      () => {
        inputBox.focus();
        screen.render();
      }
    );
  }
});
```

### 6. Update help text:

```typescript
// Add to help overlay or status bar
'F4/Ctrl+E: Emoji Picker'
```

## Built-in Emojis (50+)

### Emotions (18)
- `:smile:` → `:-)` (happy, grin)
- `:grin:` → `:D` (big smile, laugh)
- `:joy:` → `XD` (laugh, lol)
- `:wink:` → `;-)` (flirt)
- `:heart:` → `<3` (love)
- `:sad:` → `:-(` (unhappy, frown)
- `:cry:` → `:'-(` (tears, sob)
- `:shock:` → `:O` (surprised, wow)
- `:angry:` → `>:-(` (mad, furious)
- `:cool:` → `B-)` (sunglasses, awesome)
- And more...

### Actions (9)
- `:tableflip:` → `(╯°□°)╯︵ ┻━┻` (rage, flip)
- `:unflip:` → `┬─┬ノ( º _ ºノ)` (calm, fix)
- `:shrug:` → `¯\\_(ツ)_/¯` (dunno, whatever)
- `:fight:` → `(ง°ل͜°)ง` (battle, fite)
- `:dance:` → `┏(-_-)┛┗(-_- )┓` (party)
- `:hug:` → `(づ｡◕‿‿◕｡)づ` (cuddle, embrace)
- And more...

### Symbols (13)
- `:thumbsup:` → `(Y)` (yes, ok, good)
- `:fire:` → `🔥` (hot, lit)
- `:star:` → `★` (favorite)
- `:check:` → `✓` (yes, done)
- `:skull:` → `☠` (death, pirate)
- And more...

### Special (3)
- `:amiga:` → `[A]` (boing, retro)
- `:bbs:` → `[BBS]` (board, system)
- `:door:` → `[=>]` (game, app)

## Usage Examples

### As User

```
/emoji              # Open emoji picker
/emoji smile        # Search for "smile" emojis
/emojis             # List all categories
/emojis emotions    # List all emotion emojis

Type:  I love this BBS :heart: :amiga:
Shows: I love this BBS <3 [A]

Type:  This is great :tableflip:
Shows: This is great (╯°□°)╯︵ ┻━┻
```

### Keyboard Shortcuts

- `F4` or `Ctrl+E` - Open emoji picker
- `Tab` / `←→` - Switch between panes in picker
- `↑↓` - Navigate lists
- `Enter` - Select emoji
- `Esc` - Close picker

### Mouse Support

- Click category to select
- Click emoji to insert
- Scroll in lists

## Future Enhancements

1. **Custom Emojis Per-User**
   - Store in user preferences
   - `/customemoji add :myface: (^_^)`

2. **Custom Emojis Per-Channel**
   - Channel-specific emoji sets
   - Admin can add channel emojis

3. **Emoji Reactions** (Already Implemented!)
   - Use existing reaction system
   - Add emoji shortcuts to reactions

4. **Emoji Autocomplete** (Prepared but not integrated)
   - Show dropdown when typing `:`
   - Tab to complete

## Testing

```bash
cd sdk/doors/livechat
npm run build

# Start BBS
./dev/scripts/start-servers.sh

# Test in browser:
# 1. Run LIVECHAT door
# 2. Press F4 to open emoji picker
# 3. Select an emoji
# 4. Type :smile: and send message
# 5. Verify :smile: is replaced with :-)
```

## Status

✅ Emoji registry (50+ emojis)
✅ Emoji replacement system
✅ Emoji picker dialog
✅ Search functionality
✅ Category browsing
✅ Keyboard navigation
✅ Mouse support
✅ Commands (/emoji, /emojis)
⏳ Integration into app.ts (needs manual merge)
🔜 Custom emoji storage
🔜 Autocomplete dropdown

## Notes

- All emojis are ASCII/Unicode safe for terminal display
- No external dependencies
- Kaomoji (Japanese emoticons) included for fun
- Compatible with existing reaction system
- Searchable by keywords
- Follows LiveChat's existing UI patterns
