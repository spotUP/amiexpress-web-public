# ANSI Output Centralization - Screen Redraw Optimization

## Overview
Implemented centralized utilities for cursor hiding and double buffering to prevent screen tearing and flickering during BBS screen redraws.

## Implementation

### New Utility Module
**File**: `web/backend/src/utils/ansi-output.util.ts`

**Provides:**
- `HIDE_CURSOR` / `SHOW_CURSOR` - ANSI escape codes
- `CLEAR_SCREEN` - Clear screen and home cursor
- `moveCursor(x, y)` - Position cursor helper
- `setColors(fg, bg)` - ANSI color helper (no bold)
- `emitAnsi()` - Emit with optional cursor hiding and double buffering
- `ScreenBuffer` class - Builder pattern for complex screen output
- `createScreenBuffer()` - Factory function

### Updated Files

1. **screen.handler.ts** (`web/backend/src/handlers/`)
   - Now imports `HIDE_CURSOR`, `SHOW_CURSOR` from utility module
   - Already had double buffering implemented
   - Updated to use centralized constants

2. **ansi-editor/index.ts** (`doors/`)
   - Now imports and uses centralized utilities
   - `renderCanvas()` uses `ScreenBuffer` for double buffering
   - `refresh()` wraps all output with cursor hiding

## Benefits

1. **No Screen Tearing** - All output sent in single atomic operation
2. **No Cursor Flicker** - Cursor hidden during redraws
3. **Consistent Implementation** - All BBS components use same utilities
4. **Easier Maintenance** - ANSI codes defined in one place
5. **Better Performance** - Reduced socket.emit() calls

## Usage Example

```typescript
import { createScreenBuffer, HIDE_CURSOR, SHOW_CURSOR } from '../utils/ansi-output.util';

// Simple approach - wrap output with cursor hiding
socket.emit('ansi-output', HIDE_CURSOR + content + SHOW_CURSOR);

// Advanced approach - use ScreenBuffer
const buffer = createScreenBuffer(socket);
buffer
  .clear()
  .writeAt(10, 5, 'Hello, BBS!', 7, 0)
  .colors(3, 0)
  .write('More text...')
  .flush({ hideCursor: true });  // Single atomic emit
```

## Next Steps

Other handlers that do complex screen output should be updated to use these utilities:
- Message reading/posting screens
- File listing displays
- Conference selection screens
- User editor screens

This will provide consistent, tear-free output across the entire BBS.
