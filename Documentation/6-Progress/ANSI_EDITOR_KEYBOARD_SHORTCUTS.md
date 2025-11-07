# ANSI Editor - Comprehensive Keyboard Shortcuts

## Status Legend
- ✅ = Implemented
- 🔨 = In Progress
- ⏳ = Planned
- ❌ = Not Applicable (network features, etc.)

---

## General / Navigation

| Shortcut | Action | Status | Phase |
|----------|--------|--------|-------|
| `?` or `F1` | Show help screen | ✅ | 0 |
| `Arrow Keys` | Move cursor | ✅ | 0 |
| `Home` | Start of line | ⏳ | 8 |
| `End` | End of line | ⏳ | 8 |
| `Page Up` | Page up | ⏳ | 8 |
| `Page Down` | Page down | ⏳ | 8 |
| `Tab` | Tab forward (8 chars) OR Tool selector modal | ✅ | 0 |
| `Shift+Tab` | Tab backward (8 chars) | ⏳ | 8 |
| `Ctrl+Q` | Quit editor | ✅ | 0 |
| `Escape` | Cancel operation / Close modal | ✅ | 0 |

---

## Tool Selection

| Shortcut | Action | Status | Phase |
|----------|--------|--------|-------|
| `Tab` | Open tool selector modal | ✅ | 0 |
| `K` | Keyboard mode (text entry) | ⏳ | 1.1 |
| `B` | Brush mode | ⏳ | 1.1 |
| `I` | Shifter mode | ⏳ | 1.3 |
| `P` | Paintbucket (fill) mode | ✅ | 0 |

---

## Drawing Tools (Current Tool)

| Shortcut | Action | Status | Phase |
|----------|--------|--------|-------|
| `Left Click` | Draw with foreground color | ✅ | 0 |
| `Right Click` | Draw with background color | ⏳ | 1.1 |
| `Shift+Click` | Clear/erase | ⏳ | 1.1 |
| `Mouse Drag` | Continuous drawing | ⏳ | 1.1 |
| `Tab Hold` | Straight line mode (in brush) | ⏳ | 1.2 |

---

## Brush Size (Brush Mode Only)

| Shortcut | Action | Status | Phase |
|----------|--------|--------|-------|
| `Alt+=` | Increase brush size | ⏳ | 1.1 |
| `Alt+-` | Decrease brush size | ⏳ | 1.1 |
| `Alt+0` | Reset brush size to 1 | ⏳ | 1.1 |

---

## Color Selection

| Shortcut | Action | Status | Phase |
|----------|--------|--------|-------|
| `Alt+C` | Open color picker modal | ✅ | 0 |
| `0-9` | Select colors 0-9 (in modal) | ✅ | 0 |
| `Ctrl+0-7` | Toggle FG brightness (dark/bright) | ⏳ | 5.1 |
| `Alt+0-7` | Toggle BG brightness (dark/bright) | ⏳ | 5.1 |
| `Ctrl+Up` | Previous foreground color | ⏳ | 5.1 |
| `Ctrl+Down` | Next foreground color | ⏳ | 5.1 |
| `Ctrl+Left` | Previous background color | ⏳ | 5.1 |
| `Ctrl+Right` | Next background color | ⏳ | 5.1 |
| `Ctrl+D` | Default color (white on black, 7/0) | ⏳ | 5.2 |
| `Shift+Ctrl+X` | Swap foreground and background | ⏳ | 5.2 |
| `Alt+U` | Use attribute under cursor (sample) | ⏳ | 5.2 |
| `Ctrl+E` | Toggle iCE colors (enable colors 8-15 for BG) | ⏳ | 5.3 |

---

## Character Sets / F-Keys

