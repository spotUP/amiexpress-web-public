# AmiExpress-Web Project Guidelines

## 🚨 EFFICIENCY RULES - SAVE TOKENS 🚨

### Documentation Rules
1. **ONE status file**: `Documentation/6-Progress/CURRENT_STATUS.md`
2. **NO duplicate status docs** - Update existing, don't create new
3. **Archive session notes** immediately after completion to `Documentation/6-Progress/archive/YYYY-MM/`
4. **NO "COMPLETE"/"FINAL"/"RESTART" variants** - Just update CURRENT_STATUS.md
5. **Keep Docs/ < 20MB** - Move large references to Documentation/

### Work Rules
1. **Check E sources FIRST** - Don't code, then realize it's wrong (wastes sessions!)
2. **Architecture before code** - Read express.e flow before implementing
3. **Fix once, fix right** - Reference NDK docs for correct implementation upfront
4. **Test with existing tools** - Don't create one-off test scripts (archive them after use)
5. **Pre-implementation checklist** - Read express.e + NDK docs before ANY code

### Context Rules
1. **Read minimal files** - Only read what's needed for current task
2. **Use line ranges** - Don't read 1000+ line files entirely (use offset/limit)
3. **Archive aggressively** - Move old docs to Documentation/6-Progress/archive/
4. **Compact summaries** - No code blocks in continuation summaries unless essential

### MCP Workflow (Model Context Protocol) - 98% Token Savings!

**This project has an MCP server that provides on-demand access to large sources.**

**BEFORE reading express.e or NDK autodocs, use MCP tools:**

1. **Read express.e by MODULE** (BEST - most efficient!):
   ```
   Use MCP tool: list_express_modules
   - Shows all 19 modules with line ranges

   Use MCP tool: read_express_module
   - module: "mci" - MCI code processing (lines 5258-5850)
   - module: "internal-commands" - All A-Z commands (lines 24411-28227)
   - module: "doors" - Door execution (lines 4231-4613)
   - module: "commands" - Command routing (lines 4614-5257)
   - Returns: Just that module (99% token savings!)
   ```

