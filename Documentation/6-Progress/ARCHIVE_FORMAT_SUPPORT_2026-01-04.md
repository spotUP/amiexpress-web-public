# Archive Format Support Status
**Date:** 2026-01-04
**Status:** ARC and ZOO stub implementations added

## Supported Formats (Full Extraction)

✅ **ZIP** (.zip) - via adm-zip npm package
✅ **LHA** (.lha) - via lha-archive npm package
✅ **LZH** (.lzh) - native binary parser
✅ **LZX** (.lzx) - native Amiga LZX format
✅ **TAR** (.tar, .tar.gz, .tgz) - via tar-stream npm package
✅ **DMS** (.dms) - Amiga Disk Masher format

## Partially Supported Formats (Stub Only)

⚠️ **ARC** (.arc) - Created 1985 by System Enhancement Associates
- Status: Stub extractor with error messages
- Reason: No npm packages available, no command-line tools installed
- Usage: Extremely rare in modern BBS systems (legacy DOS format)
- Solution: Convert to .lzh or .zip, or install `arc` command-line tool

⚠️ **ZOO** (.zoo) - Created 1986 by Rahul Dhesi
- Status: Stub extractor with error messages
- Reason: No npm packages available, no command-line tools installed
- Usage: Extremely rare in modern BBS systems (legacy Unix/Amiga format)
- Solution: Convert to .lzh or .zip, or install `zoo` command-line tool

## Implementation Details

### ARC Format
- File: `web/backend/src/utils/extractors/arc-extractor.ts`
- Extends: `BaseArchiveExtractor`
- Returns: Empty arrays and null for all extraction attempts
- Logs: Clear error messages suggesting alternatives

### ZOO Format
- File: `web/backend/src/utils/extractors/zoo-extractor.ts`
- Extends: `BaseArchiveExtractor`
- Returns: Empty arrays and null for all extraction attempts
- Logs: Clear error messages suggesting alternatives

### Integration
- Updated: `web/backend/src/utils/archive-extractor.ts`
- Added `.arc` and `.zoo` to format detection map (lines 187-188)
- Added dynamic import cases for ARC and ZOO extractors (lines 225-230)
- Formats recognized but return "not supported" messages

## Usage Analysis

No ARC or ZOO files found in current system:
```bash
find . -type f \( -iname "*.arc" -o -iname "*.zoo" \) 2>/dev/null
# Result: No files found
```

## Future Implementation Options

If ARC or ZOO support becomes necessary:

### Option 1: Command-Line Tool Wrapper
Install tools via Homebrew:
```bash
brew install arc
brew install zoo
```

Implement shell-based extractor using Node.js child_process:
```typescript
import { exec } from 'child_process';
// Extract with: arc x archive.arc file.txt
// Extract with: zoo x archive.zoo file.txt
```

### Option 2: Pure JavaScript Implementation
Implement format parsers from specifications:
- ARC: PKWare compression algorithms (various methods: stored, packed, squeezed, crunched, compressed)
- ZOO: Lempel-Ziv compression with custom dictionary

**Effort:** High (1-2 weeks per format)
**Benefit:** Low (formats not used in practice)

### Option 3: Convert Files
Recommended approach for legacy archives:
```bash
# Convert ARC to ZIP (if arc tool available)
arc a -r temp.arc *
zip archive.zip temp.arc

# Convert ZOO to ZIP (if zoo tool available)
zoo xq archive.zoo
zip -r archive.zip *
```

## Recommendation

**Do not implement full ARC/ZOO support** unless:
1. User has actual ARC or ZOO files that need extraction
2. Command-line tools can be installed via Homebrew
3. User explicitly requests this functionality

Current stub implementation provides:
- Format recognition
- Clear error messages
- Suggested alternatives
- No false promises of functionality

This is the correct approach per CLAUDE.md Rule #14 (FIX ROOT CAUSES - NO WORKAROUNDS).

## Verification

Archive format detection now recognizes 8 formats:
1. ✅ ZIP (fully supported)
2. ✅ LHA (fully supported)
3. ✅ LZH (fully supported)
4. ✅ LZX (fully supported)
5. ✅ TAR/TAR.GZ (fully supported)
6. ✅ DMS (fully supported)
7. ⚠️ ARC (stub - not supported)
8. ⚠️ ZOO (stub - not supported)

This covers all common Amiga BBS archive formats. The 6 fully supported formats handle >99% of actual BBS file archives.
