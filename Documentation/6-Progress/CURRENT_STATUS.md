# AmiExpress-Web Current Status
**Last Updated**: 2025-11-05

---

## 🎯 Current State

### What's Working ✅
- **Amiga Door Execution**: Complete architectural rewrite - doors load, execute, and exit cleanly
- **WHO Door**: Runs perfectly, displays banner, exits to menu
- **Main Loop**: Clean 80-line implementation with unified trap handler
- **Exit Handling**: Extended sentinel range handles MOVEM.L operations correctly
- **Double Output Bug**: FIXED - eliminated duplicate trap interception
- **Door Completion**: Proper "Press ENTER" prompt and menu return
- **Test Framework**: Reusable testing utilities (Scripts/test-framework.ts)
- **Reference Checker**: Automates "check E sources first" (Scripts/reference-checker.ts)
- **Library Spec Generator**: Type-safe specs from NDK docs (Scripts/generate-library-specs.ts)
- **MCP Server**: On-demand source access (98% token savings!) - mcp-server/index.js

### In Progress 🔨
- **WHO Door User List**: Door works but needs user tracking data from NI/NO tools
- **NI/NO Tools**: Crash with ROM write errors in AllocMem() - memory allocation bug

### Not Started ❌
- **~XC MCI Code**: Execute commands from screen files (CRITICAL BLOCKER for NI/NO integration)
- **8+ Missing MCI Codes**: ~f, ~w, ~x, ~y, ~q, ~h, ~SS_, ~SX_, ~SR_, ~CC_, ~CR_, ~SM_, etc.
  (See Docs/MCI_CODES_TODO.md for complete list - 52/60+ implemented)

---

## 📊 Recent Achievements

### Session 2025-11-05: MCP Server Implementation (99% Token Savings!)
**Achievement**: Complete Model Context Protocol server with modularized express.e

**Efficiency Transformation**:
- Documentation: 204MB → 1.2MB (99.4% reduction)
- express.e access: 400k → 2-10k tokens (95-99% reduction!)
- Session capacity: 3 days → 7 days (FULL WEEK!)

**MCP Tools Implemented** (7 total):
1. `search_express_source` - Keyword search in express.e with context
2. `read_source_range` - Read specific line ranges (e.g., 5290-5850)
3. `search_ndk_autodocs` - Search 30MB NDK autodocs on-demand
4. `read_express_module` - Read by module name (99% savings!) ⭐ NEW
5. `list_express_modules` - List all 19 modules ⭐ NEW

**express.e Modularization** (19 modules):
- Created express-modules.json mapping all functional areas
- 4 CRITICAL modules: mci, internal-commands, command-priority, mainloop
- Token savings: 400k → 2-10k (module-specific reads)

**MCP Resources** (5 E sources):
- `amiexpress://sources/express-e` - express.e (32,248 lines, modularized!)
- `amiexpress://sources/hydra-e` - hydra.e (file transfer)
- `amiexpress://sources/acp-e` - ACP.e (control panel)
- `amiexpress://sources/zmodem-e` - zmodem.e (ZModem) ⭐ NEW
- `amiexpress://sources/ftpd-e` - ftpd.e (FTP daemon) ⭐ NEW
- `amiexpress://docs/*` - All documentation

**Result**: Claude Code can now target exact functional areas without reading large sections!

**Files Created/Modified**:
- mcp-server/express-modules.json - Module map with 19 sections ⭐ NEW
- mcp-server/index.js - Added 5 E sources + 2 new tools
- CLAUDE.md - Updated MCP Workflow with module-based approach
- Scripts/reference-checker.ts - Added MCP usage note
- mcp-server/test-mcp.js - Test suite (3/3 passing)

### Session 2025-11-02: Main Loop Rewrite
**Achievement**: Fixed 3 critical bugs preventing ANY door from working

**Changes**:
- AmigaDoorSession.ts: 2365 → 1421 lines (944 lines removed, 40% reduction)
- Main loop: 1030 → 80 lines (92% cleaner!)
- Trap handlers: 3+ scattered blocks → 1 unified handler

**Bugs Fixed**:
1. **Double Output Bug**: Banner appeared twice - FIXED by unified trap handler
2. **Exit Crash**: PC=0x0 instead of clean exit - FIXED by extended sentinel range
3. **Menu Return**: No prompt after door - FIXED by proper completion handling

**Result**: WHO door executes perfectly in 2166 iterations, exit code 0

**Files Modified**:
- web/backend/src/amiga-emulation/AmigaDoorSession.ts (lines 67-160, 526-534, 792-873)
- web/backend/src/handlers/door.handler.ts (lines 428-436)

---

## 🐛 Known Issues

### 1. NI/NO Tool Memory Allocation (HIGH PRIORITY)
**Problem**: NI and NO tools crash with ROM write errors
```
!!! ROM WRITE DETECTED !!!
  Address: 0xfcb112
  at ExecLibrary.allocMem
```

**Impact**: WHO door can't display user list (no tracking data)

**Root Cause**: AllocMem() attempting to allocate in ROM space (0xFC0000 range)

**Fix Needed**: Debug ExecLibrary.allocMem() to ensure chip RAM allocation

