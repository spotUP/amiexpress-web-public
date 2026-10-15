# XIM Debugging Tools - Complete Reference

Comprehensive debugging toolkit for XIM protocol 68K door development.

## Quick Start

```bash
# Start servers (XIM logging auto-enabled)
./dev/scripts/start-servers.sh

# In another terminal - start live viewer
npm run xim:live
```

**Note:** XIM logging is now **enabled by default** - no need to set `XIM_DEBUG_JSON=1` manually!

## Complete Toolkit (14 Tools)

### 1. Real-Time Message Viewer (`xim:view` / `xim:live`)

**Purpose:** Watch XIM messages as they happen

**Usage:**
```bash
npm run xim:live                    # Live tail (MANDATORY for debugging)
npm run xim:view                    # Last 100 messages
npm run xim:view -- --door WHO      # Filter by door
npm run xim:view -- --errors        # Errors only
npm run xim:view -- --stats         # Show statistics
```

**When to use:**
- ALWAYS use this as first step when debugging
- Watch message flow in real-time
- Identify missing or unexpected messages
- See exact timing between messages

**Example Output:**
```
[12:45:01.234] → JH_INIT       | WHO           | N1 | p=123
[12:45:01.456] ← JH_SM         | WHO           | N1 | len=23 | "Welcome to WHO door"
[12:45:01.789] → JH_HK         | WHO           | N1 | p=65 | "A"
```

---

### 2. Message Decoder/Encoder (`xim:decode`)

**Purpose:** Decode hex messages and create test messages

**Usage:**
```bash
# Decode hex message
npm run xim:decode -- "00000001 00000000 00000017 48656c6c6f"

# Create message
npm run xim:decode -- --type JH_SM --data "Test message"
```

**When to use:**
- Understand unknown hex data in logs
- Verify message structure
- Create test messages for replay

**Output:**
```
╔═══════════════════════════════════════════════════════════════╗
║                    XIM Message Decoder                         ║
╚═══════════════════════════════════════════════════════════════╝

  Valid: ✓
  Type: JH_SM (0x00000001)
  Param: 0 (0x00000000)
  DataLen: 23 bytes
  Data (text): "Hello world from door"
```

---

### 3. Protocol Validator (`xim:validate`)

**Purpose:** Validate protocol compliance and detect issues

**Usage:**
```bash
npm run xim:validate                    # Validate all doors
npm run xim:validate -- --door WHO      # Validate specific door
npm run xim:validate -- --strict        # Strict mode
npm run xim:validate -- --fix           # Show fix suggestions
```

**When to use:**
- After implementing new door features
- When messages seem malformed
- To check protocol sequence correctness
- Before committing door changes

**Checks:**
- Message structure validation
- Protocol sequence correctness
- Response timing analysis
- Session completeness
- Data length consistency

**Example Issues Detected:**
```
[ERRORS]

• Door WHO received JH_INIT twice
  WHO (N1) at 12:45:03
  → JH_INIT
  Fix: Check if door is being restarted incorrectly.

[WARNINGS]

• Slow response: 2100ms for JH_HK
  WHO (N1) at 12:45:05
  ← JH_SM
```

---

### 4. Door State Monitor (`xim:monitor`)

**Purpose:** Real-time dashboard of all active door sessions

**Usage:**
```bash
npm run xim:monitor                     # 2s refresh
npm run xim:monitor -- --refresh 1      # 1s refresh
```

**When to use:**
- Monitor multiple concurrent door sessions
- Identify stuck or hung doors
- Watch door state transitions
- Track message throughput

**Display:**
```
╔═══════════════════════════════════════════════════════════════╗
║                   XIM Door State Monitor                       ║
╚═══════════════════════════════════════════════════════════════╝

  DOOR              NODE  STATE          UPTIME    MSGS    LAST ACTIVITY
  ─────────────────────────────────────────────────────────────────────
  WHO                 N1   ● running      1m 23s   15↑/12↓  2s ago
      ← JH_SM
  RTOP                N2   ◐ waiting      3m 45s   42↑/38↓  8s ago
      → JH_HK
  MultiTop            N3   ✗ error        45s      3↑/2↓    10s ago [2 ERR]
      ERROR
```

