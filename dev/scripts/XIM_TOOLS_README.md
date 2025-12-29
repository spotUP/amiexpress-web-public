# XIM Debugging Tools - Complete Reference

Comprehensive debugging toolkit for XIM protocol 68K door development.

## Quick Start

```bash
# Enable structured logging
export XIM_DEBUG_JSON=1
./dev/scripts/start-servers.sh

# In another terminal - start live viewer
npm run xim:live
```

## Complete Toolkit (8 Tools)

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

### 8. Error Viewer (`xim:errors`)

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

## Debugging Workflow

### Standard Debugging Process

1. **Enable logging and start viewer:**
   ```bash
   export XIM_DEBUG_JSON=1
   ./dev/scripts/start-servers.sh
   # In another terminal:
   npm run xim:live
   ```

2. **Reproduce the issue** - Watch messages in real-time

3. **Validate protocol:**
   ```bash
   npm run xim:validate -- --door PROBLEMATIC --fix
   ```

4. **Analyze flow:**
   ```bash
   npm run xim:flow -- --door PROBLEMATIC
   ```

5. **Check state:**
   ```bash
   npm run xim:monitor
   ```

6. **Trace access (if needed):**
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

**ALWAYS use the tools:**
1. `npm run xim:live` → See what's happening
2. `npm run xim:validate` → Check protocol
3. `npm run xim:monitor` → Watch state
4. `npm run xim:decode` → Understand messages
5. `npm run xim:flow` → Visualize sequence

**SEE first, FIX second.**

The tools show you EXACTLY what's happening. Use them.
