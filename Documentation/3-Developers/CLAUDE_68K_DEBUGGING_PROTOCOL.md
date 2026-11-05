# Claude's 68K Door Debugging Protocol

**MANDATORY WORKFLOW FOR DEBUGGING 68K DOORS**

This document tells YOU (Claude) exactly how to debug 68K doors. Follow this protocol EVERY TIME.

---

## Rule #1: ALWAYS Use XIM Debugging Tools FIRST

**NEVER** start debugging a 68K door by guessing or reading code.

**ALWAYS** start with the XIM debugging tools.

---

## PRIMARY WORKFLOW: Smart Debugger (Use This First)

**For 90% of debugging tasks, use the automated smart debugger:**

### Step 1: Start Servers

```bash
./dev/scripts/start-servers.sh
```

**Note:** XIM logging is **enabled by default**.

### Step 2: Run Smart Debugger

In another terminal:
```bash
npm run xim:debug -- DOORNAME
```

Replace `DOORNAME` with the actual door (e.g., `WHO`, `RTW`, `MultiTop`).

### Step 3: Run the Door

When prompted by the debugger, run the door. The debugger will:
- Monitor all XIM messages automatically
- Detect common issues with 10 pattern matchers
- Generate comprehensive report with:
  - Issues found (with confidence scores 0-100%)
  - Evidence for each issue
  - Suggested fixes
  - Code examples
  - Full message log reference

### Step 4: Review Report

The debugger saves a report to `logs/reports/xim-debug-DOORNAME-{timestamp}.md`.

Review the top 3 issues shown in the summary. Each includes:
- Severity (critical/warning/info)
- Confidence score (how certain we are)
- Evidence (what was observed)
- Suggested fix (what to do)
- Code example (how to implement)

**This approach:**
- ✅ Zero manual steps
- ✅ Automatic pattern detection
- ✅ Confidence-scored issues
- ✅ Code examples for fixes
- ✅ Comprehensive reporting

---

## ALTERNATIVE: Manual Step-by-Step Workflow

**Use this when you need fine control or want to learn the message flow in detail:**

### Step 1: Start Live Viewer

In a second terminal:
```bash
npm run xim:live
```

### Step 2: Reproduce the Issue

Run the door and watch the live viewer. You will SEE:
- Every message sent/received
- Exact timing
- Data content
- Errors and warnings

### Step 3: Analyze with Pattern Matcher

After door completes:
```bash
npm run xim:analyze -- --door DOORNAME --verbose
```

This runs 10 automated pattern matchers:
1. GetMsg() infinite loop (95% confidence)
2. Protocol violations (100% confidence)
3. Memory leaks (75% confidence)
4. Slow response times (85% confidence)
5. Rapid-fire loops (90% confidence)
6. Door crashes (90% confidence)
7. Buffer overruns (95% confidence)
8. Missing JH_INIT (95% confidence)
9. No response pattern (80% confidence)
10. Incomplete sessions (70% confidence)

### Step 4: Use Specific Tools as Needed

- **Validate protocol:** `npm run xim:validate -- --door DOORNAME`
- **Visualize flow:** `npm run xim:flow -- --door DOORNAME`
- **Monitor state:** `npm run xim:monitor`
- **Trace access:** `npm run xim:trace -- --door DOORNAME`

### Step 5: Analyze the Message Flow Manually

Look for:
- **Missing messages**: Door expects JH_INIT but never receives it
- **Wrong sequence**: Door sends JH_SM before JH_INIT
- **Timeouts**: Long gaps between messages
- **Malformed data**: Unexpected parameters or corrupt data
- **Protocol violations**: Invalid message types

---

## Common Scenarios & Solutions

### Scenario 1: Door Starts But Shows No Output

**What you'll see in `npm run xim:live`:**
```
[12:45:01.234] → JH_INIT       | WHO           | N1 | p=123
[12:45:01.456] (nothing else)
```

**Diagnosis:** Door received JH_INIT but didn't respond

**What to check:**
1. Did door create reply port? → Check logs for "door reply port"
2. Did door crash? → Check `logs/door-68k-WHO-*.log` for errors
3. Is door stuck in loop? → Look for timeout messages

**How to fix:**
- Read the door-specific log: `tail -50 logs/door-68k-WHO-*.log`
- Check for crash/illegal instruction
- Verify door entered message loop

### Scenario 2: Keys Don't Work

