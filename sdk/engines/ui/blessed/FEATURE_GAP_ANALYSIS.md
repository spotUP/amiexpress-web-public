# Blessed Feature Gap Analysis

**Date:** December 22, 2025
**SDK Version:** 2.0.0

## Executive Summary

This document identifies missing features in the AmiExpress SDK blessed implementation compared to the official blessed/neo-blessed API.

### Critical Missing Features

1. ❌ **Scrollbars** - No visual scrollbar support
2. ❌ **Border Docking** - `dockBorders` not implemented
3. ❌ **Transparency** - `transparent` style option not implemented
4. ❌ **Shadow** - Drop shadow rendering not implemented
5. ❌ **Drag & Resize** - `enableDrag()` / `enableResize()` not implemented
6. ❌ **Advanced Scrolling** - `alwaysScroll`, `baseLimit` not implemented
7. ❌ **Shrink/Flex** - `shrink` option not implemented
8. ❌ **Hover Text** - `hoverText` floating tooltips not implemented

---

## Detailed Gap Analysis

### 1. Scrollbar Features ❌ NOT IMPLEMENTED

**What's Missing:**

```typescript
// Blessed supports scrollbar configuration
scrollbar: {
  ch: ' ',              // Scrollbar character
  track: {
    ch: '░',           // Track character
    bg: 'gray',        // Track background
  },
  style: {
    fg: 'blue',        // Scrollbar foreground
    bg: 'white',       // Scrollbar background
  }
}
```

**Current SDK Status:**
- ✅ Has `scrollable` option
- ✅ Has scrolling logic (childBase, childOffset)
- ❌ No visual scrollbar rendering
- ❌ No scrollbar configuration options
- ❌ No `alwaysScroll` option
- ❌ No `baseLimit` option

**Impact:** **HIGH** - Scrollbars are essential UX for long content

**Implementation Needed:**
1. Add `scrollbar` option to ElementOptions
2. Render scrollbar in element's render method
3. Calculate scrollbar position based on childBase/scroll percentage
4. Style scrollbar based on style.scrollbar options
5. Handle mouse wheel on scrollbar track

**Files to Modify:**
- `core/types.ts` - Add ScrollbarOptions interface
- `core/element.ts` - Add scrollbar rendering logic
- `widgets/scrollablebox.ts` - Use scrollbar in scrollable widgets

---

### 2. Border Docking ❌ NOT IMPLEMENTED

**What's Missing:**

```typescript
// Auto-connect borders between adjacent elements
dockBorders: true,          // Enable border docking
ignoreDockContrast: true   // Dock even if colors differ
```

**Visual Example:**
```
Without docking:          With docking:
┌─────────┌─────────┐    ┌─────────┬─────────┐
│         ││         │    │         │         │
└─────────┘└─────────┘    └─────────┴─────────┘
```

**Current SDK Status:**
- ❌ `dockBorders` option not in ElementOptions
- ❌ `ignoreDockContrast` not in ElementOptions
- ❌ No border connection logic

**Impact:** **MEDIUM** - Nice-to-have for professional layouts

**Implementation Needed:**
1. Add `dockBorders` and `ignoreDockContrast` to ElementOptions
2. In render pass, detect adjacent elements
3. Replace border characters at connection points
4. Check color/attribute matching (unless ignoreDockContrast)

**Algorithm:**
```typescript
// For each border cell:
// 1. Check if adjacent element exists (left/right/top/bottom)
// 2. Check if adjacent element has border
// 3. If colors match OR ignoreDockContrast:
//    - Replace corner: ┌ → ┬ (if element below)
//    - Replace edge: ─ → ┼ (if elements on both sides)
```

**Files to Modify:**
- `core/types.ts` - Add docking options
- `core/element.ts` - Add docking detection
- `core/screen.ts` - Implement border connection in render

---

### 3. Transparency/Opacity ❌ NOT IMPLEMENTED

**What's Missing:**

```typescript
style: {
  transparent: true,  // 50% opacity with color blending
  bg: 'transparent',  // Fully transparent background
}
```

**Color Blending Algorithm:**
- Blends foreground element's bg with background element's bg
- 50% opacity: `blended = (fgColor + bgColor) / 2`
- Characters are NOT blended (transparency only affects backgrounds)

**Current SDK Status:**
- ❌ No `transparent` in style options
- ❌ No color blending logic
- ❌ No background color mixing

**Impact:** **MEDIUM-LOW** - Useful for overlays, less critical for BBS