**States:**
- `●` running - Door actively processing messages
- `○` initializing - Door starting up
- `◐` waiting - No activity for >10s
- `✗` error - Error detected
- `◯` terminated - Door exited

---

### 5. Message Replay Tool (`xim:replay`)

**Purpose:** Send test XIM messages to doors

**Usage:**
```bash
# Send single message
npm run xim:replay -- --type JH_HK --param 65 --data "A" --door WHO

# Replay sequence from file
npm run xim:replay -- --sequence test-sequence.json

# Interactive mode
npm run xim:replay -- --interactive
```

**When to use:**
- Test door responses without manual input
- Reproduce specific message sequences
- Automate door testing
- Debug edge cases

**Sequence File Format:**
```json
{
  "door": "WHO",
  "node": 1,
  "description": "Test WHO door startup",
  "messages": [
    { "type": "JH_INIT", "param": 1, "delay": 0 },
    { "type": "JH_HK", "param": 13, "data": "\r", "delay": 1000 },
    { "type": "JH_HK", "param": 81, "data": "Q", "delay": 500 }
  ]
}
```

---

### 6. Message Flow Visualizer (`xim:flow`)

**Purpose:** Generate visual diagrams of message sequences

**Usage:**
```bash
npm run xim:flow                        # ASCII diagram
npm run xim:flow -- --door WHO          # Specific door
npm run xim:flow -- --format mermaid    # Mermaid format
npm run xim:flow -- --last 30           # Last 30 messages
```

**When to use:**
- Understand message flow chronology
- Identify protocol sequence issues
- Document door behavior
- Create debugging reports

**ASCII Output:**
```
  BACKEND                                  DOOR
  ───────────────────────────────────────────────────────

  12:45:01.234 JH_INIT (1)
           ────────────────────────────→

  12:45:01.456                     JH_SM "Welcome"
           ←────────────────────────────

  12:45:01.789 JH_HK (65) "A"
           ────────────────────────────→
```

**Mermaid Output:**
Copy output to https://mermaid.live/ for visual diagram.

---

### 7. Access Tracer (`xim:trace`)

**Purpose:** Trace file, library, and memory access from doors

**Usage:**
```bash
npm run xim:trace                           # All access types
npm run xim:trace -- --door WHO --type file # File access
npm run xim:trace -- --type library         # Library calls
npm run xim:trace -- --type memory          # Memory operations
npm run xim:trace -- --summary              # Summary only
```

**When to use:**
- Debug file access issues
- Track which libraries door uses
- Monitor memory allocation
- Identify access patterns

**Tracked Operations:**
- **Files:** Open, Read, Write, Close, Lock, Examine
- **Libraries:** OpenLibrary, CloseLibrary, FindPort, CreatePort
- **Memory:** AllocMem, FreeMem, CopyMem, Read32, Write32

**Output:**
```
  ACCESS TRACES
  ───────────────────────────────────────────────────────────

  WHO (23 traces)

    F [12:45:01] Open
       path: ~/Code/amiexpress-web/Conf1/Messages/MailStats

    L [12:45:01] OpenLibrary
       library: dos.library

    M [12:45:02] AllocMem
       value: 1024
```

---

### 8. Pattern Analyzer (`xim:analyze`)

**Purpose:** Automatic issue detection with pattern matching and confidence scoring

**Usage:**
```bash
npm run xim:analyze                     # Analyze all doors
npm run xim:analyze -- --door WHO       # Analyze specific door
npm run xim:analyze -- --verbose        # Show detailed analysis
```

**When to use:**
- After door session completes
- To automatically detect common issues
- When you need high-confidence diagnosis
- Before asking for help (run this first!)

