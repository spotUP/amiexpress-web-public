# WHIP Door Progress Report

**Date:** 2026-01-28
**Status:** COMPLETE

## Summary

All WHIP door features working including form dialogs with text input.

## Key Discovery: Neo-Blessed Textbox Width Bug

**Problem**: `createTextbox()` and `blessed.textbox()` with explicit `width` property completely ignore the width constraint and expand beyond their parent container.

**Root Cause**: Neo-blessed textbox widget doesn't respect explicit width values when used without borders.

**Solution**: Use bordered textboxes with edge constraints:

```typescript
// ✅ WORKING PATTERN
const input = blessed.textbox({
  parent: modal,
  left: 1,
  right: 1,           // Edge constraint instead of width
  height: 3,          // Border + content + border
  border: { type: 'line' },
  label: ' Field Name ',
  inputOnFocus: true,
  style: { border: { fg: 'cyan' } }
});
```

**Key Rules**:
1. Use `blessed.textbox()` directly, NOT `createTextbox()` SDK helper
2. MUST have `border: { type: 'line' }`
3. MUST have `height: 3` (1 border + 1 content + 1 border)
4. Use edge constraints (`left: 1, right: 1`) instead of explicit `width`
5. Put label on the border with `label: ' Name '`
6. DON'T create separate label elements (they get covered by textbox)

## Completed Features

| Feature | Status | Notes |
|---------|--------|-------|
| Party calendar RSS | PASS | Fixed XML structure parsing |
| New Project dialog | PASS | Fixed with bordered textboxes |
| New Task dialog | PASS | Fixed with bordered textboxes |
| Edit Task dialog | PASS | Same pattern |
| Main menu | PASS | Stats panel, menu list |
| Kanban board | PASS | Drag-and-drop working |
| My Tasks view | PASS | Cross-project task list |
| Leaderboard | PASS | User rankings |
| Achievements | PASS | Achievement display |
| Party timeline | PASS | Upcoming parties from demoparty.net |

## Files Modified

### WHIP Door (`Doors/whip/`)
- `ui/project-editor.ts` - Complete rewrite with bordered textboxes
- `ui/task-editor.ts` - Complete rewrite with bordered textboxes
- `ui/my-tasks.ts` - New view for user's tasks
- `ui/kanban-board.ts` - Drag-and-drop, column width fixes
- `core/party-calendar.ts` - RSS parsing fix for demoparty.net

### SDK (`sdk/`)
- `engines/ui/blessed/widgets/list.ts` - Hover style fix
- `engines/ui/blessed/widgets/dockable-panel.ts` - Focusable fix

### Documentation
- `Documentation/4-Door-Developers/TYPESCRIPT_DOOR_GUIDE.md` - Added "CRITICAL: Textbox Width Issues and Solutions" section

## Lessons Learned

1. **Always test text input forms** - They're the most problematic neo-blessed widgets
2. **Use bordered textboxes** - Only reliable pattern for constrained width
3. **Edge constraints over explicit width** - `left: 1, right: 1` works, `width: 50` doesn't
4. **Labels on borders** - Don't create separate label elements
5. **Check neo-blessed-showcase** - `Doors/neo-blessed-showcase/app.ts` has working patterns
6. **Truncate long text in lists** - Use `.substring(0, 25)` to prevent wrapping