**Implementation Needed:**
1. Add `transparent: boolean` to style options
2. In render, detect transparent elements
3. Read background buffer color at position
4. Blend colors (average RGB values)
5. Apply blended color to cell

**Challenges:**
- ANSI colors are indexed (0-255), not RGB
- Need color mapping/conversion for blending
- May need to approximate closest ANSI color

**Files to Modify:**
- `core/types.ts` - Add transparent to style
- `core/colors.ts` - Add color blending functions
- `core/element.ts` - Apply transparency in render

---

### 4. Shadow Rendering ❌ NOT IMPLEMENTED

**What's Missing:**

```typescript
shadow: true  // Translucent 2-cell wide, 1-cell high shadow (bottom-right)
```

**Visual Example:**
```
┌──────────┐
│  Content │░
│          │░
└──────────┘░
 ░░░░░░░░░░░
```

**Current SDK Status:**
- ❌ No `shadow` option in ElementOptions
- ❌ No shadow rendering

**Impact:** **LOW** - Cosmetic enhancement, not essential

**Implementation Needed:**
1. Add `shadow: boolean` to ElementOptions
2. After rendering element, draw shadow at (x+2, y+1)
3. Use dim/gray color for shadow
4. Shadow only visible if not occluded by other elements

**Files to Modify:**
- `core/types.ts` - Add shadow option
- `core/element.ts` - Render shadow after element

---

### 5. Drag & Resize ❌ NOT IMPLEMENTED

**What's Missing:**

```typescript
element.enableDrag(callback);   // Make element draggable
element.enableResize(callback); // Make element resizable
element.draggable = true;       // Draggable option
```

**Blessed API:**
```typescript
box.enableDrag((position) => {
  console.log('Dragged to:', position);
});

box.enableResize((size) => {
  console.log('Resized to:', size);
});
```

**Current SDK Status:**
- ⚠️ Has `draggable` property in Element (line 46)
- ❌ No `enableDrag()` method
- ❌ No `enableResize()` method
- ❌ No drag event handling
- ❌ No resize event handling

**Impact:** **MEDIUM** - Useful for interactive UIs, less critical for BBS doors

**Implementation Needed:**
1. Implement `enableDrag(callback)` method
2. Listen for mousedown, mousemove, mouseup
3. Update element position during drag
4. Call callback with new position
5. Similar logic for `enableResize()`

**Files to Modify:**
- `core/element.ts` - Add enableDrag/enableResize methods
- `core/screen.ts` - Route drag/resize mouse events

---

### 6. Advanced Scrolling Options ❌ NOT IMPLEMENTED

**What's Missing:**

```typescript
alwaysScroll: true,  // Ignore childOffset, change childBase on every scroll
baseLimit: 100,      // Limit childBase (default: Infinity)
```

**Purpose:**
- `alwaysScroll`: Scroll always affects base position (simpler scrolling)
- `baseLimit`: Prevent scrolling beyond certain point

**Current SDK Status:**
- ✅ Has `childBase` and `childOffset` properties
- ❌ No `alwaysScroll` option
- ❌ No `baseLimit` option
- ❌ Scroll logic doesn't support these modes

**Impact:** **LOW** - Advanced scrolling modes, rarely used

**Implementation Needed:**
1. Add `alwaysScroll` and `baseLimit` to ElementOptions
2. Modify scroll() method to respect these options
3. Clamp childBase to baseLimit

**Files to Modify:**
- `core/types.ts` - Add options
- `core/element.ts` - Update scroll logic

---

### 7. Shrink/Flex Layout ❌ NOT IMPLEMENTED

**What's Missing:**

```typescript
shrink: true  // Element shrinks/grows to fit content and children
```

**Behavior:**
- Element calculates minimum size needed for content
- Width/height auto-adjust to fit
- Useful for auto-sizing containers

**Current SDK Status:**
- ❌ No `shrink` option
- ❌ No auto-sizing logic
- ❌ Dimensions are always explicit or fill parent

**Impact:** **LOW-MEDIUM** - Useful for dynamic layouts

**Implementation Needed:**
1. Add `shrink: boolean` to ElementOptions
2. Calculate content dimensions (text width/height)
3. Calculate children bounding box
4. Set element size to fit both
5. Re-calculate on content/children changes

**Challenges:**
- Need to measure text width (account for ANSI codes)
- Need to track children dimensions
- May cause layout thrashing if not careful

