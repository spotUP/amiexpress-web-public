# Scripts Organization - Cleanup Complete
**Date:** November 1, 2025
**Status:** ✅ COMPLETE

## Summary

Organized all test scripts into the `Scripts/` directory and established rules for script location.

## Changes Made

### 1. Moved All Test Scripts
- **Location:** `Scripts/` directory
- **Count:** 43 scripts moved from project root
- **Types:** Test scripts, utilities, and development tools

### 2. Updated CLAUDE.md
Added new section under "File Organization":

```markdown
**Scripts Location:**
- ALL test scripts (.js files) go in `Scripts/` directory
- NEVER create test scripts in project root
- Examples: test-door.js, test-bbs-commands.js, etc.
```

### 3. Created Scripts/README.md
- Documented script organization
- Listed script categories
- Provided usage examples
- Added guidelines for future scripts

## Script Categories

### Door Testing (20+ scripts)
- `test-door-*.js` - Door execution tests
- `test-ga-*.js` - GetAnswer door tests
- `test-getanswer*.js` - GetAnswer variants
- `test-what-door.js` - What door tests

### BBS Testing (10+ scripts)
- `test-bbs-*.js` - BBS system tests
- `test-dos-file-io.js` - File I/O tests
- `test-check-memory.js` - Memory utilities

### Utilities
- `bbs-cli.js` - BBS CLI interface
- `disassemble-door.js` - Disassembly tool

## Benefits

1. **Cleaner Project Root:** No more clutter from test scripts
2. **Better Organization:** All scripts in one logical location
3. **Easier Discovery:** Developers know where to find/create scripts
4. **Consistent Pattern:** Matches Docs/ directory organization

## Future Guidelines

When creating test scripts:
1. ✅ Create in `Scripts/` directory
2. ✅ Use descriptive names: `test-<feature>-<variant>.js`
3. ✅ Add comment explaining purpose
4. ❌ Never create in project root

## Files Modified

1. `CLAUDE.md` - Added Scripts location rule
2. `Scripts/README.md` - Created (new)
3. 43 `.js` files - Moved to Scripts/

## Verification

```bash
# Scripts in Scripts folder
ls Scripts/*.js | wc -l
# Output: 43

# Scripts in root (should be 0)
find . -maxdepth 1 -name "test-*.js" | wc -l
# Output: 0
```

✅ All test scripts successfully organized!
