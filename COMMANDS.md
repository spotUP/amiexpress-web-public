# AmiExpress-Web Command Registry

**CRITICAL:** This file tracks ALL commands in the system to prevent accidental overwrites of original AmiExpress commands.

## 📋 Original AmiExpress Internal Commands (SACRED - DO NOT MODIFY)

These commands are from express.e (processInternalCommand function, lines 28283-28450). They are **UNTOUCHABLE** and must be implemented exactly as the original.

### Status Legend:
- ✅ **Implemented & Verified** - Command works exactly as express.e
- 🚧 **Partially Implemented** - Command exists but behavior may differ
- ❌ **Not Implemented** - Command missing entirely
- ⚠️ **BROKEN** - Command exists but does wrong thing

---

### Navigation Commands

| Command | Express.e Line | Purpose | Status | Notes |
|---------|---------------|---------|--------|-------|
| `<` | 24529 | Previous conference (internalCommandLT) | ❌ | Not implemented |
| `<<` | 24566 | Previous message base (internalCommandLT2) | ❌ | Not implemented |
| `>` | 24548 | Next conference (internalCommandGT) | ❌ | Not implemented |
| `>>` | 24580 | Next message base (internalCommandGT2) | ❌ | Not implemented |

### System Commands

| Command | Express.e Line | Purpose | Status | Notes |
|---------|---------------|---------|--------|-------|
| `0` | 24424 | Remote shell (internalCommand0) | 🚧 | Shows "not available" |
| `1` | 24453 | Account editing (internalCommand1) | 🚧 | Partially implemented |
| `2` | 24461 | View callers log (internalCommand2) | 🚧 | Shows mock data |
| `3` | 24511 | Edit directory files (internalCommand3) | 🚧 | Partially implemented |
| `4` | 24517 | Edit any file (internalCommand4) | ❌ | Not implemented |
| `5` | 24523 | Change directory (internalCommand5) | ❌ | Not implemented |
| `?` | 24594 | Help (internalCommandQuestionMark) | 🚧 | Shows help text |

### Message Commands

| Command | Express.e Line | Purpose | Status | Notes |
|---------|---------------|---------|--------|-------|
| `A` | 24601 | Post message (internalCommandA) | 🚧 | Partially implemented |
| `B` | 24607 | Bulletins (internalCommandB) | ❌ | Not implemented |
| `C` | 24658 | Comment to sysop (internalCommandC) | 🚧 | Partially implemented |
| `CF` | 24672 | Comment with flags (internalCommandCF) | ❌ | Not implemented |
| `CM` | 24843 | Clear message scan pointers (internalCommandCM) | ❌ | Not implemented |
| `E` | 24860 | Email (internalCommandE) | 🚧 | Partially implemented |
| `M` | 25239 | Message menu (internalCommandM) | ❌ | Not implemented |
| `MS` | 25250 | Mailscan (internalCommandMS) | 🚧 | Partially implemented |
| `N` | 25275 | New messages scan (internalCommandN) | 🚧 | Partially implemented |
| `NM` | 25281 | New messages (internalCommandNM) | ❌ | Not implemented |
| `R` | 25518 | Read messages (internalCommandR) | 🚧 | Partially implemented |
| `RL` | 25534 | Relogon (internalCommandRL) | 🚧 | Partially implemented |

### File Commands

| Command | Express.e Line | Purpose | Status | Notes |
|---------|---------------|---------|--------|-------|
| `D` | 24853 | Download files (internalCommandD) | 🚧 | Partially implemented |
| `DS` | 24853 | Download with status (internalCommandD) | ❌ | Not implemented |
| `F` | 24877 | File areas (internalCommandF) | 🚧 | Partially implemented |
| `FM` | 24889 | File maintenance (internalCommandFM) | ❌ | Not implemented |
| `FR` | 24883 | File reverse (internalCommandFR) | ❌ | Not implemented |
| `FS` | 24872 | File search (internalCommandFS) | ❌ | Not implemented |
| `U` | 25646 | Upload files (internalCommandU) | 🚧 | Partially implemented |
| `UP` | 25667 | Upload with parameters (internalCommandUP) | ❌ | Not implemented |
| `US` | 25660 | User statistics (internalCommandUS) | ❌ | Not implemented |
| `RZ` | 25608 | Zmodem upload (internalCommandRZ) | 🚧 | Partially implemented |

### Conference Commands

| Command | Express.e Line | Purpose | Status | Notes |
|---------|---------------|---------|--------|-------|
| `J` | 25113 | Join conference (internalCommandJ) | 🚧 | Partially implemented |
| `JM` | 25185 | Join message base (internalCommandJM) | 🚧 | Partially implemented |

### Chat/Communication Commands

| Command | Express.e Line | Purpose | Status | Notes |
|---------|---------------|---------|--------|-------|
| `O` | 25372 | Page sysop (internalCommandO) | 🚧 | Partially implemented |
| `OLM` | 25406 | Online message (internalCommandOLM) | 🚧 | Partially implemented |
| `WHO` | - | Who's online (internalCommandWHO) | 🚧 | Partially implemented |
| `WHD` | - | Who's online detailed (internalCommandWHD) | ❌ | Not implemented |
| `W` | - | Who's online short (internalCommandW) | ❌ | Not implemented |