**What you'll see:**
```
[12:45:01.234] → JH_INIT       | WHO           | N1 | p=123
[12:45:01.456] ← JH_SM         | WHO           | N1 | "Welcome"
[12:45:02.789] → JH_HK         | WHO           | N1 | p=65 | "A"
[12:45:02.789] (no response)
```

**Diagnosis:** Door received keystroke but didn't respond

**What to check:**
1. Is door processing JH_HK messages?
2. Is door stuck in GetMsg() loop?
3. Did door crash on keystroke?

**How to fix:**
- Filter by door: `npm run xim:view -- --door WHO --last 100`
- Look for pattern: Is it ALL keys or specific keys?
- Check if door sends ANY response or none

### Scenario 3: Garbled Output

**What you'll see:**
```
[12:45:01.234] ← JH_SM         | WHO           | N1 | "\x00\x00\xFFInvalid..."
```

**Diagnosis:** Door sending corrupt data

**What to check:**
1. Decode the hex: `npm run xim:decode -- "<hex from log>"`
2. Check data length vs actual data
3. Look for buffer overrun

**How to fix:**
- Use decoder to understand what door is actually sending
- Check if door is writing past buffer boundaries
- Verify string null-termination

### Scenario 4: Door Hangs/Timeout

**What you'll see:**
```
[12:45:01.234] → JH_HK         | WHO           | N1 | p=65
[12:45:06.789] ⚠ TIMEOUT      | WHO           | N1 | No response for 5555ms
```

**Diagnosis:** Door stopped responding

**What to check:**
1. What was the last message sent TO door?
2. What was the last message FROM door?
3. Is door waiting on WaitPort() indefinitely?

**How to fix:**
- View timeline: `npm run xim:view -- --door WHO --stats`
- Check if door is in infinite loop
- Verify door didn't crash silently

### Scenario 5: Protocol Errors

**What you'll see:**
```
[12:45:01.234] [ERROR] Invalid message type: 0xDEADBEEF
[12:45:01.456] [WARN] Malformed XIM header
```

**Diagnosis:** Door sending invalid protocol messages

**What to check:**
1. Is door using correct endianness (big-endian)?
2. Is message structure correct?
3. Is door writing to wrong memory addresses?

**How to fix:**
- Decode suspicious messages
- Verify door is writing XIM message struct correctly
- Check for memory corruption

---

## Your Debugging Workflow

### 1. OBSERVATION (Use Tools)

```bash
# Start viewer
npm run xim:live

# Filter to problematic door
npm run xim:view -- --door PROBLEMATIC --errors

# Show statistics
npm run xim:view -- --door PROBLEMATIC --stats
```

**DO THIS FIRST.** Don't guess!

### 2. ANALYSIS (What's Wrong?)

Look at the message timeline and identify:
- Where does communication break down?
- What's the last successful message?
- What message was expected but never came?
- Are there any error messages?

### 3. HYPOTHESIS (Why Is It Wrong?)

Based on what you observed, form a hypothesis:
- "Door never responds to JH_INIT" → Likely door crashed on startup
- "Door stops after first JH_HK" → Likely door can't handle keystrokes
- "Messages are garbled" → Likely memory corruption or wrong encoding

### 4. VERIFICATION (Test Your Hypothesis)

Check the hypothesis:
- Read door-specific logs
- Decode suspicious messages
- Check backend logs for errors
- Review relevant door code

### 5. FIX (Implement Solution)

Make the fix based on your findings.

### 6. VERIFY (Test Again)

Run the door again with `npm run xim:live` and verify:
- Message flow is correct
- No errors appear
- Door responds as expected

---

## Complete Tool Reference

### 1. Viewing Messages (`npm run xim:view`, `npm run xim:live`)

```bash
# Live tail (ALWAYS use this during development)
npm run xim:live

# Last 100 messages
npm run xim:view

# Filter by door
npm run xim:view -- --door WHO

# Filter by node
npm run xim:view -- --node 1

# Errors only
npm run xim:errors

# With statistics
npm run xim:view -- --stats

# Custom log file
npm run xim:view -- --file /path/to/log.json
```

### 2. Decoding Messages (`npm run xim:decode`)

```bash
# Decode hex message
npm run xim:decode -- "00000001 00000000 00000017 48656c6c6f"

# Create test message
npm run xim:decode -- --type JH_INIT --param 123

# Create message with data
npm run xim:decode -- --type JH_SM --data "Test message"
```

### 3. Validating Protocol (`npm run xim:validate`)

