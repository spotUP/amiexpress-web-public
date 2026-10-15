# Transparency/Opacity Implementation

**Date:** December 23, 2025
**Status:** ✅ COMPLETE (Updated with CSS Overlay Support)

## Overview

Two transparency mechanisms are now supported:

1. **ANSI Transparency** (`transparent: true`): Sets background to "none", showing underlying buffer content
2. **CSS Opacity** (`opacity: number`): Web-only feature that emits OSC 9999 sequences for true CSS rgba overlays

---

## Implementation Details

### 1. ANSI Transparency (transparent: true)

**File:** `core/types.ts`

```typescript
export interface Colors {
  fg?: Color;
  bg?: Color;
  transparent?: boolean;  // Set bg to transparent (shows buffer behind)
  opacity?: number;       // Web-only: CSS opacity (0-1)
}
```

When `transparent: true`, the background is set to `0x1ff` (transparent constant), and `fillRegion()` preserves the existing buffer content.

---

### 2. CSS Opacity for Web Connections (opacity: number)

**NEW in December 2025**

For web browser connections, elements can now have true CSS-based transparency via positioned overlay divs.

**How It Works:**

1. **Element sets opacity in style:**
   ```typescript
   style: { bg: 'black', opacity: 0.5 }
   ```

2. **Element emits OSC 9999 overlay event** on show/hide/attach/destroy:
   - Format: `ESC ] 9999 ; overlay ; <json> BEL`
   - JSON includes: id, show, opacity, x, y, width, height

3. **BBSTerminal renders positioned CSS div:**
   - Calculates pixel position from terminal cell coordinates
   - Creates rgba overlay with specified opacity
   - Overlay is positioned precisely over the element

**Files Modified for CSS Opacity:**

- `core/types.ts` - Added `opacity?: number` to Colors interface
- `core/element.ts` - Added `_emitOverlayEvent()` method, hooks in show/hide/destroy
- `widgets/overlay.ts` - Updated to emit positioned overlay events
- `packages/terminal/BBSTerminal.tsx` - Renders positioned CSS overlay divs

---

### 3. Overlay Widget

The `Overlay` widget is purpose-built for modal dialogs with opacity:

```typescript
import * as blessed from '@amiexpress/bbs-door-sdk/engines/ui/neo-blessed';

const overlay = blessed.overlay({
  parent: screen,
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  opacity: 0.5,  // 50% opacity overlay
  hidden: true,
  style: { bg: 'black' },
});

// Show overlay
overlay.show();

// Overlay automatically:
// 1. Emits OSC event for web clients (CSS opacity)
// 2. Focuses itself
// 3. Handles ESC to hide
```

---

## Usage Examples

### Using Overlay Widget (Recommended for Modals)

```typescript
const overlay = blessed.overlay({
  parent: screen,
  opacity: 0.5,
  hidden: true,
});

// Add content on top of overlay
const dialog = blessed.box({
  parent: overlay,
  top: 'center',
  left: 'center',
  width: 40,
  height: 10,
  label: ' Dialog ',
  border: { type: 'line' },
  content: 'This appears over a semi-transparent overlay!',
  style: { bg: 'blue', fg: 'white' },
});

// Show modal
overlay.show();
screen.render();
```

### Using opacity Style on Any Element

```typescript
const dimmedBox = blessed.box({
  parent: screen,
  top: 5,
  left: 10,
  width: 30,
  height: 10,
  style: {
    bg: 'black',
    fg: 'white',
    opacity: 0.7,  // 70% opacity - web only
  },
  content: 'Semi-transparent on web clients!',
});
```

### Using transparent for Buffer Transparency

```typescript
const transparentBox = blessed.box({
  parent: screen,
  style: {
    fg: 'white',
    bg: 'transparent',  // Shows buffer content behind
  },
  content: 'Text floats over whatever is behind it',
});
```

---

## Technical Details

### OSC 9999 Protocol

Elements with opacity emit Operating System Command sequences:

```
ESC ] 9999 ; overlay ; {"id":"element-123","show":true,"opacity":0.5,"x":10,"y":5,"width":30,"height":10} BEL
```

**Fields:**
- `id`: Unique identifier for this overlay
- `show`: true to show, false to hide
- `opacity`: CSS opacity value (0-1)
- `x`, `y`: Position in terminal cells
- `width`, `height`: Size in terminal cells

### Frontend Rendering

BBSTerminal.tsx parses OSC 9999 sequences and renders positioned div overlays:

```typescript
// Overlay div style calculation:
{
  position: 'absolute',
  left: offsetLeft + (x * cellWidth),
  top: offsetTop + (y * cellHeight),
  width: width * cellWidth,
  height: height * cellHeight,
  backgroundColor: `rgba(0, 0, 0, ${opacity})`,
  pointerEvents: 'none',
  zIndex: 100,
}
```

---

## Platform Support

| Feature | Web Browser | Telnet | SSH |
|---------|-------------|--------|-----|
| `transparent: true` | ✅ | ✅ | ✅ |
| `opacity: number` | ✅ CSS | ❌ N/A | ❌ N/A |
| Overlay widget | ✅ CSS | ⚠️ Solid | ⚠️ Solid |

**Note:** For telnet/SSH, opacity falls back to solid background (no CSS support).

---

## Files Modified

1. **core/types.ts** - Added `opacity?: number` to Colors interface
2. **core/element.ts** - Added `_emitOverlayEvent()`, hooks in show/hide/destroy/attach
3. **widgets/overlay.ts** - Emits positioned overlay events with x, y, width, height
4. **packages/terminal/BBSTerminal.tsx** - Parses OSC 9999, renders positioned CSS overlays

---

## Testing

The neo-blessed showcase includes an Overlay test:

1. Run the BBS server: `./dev/scripts/start-servers.sh`
2. Connect via web browser to `http://localhost:3001`
3. Login and run `NEOSHOWCASE`
4. Navigate to "Dialogs" section
5. Click "Overlay" button
6. Observe: Semi-transparent overlay with opacity 0.5

---

**Implementation Complete!**

True CSS opacity now works in the web terminal via OSC 9999 positioned overlays.
