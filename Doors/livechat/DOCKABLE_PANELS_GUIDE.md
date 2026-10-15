# LiveChat Dockable & Resizable Panels Guide

**Version**: 3.2 Enhanced
**Date**: 2024-12-24
**Features**: Full panel dragging and resizing support

## Overview

LiveChat now features **fully dockable and resizable panels** using neo-blessed's advanced UI capabilities. All major panels and overlays can be moved and resized to create a customized workspace.

## Dockable & Resizable Components

### Main Panels

#### 1. Channel List (Sidebar)
**Location**: Left sidebar
**Label**: `[Resize: Bottom-Right]`
**Features**:
- ✅ **Resizable** - Drag bottom-right corner to adjust width
- Automatically adjusts chat area when resized
- Syncs width with user list tab
- Shows active channels with color coding

**How to Resize**:
1. Hover over bottom-right corner of channel list
2. Click and drag to desired width
3. Chat area automatically adjusts to new sidebar width

**Dynamic Behavior**:
- When resized, chat log left position updates
- Sidebar tabs bar width syncs automatically
- User list inherits new width when switched

---

#### 2. User List (Sidebar)
**Location**: Left sidebar (shared with channels)
**Label**: `[Resize: Bottom-Right]`
**Features**:
- ✅ **Resizable** - Drag bottom-right corner to adjust width
- Automatically adjusts chat area when resized
- Syncs width with channel list tab
- Shows online users with presence indicators

**How to Resize**:
1. Switch to Users tab (F2 or click "Us" tab)
2. Hover over bottom-right corner
3. Click and drag to desired width
4. Width syncs across both sidebar tabs

---

#### 3. Drawing Canvas
**Location**: Main area (replaces chat when in art: channels)
**Label**: `[Resize: Corner]`
**Features**:
- ✅ **Resizable** - Drag bottom-right corner to adjust canvas size
- Collaborative whiteboard for art channels
- Real-time drawing with other users
- Color palette (C key), clear (X key)

**How to Use**:
1. Join an art: channel (e.g., /join art:sketch)
2. Press F5 or type /draw to enter drawing mode
3. Resize canvas by dragging corner
4. Draw with mouse/click, change colors with C key
5. ESC to exit drawing mode

---

### Draggable Overlays

All modal overlays are **fully draggable and resizable**:

#### 4. Settings Overlay
**Label**: `[Drag to Move | Resize: Corner | ESC: Close]`
**Shortcut**: Ctrl+S
**Features**:
- ✅ **Draggable** - Click title bar and drag anywhere
- ✅ **Resizable** - Drag bottom-right corner
- Mute events, sounds, typing indicators
- Timestamp preferences
- Status selection (online, away, busy, DND)

**How to Move**:
1. Press Ctrl+S to open settings
2. Click and hold on title bar
3. Drag to desired position
4. Resize if needed by dragging corner

---

#### 5. User Profile Overlay
**Label**: `[Drag to Move | Resize: Corner]`
**Features**:
- ✅ **Draggable** - Click title bar and drag
- ✅ **Resizable** - Drag bottom-right corner
- View user info (name, node, status, channel)
- Send DM button
- View user activity

**How to Open**:
- Click username in user list (Users tab)
- Right-click username → View Profile
- Select user and press Enter

---

#### 6. File Sharing Overlay
**Label**: `[Drag to Move | Resize: Corner | ESC: Close]`
**Shortcut**: F6
**Features**:
- ✅ **Draggable** - Click title bar and drag
- ✅ **Resizable** - Drag bottom-right corner
- Browse and share files with channel
- File manager with directory navigation
- Share files with other users

**How to Use**:
1. Press F6 to open file sharing
2. Drag overlay to preferred position
3. Resize to see more files
4. Select file and click "Share File"

---

## Resizing Behavior

### How Resizing Works
1. **Bottom-Right Corner**: All resizable panels have a 3x2 pixel resize area in bottom-right corner
2. **Minimum Sizes**: Panels enforce minimum dimensions (5 wide, 3 tall)
3. **Live Updates**: Screen re-renders during resize for immediate feedback
4. **Constraint Preservation**: Panels maintain their constraints (e.g., sidebar height always matches screen)

### Visual Indicators
- Panel labels include `[Resize: Bottom-Right]` or `[Resize: Corner]`
- Cursor changes when hovering over resize area (terminal-dependent)
- Borders provide visual feedback during resize

---

## Dragging Behavior

### How Dragging Works
1. **Title Bar Drag**: Click and hold title bar to start drag
2. **Free Movement**: Move panel anywhere on screen
3. **Boundary Detection**: Panels stay within screen bounds
4. **Drop on Release**: Release mouse to drop panel at new position

