# Blessed SDK & LiveChat Handoff Document

**Last Updated:** 2026-01-08
**Session Focus:** Neo-blessed SDK improvements, panel features, transparency, dock zones

---

## Current State Summary

The neo-blessed SDK is in a mature state with recent improvements to panels, modals, transparency, and dock zones. All 31 TypeScript doors build successfully.

---

## Recent Changes (This Session)

### 1. Dock Zone Size Reduction
**File:** `sdk/engines/ui/blessed/widgets/dockable-panel.ts` (lines 1142-1165)
**Change:** Reduced dock zone preview size from 30% to 15% of screen
**Why:** User feedback - zones were too large when dragging panels
**Status:** COMPLETE

```typescript
const dockSize = 0.15;  // Was 0.3 (30%), now 15% of screen width/height
```

### 2. Universal Transparency API
**File:** `sdk/engines/ui/blessed/core/element.ts`
**Change:** Added transparency methods to base Element class (all widgets inherit)
**Methods Added:**
- `setTransparent(enabled: boolean)` - Enable/disable 50% color blending
- `isTransparent(): boolean` - Check if transparency is enabled
- `toggleTransparent()` - Toggle transparency on/off

**Critical Discovery:** Renderer reads from `element.options.style`, NOT `element.style`. This was causing transparency to not work during panel drags.

**Status:** COMPLETE

### 3. Panel Transparency During Drag
**File:** `sdk/engines/ui/blessed/widgets/dockable-panel.ts`
**Change:** Fixed panels to become transparent when being dragged
**Implementation:** Uses new `this.setTransparent(true/false)` in startDrag/stopDrag
**Status:** COMPLETE

### 4. Panel Default Background Color
**File:** `sdk/engines/ui/blessed/widgets/panel.ts`
**Change:** Default background changed from `black` to `lightblack` (ANSI color 8 - dark grey)
**Why:** User feedback - black looked boring, dark grey is more modern
**Note:** Must use ANSI color names, NOT hex codes like `#333333`
**Status:** COMPLETE

### 5. Modal/Dialog Background Colors
**Files:**
- `sdk/engines/ui/blessed/widgets/message.ts`
- `sdk/engines/ui/blessed/widgets/prompt.ts`
- `sdk/engines/ui/blessed/widgets/question.ts`

**Changes:**
- Default dialog background: `blue` (was `black`)
- Border options: `{ type: 'line', fg: 'white', bg: 'blue' }`
- Style border: `{ fg: 'white', bg: 'blue' }`
- Inner element backgrounds use `dialogBg` variable for consistency

**Status:** COMPLETE

### 6. fitContent Feature for Panels
**File:** `sdk/engines/ui/blessed/widgets/dockable-panel.ts`
**Change:** Added auto-resize to fit content (like CSS `fit-content`)

**Options:**
```typescript
fitContent?: boolean | { width?: boolean; height?: boolean };  // Default: true
```

**Methods:**
- `fitToContent()` - Manually trigger fit
- `setFitContent(settings)` - Enable/disable
- `getFitContent()` - Get current settings

**Behavior:**
- GROW ONLY - panels expand when content doesn't fit, never shrink
- Disabled after manual resize (user took control)
- Auto-triggers on child append and content changes

**Status:** COMPLETE

### 7. AudioEngine Client Export Fix
**File:** `sdk/client/index.ts`
**Change:** Restored `AudioEngine` export to client module
**Why:** Was incorrectly removed with comment "uses blessed (server-only)" - but AudioEngine uses Tone.js which is browser-compatible
**Status:** COMPLETE

---

## What Works

### Panel System
- [x] Drag and drop panels
- [x] Edge docking (top, bottom, left, right)
- [x] Dock zone preview (cyan ghost box) at 15% screen size
- [x] Panel transparency during drag
- [x] Dark grey default background (`lightblack`)
- [x] fitContent auto-resize (grow only)
- [x] Panel resize via edges
- [x] Panel swap when dragging over docked panel
- [x] Tab merging when dropping panel on another
- [x] Minimize/maximize
- [x] Alt+number shortcuts (Alt+1 to Alt+9)
- [x] F6 panel cycling

### Modal Dialogs
- [x] Message box with blue background
- [x] Prompt with input field
- [x] Question (Yes/No dialog)
- [x] Overlay dimming effect
- [x] Responsive centering on resize
- [x] Focus trapping within modal
- [x] Tab navigation between buttons
- [x] Arrow key navigation

### Transparency System
- [x] `setTransparent(true/false)` on any widget
- [x] 50% color blending with underlying content
- [x] Works during panel drag
- [x] Ghost box preview has transparency