```bash
# Validate all doors
npm run xim:validate

# Validate specific door
npm run xim:validate -- --door WHO

# Strict mode (fail on warnings)
npm run xim:validate -- --strict

# Show fix suggestions
npm run xim:validate -- --fix
```

**Use this to:**
- Detect malformed messages
- Verify protocol sequences
- Find timing issues
- Check session completeness

### 4. Monitoring Door State (`npm run xim:monitor`)

```bash
# Monitor with 2s refresh
npm run xim:monitor

# Faster 1s refresh
npm run xim:monitor -- --refresh 1
```

**Use this to:**
- Watch all active door sessions in real-time
- See current state (initializing, running, waiting, error, terminated)
- Track message counts
- Identify stuck or hung doors

### 5. Real Message Injection (`npm run xim:replay:real`)

**IMPORTANT:** This tool injects REAL messages into RUNNING door sessions. Development mode only.

```bash
# List active door sessions
npm run xim:replay:real -- --list

# Send single keystroke to running door
npm run xim:replay:real -- --type JH_HK --param 81 --data "Q" --door WHO

# Replay sequence to running door
npm run xim:replay:real -- --sequence test-sequences/test-who-door.json

# Interactive mode
npm run xim:replay:real -- --interactive
```

**Use this to:**
- Automated door testing
- Regression testing
- Fuzzing for edge cases
- Reproduce user input sequences
- CI/CD integration

**Requirements:**
- Backend must be running
- NODE_ENV=development (security: dev mode only)
- Door must be actively running on a node

### 6. Recording Sessions (`npm run xim:record`)

**Capture live sessions with precise timing for replay:**

```bash
# Record WHO door until stopped (Ctrl+C)
npm run xim:record -- --door WHO

# Record for 60 seconds
npm run xim:record -- --door WHO --duration 60

# Record to specific file
npm run xim:record -- --door WHO --output recordings/WHO-baseline.json

# Record all doors (separate files)
npm run xim:record -- --all
```

**Use this to:**
- Capture bug reproduction steps
- Build regression test library
- Record real user interaction patterns
- Create performance baselines
- Save working sessions for comparison

**Workflow:**
1. Start recording with `xim:record`
2. Use door normally (browser/terminal)
3. Press Ctrl+C to stop and save
4. Replay with `xim:replay:real --sequence recordings/{file}.json`

**Recording format:**
- JSON compatible with `xim:replay:real`
- Precise timing (millisecond accuracy)
- Session metadata (door, duration, message count)
- Human-readable comments
- Stored in: `dev/scripts/test-sequences/recordings/`

### 7. Performance Profiler (`npm run xim:perf`)

**Analyze door performance and identify bottlenecks:**

```bash
# Profile all doors
npm run xim:perf

# Profile specific door
npm run xim:perf -- --door WHO

# Compare two versions (baseline vs current)
npm run xim:perf -- --baseline recordings/WHO-v1.json --current recordings/WHO-v2.json

# Generate detailed markdown report
npm run xim:perf -- --door WHO --report performance-report.md

# JSON output for CI/CD
npm run xim:perf -- --door WHO --json > performance.json
```

**Use this to:**
- Identify performance bottlenecks
- Measure door execution time
- Track message throughput
- Find slow operations
- Compare performance before/after optimizations
- Establish performance baselines

**Metrics tracked:**
- Total execution time
- Message throughput (messages/second)
- Average/max/min response times
- Slowest operations (top 10)
- Time distribution by message type
- Performance comparison (baseline vs current)

**Output example:**
```
Performance Summary:
  Door: WHO
  Total Duration: 12.45s
  Messages: 156
  Throughput: 12.53 msg/sec

Response Times:
  Average: 78.23ms
  Maximum: 245.67ms
  Minimum: 12.34ms

Top 10 Slowest Operations:
  1. JH_GNS - 245.67ms
  2. JH_SM - 189.23ms
  3. JH_HK - 134.56ms
```

### 8. Old Replay Tool (`npm run xim:replay`)

**NOTE:** Use `xim:replay:real` for automated testing. This tool is for manual testing only.

```bash
# Send single message
npm run xim:replay -- --type JH_HK --param 65 --data "A" --door WHO

# Replay sequence from file
npm run xim:replay -- --sequence test-sequence.json

# Interactive mode
npm run xim:replay -- --interactive
```

### 9. Visualizing Flow (`npm run xim:flow`)