### Visual Indicators
- Panel labels include `[Drag to Move]`
- Panels render at new position during drag
- Shadow effects remain during movement

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **F1** | Help overlay (not draggable, fullscreen) |
| **F2** | Toggle Channels/Users sidebar tab |
| **F3** | Cycle through channels |
| **F5** | Enter drawing mode (in art: channels) |
| **F6** | Open file sharing overlay |
| **Tab** | Cycle focus between panels |
| **Ctrl+S** | Open settings overlay |
| **Ctrl+Q** | Quit LiveChat |
| **ESC** | Close current overlay / Exit mode |

---

## Advanced Features

### Panel Layout Persistence
**Note**: Panel positions and sizes reset when overlay is closed/reopened. Future versions may implement layout persistence.

### Dynamic Layout Adjustments
- **Sidebar Resize**: When sidebar width changes, chat area automatically adjusts its left position to match
- **Tab Switching**: Sidebar width persists across Channels/Users tabs
- **Drawing Mode**: Canvas fills chat area and is independently resizable

### Multi-Panel Workflows
1. **Resize sidebar** to see more channel names
2. **Open settings** and drag to corner for quick access
3. **Open profile** while chatting to view user info
4. **Resize drawing canvas** for detailed artwork
5. **Open file sharing** and position alongside chat

---

## Technical Implementation

### Neo-Blessed APIs Used

**Draggable Panels**:
```typescript
const panel = blessed.box({
  draggable: true,  // Enable dragging
  // ... other options
});
```

**Resizable Panels**:
```typescript
panel.enableResize((data) => {
  // data.width, data.height contain new dimensions
  // Update dependent panels here
});
```

**Dynamic Updates**:
- `screen.render()` called after each resize/drag
- Related panels update their positions/sizes automatically
- Event handlers manage cross-panel dependencies

### Panel Coordination
- **Sidebar → Chat**: When sidebar resizes, chat left position updates
- **Tabs → Width**: Sidebar width syncs across Channels/Users tabs
- **Canvas → Chat**: Drawing canvas fills same area as chat log

---

## Best Practices

### 1. Start with Default Layout
Default layout is optimized for 80x24 terminals. Customize as needed.

### 2. Resize Sidebar First
Sidebar width affects chat area, so set it first before opening overlays.

### 3. Position Overlays Strategically
- Place settings in corner for quick access
- Keep profile overlay near user list
- Position file sharing to not block chat

### 4. Use Keyboard for Speed
Keyboard shortcuts are faster than mouse for common actions.

### 5. Close Unused Overlays
Multiple overlays can clutter the screen. Close what you're not using.

---

## Troubleshooting

### Panel Won't Resize
- **Check corner**: Resize area is small (3x2 pixels). Hover carefully.
- **Mouse support**: Ensure mouse is enabled in terminal
- **Minimum size**: Panels can't shrink below 5x3

### Panel Won't Drag
- **Title bar**: Click and hold title bar, not body
- **Draggable flag**: Only overlays are draggable (not main panels)
- **Hidden panels**: Can't drag hidden panels

### Layout Breaks After Resize
- **Refresh**: Press Ctrl+L or toggle overlay to refresh layout
- **Reset**: Close and reopen overlay to reset to defaults
- **Screen size**: Very small terminals may have layout issues

### Sidebar Resize Not Working
- **Bottom-right only**: Drag from bottom-right corner, not edges
- **Auto-adjust**: Other panels update automatically on successful resize

---

## Future Enhancements

Planned features for future versions:

- [ ] Layout persistence (save panel positions/sizes)
- [ ] Snap-to-grid for precise positioning
- [ ] Panel docking (attach panels to screen edges)
- [ ] Multi-monitor support (if terminal supports it)
- [ ] Preset layouts (compact, wide, developer, etc.)
- [ ] Touch screen support for mobile terminals

---

## Summary

LiveChat v3.2 Enhanced provides a **modern, desktop-class UI** with full panel management:

✅ **Resizable Panels**: Sidebar, users, drawing canvas
✅ **Draggable Overlays**: Settings, profile, file sharing
✅ **Dynamic Layouts**: Auto-adjustment of dependent panels
✅ **Mouse Support**: Full click, drag, resize with mouse
✅ **Keyboard Shortcuts**: Fast access to all features

Experience **next-level BBS chat** with a fully customizable interface!

---

**Questions or Issues?**
- Check neo-blessed documentation in `sdk/docs/NEO_BLESSED_GUIDE.md`
- Review code comments in `app.ts` for implementation details
- Report bugs via BBS feedback system