**What it detects (10 patterns):**
1. GetMsg() infinite loop (95% confidence)
2. Protocol violations - JH_SM before JH_INIT (100% confidence)
3. Memory leaks - AllocMem without FreeMem (75% confidence)
4. Slow response times >2000ms (85% confidence)
5. Rapid-fire message loops (90% confidence)
6. Door crashes (90% confidence)
7. Buffer overruns - data length mismatch (95% confidence)
8. Missing JH_INIT (95% confidence)
9. No response pattern (80% confidence)
10. Incomplete session - no JH_TERMINATE (70% confidence)

**Output:**
```
╔═══════════════════════════════════════════════════════════════╗
║                    XIM Pattern Analyzer                        ║
╚═══════════════════════════════════════════════════════════════╝

  Door: WHO
  Log: logs/xim-debug.json

  Issues Found: 2

  ✗ [CRITICAL] GetMsg() infinite loop detected
     Confidence: 95%
     Pattern: GETMSG_LOOP

  ! [WARNING] Slow keystroke response times
     Confidence: 85%
     Pattern: SLOW_RESPONSE

  Run with --verbose for detailed output
```

**Integrated into:** `xim:debug` automatically runs analyzer

---

### 9. Smart Debugger (`xim:debug`)

**Purpose:** One-command orchestrated debugging workflow

**Usage:**
```bash
npm run xim:debug -- WHO                # Debug WHO door
npm run xim:debug -- RTW                # Debug RTW door
```

**When to use:**
- **PRIMARY DEBUGGING TOOL** - use this first!
- Need comprehensive automated analysis
- Want auto-generated report with fixes
- Testing new door implementation

**What it does:**
1. [1/5] Clears old logs for clean session
2. [2/5] Starts monitoring XIM messages
3. [3/5] Waits for you to run the door
4. [4/5] Analyzes session with pattern matcher
5. [5/5] Generates comprehensive report

**Output:**
```
╔═══════════════════════════════════════════════════════════════╗
║              XIM Smart Debugger - One Command                  ║
╚═══════════════════════════════════════════════════════════════╝

  Door: WHO
  Session: 2025-12-29T12:45:01.234Z

[1/5] Preparing clean debug session...
      ✓ Old logs cleared

[2/5] Starting live monitoring...
      ✓ Live viewer started
      ✓ Validator running
      ✓ State monitor active

[3/5] Waiting for door execution...
      Please run the door: WHO
      (Watching for XIM messages...)

  ✓ Door detected!
    Messages: 47
  ✓ Door session completed

[4/5] Analyzing session...
      ✓ Session analyzed

[5/5] Generating report...
      ✓ Report generated

╔═══════════════════════════════════════════════════════════════╗
║                      Debug Summary                             ║
╚═══════════════════════════════════════════════════════════════╝

  Door: WHO
  Messages: 47
  Status: ✓ COMPLETED

  Issues Found: 1

  ! [WARNING] Slow keystroke response times
    Confidence: 85%
    Fix: Optimize keystroke handler, avoid blocking I/O operations

  Full Report: logs/reports/xim-debug-WHO-2025-12-29T12-45-30-000Z.md

  Next Steps:
    - Review full report for details
    - Run validator: npm run xim:validate -- --door WHO
    - View messages: npm run xim:view -- --door WHO
```

**Report includes:**
- Session statistics
- Top 3 issues with confidence scores
- Evidence and suggested fixes
- Code examples
- Full message log reference

---

### 10. Session Diff (`xim:diff`)

**Purpose:** Compare two XIM debug sessions to identify differences

**Usage:**
```bash
# Compare two log files
npm run xim:diff -- logs/before.json logs/after.json

# Compare with filtering
npm run xim:diff -- session1.json session2.json --door WHO

# Show only changes
npm run xim:diff -- before.json after.json --changes-only

# Export to markdown
npm run xim:diff -- s1.json s2.json --output comparison.md
```

**When to use:**
- **Regression testing** - Compare working vs broken sessions
- **Code changes** - Verify impact of modifications
- **Performance analysis** - Identify timing regressions
- **Protocol debugging** - Ensure message sequence consistency

**What it compares:**
- Message sequences (missing, extra, changed)
- Message parameters and data
- Timing deltas (relative timing within sessions)
- Protocol sequence changes
- Performance differences