| Shortcut | Action | Status | Phase |
|----------|--------|--------|-------|
| `F1-F12` | Type character from current set | ⏳ | 4.1 |
| `Alt+0` | Switch to F-key set 1 | ⏳ | 4.2 |
| `Alt+1` | Switch to F-key set 2 | ⏳ | 4.2 |
| `Alt+2` | Switch to F-key set 3 | ⏳ | 4.2 |
| `Alt+3` | Switch to F-key set 4 | ⏳ | 4.2 |
| `Alt+4` | Switch to F-key set 5 | ⏳ | 4.2 |
| `Alt+5` | Switch to F-key set 6 (default - shading) | ⏳ | 4.2 |
| `Alt+6` | Switch to F-key set 7 | ⏳ | 4.2 |
| `Alt+7` | Switch to F-key set 8 | ⏳ | 4.2 |
| `Alt+8` | Switch to F-key set 9 | ⏳ | 4.2 |
| `Alt+9` | Switch to F-key set 10 | ⏳ | 4.2 |
| `Alt+Shift+0-9` | Switch to F-key sets 11-20 | ⏳ | 4.2 |
| `Ctrl+,` | Previous F-key set | ⏳ | 4.2 |
| `Ctrl+.` | Next F-key set | ⏳ | 4.2 |
| `Ctrl+/` | Default F-key set (set 6) | ⏳ | 4.2 |

---

## Selection

| Shortcut | Action | Status | Phase |
|----------|--------|--------|-------|
| `Alt+B` | Start selection mode | ⏳ | 2.1 |
| `Ctrl+A` | Select all | ⏳ | 2.1 |
| `Escape` | Deselect | ⏳ | 2.1 |
| `Shift+Arrows` | Extend selection | ⏳ | 2.1 |
| `Click+Drag` | Select rectangle | ⏳ | 2.1 |

---

## Clipboard

| Shortcut | Action | Status | Phase |
|----------|--------|--------|-------|
| `Ctrl+X` | Cut (remove selection) | ⏳ | 2.2 |
| `Ctrl+C` | Copy (copy selection) | ⏳ | 2.2 |
| `Ctrl+V` | Paste at cursor | ⏳ | 2.2 |
| `Ctrl+Alt+V` | Paste as movable selection | ⏳ | 2.2 |

---

## Selection Operations (When Selection Active)

| Shortcut | Action | Status | Phase |
|----------|--------|--------|-------|
| `M` | Move block (cut and reposition) | ⏳ | 2.3 |
| `C` | Copy block (copy for placement) | ⏳ | 2.3 |
| `F` | Fill selection with foreground color | ⏳ | 2.3 |
| `E` | Erase selection (clear to spaces) | ⏳ | 2.3 |
| `S` | Stamp (place copy and continue) | ⏳ | 2.3 |
| `Enter` | Place selection and exit mode | ⏳ | 2.3 |
| `R` | Rotate selection 90° clockwise | ⏳ | 2.3 |
| `X` | Flip selection horizontally | ⏳ | 2.3 |
| `Y` | Flip selection vertically | ⏳ | 2.3 |
| `=` | Center selection horizontally | ⏳ | 2.3 |
| `Ctrl+K` | Crop (create new document from selection) | ⏳ | 2.3 |

---

## Selection Operation Modes

| Shortcut | Action | Status | Phase |
|----------|--------|--------|-------|
| `T` | Transparent mode (spaces transparent) | ⏳ | 2.3 |
| `O` | Over mode (draw over existing) | ⏳ | 2.3 |
| `U` | Underneath mode (draw under existing) | ⏳ | 2.3 |

---

## Canvas Operations - Line/Row

| Shortcut | Action | Status | Phase |
|----------|--------|--------|-------|
| `Alt+L` | Left justify current line | ⏳ | 3.1 |
| `Alt+R` | Right justify current line | ⏳ | 3.1 |
| `Alt+Shift+C` | Center current line | ⏳ | 3.1 |
| `Alt+Up` | Insert row above cursor | ⏳ | 3.1 |
| `Alt+Down` | Delete current row | ⏳ | 3.1 |
| `Alt+E` | Erase entire line | ⏳ | 3.1 |
| `Alt+Home` | Erase from cursor to start of line | ⏳ | 3.1 |
| `Alt+End` | Erase from cursor to end of line | ⏳ | 3.1 |

---

## Canvas Operations - Column

| Shortcut | Action | Status | Phase |
|----------|--------|--------|-------|
| `Alt+Right` | Insert column at cursor | ⏳ | 3.2 |
| `Alt+Left` | Delete current column | ⏳ | 3.2 |
| `Alt+Shift+E` | Erase entire column | ⏳ | 3.2 |
| `Alt+PageUp` | Erase from cursor to start of column | ⏳ | 3.2 |
| `Alt+PageDown` | Erase from cursor to end of column | ⏳ | 3.2 |