**Files to Modify:**
- `core/types.ts` - Add shrink option
- `core/element.ts` - Add shrink calculation logic

---

### 8. Hover Text (Tooltips) ❌ NOT IMPLEMENTED

**What's Missing:**

```typescript
hoverText: 'This is a tooltip'  // Floating text on mouseover
```

**Behavior:**
- On mouseenter: Show floating text near cursor
- On mouseleave: Hide floating text
- Text follows cursor or anchored to element

**Current SDK Status:**
- ✅ Has mouse events (mouseenter, mouseleave)
- ❌ No `hoverText` option
- ❌ No tooltip rendering

**Impact:** **LOW** - Nice UX enhancement, not essential

**Implementation Needed:**
1. Add `hoverText` to ElementOptions
2. Create hover text overlay element
3. Show/hide on mouseenter/mouseleave
4. Position near cursor or element
5. Render above all other elements

**Files to Modify:**
- `core/types.ts` - Add hoverText option
- `core/element.ts` - Handle hover events
- `core/screen.ts` - Render hover overlay

---

## Additional Missing Features

### 9. Fixed Positioning ⚠️ PARTIAL

**Status:** Option exists but not fully implemented

```typescript
fixed: true  // Element doesn't scroll with parent
```

**Current SDK:**
- ✅ `fixed` is in ElementOptions (line 188)
- ❌ Not used in coordinate calculation
- ❌ Doesn't prevent scrolling

**Files to Modify:**
- `core/element.ts` - Check fixed in _getCoords, ignore parent scroll

---

### 10. Vi-Style Navigation ⚠️ PARTIAL

**Status:** Option exists but not fully implemented

```typescript
vi: true  // Enable j/k for up/down, h/l for left/right
```

**Current SDK:**
- ⚠️ `vi` mentioned in documentation
- ❌ Not in ElementOptions interface
- ❌ Not in key handling

**Files to Modify:**
- `core/types.ts` - Add vi to ElementOptions
- `widgets/list.ts` - Add vi key bindings

---

### 11. Alignment Options ⚠️ PARTIAL

**Status:** Positioning works but content alignment missing

```typescript
align: 'left' | 'center' | 'right',    // Horizontal text alignment
valign: 'top' | 'middle' | 'bottom',   // Vertical text alignment
```

**Current SDK:**
- ✅ Position calculation supports 'center'
- ❌ Content text alignment not implemented
- ❌ `align` and `valign` not in ElementOptions

**Impact:** **MEDIUM** - Useful for text centering

**Files to Modify:**
- `core/types.ts` - Add align/valign options
- `core/element.ts` - Apply alignment in renderContent

---

## Summary Table

| Feature | Priority | Status | Effort | Impact |
|---------|----------|--------|--------|--------|
| **Scrollbars** | 🔴 Critical | ❌ Missing | High | High |
| **Border Docking** | 🟡 Nice-to-have | ❌ Missing | Medium | Medium |
| **Transparency** | 🟡 Nice-to-have | ❌ Missing | High | Low |
| **Shadow** | 🟢 Optional | ❌ Missing | Low | Low |
| **Drag & Resize** | 🟡 Nice-to-have | ❌ Missing | Medium | Medium |
| **alwaysScroll/baseLimit** | 🟢 Optional | ❌ Missing | Low | Low |
| **Shrink/Flex** | 🟡 Nice-to-have | ❌ Missing | High | Medium |
| **Hover Text** | 🟢 Optional | ❌ Missing | Low | Low |
| **Fixed Positioning** | 🟡 Nice-to-have | ⚠️ Partial | Low | Medium |
| **Vi Navigation** | 🟢 Optional | ⚠️ Partial | Low | Low |
| **Text Alignment** | 🟡 Nice-to-have | ⚠️ Partial | Low | Medium |

---

## Recommended Implementation Order

### Phase 1: High-Impact Features (Do First)

1. **Scrollbars** 🔴
   - Most visible missing feature
   - Essential for good UX
   - Expected in any terminal UI

2. **Text Alignment** 🟡
   - Simple to implement
   - High value for layouts
   - Quick win

3. **Fixed Positioning** 🟡
   - Option already exists
   - Just needs implementation
   - Low effort, medium impact

### Phase 2: Medium-Impact Features (Do Next)

4. **Border Docking** 🟡
   - Professional-looking layouts
   - Medium effort
   - Nice polish

5. **Drag & Resize** 🟡
   - Interactive UIs
   - Medium effort
   - Good for advanced doors