**Output:**
```
╔═══════════════════════════════════════════════════════════════╗
║                    XIM Session Diff                            ║
╚═══════════════════════════════════════════════════════════════╝

  Session 1:
    File: logs/before.json
    Door: WHO
    Messages: 47
    Duration: 2340ms

  Session 2:
    File: logs/after.json
    Door: WHO
    Messages: 45
    Duration: 2890ms

  Summary:
    ✗ Message count: 47 vs 45
    ✗ 2 missing messages
    ~ 3 changed messages
    ⓘ 5 timing differences (>100ms)

  Timing Analysis:
    Average delta: 45ms
    Max delta: 550ms
    Slowest (S1): JH_HK (120ms)
    Slowest (S2): JH_HK (670ms)

  Differences:

  - [12]
      Missing: JH_SM (receive)

  ~ [15]
      S1: JH_HK (send)
      S2: JH_HK (send)
          Param: 65 -> 81

  Δ [23]
      JH_SM timing delta: 550ms
```

**Use cases:**
- Before/after code change comparison
- Identify when door behavior changed
- Find performance regressions
- Verify bug fixes didn't break protocol
- Compare different door versions

---

### 11. Error Viewer (`xim:errors`)

**Purpose:** Show only errors and warnings

**Usage:**
```bash
npm run xim:errors                      # Errors only
npm run xim:errors -- --live            # Live error tail
```

**When to use:**
- Focus on problems
- Filter out noise
- Quick error check

---

### 12. Real Message Injection (`xim:replay:real`)

**Purpose:** Inject XIM messages into running doors for automated testing

**Usage:**
```bash
# List active door sessions
npm run xim:replay:real -- --list

# Send single keystroke
npm run xim:replay:real -- --type JH_HK --param 81 --data "Q" --door WHO

# Replay sequence from file
npm run xim:replay:real -- --sequence dev/scripts/test-sequences/test-who-door.json

# Interactive mode
npm run xim:replay:real -- --interactive
```

**When to use:**
- Automated door testing
- Regression testing
- Fuzzing for edge cases
- CI/CD integration
- Reproduce user input sequences

**Requirements:**
- Backend must be running
- NODE_ENV=development (security: dev mode only)
- Door must be actively running

**Example Test Sequence:**
```json
{
  "door": "WHO",
  "description": "Test WHO door - list users and quit",
  "messages": [
    { "type": "JH_HK", "param": 13, "data": "\r", "delay": 0 },
    { "type": "JH_HK", "param": 81, "data": "Q", "delay": 1000 }
  ]
}
```

**Security Note:** Message injection is ONLY enabled in development mode. Production builds cannot inject messages.

---

### 13. Session Recorder (`xim:record`)

**Purpose:** Record live XIM sessions with precise timing for later replay

**Usage:**
```bash
# Record WHO door until stopped
npm run xim:record -- --door WHO

# Record for 60 seconds
npm run xim:record -- --door WHO --duration 60

# Record to specific file
npm run xim:record -- --door WHO --output my-recording.json

# Record all doors (separate files)
npm run xim:record -- --all
```

**When to use:**
- Capture bug reproduction steps
- Build regression test library
- Record real user interaction patterns
- Create performance baselines
- Save working sessions for comparison

**Workflow:**
```bash
# 1. Start recording
npm run xim:record -- --door WHO

# 2. Use the door normally (browser/terminal)
# Recording captures all your input with precise timing

# 3. Stop recording (Ctrl+C)
# Saved to: recordings/WHO-2025-12-29-HHMMSS.json

# 4. Replay anytime
npm run xim:replay:real -- --sequence recordings/WHO-2025-12-29-HHMMSS.json
```

**Recording Format:**
- JSON format compatible with `xim:replay:real`
- Includes message timing (millisecond accuracy)
- Session metadata (door, duration, message count)
- Human-readable comments for each message
- Stored in: `dev/scripts/test-sequences/recordings/`