---

## Canvas Operations - Scrolling

| Shortcut | Action | Status | Phase |
|----------|--------|--------|-------|
| `Ctrl+Alt+Up` | Scroll entire canvas up | ⏳ | 3.3 |
| `Ctrl+Alt+Down` | Scroll entire canvas down | ⏳ | 3.3 |
| `Ctrl+Alt+Left` | Scroll entire canvas left | ⏳ | 3.3 |
| `Ctrl+Alt+Right` | Scroll entire canvas right | ⏳ | 3.3 |

---

## Canvas Operations - Resize

| Shortcut | Action | Status | Phase |
|----------|--------|--------|-------|
| `Ctrl+Alt+R` | Set canvas size (width/height) | ⏳ | 3.4 |

---

## Undo / Redo

| Shortcut | Action | Status | Phase |
|----------|--------|--------|-------|
| `Ctrl+Z` | Undo | ✅ | 0 |
| `Ctrl+Y` | Redo | ✅ | 0 |

---

## File Operations

| Shortcut | Action | Status | Phase |
|----------|--------|--------|-------|
| `Ctrl+S` | Save (show save modal) | ✅ | 0 |
| `Ctrl+O` | Open (show load modal) | ✅ | 0 |
| `Ctrl+I` | Edit SAUCE info | ⏳ | 7.2 |

---

## Special Features

| Shortcut | Action | Status | Phase |
|----------|--------|--------|-------|
| `Ctrl+Alt+M` | Toggle mirror mode (symmetry) | ⏳ | 9.1 |
| `Insert` | Toggle insert/overwrite mode | ⏳ | 9.3 |

---

## Modifier Keys (General Purpose)

| Modifier | Purpose | Status |
|----------|---------|--------|
| `Shift` | Clear/erase mode in drawing tools | ⏳ |
| `Shift` | Extend selection (keyboard mode) | ⏳ |
| `Tab Hold` | Straight line mode (brush) | ⏳ |
| `Escape` | Cancel operation / Close modal / Deselect | ✅ |

---

## Keyboard Shortcut Conflicts Resolved

### Original Conflicts:
1. **Alt+C**: Color picker (current) vs Center line (Moebius)
   - **Resolution**: Keep `Alt+C` for color picker, use `Alt+Shift+C` for center line

2. **Ctrl+Alt+S**: Connect to server (Moebius) vs Set canvas size
   - **Resolution**: Use `Ctrl+Alt+R` for canvas resize (no BBS network features needed)

3. **C key**: Copy block vs Typing
   - **Resolution**: `C` only works in selection operation mode (not in text mode)

4. **M key**: Move block vs Typing
   - **Resolution**: `M` only works in selection operation mode (not in text mode)

---

## Implementation Notes

### Terminal Compatibility
Some shortcuts may not work reliably over terminal connections:
- Complex Ctrl+Alt+Shift combinations
- Some function key combinations
- Numpad-specific keys (if numpad mode enabled)

### Mode-Specific Shortcuts
Many shortcuts are context-sensitive:
- **Text/Keyboard Mode**: Most letter keys type characters
- **Selection Mode**: Letter keys perform selection operations (M, C, F, E, R, X, Y, etc.)
- **Tool Mode**: Letter keys switch tools (K, B, I, P)

### Priority Rules
1. **Modal open**: Modal shortcuts take precedence (ESC, arrows, Enter)
2. **Selection active**: Selection operation shortcuts active (M, C, F, E, R, X, Y, etc.)
3. **Tool mode**: Tool-specific shortcuts active
4. **Global shortcuts**: Always available (Ctrl+Z, Ctrl+S, etc.)

---

## Quick Reference Card (For Help Screen)