```bash
# ASCII diagram
npm run xim:flow

# Specific door only
npm run xim:flow -- --door WHO

# Mermaid diagram format
npm run xim:flow -- --format mermaid

# Last 30 messages
npm run xim:flow -- --last 30
```

**Use this to:**
- See message sequence visually
- Understand protocol flow
- Identify missing or out-of-order messages
- Generate diagrams for documentation

### 10. Tracing Access (`npm run xim:trace`)

```bash
# Trace all access types
npm run xim:trace

# File access for specific door
npm run xim:trace -- --door WHO --type file

# Library access only
npm run xim:trace -- --type library

# Memory operations only
npm run xim:trace -- --type memory

# Summary only
npm run xim:trace -- --summary
```

**Use this to:**
- Track file operations (Open, Read, Write, Close)
- Monitor library calls (OpenLibrary, FindPort)
- Watch memory access (AllocMem, FreeMem)
- Identify access patterns

### 10. Querying JSON Logs (jq)

```bash
# All JH_INIT messages
jq 'select(.message.type == "JH_INIT")' logs/xim-debug.json

# Count by type
jq -r '.message.type' logs/xim-debug.json | sort | uniq -c

# Find errors
jq 'select(.level == "error")' logs/xim-debug.json

# Messages for specific door
jq 'select(.door == "WHO")' logs/xim-debug.json

# Last 10 messages
tail -10 logs/xim-debug.json | jq '.'

# Messages between timestamps
jq 'select(.timestamp >= "2025-12-29T12:45:00" and .timestamp <= "2025-12-29T12:46:00")' logs/xim-debug.json
```

---

## Environment Variables

```bash
# Enable structured JSON logging (ALWAYS SET THIS)
export XIM_DEBUG_JSON=1

# Custom log file location (optional)
export XIM_LOG_FILE=/custom/path/xim-debug.json

# Legacy console logging (don't use, JSON is better)
export XIM_DEBUG=1
```

---

## Tips for Effective Debugging

### 1. Always Start Fresh

```bash
# Clear old log
rm logs/xim-debug.json

# Start fresh session
export XIM_DEBUG_JSON=1
npm run xim:live
```

### 2. Compare Working vs Broken

```bash
# Working door
npm run xim:view -- --door WORKING > working.log

# Broken door
npm run xim:view -- --door BROKEN > broken.log

# Compare
diff working.log broken.log
```

### 3. Focus on Errors First

```bash
npm run xim:errors -- --live
```

This shows ONLY errors and warnings. Fix these first.

### 4. Watch Message Sequence

XIM protocol has expected sequences:

**Normal startup:**
```
→ JH_INIT       (backend sends)
← JH_SM         (door acknowledges)
→ JH_HK         (user presses key)
← JH_SM         (door responds)
...
→ JH_TERMINATE  (backend closes)
```

If your door doesn't follow this, that's the bug.

### 5. Use Statistics

```bash
npm run xim:view -- --door WHO --stats
```

See which messages are most common. If door sends 1000x JH_SM but never responds to JH_HK, that's your clue.

### 6. Decode Unknown Messages

If you see weird hex in logs:
```bash
npm run xim:decode -- "<that hex>"
```

Understand what the door is actually trying to send.

---

## When XIM Tools Aren't Enough

If XIM logging doesn't show the problem, escalate to:

1. **Door-specific logs**: `logs/door-68k-DOORNAME-*.log`
2. **Backend logs**: `logs/backend.log` (search for door name)
3. **CPU trace logs**: If DOOR_TRACE_FIRST_PC_COUNT is set
4. **Memory dumps**: Check for crashes/illegal instructions

But 90% of the time, XIM logging will show you exactly what's wrong.

---

## Example Debug Session

**Problem**: WHO door doesn't show output

**Step 1: Enable logging**
```bash
export XIM_DEBUG_JSON=1
./dev/scripts/start-servers.sh
```

**Step 2: Start viewer**
```bash
npm run xim:live
```

**Step 3: Run door**
User types: `WHO`

**Step 4: Observe**
Viewer shows:
```
[12:45:01.234] → JH_INIT       | WHO           | N1 | p=123
```

Only one message! Door never responded.

**Step 5: Analyze**
Door received JH_INIT but didn't send JH_SM back.

**Step 6: Check door log**
```bash
tail -50 logs/door-68k-WHO-*.log
```

Found: `Illegal instruction at 0x1234`

**Step 7: Hypothesis**
Door crashed on startup due to illegal instruction.

**Step 8: Fix**
Investigate why illegal instruction occurred (probably wrong code execution or missing library function).