6. **Shrink/Flex** 🟡
   - Dynamic layouts
   - High effort but useful
   - Consider if needed

### Phase 3: Low-Priority Features (Optional)

7. **Transparency** 🟢
   - Cosmetic enhancement
   - High effort (color blending)
   - Low priority for BBS

8. **Shadow** 🟢
   - Visual polish
   - Low effort
   - Nice to have

9. **Hover Text** 🟢
   - Tooltips
   - Low effort
   - UX enhancement

10. **Vi Navigation** 🟢
    - For vi users
    - Low effort
    - Optional

11. **Advanced Scrolling** 🟢
    - alwaysScroll, baseLimit
    - Low effort
    - Rarely used

---

## Implementation Plan

### Sprint 1: Scrollbars (High Priority)
**Goal:** Add visual scrollbar support

**Tasks:**
1. Define ScrollbarOptions interface
2. Add scrollbar rendering to Element
3. Calculate scrollbar thumb position
4. Style scrollbar based on style options
5. Add mouse wheel support on scrollbar
6. Test with ScrollableBox, List, Log widgets

**Files:**
- `core/types.ts`
- `core/element.ts`
- `widgets/scrollablebox.ts`
- `widgets/list.ts`

**Estimated Effort:** 4-6 hours

---

### Sprint 2: Text Alignment + Fixed (Quick Wins)
**Goal:** Implement text alignment and fix positioning

**Tasks:**
1. Add `align` and `valign` to ElementOptions
2. Implement text centering in content rendering
3. Implement `fixed` option in coordinate calculation
4. Test alignment with Box, Text widgets
5. Test fixed with nested scrollable containers

**Files:**
- `core/types.ts`
- `core/element.ts`

**Estimated Effort:** 2-3 hours

---

### Sprint 3: Border Docking (Polish)
**Goal:** Auto-connect adjacent borders

**Tasks:**
1. Add `dockBorders` and `ignoreDockContrast` options
2. Detect adjacent elements in render
3. Replace border characters at connections
4. Handle color/attribute matching
5. Test with grid layouts

**Files:**
- `core/types.ts`
- `core/element.ts`
- `core/screen.ts`

**Estimated Effort:** 4-5 hours

---

### Sprint 4: Drag & Resize (Interactive)
**Goal:** Draggable and resizable elements

**Tasks:**
1. Implement `enableDrag(callback)` method
2. Handle mousedown, mousemove, mouseup events
3. Update element position during drag
4. Implement `enableResize(callback)` method
5. Add resize handles detection
6. Test with Box, Form widgets

**Files:**
- `core/element.ts`
- `core/screen.ts`

**Estimated Effort:** 6-8 hours

---

### Sprint 5: Advanced Features (Optional)
**Goal:** Remaining features

**Tasks:**
1. Implement shrink/flex layout
2. Add transparency/color blending
3. Add shadow rendering
4. Add hover text tooltips
5. Add vi navigation
6. Add alwaysScroll/baseLimit

**Files:** Various

**Estimated Effort:** 8-12 hours (can be split)

---

## Testing Strategy

### Unit Tests
- Test each feature in isolation
- Mock dependencies (screen, parent, etc.)
- Cover edge cases

### Integration Tests
- Test features together
- Test with real widgets
- Test in actual door environment

### Visual Tests
- Manual testing in terminal
- Screenshot comparisons
- BBS environment testing

### Regression Tests
- Ensure existing features still work
- Test example doors (neo-blessed-showcase, livechat)
- Test all 34 widgets

---

## Success Criteria

### Phase 1 Complete
- ✅ Scrollbars render correctly
- ✅ Text alignment works (left, center, right)
- ✅ Fixed positioning prevents scroll
- ✅ All existing doors still work

### Phase 2 Complete
- ✅ Borders dock automatically
- ✅ Elements can be dragged
- ✅ Elements can be resized
- ✅ No regressions

### Phase 3 Complete
- ✅ All blessed features implemented
- ✅ 1:1 API parity with blessed
- ✅ Documentation updated
- ✅ Examples showcase all features

---

**Next Steps:**
1. Review this gap analysis
2. Prioritize features (confirm Sprint 1 priorities)
3. Begin Sprint 1: Scrollbars
4. Test and iterate
5. Move to next sprint

**Questions for User:**
1. Do you want scrollbars first? (Recommended)
2. Any features more critical than others for your BBS doors?
3. Should we implement all features or just high-priority ones?