```
ANSI EDITOR - QUICK KEYBOARD REFERENCE

TOOLS            DRAWING          SELECTION        COLORS
Tab   Tool menu  Click    Draw    Alt+B  Select    Alt+C  Picker
K     Keyboard   Shift    Erase   Ctrl+A Select all Ctrl+D Default
B     Brush      Drag     Line    Ctrl+X Cut       Ctrl+E iCE
I     Shifter    Alt+/-   Size    Ctrl+C Copy      Alt+U  Sample
P     Fill                        Ctrl+V Paste     Ctrl+0-7 Toggle

FILE             EDIT             CANVAS           HELP
Ctrl+S  Save     Ctrl+Z  Undo    Alt+L  Left      ?      Help
Ctrl+O  Open     Ctrl+Y  Redo    Alt+R  Right     Escape Cancel
Ctrl+I  SAUCE    Ctrl+K  Crop    Alt+C  Center    Ctrl+Q Quit
                                 Alt+↑↓ Row ins/del

F-KEYS (F1-F12 type character from current set)
Alt+0-9  Switch sets 1-10    Ctrl+, / . Previous/Next set
```

---

## Advanced Shortcuts (Phase 9+)

These are power-user features for later phases:

### Mirror Mode
- `Ctrl+Alt+M`: Toggle horizontal mirror (symmetry drawing)

### Guides & Overlays
- TBD: Grid overlay shortcuts

### Numpad Drawing Mode
- `0-9`: F-key characters
- `+`: F1 (common block)
- `.`: Space
- `Enter`: New line

---

## Terminal-Specific Notes

### Ctrl+Key Codes
- `Ctrl+A` = `\x01`
- `Ctrl+C` = `\x03` (may be intercepted by terminal)
- `Ctrl+D` = `\x04`
- `Ctrl+E` = `\x05`
- `Ctrl+Z` = `\x1a`
- `Ctrl+Q` = `\x11`
- `Ctrl+S` = `\x13`
- `Ctrl+O` = `\x0f`
- `Ctrl+X` = `\x18`
- `Ctrl+V` = `\x16`
- `Ctrl+Y` = `\x19`
- `Ctrl+K` = `\x0b`
- `Ctrl+I` = `\x09` (Tab)

### Alt+Key Codes
- `Alt+C` = `\x1bc`
- `Alt+B` = `\x1bb`
- `Alt+L` = `\x1bl`
- `Alt+R` = `\x1br`
- `Alt+E` = `\x1be`
- `Alt+U` = `\x1bu`
- `Alt+0-9` = `\x1b0` - `\x1b9`

### Arrow Key Codes
- `Up` = `\x1b[A`
- `Down` = `\x1b[B`
- `Right` = `\x1b[C`
- `Left` = `\x1b[D`
- `Home` = `\x1b[H`
- `End` = `\x1b[F`
- `PageUp` = `\x1b[5~`
- `PageDown` = `\x1b[6~`
- `Insert` = `\x1b[2~`
- `Delete` = `\x1b[3~`

### Function Key Codes
- `F1` = `\x1bOP`
- `F2` = `\x1bOQ`
- `F3` = `\x1bOR`
- `F4` = `\x1bOS`
- `F5` = `\x1b[15~`
- `F6` = `\x1b[17~`
- `F7` = `\x1b[18~`
- `F8` = `\x1b[19~`
- `F9` = `\x1b[20~`
- `F10` = `\x1b[21~`
- `F11` = `\x1b[23~`
- `F12` = `\x1b[24~`

---

## Implementation Status Summary

### Phase 0 (Completed): 15 shortcuts ✅
- Basic navigation, tool selection, file operations, undo/redo

### Phase 1 (Drawing Tools): 15 shortcuts ⏳
- Brush modes, sizes, ellipses, shifter

### Phase 2 (Selection): 20 shortcuts ⏳
- Selection, clipboard, operations, modes

### Phase 3 (Canvas Ops): 18 shortcuts ⏳
- Line/column ops, scrolling, resize

### Phase 4 (F-Keys): 25 shortcuts ⏳
- Character sets, navigation

### Phase 5 (Colors): 15 shortcuts ⏳
- Color navigation, utilities, iCE colors

### Phase 6-10 (Advanced): 10 shortcuts ⏳
- Special features, BBS-specific

**Total Planned**: ~120 keyboard shortcuts
**Current Status**: ~15 implemented (12.5%)
**Target**: 80-90 shortcuts for full Moebius parity
