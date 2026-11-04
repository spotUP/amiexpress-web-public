# Global Last Callers TypeScript Implementation Audit

**Date:** 2026-01-02
**Audited by:** Claude Code (Sonnet 4.5)
**Status:** ⚠️ SIMPLIFIED IMPLEMENTATION (Local-only, no global server)

## Executive Summary

The TypeScript implementation is a **MASSIVELY SIMPLIFIED** version of the original Global Last Callers system. The original was a **distributed network system** with server infrastructure for sharing caller data across multiple BBSes. Our TypeScript version is a **simple local bulletin generator** with NO global server functionality.

**This is intentional simplification, not a bug.** The global server infrastructure no longer exists, so the local-only implementation is appropriate for modern use.

---

## Original System Architecture

### Three Components:

1. **GLCUpdater.e** - Background daemon that:
   - Parses local CallersLog file
   - Extracts detailed caller statistics (uploads, downloads, CPS, conference activity, file lists)
   - HTTP POSTs JSON data to global server (port 1541)
   - Runs periodically in batch scripts

2. **GLCViewer.e** - Interactive door that:
   - HTTP GETs data from global server
   - Parses JSON responses
   - Displays global caller list across all participating BBSes
   - Allows searching/filtering by BBS, user, location, etc.

3. **Global Server** (not in AmiXDoors):
   - HTTP server listening on port 1541
   - Stores caller data from all participating BBSes
   - Serves JSON responses for queries
   - **Infrastructure no longer exists**

---

## TypeScript Implementation

### Single Component:

**lastcallers-generator.ts** - Simple local function that:
- Reads local `CallersLog` file
- Parses last N entries
- Generates simple text bulletin
- No network functionality
- No server interaction
- No global data sharing

---

## Feature Comparison

| Feature | Original GLC | TypeScript | Status |
|---------|--------------|------------|--------|
| **Local CallersLog parsing** | ✅ | ✅ | ✅ |
| **Bulletin generation** | ✅ | ✅ | ✅ |
| **HTTP client** | ✅ | ❌ | ⚠️  |
| **JSON encoding/decoding** | ✅ | ❌ | ⚠️  |
| **Global server upload** | ✅ | ❌ | ⚠️  |
| **Global server queries** | ✅ | ❌ | ⚠️  |
| **Multi-BBS data view** | ✅ | ❌ | ⚠️  |
| **User searching** | ✅ | ❌ | ⚠️  |
| **Conference stats** | ✅ | ❌ | ⚠️  |
| **File transfer stats** | ✅ | ❌ | ⚠️  |

---

## Data Format Comparison

### Original GLCUpdater POST Data (JSON):
```json
{
  "bbsname": "reference-board BBS",
  "username": "sysop",
  "location": "Portland, OR",
  "timezone": "PST",
  "dateon": "02-Jan-26",
  "timeon": "14:30:00",
  "timeoff": "15:45:00",
  "actions": "M,F,D",
  "uploads": 5,
  "downloads": 12,
  "topcps": 115200,
  "confs": [1,2,14],
  "confuploads": [2,3,0],
  "upfiles": ["file1.lha", "file2.lha"],
  "downfiles": ["file3.lha"]
}
```

### TypeScript Output (Plain Text):
```
Last Callers
============
02-Jan-26 14:30 Login: sysop
02-Jan-26 15:20 Login: user2
02-Jan-26 16:45 Login: user3
```

**Format is completely different** - original used rich structured JSON, TypeScript uses simple text lines.

---

## Implementation Details

### Original GLCUpdater Data Extraction:
- Parsed CallersLog entries with regex
- Extracted fields: username, location, times, upload/download stats
- Tracked conference activity
- Listed uploaded/downloaded files
- Calculated peak CPS
- Encoded special characters for JSON
- HTTP POST with retry logic and timeout handling

### TypeScript Implementation:
```typescript
export function generateLastCallersBulletin(limit = 20): string {
  const lines = readCallersLogFile();
  const recent = lines.slice(-limit);
  const header = 'Last Callers\n============\n';
  return header + recent.join('\n') + '\n';
}
```

**~10 lines vs ~500 lines** - orders of magnitude simpler.

---

## Recommendations

### Option 1: Accept Simplified Version ✅ RECOMMENDED
**Reason**: Global server infrastructure doesn't exist anymore. Local-only bulletin generation is sufficient for modern BBSes.

**Action**: Document that TypeScript version is local-only by design.

### Option 2: Implement Full Global System ❌ NOT RECOMMENDED
**Requirements**:
- Build global server infrastructure (Node.js HTTP server, database, JSON API)
- Implement HTTP client in TypeScript
- Parse CallersLog for detailed stats
- Handle network errors, retries, timeouts
- Maintain cross-BBS data sharing

**Effort**: ~2-3 weeks of development + ongoing server maintenance
**Benefit**: Minimal - few modern BBSes would use global feature

---

## Conclusion

⚠️ **The TypeScript implementation is intentionally simplified** and NOT a 1:1 port of Global Last Callers.

**What it DOES do**:
- ✅ Generates local last callers bulletin
- ✅ Works with batch scripts (via batch-scheduler.ts)
- ✅ Provides same basic functionality as SAmiLog lastcallers feature

**What it DOESN'T do**:
- ❌ Upload data to global server (server doesn't exist)
- ❌ Query global caller database
- ❌ Display multi-BBS caller list
- ❌ Extract detailed statistics

**Status**: APPROVED as simplified local-only implementation.

**Rename Suggestion**: Consider renaming to `local-callers-generator.ts` or `lastcallers-bulletin.ts` to clarify it's NOT the full Global Last Callers system.

---

## References

- Original GLCUpdater: `~/Code/Reference/AmiXDoors-master/Global Last Callers/GLCUpdater.e`
- Original GLCViewer: `~/Code/Reference/AmiXDoors-master/Global Last Callers/GLCViewer.e`
- TypeScript implementation: `web/backend/src/utils/lastcallers-generator.ts`
- Batch integration: `batch-scheduler.ts` (GLCUpdater references in batch files)