**Step 9: Verify**
Run WHO again, see:
```
[12:45:01.234] → JH_INIT       | WHO           | N1 | p=123
[12:45:01.456] ← JH_SM         | WHO           | N1 | "Users online: 1"
```

Success! Door now responds.

---

## Remember

**NEVER debug blind.**

**ALWAYS use the tools:**
1. `npm run xim:live` → See what's happening
2. `npm run xim:decode` → Understand messages
3. `jq` queries → Find patterns

**SEE first, FIX second.**

The tools show you EXACTLY what's happening. Use them.

---

## Merged from 68K Door Emulation Debugging Workflow

### Philosophy

1. **NEVER blame MOIRA** - The CPU emulator is battle-tested and correct
2. **Use vamos as ground truth** - If it works in vamos, bug is in YOUR code
3. **Test incrementally** - Fix one thing at a time, verify with multiple doors
4. **Document findings** - Keep this file updated with what you learn


### Toolchain

#### Essential Tools

```bash
# Install amitools (includes vamos)
pip3 install amitools

# Verify installation
vamos --version
vda68k --version  # Disassembler
```

#### Test Script
```bash
./dev/scripts/test-68k-library-functions.sh
```


### Testing Strategy

#### Level 1: Vamos Baseline

**For ANY door that fails in your emulator:**

```bash
# Run in vamos (ground truth)
vamos Doors/who/who

# With detailed logging
vamos --log-file=/tmp/vamos-who.log --log-level=debug Doors/who/who

# Check exit code
echo $?  # Should be 0 for success
```

**If it fails in vamos → door is broken, not emulator**
**If it works in vamos → bug is in YOUR emulator**

#### Level 2: Minimal Test Cases

Start with simplest possible doors:

1. **WHO** - Minimal dos.library usage, just file open/read
2. **Bulls** - Simple file operations
3. **MultiTop** - More complex, uses DateStamp, file ops
4. **Diagnostic** - Complex, many library calls (test last)

#### Level 3: Execution Trace Comparison

```bash
# 1. Get vamos trace
vamos --log-file=/tmp/vamos-trace.log Doors/who/who

# 2. Run in your emulator, get door log
# Logs are in: logs/door-68k-{DOORNAME}-{TIMESTAMP}.-N{NODE}.log

# 3. Compare side-by-side
# Look for first divergence point
```


### Common Issues to Check

#### 1. ROM Loading

**Verify** (check backend.log on startup):
```
[ROM] Loading Kickstart ROM from: /path/to/Kickstart v3.1...
[ROM] Kickstart 3.1 loaded successfully
[ROM] Mapped to memory range: 0xF80000 - 0xFFFFFF
```

**Test**:
- ROM should be 512KB (524288 bytes)
- Mapped at 0xF80000-0xFFFFFF
- Library vectors should point into ROM range

#### 2. Library Base Addresses

**Check** DosLibrary.ts, ExecLibrary.ts initialization:
```typescript
// dos.library base should be set correctly
// exec.library base at 0x4 (SysBase)
```

**Verify in logs**:
```
[dos.library] Initialized at base 0x...
[exec.library] SysBase at 0x00000004
```

#### 3. LVO Offsets

**CRITICAL**: Library Vector Offsets must match NDK exactly

Use MCP to verify:
```
mcp__amiexpress-docs__search_ndk_autodocs "Open"
mcp__amiexpress-docs__search_ndk_autodocs "Read"
```

**Check LibraryTraps.ts** - Are offsets correct?

Common mistakes:
- PrintFault was at -396, should be -474 ✓ (FIXED)
- SetFileDate should be at -396 ✓ (FIXED)

#### 4. Function Implementations

**For each dos.library function:**

1. Does it read parameters correctly? (D1, D2, D3, A0, A1...)
2. Does it set return value correctly? (D0)
3. Does it set lastError correctly?
4. Does it handle NULL/error cases?

**Example check:**
```typescript
// SetFileDate(namePtr: D1, datePtr: D2): BOOL D0
SetFileDate(): void {
  const namePtr = this.emulator.getRegister(CPURegister.D1);  // ✓
  const datePtr = this.emulator.getRegister(CPURegister.D2);  // ✓

  // ... do work ...

  this.emulator.setRegister(CPURegister.D0, -1);  // Success = -1 (TRUE)
  this.lastError = this.ERROR_NO_ERROR;  // ✓
}
```

#### 5. Memory Layout

**Check stack, heap, segment placement:**

