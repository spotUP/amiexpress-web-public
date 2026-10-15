# ANSI Editor Feature Audit - Moebius Comparison

**Created:** 2026-01-15
**Status:** In Progress

## Moebius Features Extracted from Source

### Drawing Modes (View Menu)
| Feature | Moebius Key | Our Editor | Status |
|---------|-------------|------------|--------|
| Keyboard Mode | K | - | Missing |
| Brush Mode | B | Default | Partial |
| Shifter Mode | I | - | Missing |
| Paintbucket Mode | P | - | Missing |

### Drawing Tools (from /app/document/tools/)
| Tool | Moebius File | Our Editor | Status |
|------|--------------|------------|--------|
| Brush | brush.js | Freehand draw | Partial |
| Brushes (multiple) | brushes.js | Single char | Missing |
| Line | line.js | - | Missing |
| Rectangle Outline | rectangle_outline.js | - | Missing |
| Rectangle Filled | rectangle_filled.js | - | Missing |
| Ellipse Outline | ellipse_outline.js | - | Missing |
| Ellipse Filled | ellipse_filled.js | - | Missing |
| Fill (flood fill) | fill.js | - | Missing |
| Sample (color picker) | sample.js | - | Missing |
| Select | select.js | - | Missing |
| Shifter | shifter.js | - | Missing |
| Cursor | cursor.js | Arrow keys | Partial |
| Clipboard | clipboard.js | - | Missing |
| Overlay | overlay.js | - | Missing |

### File Operations
| Feature | Moebius Key | Our Editor | Status |
|---------|-------------|------------|--------|
| New | Cmd+N | - | Missing |
| Open | Cmd+O | - | Missing |
| Save | Cmd+S | - | Missing |
| Save As | Cmd+Shift+S | - | Missing |
| Export PNG | Cmd+Shift+E | - | Missing |
| Export Animated PNG | Cmd+Shift+A | - | Missing |
| Export UTF-8 | Cmd+Shift+U | - | Missing |
| Edit SAUCE Info | Cmd+I | - | Missing |
| Duplicate | - | - | Missing |
| Revert to Last Save | - | - | Missing |

### Edit Operations
| Feature | Moebius Key | Our Editor | Status |
|---------|-------------|------------|--------|
| Undo | Cmd+Z | U | Done |
| Redo | Cmd+Shift+Z | - | Missing |
| Insert Mode | Insert | - | Missing |
| Overwrite Mode | Cmd+Alt+O | - | Missing |
| Mirror Mode | Cmd+Alt+M | - | Missing |
| Cut | Cmd+X | - | Missing |
| Copy | Cmd+C | - | Missing |
| Paste | Cmd+V | - | Missing |
| Paste As Selection | Cmd+Alt+V | - | Missing |
| Left Justify Line | Alt+L | - | Missing |
| Right Justify Line | Alt+R | - | Missing |
| Center Line | Alt+C | - | Missing |
| Insert Row | Alt+Up | - | Missing |
| Delete Row | Alt+Down | - | Missing |
| Insert Column | Alt+Right | - | Missing |
| Delete Column | Alt+Left | - | Missing |
| Erase Row | Alt+E | - | Missing |
| Erase to Start of Row | Alt+Home | - | Missing |
| Erase to End of Row | Alt+End | - | Missing |
| Erase Column | Alt+Shift+E | - | Missing |
| Scroll Canvas Up | Ctrl+Alt+Up | - | Missing |
| Scroll Canvas Down | Ctrl+Alt+Down | - | Missing |
| Scroll Canvas Left | Ctrl+Alt+Left | - | Missing |
| Scroll Canvas Right | Ctrl+Alt+Right | - | Missing |
| Set Canvas Size | Cmd+Alt+C | - | Missing |

### Selection Operations
| Feature | Moebius Key | Our Editor | Status |
|---------|-------------|------------|--------|
| Select All | Cmd+A | - | Missing |
| Deselect | - | - | Missing |
| Start Selection | Alt+B | - | Missing |
| Move Block | M | - | Missing |
| Copy Block | C | - | Missing |
| Fill Selection | F | - | Missing |
| Erase Selection | E | - | Missing |
| Stamp | S | - | Missing |
| Place | Enter | - | Missing |
| Rotate | R | - | Missing |
| Flip X | X | - | Missing |
| Flip Y | Y | - | Missing |
| Center | = | - | Missing |
| Transparent | T | - | Missing |
| Over | O | - | Missing |
| Underneath | U | - | Missing |
| Crop | Cmd+K | - | Missing |
| Import Selection | - | - | Missing |
| Export Selection | - | - | Missing |

