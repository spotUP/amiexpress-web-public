# ANSI Editor SDK - State-of-the-Art ANSI/ASCII Art Editor

A comprehensive, professional-grade ANSI/ASCII art editor for AmiExpress BBS with full Moebius feature parity and modern enhancements.

**Command:** `/ansied`

## Features

### Drawing Tools
- **Draw** - Freehand drawing
- **Line** - Straight lines with preview
- **Box** - Rectangle outlines
- **Box Fill** - Filled rectangles
- **Ellipse** - Ellipse outlines
- **Ellipse Fill** - Filled ellipses
- **Text** - Type text directly on canvas
- **Fill** - Flood fill areas
- **Pick** - Color and character picker
- **Select** - Selection tool for copy/cut/paste
- **Shifter** - Half-block character shifter

### Advanced Features
- **Undo/Redo** - 100 levels with chunked operations
- **Clipboard** - Copy, cut, paste, transform selections
- **Mouse Support** - Full mouse input for all tools
- **iCE Colors** - 16 background colors + blink attribute
- **Guides** - 80x25, 80x40, 44x22, grid overlays
- **Real-time Preview** - Live preview for line/box/ellipse tools
- **Neo-Blessed Modals** - Professional UI overlays

### File Formats
- **ANS** - ANSI with color codes
- **ASC** - Plain ASCII text
- **BIN** - Binary format (char + attribute)
- **XB** - XBin format
- **TXT** - Text files

### Keyboard Shortcuts

#### Tools
- `D` - Draw
- `L` - Line
- `B` - Box
- `E` - Ellipse
- `T` - Text mode
- `F` - Fill
- `P` - Pick colors
- `S` - Select
- `H` - Shifter

#### File Operations
- `Ctrl+N` - New file
- `Ctrl+O` - Open file
- `Ctrl+S` - Save file

#### Edit Operations
- `Ctrl+Z` - Undo
- `Ctrl+Y` - Redo
- `Ctrl+C` - Copy
- `Ctrl+X` - Cut
- `Ctrl+V` - Paste
- `Ctrl+A` - Select all
- `Delete` - Delete selection

#### View
- `G` - Toggle guides
- `I` - Toggle iCE colors
- `K` - Color picker
- `Tab` - Tool selector

#### Navigation
- `Arrow Keys` - Move cursor
- `Page Up/Down` - Jump 10 lines
- `Home/End` - Start/end of line

#### Other
- `F1` - Help
- `Q` - Quit (with save prompt)
- `Enter` - Confirm
- `Esc` - Cancel

## Installation

```bash
cd ~/Code/amiexpress-web/doors/ansi-editor-sdk
npm install
npm run build
```

## Usage

Run standalone:
```bash
npm run dev
```

## Architecture

The editor is built with a modular architecture:

- **types.ts** - Type definitions and constants
- **canvas.ts** - Canvas operations (undo/redo, selection, rendering)
- **drawing.ts** - Drawing tools implementation
- **modals.ts** - Neo-Blessed UI modals
- **file-ops.ts** - File loading/saving/import/export
- **index.ts** - Main editor class and event handling

## Technical Details

- **Canvas Size**: 80x22 (2 lines reserved for status bar)
- **Color Support**: 16 foreground + 16 background (with iCE colors)
- **Undo Levels**: 100 (configurable)
- **File Formats**: 5 formats (ANS, ASC, BIN, XB, TXT)
- **Mouse Events**: Full support via Socket.IO
- **Keyboard Events**: Comprehensive key bindings

## Requirements

- Node.js 20+
- TypeScript 5+
- AmiExpress BBS Door SDK

## License

MIT

## Author

AmiExpress-Web Development Team