**Features:**
- Real-time capture from xim-debug.json
- Automatic filename generation with timestamps
- Recording status display
- Press Ctrl+C to stop and save
- Compatible with CI/CD testing

---

### 14. Performance Profiler (`xim:perf`)

**Purpose:** Analyze door performance and identify bottlenecks

**Usage:**
```bash
# Profile all doors
npm run xim:perf

# Profile specific door
npm run xim:perf -- --door WHO

# Compare two versions (baseline vs current)
npm run xim:perf -- --baseline recordings/WHO-v1.json --current recordings/WHO-v2.json

# Generate detailed report
npm run xim:perf -- --door WHO --report performance-report.md

# JSON output for CI/CD
npm run xim:perf -- --door WHO --json > performance.json
```

**When to use:**
- Identify performance bottlenecks
- Measure door execution time
- Track message throughput
- Find slow operations
- Compare performance before/after optimizations
- Establish performance baselines
- CI/CD performance testing

**Metrics tracked:**
- Total execution time
- Message throughput (messages/second)
- Average/max/min response times
- Slowest operations (top 10)
- Time distribution by message type
- Performance comparison (baseline vs current)

**Output:**
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

**Comparison mode:**
```bash
npm run xim:perf -- --baseline recordings/WHO-v1.json --current recordings/WHO-v2.json
```

Shows performance delta:
- Total Duration: 12.45s → 10.23s (-2.22s, -17.8%) ↓
- Throughput: 12.53 msg/sec → 15.24 msg/sec (+2.71, +21.6%) ↑
- Avg Response Time: 78.23ms → 63.45ms (-14.78ms, -18.9%) ↓

**Report generation:**
- Markdown reports for documentation
- JSON export for automation
- ASCII graphs and charts
- Bottleneck identification
- Optimization recommendations

---

## Debugging Workflow

### **PRIMARY: Automated Smart Debugger (RECOMMENDED)**

**Use this for 90% of debugging tasks:**

```bash
# Start backend
./dev/scripts/start-servers.sh

# In another terminal - run smart debugger
npm run xim:debug -- DOORNAME

# Then run the door when prompted
# Debugger auto-generates report with issues + fixes
```

**Benefits:**
- Zero manual steps
- Automatic pattern detection (10 patterns)
- Confidence-scored issues
- Code examples for fixes
- Comprehensive report generated

---

### **ALTERNATIVE: Manual Step-by-Step (when you need control)**

1. **Enable logging and start viewer:**
   ```bash
   ./dev/scripts/start-servers.sh  # XIM logging auto-enabled
   # In another terminal:
   npm run xim:live
   ```

2. **Reproduce the issue** - Watch messages in real-time

3. **Analyze with pattern matcher:**
   ```bash
   npm run xim:analyze -- --door PROBLEMATIC --verbose
   ```

4. **Validate protocol:**
   ```bash
   npm run xim:validate -- --door PROBLEMATIC --fix
   ```

5. **Visualize flow:**
   ```bash
   npm run xim:flow -- --door PROBLEMATIC
   ```

6. **Check state:**
   ```bash
   npm run xim:monitor
   ```

7. **Trace access (if needed):**
   ```bash
   npm run xim:trace -- --door PROBLEMATIC
   ```

### Common Scenarios

**Door not responding:**
```bash
# Watch messages
npm run xim:live

# Check state
npm run xim:monitor

# Validate
npm run xim:validate -- --door WHO
```

**Garbled output:**
```bash
# View messages
npm run xim:view -- --door WHO --last 50

# Decode suspicious hex
npm run xim:decode -- "00000001..."

# Validate structure
npm run xim:validate -- --door WHO --strict
```

**Protocol errors:**
```bash
# See errors
npm run xim:errors

# Validate protocol
npm run xim:validate -- --fix

# Visualize flow
npm run xim:flow -- --door WHO
```

**Performance issues:**
```bash
# Monitor state
npm run xim:monitor

# Validate timing
npm run xim:validate -- --strict

# Trace access patterns
npm run xim:trace -- --summary
```

---

## Environment Variables

