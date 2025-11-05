# Amiga Development Reference

## 🚨 CRITICAL: ALWAYS Reference Amiga Developer Documentation

**WHEN working on door implementation, emulation, or Amiga-related code:**

### Local Documentation (PRIMARY SOURCE)

**Location:** `~/Code/amigadeveloperdocs/`

This is the complete ADCD 2.1 (Amiga Developer CD) documentation set - the authoritative source for ALL AmigaOS APIs.

**Comprehensive Implementation Guide:**
**📚 `~/Code/amiexpress-web/Docs/AMIGA_DOOR_IMPLEMENTATION_GUIDE.md`**

This 29KB guide contains:
- Complete function specifications with parameters and return values
- Critical implementation details and gotchas
- Common code patterns (door setup, message loops, cleanup)
- TypeScript/JavaScript emulation considerations
- Full reference paths to original documentation

**MANDATORY READING** before implementing ANY door-related code!

### Documentation Structure

**Key directories in `~/Code/amigadeveloperdocs/ADCD_2.1/`:**
- `Includes_and_Autodocs_3._guide/` - Library function autodocs (PRIMARY)
- `Libraries_Manual_guide/` - Conceptual overviews and tutorials
- `Devices_Manual_guide/` - Device driver documentation
- `Hardware_Manual_guide/` - Hardware reference

**Most critical autodoc files:**
- `node01D6.html` - exec.library index
- `node0378.html` - dos.library index
- `node062E.html` - MsgPort/Message structures
- `node028C.html` - Interprocess Communications overview

### Why This Matters

AmigaOS has specific, documented behavior for ALL library functions:
- **Message passing** - Zero-copy semantics, signal-based notification
- **Task signaling** - 32-bit flags (not counters), coalescing behavior
- **Memory management** - Alignment requirements, pool allocators
- **Port protocols** - Public vs private, Forbid/Permit critical sections

**These are NOT like modern OS APIs!** Reading the docs prevents:
- Wrong parameter types or register usage
- Incorrect return values
- Missing flags or special behaviors
- Misunderstanding message port protocols
- Signal vs message confusion
- Port pointer lifetime issues

### Before Implementing ANY Amiga Function

1. **Read the implementation guide** (`AMIGA_DOOR_IMPLEMENTATION_GUIDE.md`)
2. **Find the autodoc** in `~/Code/amigadeveloperdocs/ADCD_2.1/`
3. **Read the full specification** (parameters, returns, behavior, side effects)
4. **Check for gotchas** (documented in NOTES/BUGS sections)
5. **Implement EXACTLY as documented** - no assumptions!

### Quick Reference - Critical Functions

**Message Ports:**
- `CreateMsgPort()` - node01FC.html - Auto-allocates signal bit
- `DeleteMsgPort()` - node0200.html - Frees signal and port
- `FindPort()` - node0208.html - **MUST use Forbid/Permit!**
- `AddPort()` - node01E7.html - Makes port public
- `RemPort()` - node0233.html - Removes from public list

**Message Passing:**
- `PutMsg()` - node0226.html - Enqueues and signals
- `GetMsg()` - node0214.html - Non-blocking, **loop until NULL!**
- `ReplyMsg()` - node0235.html - Returns to sender
- `WaitPort()` - node0248.html - Blocks until message arrives

**Signals:**
- `AllocSignal()` - node01EA.html - Can FAIL if all 32 bits used
- `FreeSignal()` - node020B.html - Release bit for reuse
- `Signal()` - node023B.html - Flags coalesce (not counted)
- `Wait()` - node0247.html - Blocks and clears returned signals

**Memory:**
- `AllocMem()` - node01ED.html - Flags: MEMF_PUBLIC, MEMF_CLEAR, MEMF_CHIP
- `FreeMem()` - node020D.html - Must specify exact size
- `AllocVec()` - node01F0.html - Remembers size (V36+)
- `FreeVec()` - node020E.html - No size needed (V36+)

**ALWAYS reference the docs, NEVER guess!**

## vAmiga Sources Reference

**BEFORE implementing ANY Amiga emulation or door functionality, reference vAmiga sources!**

Key rule: **Don't guess. Don't try random fixes. Check vAmiga sources first.**

Location: `~/Code/amiexpress-web/Docs/vAmiga/`

vAmiga is a complete, working Amiga emulator that has ALL the answers for correct implementation.

**See `CRITICAL_RULES.md` for detailed guidelines on using vAmiga as reference.**

## Testing with Puppeteer

**NEVER use socket.io-client for testing the BBS - ALWAYS use Puppeteer!**

### Why Puppeteer?
- Properly simulates user interaction through browser
- Handles terminal rendering correctly
- Waits for screen updates naturally
- Consistent and reproducible
- Fast iteration - no manual typing

### Master Test Script

**Location**: `/test-ga-command.js` (root of project)

When testing ANY feature:
1. Copy `test-ga-command.js` to `test-[feature].js`
2. Modify the command being tested
3. Run: `node test-[feature].js`
4. Monitor logs: `tail -f /tmp/backend.log`

**See `/Docs/TESTING_WITH_PUPPETEER.md` for complete guide.**

### Correct Login Sequence

```javascript
// ANSI
await page.keyboard.type('A');
await page.keyboard.press('Enter');
await sleep(1000);

// Username
await page.keyboard.type('sysop');
await page.keyboard.press('Enter');
await sleep(1000);

// Password
await page.keyboard.type('sysop');
await page.keyboard.press('Enter');
await sleep(3000);

// First prompt
await page.keyboard.press('Enter');
await sleep(2000);

// Second prompt
await page.keyboard.press('Enter');
await sleep(2000);

// Wait for command prompt
await sleep(2000);

// NOW type commands
```

**Never try to use socket.io-client - it doesn't work correctly!**
