# ANSI Screen Editor Door

A full-featured ANSI/ASCII screen file editor for AmiExpress-Web.

## Features

- **80x24 Canvas** - Standard BBS screen dimensions
- **Drawing Tools**:
  - Draw mode - Freehand drawing with arrow keys
  - Line mode - Draw straight lines
  - Box mode - Draw rectangles
  - Text mode - Type text onto canvas
  - Fill mode - Flood-fill areas
  - Pick mode - Sample color/character from canvas

- **Color Support**:
  - 8 foreground colors (F1-F8)
  - 8 background colors
  - ANSI color codes (30-37, 40-47)

- **File Operations**:
  - Save to BBS/Screens/ directory
  - Load existing screen files
  - ANSI format import/export
  - Modified file tracking

## Controls

### Navigation
- **Arrow Keys** - Move cursor
- **TAB** - Cycle through tools
- **SPACE** - Draw (in draw mode)
- **ENTER** - Execute tool action (place line, box, text, fill, pick)

### Colors
- **F1** - Black
- **F2** - Red
- **F3** - Green
- **F4** - Yellow
- **F5** - Blue
- **F6** - Magenta
- **F7** - Cyan
- **F8** - White

### File Operations
- **S** - Save file
- **L** - Load file
- **Q** - Quit (prompts to save if modified)

### Text Mode
- Type normally to build text buffer
- **ENTER** - Place text on canvas
- **ESC** - Cancel text entry
- **BACKSPACE** - Delete last character

## Usage

### From BBS
1. Make yourself sysop (Level 5+)
2. Type `X ANSI-EDITOR` to run the door
3. Use the controls above to create your screen

### For Sysops
To make a custom command for easier access:

```
BBSCMD=EDIT
DOORNAME=Doors:ansi-editor
ACS=ACS_SYSOP
```

Then just type `EDIT` from the main menu.

## File Format

Files are saved in standard ANSI format:
- Color codes: `\x1b[0;3X;4Ym` where X=fg, Y=bg
- Standard ASCII characters
- `\r\n` line endings
- 80 characters per line, 22 lines (24 minus status bars)

## Tips

1. **Creating Logos**: Use text mode + colors for quick logo creation
2. **Borders**: Use box tool + line tool for clean borders
3. **Fill Backgrounds**: Use fill tool to quickly color areas
4. **Color Picking**: Use pick tool to sample colors from loaded files
5. **Save Often**: Editor tracks modified state and prompts before quit

## Technical Details

- Written in TypeScript
- Uses Socket.IO for real-time communication
- Canvas stored as 2D array of Cell objects
- Bresenham's algorithm for line drawing
- Flood-fill with stack-based traversal
- Simple ANSI parser for file loading

## Future Enhancements

- [ ] Undo/redo
- [ ] Copy/paste regions
- [ ] Character palette selection
- [ ] Grid display toggle
- [ ] Preview mode
- [ ] Export to other formats (plain text, HTML)
- [ ] Brush sizes
- [ ] Circle/ellipse tools
- [ ] Color palette editor