From door logs:
```
[HUNK] Segment 0: CODE at 0x1008, size=11908 bytes
[HUNK] Segment 1: DATA at 0x3f08, size=1472 bytes
[INFO] Entry point: 0x1008
[CPU] PC=0x1008 ... SP=0x64dc A4=0xbf06
```

**Verify**:
- Code segment in low memory ✓
- Data segment after code ✓
- Stack pointer reasonable (0x6000-0x7000 range) ✓
- No overlaps ✓

#### 6. Trapped vs Native Functions

**CRITICAL RULE**: Only trap when absolutely necessary

**From CLAUDE.md**:
- dos.library → Native 68K from ROM (DON'T trap)
- exec.library → Native 68K from ROM (DON'T trap)
- AEDoor.library → Native binary from ./Libs/AEDoor.library
- ONLY trap: PutMsg/GetMsg (BBS communication), utility functions

**Check LibraryTraps.ts**:
- Are you trapping functions that should execute natively?
- Remove unnecessary traps and let ROM handle them


### Debugging Specific Issues

#### RawDoFmt Callback Timeout

**Symptom**: "RawDoFmt putch callback did not return within 1000 steps"

**Cause**: maxSteps = 1000 too low for some callbacks

**Fix**:
```typescript
// ExecLibrary.ts line 4917
const maxSteps = 10000;  // Increase from 1000
```

**Verify**: Callback should complete and return to stub

#### Stack Region False Positive

**Symptom**: Door exits immediately, logs say "PC reached stack region"

**Cause**: Overly aggressive check treating valid stack trampolines as exit

**Fix**: Already disabled in DoorLifecycleManager.ts ✓

#### File Not Found Errors

**Symptom**: Door can't find files that exist

**Check**:
1. Amiga assigns (BBS:, Doors:, Node1:) set correctly?
2. Path resolution working? (case-insensitive on Amiga)
3. Using amigafs module for file ops?

**Debug**:
```bash
# Check door logs for file operations
grep "Open.*ami=" logs/door-68k-{DOORNAME}*.log
```


### Success Criteria

A door is "working" when:

1. ✓ Loads and executes (doesn't crash)
2. ✓ Produces same output as vamos
3. ✓ Returns same exit code as vamos
4. ✓ File operations succeed
5. ✓ Date/time functions work
6. ✓ No timeout warnings in logs


### Current Status

#### Working Doors
- ByteKillHandler ✓ (see logs, completes successfully)
- WHO ✓ (needs verification)
- Bulls ✓ (needs verification)

#### Broken Doors
- Diagnostic (RawDoFmt timeout, SetFileDate issues)
- AquaScan (needs testing)
- MultiTop (needs testing)

#### Known Issues
1. RawDoFmt callback maxSteps too low (1000 → 10000)
2. SetFileDate stubbed out (needs proper implementation)
3. Some doors may be calling functions that aren't in ROM


### Next Steps

1. **Immediate**: Test WHO door in both vamos and emulator, compare output
2. **Short-term**: Fix RawDoFmt maxSteps, test diagnostic again
3. **Medium-term**: Create minimal test doors for each library function
4. **Long-term**: Comprehensive regression suite


### Resources

- **NDK AutoDocs**: `mcp__amiexpress-docs__search_ndk_autodocs "<function>"`
- **Vamos source**: `dev/docs/amitools/amitools/vamos/`
- **LVO offsets**: `https://github.com/deplinenoise/amiga-sdk/blob/master/sdkinclude/lvo/dos_lib.i`
- **Door logs**: `logs/door-68k-*.log`
- **XIM debug**: Set `XIM_DEBUG=1` for protocol logs


### Template: Debugging a New Issue

```bash
# 1. Reproduce the issue
./dev/scripts/start-servers.sh
# Run door, note error

# 2. Test in vamos
vamos Doors/{DOORNAME}/{binary}
# Does it work? If yes → bug is in YOUR emulator

# 3. Get execution trace
vamos --log-file=/tmp/vamos.log Doors/{DOORNAME}/{binary}

# 4. Get emulator trace
# Check: logs/door-68k-{DOORNAME}-{TIMESTAMP}.-N*.log

# 5. Compare traces
# Find first divergence point

# 6. Identify root cause
# - Missing function implementation?
# - Wrong LVO offset?
# - Incorrect parameter handling?
# - Memory layout issue?

# 7. Fix and verify
# - Make minimal fix
# - Test with multiple doors
# - Document in this file
```