### System Status Commands

| Command | Express.e Line | Purpose | Status | Notes |
|---------|---------------|---------|--------|-------|
| `G` | 25047 | Goodbye/Logoff (internalCommandG) | 🚧 | Partially implemented |
| `Q` | 25504 | Quiet node (internalCommandQ) | 🚧 | Partially implemented |
| `S` | 25540 | Statistics (internalCommandS) | 🚧 | Partially implemented |
| `T` | 25622 | Time left (internalCommandT) | ❌ | Not implemented |
| `V` | - | Version (internalCommandV) | 🚧 | Partially implemented |
| `VER` | - | Version detailed (internalCommandVER) | 🚧 | Partially implemented |
| `VO` | - | Version output (internalCommandVO) | ❌ | Not implemented |
| `VS` | - | View statistics (internalCommandVS) | ❌ | Not implemented |

### Special Commands

| Command | Express.e Line | Purpose | Status | Notes |
|---------|---------------|---------|--------|-------|
| `^` | 25089 | Upload hat (internalCommandUpHat) | ❌ | Not implemented |
| `GR` | - | Greets/Graphics (internalCommandGR) | ❌ | Not implemented |
| `H` | 25071 | Help (internalCommandH) | ❌ | Not implemented (we have ?) |
| `X` | 26113 | Expert mode toggle (internalCommandX) | ✅ | **VERIFIED - Phase 1** |
| `Z` | 26113 | Zippy text search (internalCommandZ) | 🚧 | Partially implemented |
| `ZOOM` | - | Zoom (internalCommandZOOM) | ❌ | Not implemented |

---

## 🆕 Custom Web Commands (Our Additions)

These commands are NOT in the original AmiExpress. They are custom additions for the web version and use non-conflicting names.

### Currently Defined Custom Commands:

| Command | Purpose | Status | Notes |
|---------|---------|--------|-------|
| `checkup` | System checkup? | ⚠️ | **REVIEW NEEDED** - Source unknown |
| `native` | ? | ⚠️ | **REVIEW NEEDED** - Source unknown |
| `sal` | ? | ⚠️ | **REVIEW NEEDED** - Source unknown |
| `script` | ? | ⚠️ | **REVIEW NEEDED** - Source unknown |
| `web` | ? | ⚠️ | **REVIEW NEEDED** - Source unknown |
| `O_USERS` | List users? | ⚠️ | **REVIEW NEEDED** - Conflicts with WHO? |

### ⚠️ ATTENTION NEEDED:

The commands marked **REVIEW NEEDED** above were found in the current implementation but are NOT in express.e. We need to:

1. **Verify their purpose** - What do they do?
2. **Rename if needed** - Do they conflict with any original commands?
3. **Document or remove** - Are they necessary?

### Proposed Custom Commands (Not Yet Implemented):

When we need web-specific features, use these naming patterns:

| Prefix | Purpose | Example |
|--------|---------|---------|
| `WEB_*` | Web interface features | `WEB_SETTINGS`, `WEB_PROFILE` |
| `MODERN_*` | Modern enhancements | `MODERN_SEARCH`, `MODERN_UPLOAD` |
| `CUSTOM_*` | Custom additions | `CUSTOM_STATS`, `CUSTOM_TOOLS` |
| `ADMIN_*` | Administrative tools | `ADMIN_MONITOR`, `ADMIN_CONFIG` |

---

## 📝 Command Implementation Checklist

Before implementing ANY command:

1. **Check this registry** - Is it an original AmiExpress command?
2. **If original:**
   - Find it in express.e
   - Read the complete implementation
   - Implement EXACTLY as shown
   - Mark as ✅ when verified
3. **If custom:**
   - Use non-conflicting name (WEB_*, MODERN_*, etc.)
   - Document it in the "Custom Web Commands" section
   - Get user approval before implementing

---

## 🔍 Command Verification Protocol

To verify a command implementation:

1. **Find in express.e:**
   ```bash
   grep -n "internalCommand<X>" ~/Code/AmiExpress-Web/AmiExpress-Sources/express.e
   ```

2. **Read implementation:**
   ```bash
   sed -n '<line>,<line+50>p' ~/Code/AmiExpress-Web/AmiExpress-Sources/express.e
   ```

3. **Compare behavior** - Does our implementation match exactly?

4. **Update status** - Change ❌ → 🚧 → ✅

---

## 📊 Implementation Statistics

**Total Original Commands:** 49
**Implemented & Verified:** 1 (2%)
**Partially Implemented:** 22 (45%)
**Not Implemented:** 26 (53%)
**Broken/Wrong:** 0 (0%)

**Custom Commands:** 6 (all need review)

---

**Last Updated:** 2025-10-18
**Updated By:** Phase 1 Critical Fixes
**Next Review:** After each phase of implementation