### Color Operations
| Feature | Moebius Key | Our Editor | Status |
|---------|-------------|------------|--------|
| Select Attribute | Alt+A | - | Missing |
| Previous FG Color | Ctrl+Up | - | Missing |
| Next FG Color | Ctrl+Down | - | Missing |
| Previous BG Color | Ctrl+Left | - | Missing |
| Next BG Color | Ctrl+Right | - | Missing |
| Use Attribute Under Cursor | Alt+U | - | Missing |
| Default Color | Cmd+D | - | Missing |
| Switch FG/BG | Shift+Cmd+X | - | Missing |
| iCE Colors | Cmd+E | - | Missing |
| Color Picker Dialog | F/B | F/B | Done |

### View Operations
| Feature | Moebius Key | Our Editor | Status |
|---------|-------------|------------|--------|
| Show Status Bar | Cmd+/ | Always on | Done |
| Show Tool Bar | Cmd+T | - | Missing |
| Show Preview | Cmd+Alt+P | - | Missing |
| Previous Character Set | Ctrl+, | - | Missing |
| Next Character Set | Ctrl+. | - | Missing |
| Default Character Set | Ctrl+/ | - | Missing |
| Increase Brush Size | Alt+= | - | Missing |
| Decrease Brush Size | Alt+- | - | Missing |
| Reset Brush Size | Alt+0 | - | Missing |
| Use 9px Font | Cmd+F | - | N/A |
| Actual Size | Cmd+Alt+0 | - | N/A |
| Zoom In | Cmd+= | - | N/A |
| Zoom Out | Cmd+- | - | N/A |
| Guides (multiple sizes) | - | - | Missing |
| Drawing Grid | - | - | Missing |
| Reference Image | Cmd+Shift+O | - | Missing |
| Toggle Reference Image | Ctrl+Tab | - | Missing |
| Scroll with Cursor | Cmd+R | - | Missing |

### Character Picker
| Feature | Moebius | Our Editor | Status |
|---------|---------|------------|--------|
| Character Grid | Full CP437 | Subset | Partial |
| Multiple Character Sets | Yes | No | Missing |
| Custom Paint Brush Block | Yes | No | Missing |

### Network/Collaboration
| Feature | Moebius | Our Editor | Status |
|---------|---------|------------|--------|
| Connect to Server | Yes | - | Missing |
| Multi-user editing | Yes | - | Future |
| Chat Window | Yes | - | Future |

---

## Summary Statistics

### Current Implementation Status
- **Total Moebius Features:** ~100+
- **Our Features Done:** ~8
- **Our Features Partial:** ~4
- **Missing Features:** ~90+

### Priority Features to Implement

#### P0 - Critical (Basic Drawing)
1. Line tool
2. Rectangle (outline + filled)
3. Ellipse (outline + filled)
4. Flood fill
5. Color sample/picker tool
6. Redo

#### P1 - Important (Selection/Clipboard)
1. Selection tool (rectangular)
2. Cut/Copy/Paste
3. Move/Copy block
4. Flip X/Y
5. Rotate

#### P2 - Nice to Have (Advanced Edit)
1. Mirror mode
2. Insert/Delete Row/Column
3. Erase operations
4. Canvas scroll
5. Set canvas size

#### P3 - Future (Collaboration)
1. Multi-user editing
2. Network server
3. Chat

---

## Our Current Features

### Working (Done)
- [x] Freehand brush drawing
- [x] Color picker (FG + BG horizontal palette)
- [x] Character picker (scrollable list)
- [x] Undo (single level)
- [x] Arrow key navigation
- [x] Mouse drawing
- [x] Status bar
- [x] ESC to exit

### Partial
- [ ] Brush - only single character, no size/multiple brushes
- [ ] Character set - limited subset, not full CP437
- [ ] Cursor - basic, no visual modes

### Missing (High Priority)
- [ ] Line tool
- [ ] Box/Rectangle tool
- [ ] Ellipse tool
- [ ] Flood fill
- [ ] Redo
- [ ] Selection
- [ ] Clipboard (cut/copy/paste)
- [ ] File save/load

---

## Next Steps

1. Implement drawing tools (line, box, ellipse, fill)
2. Add redo support
3. Add selection tool + clipboard
4. Add file save/load (.ANS format)
5. Add more advanced editing (mirror, insert/delete row/col)
