# ANSI Editor Door - Complete Guide

## Overview

The ANSI Editor is a full-featured professional ANSI art creation and editing door for AmiExpress BBS. It provides a complete application with file management, multiple editing modes, and comprehensive help.

**Command:** `ANSI-EDIT`
**Access Level:** 0 (All users)
**Category:** Art & Graphics
**Type:** TypeScript SDK Door

**Note:** Registered as `ANSI-EDIT` due to BBS command name length limits (max 10 chars). The .info file contains `ANSI-EDIT` but the system truncates to `ANSI-EDIT`.

## Features

### File Management

**Main Menu:**
- **New File** - Create new ANSI art from scratch (.ANS, .ASC, .XB formats)
- **Open File** - Quick open dialog with file selection
- **File Browser** - Full file management interface
- **Gallery View** - Visual gallery of ANSI art (structure ready for thumbnails)
- **Settings** - Configure editor preferences
- **Help** - Comprehensive keyboard shortcuts and features guide
- **Quit** - Exit editor (with unsaved changes warning)

**File Browser Operations:**
- [E] Edit - Open file in ANSI editor
- [D] Delete - Remove file (with confirmation)
- [R] Rename - Rename file
- [I] Info - Show file information (size, date, dimensions, metadata)
- [N] New - Create new file
- [ESC] Back - Return to main menu

**File Information Display:**
- Filename and full path
- File size (bytes/KB/MB)
- Last modified date/time
- Dimensions (width x height)
- SAUCE metadata (title, author, group)

### ANSI Editor Integration

The door integrates the complete SDK ANSI Editor with all advanced features:

#### Text Editing Mode (Default)

**Navigation:**
- Arrow Keys - Move cursor
- Home/End - Start/End of line
- PgUp/PgDn - Scroll page

**Editing:**
- Backspace/Del - Delete character
- Enter - New line
- Type to insert text

**Commands:**
- Ctrl+S - Save file
- Ctrl+M - Switch to Draw Mode
- Ctrl+F - Find text
- Ctrl+Z - Undo
- Ctrl+Y - Redo
- F1 - Show help
- ESC - Exit editor

#### Drawing Mode (Ctrl+M to activate)

**Tool Selection (Keys 1-9):**
1. Freehand Draw - Free drawing with current character/color
2. Line - Draw straight lines
3. Box (outline) - Draw rectangle outlines
4. Box (filled) - Draw filled rectangles
5. Ellipse (outline) - Draw ellipse outlines
6. Ellipse (filled) - Draw filled ellipses
7. Flood Fill - Fill enclosed areas
8. Eyedropper/Pick - Pick character and colors from canvas
9. Block Selection - Select and manipulate rectangular areas

**Character & Colors:**
- C - Character Picker (full CP437 256-character set)
- F - Foreground Color (16 colors)
- B - Background Color (16 colors with iCE support)
- I - Toggle iCE Colors (enable 16 BG colors, disable blink)

**Other Commands:**
- U or Ctrl+Z - Undo last action
- Ctrl+L - Clear canvas
- Ctrl+M - Return to Text Mode
- Ctrl+S - Save

### Settings System

**User Preferences:**
- Auto-save - Automatically save on exit
- Backup on save - Create .bak files before saving
- Show line numbers - Display line numbers in text mode
- Show toolbar - Display toolbar in editor
- Show status bar - Display status information
- Confirm delete - Require confirmation before deleting files

Settings are persisted per session and can be toggled with Space key.

### Advanced Editor Features

**CP437 Extended ASCII:**
- Full 256-character set
- Box drawing characters
- Special symbols
- International characters

**16-Color Palette:**
- Standard colors (0-7): black, red, green, yellow, blue, magenta, cyan, white
- Bright colors (8-15): gray, light red, light green, light yellow, light blue, light magenta, light cyan, light white

**iCE Colors:**
- Enable 16 background colors (normally limited to 8)
- Disables blink attribute
- Toggle with 'I' key in draw mode

**Brush Modes:**
- Half-block patterns
- Quarter-block patterns
- Custom brush shapes

**Mirror Drawing:**
- Horizontal mirroring
- Vertical mirroring
- Symmetrical art creation

**File Formats:**
- .ANS - ANSI art with color codes (most common)
- .ASC - ASCII art (text only, no colors)
- .XB - XBin format with SAUCE metadata

**SAUCE Metadata:**
- Title - Art title
- Author - Artist name
- Group - Group/crew affiliation
- Date - Creation date
- Comments - Additional information

**Undo/Redo:**
- Full history tracking
- Unlimited undo levels
- Works in both text and draw modes

## File Storage

**Default Directory:**
`data/ansi-art/`

All ANSI files are stored in this directory by default. The directory is automatically created if it doesn't exist.

**File Organization:**
- Files are displayed alphabetically
- Subdirectories not currently supported (future enhancement)
- File extensions: .ans, .asc, .xb

## Usage Examples

### Creating New ANSI Art

1. Run `ANSI-EDIT` command in BBS
2. Select "New File" (or press N)
3. Enter filename (extension added automatically)
4. Editor opens in text mode
5. Type text or press Ctrl+M for drawing mode
6. Use tools 1-9 to draw
7. Press C for character picker, F/B for colors
8. Press Ctrl+S to save
9. Press ESC to exit

### Editing Existing File

1. Run `ANSI-EDIT` command
2. Select "File Browser" (or press B)
3. Navigate to file with arrow keys
4. Press E to edit or Enter
5. Make changes
6. Press Ctrl+S to save
7. Press ESC to return to browser

### Advanced Drawing Techniques