### All 31 TypeScript Doors Build Successfully
ansi-editor, arkanoid, bbs-dashboard, bbslinkwall, bubble-bobble, card-lobby, donkey-kong, door-manager, doors-menu, fire-emblem-v2, font-test, frogger, galaga, grandmaster, joust, livechat, mail-composer, ncurses-pong, neo-blessed-showcase, pengo, phreakwars, pipe-dream, puzzle-bobble, rip-browser, scrollwars, super-qix, telnet, tic-tac-toe, voice-chat, widget-shadow-demo, zoo-keeper

---

## What Doesn't Work / Known Issues

### None Reported This Session
All requested features were implemented and verified working.

---

## LiveChat Door State

**Directory:** `Doors/livechat/`
**Build Status:** PASSES

### Features Implemented
- Neo-blessed UI with panels
- Chat log display
- User list
- Input field
- Login modal for chat-only users
- Video chat integration
- Voice channel support
- Private messaging
- Room management

### Recent LiveChat Changes
None this session - door was rebuilt to pick up SDK changes only.

### Key Files
- `Doors/livechat/app.ts` - Main application
- `Doors/livechat/ui/screen.ts` - Screen setup
- `Doors/livechat/ui/chat-log.ts` - Chat log widget
- `Doors/livechat/ui/login-modal.ts` - Login for chat-only users
- `Doors/livechat/features/voice-chat.ts` - Voice channel handling
- `Doors/livechat/features/video-grid.ts` - Video grid layout

---

## Critical Technical Notes

### 1. Renderer Reads from options.style, NOT style
```typescript
// WRONG - won't work:
this.style.transparent = true;

// CORRECT - renderer uses this:
(this.options.style as any).transparent = true;

// BEST - use the API:
this.setTransparent(true);
```

### 2. ANSI Colors Only - No Hex Codes
```typescript
// WRONG:
bg: '#333333'

// CORRECT:
bg: 'lightblack'  // ANSI color 8 (dark grey)
```

Available ANSI colors: black, red, green, yellow, blue, magenta, cyan, white, gray, lightblack, lightred, lightgreen, lightyellow, lightblue, lightmagenta, lightcyan, lightwhite

### 3. fitContent is Grow-Only
Panels only expand to fit content, never shrink. This prevents panels from collapsing when content is removed.

### 4. AudioEngine Uses Tone.js (Browser Compatible)
Despite old comment saying "uses blessed", AudioEngine uses Tone.js for Web Audio. Safe to import from `@amiexpress/bbs-door-sdk/client`.

---

## Files Modified This Session

1. `sdk/engines/ui/blessed/widgets/dockable-panel.ts`
   - Dock zone size: 30% -> 15%
   - fitContent feature added
   - Drag transparency using setTransparent()

2. `sdk/engines/ui/blessed/widgets/panel.ts`
   - Default background: black -> lightblack

3. `sdk/engines/ui/blessed/widgets/message.ts`
   - Blue background and border

4. `sdk/engines/ui/blessed/widgets/prompt.ts`
   - Blue background and border

5. `sdk/engines/ui/blessed/widgets/question.ts`
   - Blue background and border

6. `sdk/engines/ui/blessed/core/element.ts`
   - Added setTransparent(), isTransparent(), toggleTransparent()

7. `sdk/client/index.ts`
   - Restored AudioEngine export

---

## Next Steps / Pending Work

None explicitly requested. System is in stable state with all features working.

---

## How to Verify Everything Works

```bash
# Build SDK
cd sdk && npm run build

# Build all doors (should all pass)
for door in Doors/*/; do
  if [ -f "$door/package.json" ]; then
    echo "Building $(basename $door)..."
    (cd "$door" && npm run build)
  fi
done

# Start servers
./dev/scripts/start-servers.sh

# Test in browser at http://localhost:3001
# - Run NEOSHOWCASE command to test panel features
# - Run LIVECHAT to test chat interface
```

---

## Key Code Locations

| Feature | File | Line Range |
|---------|------|------------|
| Dock zone size | dockable-panel.ts | 1142-1165 |
| Transparency API | element.ts | ~2050-2080 |
| Panel drag transparency | dockable-panel.ts | startDrag/stopDrag methods |
| fitContent | dockable-panel.ts | fitToContent() method |
| Modal blue background | message.ts, prompt.ts, question.ts | constructor |
| Panel dark grey bg | panel.ts | constructor style |

---

## Session Summary

This session focused on polish and user feedback:
1. Made dock zones smaller (less intrusive)
2. Added universal transparency API
3. Fixed panel transparency during drag
4. Modernized default panel appearance
5. Unified modal dialog styling
6. Added fitContent auto-resize for panels
7. Fixed AudioEngine client export

All changes are complete and verified working. All 31 TypeScript doors build successfully.