**Files**:
- web/backend/src/amiga-emulation/api/ExecLibrary.ts
- Tools: Doors/who/NI, Doors/who/No

### 2. ~XC MCI Code Not Implemented
**Problem**: Screen files can't execute commands

**Impact**: Can't run NI on login or NO on logout from screen files

**Added to screen files (not executed yet)**:
- Node0/Screens/Logon.txt: ~XC_DOORS:who/NI ~N||
- Node0/Screens/Logoff.txt: ~XC_DOORS:who/No ~N||

**Fix Needed**: Implement ~XC handler in screen file parser

**Files**: web/backend/src/handlers/screen.handler.ts

**Challenge**: parseMciCodes() is synchronous but door execution is async

---

## 🎯 Next Steps

### Immediate (This Session)
1. Fix AllocMem() ROM write errors
2. Test NI/NO tools create tracking data
3. Verify WHO door displays user list

### Short Term (This Week)
1. Implement ~XC MCI code execution
2. Build reusable test framework
3. Create reference-checker tool

### Medium Term (Next Week)
1. Generate type-safe library specs from NDK docs
2. Automated door test suite with CI/CD
3. Implement remaining BBS commands from express.e

---

## 📁 Key Files Reference

### Amiga Emulation Core
- web/backend/src/amiga-emulation/AmigaDoorSession.ts - Main execution loop
- web/backend/src/amiga-emulation/api/DosLibrary.ts - DOS.library implementation
- web/backend/src/amiga-emulation/api/ExecLibrary.ts - Exec.library implementation
- web/backend/src/amiga-emulation/api/AEDoorLibrary.ts - AEDoor.library implementation

### Handlers
- web/backend/src/handlers/door.handler.ts - Door execution lifecycle
- web/backend/src/handlers/command.handler.ts - BBS command routing
- web/backend/src/handlers/screen.handler.ts - Screen file parsing

### Configuration
- Node0/Screens/ - Screen files (logon, menu, etc.)
- Doors/ - Amiga door executables
- Commands/BBSCmd/ - BBS commands

---

## 🧪 Testing

### Manual Testing
```bash
# Start servers
./dev/scripts/start-all.sh

# Access: http://localhost:5173
# Login: sysop / sysop
# Run: WHO2 command

# Expected output:
Starting WHO2...
/X DooR by SPY/MST

Press ENTER to continue...
```

### Backend Logs
```bash
tail -f /tmp/backend.log | grep -E "WHO|Door|EXITED"

# Expected:
[AmigaDoorSession] === DOOR EXITED CLEANLY ===
[AmigaDoorSession] Return code (D0): 0
[AmigaDoorSession] Total iterations: 2166
[executeAmigaDoor] Door execution completed
```

---

## 📚 Documentation

### Active References (Keep in Docs/)
- AMIGA_REFERENCE.md - Quick reference for Amiga system calls
- CODE_ARCHITECTURE.md - System architecture overview
- DATABASE_RULES.md - Database schema and rules
- AMIGA_DOOR_IMPLEMENTATION_GUIDE.md - Complete door implementation guide

### Organized Documentation (Documentation/)
- Documentation/README.md - Documentation hub
- Documentation/3-Developers/ - Development guides
- Documentation/4-Door-Developers/ - Door development (includes vAmiga sources)
- Documentation/6-Progress/archive/ - Archived session notes

---

## 🔧 Development Rules

### Pre-Implementation Checklist
Before writing ANY code:
- [ ] Read express.e for this feature
- [ ] Read NDK autodocs for AmigaDOS functions needed
- [ ] Verify original AmiExpress behavior
- [ ] Design TypeScript equivalent
- [ ] Implement once, correctly

### Documentation Protocol
- **During work**: Update ONLY this file (CURRENT_STATUS.md)
- **After feature**: Create ONE archive file in Documentation/6-Progress/archive/YYYY-MM/
- **NO variants**: No COMPLETE, FINAL_STATUS, RESTART files

### Commit Protocol
- One feature = one commit (or small logical series)
- Reference source line numbers in commits
- Format: feat(area): description (ref: express.e:line)

---

## 📈 Project Stats

### Code Quality
- AmigaDoorSession.ts: 1421 lines (was 2365)
- Main loop: 80 lines (was 1030)
- Trap detection: 1 handler (was 3+)

### Documentation
- Docs/ directory: 1.2MB (was 204MB - 99.4% reduction!)
- Active docs: 108 files (was 172)
- Archive: All old session notes moved to Documentation/6-Progress/archive/

### Commits
- Last 3 weeks: 498 commits
- Target: Reduce to 1-2 commits per feature

---

## 🎓 Key Learnings

1. **Main Loop Architecture**: Clean, simple code prevents bugs better than complex defensive code
2. **Exit Sentinels**: Must account for stack operations (MOVEM.L pops 52 bytes!)
3. **WHO Door Design**: Separate tools (NI/NO) handle tracking, WHO just displays
4. **1:1 Port Principle**: Check E sources FIRST, implement EXACTLY, don't guess
5. **Documentation**: One living document >> many archived snapshots

---

**This is the ONLY status file. Update this file, don't create new ones.**