1. Open or create file
2. Press Ctrl+M to enter draw mode
3. Press C to select a box-drawing character
4. Press F to select foreground color (e.g., cyan)
5. Press B to select background color (e.g., black)
6. Press 3 to select Box tool
7. Click and drag to draw boxes
8. Press I to enable iCE colors for more background colors
9. Press 7 for Flood Fill to fill areas
10. Press U to undo mistakes
11. Press Ctrl+S to save
12. Press Ctrl+M to return to text mode

## Technical Details

**Implementation:**
- TypeScript door using BBS Door SDK
- Neo-blessed UI framework
- Case-insensitive file system support (AmigaFS)
- Full integration with SDK ANSI Editor engine
- Session-based state management

**File Operations:**
- Reads .ANS/.ASC/.XB files
- Writes with optional backup (.bak)
- Supports SAUCE metadata (read/write)
- Automatic file format detection

**Memory:**
- Efficient sparse canvas storage
- Minimal memory footprint
- Fast rendering even with large files

**Performance:**
- Real-time rendering
- Instant tool switching
- Smooth cursor movement
- No lag even with 1000+ line files

## Keyboard Shortcuts Reference

### Main Menu
- Arrow Keys - Navigate menu
- Enter - Select option
- Letter Key - Quick select (N, O, B, G, S, H, Q)

### File Browser
- Arrow Keys / PgUp/PgDn - Navigate files
- Enter or E - Edit selected file
- D - Delete file
- R - Rename file
- I - File info
- N - New file
- ESC - Back to main menu

### Text Mode Editor
- Arrow Keys - Move cursor
- Home/End - Line start/end
- PgUp/PgDn - Page up/down
- Backspace/Del - Delete
- Enter - New line
- Ctrl+S - Save
- Ctrl+M - Switch to draw mode
- Ctrl+F - Find
- Ctrl+Z - Undo
- Ctrl+Y - Redo
- F1 - Help
- ESC - Exit

### Draw Mode Editor
- 1-9 - Select tool
- C - Character picker
- F - Foreground color
- B - Background color
- I - Toggle iCE colors
- U or Ctrl+Z - Undo
- Ctrl+L - Clear canvas
- Ctrl+M - Back to text mode
- Ctrl+S - Save
- ESC - Exit

### Settings
- Arrow Keys - Navigate settings
- Space - Toggle selected setting
- ESC - Return to main menu

## Future Enhancements

**Planned Features:**
- Gallery view with actual ANSI thumbnails
- Directory navigation and subdirectories
- SAUCE metadata editor dialog
- Export to multiple formats (PNG, TXT, HTML)
- Import from various formats
- Copy/paste between files
- Recent files list
- Templates and starter files
- BBS file area integration
- Multi-user collaboration
- Auto-save and crash recovery

**Advanced Drawing:**
- More brush shapes
- Gradient fills
- Pattern fills
- Layer system
- Animation frames
- Sprite library

## Troubleshooting

**Door won't start:**
- Check that BBSCmd.info has ANSI-EDIT entry
- Verify TYPE=TS and PRELOADER=YES are set
- Ensure web/backend/src/doors/ansi-editor.ts exists
- Check logs for import errors

**Files not showing:**
- Verify data/ansi-art/ directory exists
- Check file extensions (.ans, .asc, .xb)
- Ensure files have correct permissions

**Editor crashes:**
- Check file format is valid ANSI/ASCII
- Verify file isn't corrupted
- Check for special characters that may cause parsing issues

**Save fails:**
- Check disk space
- Verify write permissions on data/ansi-art/
- Ensure filename is valid (no special chars)

**TypeScript errors:**
- TS6059 errors are structural (SDK outside backend rootDir)
- These are configuration warnings, not runtime errors
- Door functions correctly despite these warnings
- Will be resolved when SDK uses build artifacts

## Code Example - Custom Door Using ANSI Editor

```typescript
import type { BBSSession } from '../types';
import { showANSIEditor } from '../../../../sdk/engines/ui/ansi-editor';

export default async function myCustomDoor(session: BBSSession): Promise<void> {
  const initialContent = `{cyan-fg}Welcome to My Door!{/cyan-fg}\n\nEdit this ANSI art...`;

  const result = await showANSIEditor(session, {
    title: 'My Custom Editor',
    initialContent,
    maxLines: 500,
    maxLineLength: 80,
    showLineNumbers: true,
    toolbar: true,
    statusBar: true,
    onSave: async (content: string) => {
      // Save to your custom location
      session.writeLine('Saved!');
      return true; // Return true for success
    }
  });

  if (result) {
    session.writeLine(`Editor returned ${result.length} characters`);
  }
}
```

## Credits

**Developer:** Claude Code AI Assistant
**SDK:** AmiExpress BBS Door SDK
**UI Framework:** Neo-Blessed
**Platform:** AmiExpress-Web BBS

**Based on:**
- Original AmiExpress ANSI Editor concepts
- Modern terminal ANSI art editors
- Professional graphics application UX patterns

## License

Part of AmiExpress-Web BBS system. See main project LICENSE.

## Support

For issues, feature requests, or contributions:
- GitHub: https://github.com/amiexpressweb/amiexpress-web
- Documentation: /Documentation/4-Door-Developers/

## See Also

- `DOOR_DEVELOPMENT.md` - General door development guide
- `SDK_USAGE_GUIDE.md` - BBS Door SDK documentation
- `NEO_BLESSED_COLOR_GUIDE.md` - Neo-blessed UI guide
- SDK ANSI Editor source: `sdk/engines/ui/ansi-editor/`