2. **Search express.e** (when you don't know the module):
   ```
   Use MCP tool: search_express_source
   - query: "internalCommandWHO" or "PROC displayWho"
   - Returns: Line numbers + context (7k tokens vs 400k!)
   ```

3. **Read specific express.e ranges** (when you know exact lines):
   ```
   Use MCP tool: read_source_range
   - source: "express-e"
   - startLine: 5290
   - endLine: 5850
   - Returns: Only those lines (98% token savings!)
   ```

4. **Search NDK autodocs** (instead of grepping 30MB files):
   ```
   Use MCP tool: search_ndk_autodocs
   - query: "Close" or "AllocMem"
   - library: "dos" or "exec" (optional)
   - Returns: Complete function spec on-demand
   ```

**MCP Server Location**: `mcp-server/index.js`

**Available MCP Resources**:
- `amiexpress://sources/express-e` - express.e (32,248 lines, modularized!)
- `amiexpress://sources/hydra-e` - hydra.e (file transfer protocol)
- `amiexpress://sources/acp-e` - ACP.e (control panel)
- `amiexpress://sources/zmodem-e` - zmodem.e (ZModem protocol)
- `amiexpress://sources/ftpd-e` - ftpd.e (FTP daemon)
- `amiexpress://docs/*` - All documentation

**express.e Modules** (19 total):
- `init` - Initialization & imports
- `core` - Utility functions
- `security` - Password/auth
- `io` - Serial/console I/O
- `messaging` - XIM/door messages
- `doors` - Door execution
- `commands` - Command routing
- `mci` - **MCI code processing** (CRITICAL!)
- `display` - Screen file display
- `internal-commands` - **All A-Z commands** (CRITICAL!)
- `command-priority` - **Command resolution order** (CRITICAL!)
- `mainloop` - **Main BBS loop** (CRITICAL!)
- Plus: rexx, windows, logging, mail, files, conference, startup

**Token Savings**:
- Full express.e: ~400k tokens
- Module read: ~2-10k tokens (depends on module)
- Reduction: 95-99%!

**This is the PREFERRED way to access sources in Claude Code sessions.**

---

## 🚨 CRITICAL RULES - READ FIRST 🚨

### 1:1 Port - ALWAYS Check E Sources FIRST

**THIS IS THE #1 RULE - FAILURE TO FOLLOW THIS WASTES EVERYONE'S TIME**

**BEFORE Writing or Modifying ANY Code:**

1. **Find the original implementation:**
   ```bash
   grep -n "internalCommand<X>" ~/Code/AmiExpress-Web/AmiExpress-Sources/express.e
   grep -n "PROC <functionName>" ~/Code/AmiExpress-Web/AmiExpress-Sources/express.e
   ```

2. **Read the original E code:**
   ```bash
   sed -n '<startLine>,<endLine>p' ~/Code/AmiExpress-Web/AmiExpress-Sources/express.e
   ```

3. **ONLY THEN implement the exact behavior - NO GUESSING, NO ASSUMPTIONS**

**Why:** This is a 1:1 port. Every command, flow, and behavior must match express.e EXACTLY.

**Command Priority (from express.e:28228):**
```
1. SysCommand (SYSCMD)
2. BbsCommand (BBSCMD)
3. InternalCommand (built-in)
```

### NEVER Overwrite Original AmiExpress Commands

**ALL original AmiExpress commands are SACRED and must NEVER be overwritten.**

Before creating ANY command:
```bash
grep -i "ELSEIF.*StrCmp(cmdcode,'YOUR_COMMAND')" ~/Code/AmiExpress-Web/AmiExpress-Sources/express.e
```

- If found: Implement it EXACTLY as express.e shows
- If not found: You CAN create it (use WEB_*, MODERN_*, CUSTOM_*, ADMIN_* prefixes)

### NO SLOPPY IMPLEMENTATIONS - 100% ACCURACY REQUIRED

**🚨 CRITICAL: This is a 1:1 port. NEVER be sloppy with implementations. 🚨**

**MANDATORY REQUIREMENTS:**
1. **NEVER use stubs or placeholders** - Implement functions completely or not at all
2. **NEVER skip functionality** - All documented behavior must be implemented
3. **ALWAYS reference Amiga developer docs** - Check NDK3.2R4/Autodocs/ for specifications
4. **ALWAYS reference E sources** - Check AmiExpress-Sources/ for original behavior
5. **VERIFY 100% correctness** - Test all edge cases and return values
6. **NO skipped functions** - If a function exists in the spec, implement it fully

**BEFORE implementing ANY AmigaDOS/Exec function:**
```bash
# 1. Read the COMPLETE specification
cat NDK3.2R4/Autodocs/AG/dos | grep -A50 "^@Node \"FunctionName\""

# 2. Check for ALL edge cases mentioned
# 3. Implement ALL documented behavior (success cases, failure cases, special values)
# 4. Verify return values match spec EXACTLY (DOSTRUE=-1, DOSFALSE=0, etc.)
```

**Example of SLOPPY (WRONG):**
```typescript
Close(): void {  // ❌ Wrong return type
  if (handle <= 3) return;  // ❌ Missing error handling
  this.openFiles.delete(handle);  // ❌ Incomplete
}
```

**Example of CORRECT:**
```typescript
Close(): number {  // ✅ Correct return type per spec
  // Handle Close(0) - V47+ behavior
  if (handle === 0) return -1;

  // Standard handles should not be closed
  if (handle <= 3 || handle === this.NIL_HANDLE) {
    this.lastError = this.ERROR_NO_ERROR;
    return -1;  // Success
  }

  const fileHandle = this.openFiles.get(handle);
  if (!fileHandle) {
    this.lastError = this.ERROR_OBJECT_NOT_FOUND;
    return 0;  // Failure
  }

  // Flush writes if needed
  if (fileHandle.mode === MODE_NEWFILE && fileHandle.buffer) {
    try {
      fs.writeFileSync(fileHandle.realPath!, fileHandle.buffer);
    } catch (error) {
      this.lastError = this.ERROR_WRITE_PROTECTED;
      return 0;  // Failure, but still deallocate below
    }
  }

  // ALWAYS deallocate, even on failure (per spec)
  this.openFiles.delete(handle);
  this.lastError = this.ERROR_NO_ERROR;
  return -1;  // Success
}
```

**This is not negotiable. Sloppy implementations waste time and break doors.**

### NEVER Blame MOIRA Emulator

**🚨 CRITICAL: MOIRA is a battle-tested M68K emulator. It works correctly. 🚨**

**RULES:**
1. **NEVER assume bugs are in MOIRA** - They are almost certainly in YOUR code
2. **NEVER add "workarounds" for MOIRA** - Fix your actual bugs instead
3. **If something seems wrong, check YOUR implementation first** - 99.9% of the time it's your bug

**MOIRA is used in production Amiga emulators and is thoroughly tested. If you think you found a MOIRA bug, you're wrong - check your code again.**

### Server Management - ALWAYS Use Startup Scripts

**BEFORE restarting servers:**

```bash
# ✓ CORRECT - Use atomic startup scripts
./start-all.sh      # Start both servers
./start-backend.sh  # Backend only
./start-frontend.sh # Frontend only
./stop-all.sh       # Stop all servers

# ✗ WRONG - NEVER do this:
npm run dev &
npm run dev 2>&1 &
cd backend/backend && npm run dev &
```

**Why:** Manual commands create duplicate instances = stale code = wasted time.

**Verify exactly ONE server per port:**
```bash
lsof -ti:3001 | wc -l    # Backend (expect: 1)
lsof -ti:5173 | wc -l    # Frontend (expect: 1)
```

**Default Ports:**
- Backend: `http://localhost:3001`
- Frontend: `http://localhost:5173` ← Users access this

---

## Quick Reference Links

### Documentation Hub
- **[Documentation Index](Documentation/README.md)** - Complete documentation organized by role

### Core Development
- **[Architecture](Documentation/3-Developers/ARCHITECTURE.md)** - System architecture and modular structure
- **[Database](Documentation/3-Developers/DATABASE.md)** - Database rules and schema
- **[Testing](Documentation/3-Developers/TESTING.md)** - Puppeteer testing guide
- **[Amiga Emulation](Documentation/4-Door-Developers/AMIGA_EMULATION.md)** - AmigaOS docs and vAmiga sources

### Deployment & Operations
- **[Deployment](Documentation/2-Sysops/DEPLOYMENT.md)** - Production deployment guide

### Door Development
- **[Door Development](Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md)** - Complete door implementation guide

---

## Critical Rules Summary

### BBS Output Rules

**NO EMOJIS in BBS output:**
- Classic Amiga terminals cannot display emojis
- Use text symbols: `*` `X` `!` `-` `+` instead
- Console logs: Also no emojis (keeps logs clean)

**NO BOLD text styles:**
- ❌ DO NOT use `\x1b[1;XXm` or `[1;XXm`
- ✅ USE `\x1b[0;XXm` or `[XXm`
- Authentic AmiExpress didn't use bold

**Screen File Guidelines:**
- Use traditional Amiga ASCII art: `_`, `/`, `\`, `|`, `-`
- NO PC DOS box-drawing: `█`, `╔`, `═`, `╗`
- Keep within 80x24 dimensions
- Use `\r\n` line endings

### File Organization

**Documentation Location:**
- ALL new docs go in `Docs/` directory
- README.md and CLAUDE.md stay in root
- Exceptions: Config files stay in root

**Scripts Location:**
- ALL test scripts (.js files) go in `Scripts/` directory
- NEVER create test scripts in project root
- Examples: test-door.js, test-bbs-commands.js, etc.

**Task Completion Notifications:**

When completing major features:

1. **Discord Webhook:**
   ```bash
   curl -X POST "https://discord.com/api/webhooks/REDACTED/REDACTED" \
     -H "Content-Type: application/json" \
     -d '{"content": "**AmiExpress-Web Update**\n\n**Achievement:** <milestone>\n**Coverage:** <percentage>%\n**Changes:** <summary>"}'
   ```

2. **BBS Bulletins:**
   - Location: `backend/data/bbs/BBS/Conf01/Bulletins/`
   - Format: `YYYYMMDD_CHANGELOG.TXT`
   - Include technical details

### Main Menu Updates

**ALWAYS update main menu when implementing new commands:**

1. Main menu location: `backend/BBS/Screens/MENU.TXT`
2. Check express.e first - verify command doesn't exist
3. Custom commands - clearly mark them
4. Place in appropriate section (MESSAGES, FILES, CONFERENCE, SYSTEM)
5. Test in BBS to verify

---

## Implementation Details

### Screen Display Flow

The screen display system follows express.e lines 28555-28648:
1. BBSTITLE (on connect, no pause)
2. LOGON (after login, with pause)
3. BULL (system bulletins, with pause if shown)
4. NODE_BULL (node-specific bulletins, with pause if shown)
5. confScan (scanning for new messages)
6. CONF_BULL (conference bulletins, with pause if shown)
7. MENU (main menu, with pause if needed)

### State Machine

The BBS uses proper substates:
- `DISPLAY_BULL` - Shows BULL and NODE_BULL screens
- `DISPLAY_CONF_BULL` - Joins conference and shows CONF_BULL
- `DISPLAY_MENU` - Shows menu with respect to menuPause flag
- `READ_COMMAND` - Waits for line input
- `READ_SHORTCUTS` - Waits for hotkey input (expert mode)

---

## Additional Resources

For detailed information, see:
- `Docs/AMIGA_DOOR_IMPLEMENTATION_GUIDE.md` - Complete door implementation guide
- `Docs/TESTING_WITH_PUPPETEER.md` - Complete testing guide
- `backend/backend/MODULARIZATION_GUIDE.md` - Backend architecture details
- `Docs/CRITICAL_RULES.md` - vAmiga reference guidelines

---

**Remember:** When in doubt, check the E sources and reference documentation FIRST!