```bash
XIM_DEBUG_JSON=1        # Enable structured JSON logging (REQUIRED)
XIM_LOG_FILE=path       # Custom log file path (default: logs/xim-debug.json)
```

---

## Log File Format

Structured JSON - one message per line:

```json
{
  "timestamp": "2025-12-29T12:45:01.234Z",
  "level": "debug",
  "direction": "send",
  "door": "WHO",
  "node": 1,
  "message": {
    "type": "JH_INIT",
    "typeCode": 0,
    "param": 123,
    "dataLen": 0
  },
  "port": "AEDoorRP"
}
```

Query with `jq`:
```bash
# All JH_INIT messages
jq 'select(.message.type == "JH_INIT")' logs/xim-debug.json

# Count by type
jq -r '.message.type' logs/xim-debug.json | sort | uniq -c

# Messages for specific door
jq 'select(.door == "WHO")' logs/xim-debug.json
```

---

## XIM Protocol Message Types

| Type | Code | Direction | Description |
|------|------|-----------|-------------|
| JH_INIT | 0 | Backend → Door | Initialize door with node/user info |
| JH_SM | 1 | Door → Backend | Send message (text to display) |
| JH_STAT | 2 | Backend → Door | Status request |
| JH_TERMINATE | 3 | Backend → Door | Terminate door |
| JH_HK | 4 | Backend → Door | Hot key (keystroke from user) |
| JH_GNS | 5 | Door → Backend | Get next string from user |
| JH_PROMPT | 6 | Door → Backend | Show prompt |
| JH_MORE | 7 | Door → Backend | More prompt |
| JH_REQUEST | 8 | Door → Backend | Request data |
| JH_IGNORE | 9 | Door → Backend | Ignore input |
| JH_SMPTR | 10 | Door → Backend | Send message pointer |

---

## Tips & Best Practices

### 1. Always Use Live Mode During Development

```bash
npm run xim:live
```

See messages as they happen. Catch errors immediately.

### 2. Validate Early and Often

```bash
npm run xim:validate
```

Run after every significant door change.

### 3. Compare Working vs Broken

```bash
# Working door
npm run xim:view -- --door WORKING > working.log

# Broken door
npm run xim:view -- --door BROKEN > broken.log

# Compare
diff working.log broken.log
```

### 4. Use Monitor for Multi-Door Sessions

```bash
npm run xim:monitor
```

See all active doors at once.

### 5. Decode Unknown Messages

```bash
npm run xim:decode -- "<hex from log>"
```

Understand what door is trying to send.

### 6. Visualize Complex Flows

```bash
npm run xim:flow -- --door COMPLEX --format mermaid
```

Generate diagrams for documentation.

### 7. Focus on Errors First

```bash
npm run xim:errors -- --live
```

Fix errors before investigating warnings.

---

## Documentation

- **Claude Protocol:** `Documentation/3-Developers/CLAUDE_68K_DEBUGGING_PROTOCOL.md`
- **User Guide:** `Documentation/4-Door-Developers/XIM_DEBUGGING_GUIDE.md`
- **Door Development:** `Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md`

---

## Remember

**NEVER debug blind.**

**PRIMARY WORKFLOW:**
1. `npm run xim:debug -- DOORNAME` → **START HERE** - Full automated debugging
2. Review auto-generated report with issues + fixes
3. Use specific tools if needed

**DETAILED TOOLS (when needed):**
1. `npm run xim:live` → See what's happening in real-time
2. `npm run xim:analyze` → Pattern-based issue detection (10 patterns)
3. `npm run xim:diff` → Compare sessions (regression testing)
4. `npm run xim:validate` → Check protocol compliance
5. `npm run xim:monitor` → Watch door state
6. `npm run xim:decode` → Understand messages
7. `npm run xim:flow` → Visualize sequence
8. `npm run xim:replay:real` → Automated testing (inject messages)
9. `npm run xim:record` → Record sessions for replay
10. `npm run xim:perf` → Performance profiling and bottleneck analysis

**SEE first, FIX second.**

The tools show you EXACTLY what's happening. Use them.
