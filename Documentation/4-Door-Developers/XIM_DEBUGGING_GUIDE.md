# XIM 68K Door Debugging Guide

Complete guide to debugging XIM protocol doors using structured logging and visualization tools.

## Quick Start

### 1. Enable Structured Logging

```bash
export XIM_DEBUG_JSON=1
./dev/scripts/start-servers.sh
```

This enables structured JSON logging to `logs/xim-debug.json`.

### 2. View Messages in Real-Time

```bash
# Live tail (recommended for development)
npm run xim:live

# View last 100 messages
npm run xim:view

# Filter by door
npm run xim:view -- --door WHO

# Show only errors
npm run xim:errors
```

### 3. Decode Specific Messages

```bash
# Decode hex message
npm run xim:decode -- "00000001 00000000 00000017 48656c6c6f"

# Create test message
npm run xim:decode -- --type JH_INIT --param 123
```

---

## Tools Overview

### 1. XIM Log Viewer (`npm run xim:view`)

Real-time visualization of all XIM protocol messages with color-coding and filtering.

**Features:**
- Timeline view with millisecond timestamps
- Direction arrows (→ send, ← receive)
- Message type, door name, node ID
- Data preview (first 40 chars)
- Error highlighting
- Statistics summary

**Options:**
```bash
npm run xim:view -- --live          # Live tail mode
npm run xim:view -- --door WHO      # Filter by door
npm run xim:view -- --node 1        # Filter by node
npm run xim:view -- --errors        # Errors only
npm run xim:view -- --stats         # Show statistics
npm run xim:view -- --last 50       # Last N messages
```

**Example Output:**
```
[12:45:01.234] → JH_INIT       | WHO           | N1 | p=123
[12:45:01.456] ← JH_SM         | WHO           | N1 | len=23 | "Welcome to WHO door"
[12:45:01.789] → JH_HK         | WHO           | N1 | p=65 | "A"
[12:45:02.012] ← JH_SM         | WHO           | N1 | len=13 | "You pressed A"
[12:45:03.456] ⚠ TIMEOUT      | WHO           | N1 | No response for 1444ms
```

### 2. XIM Message Decoder (`npm run xim:decode`)

Decode and encode XIM protocol messages.

**Decode hex:**
```bash
npm run xim:decode -- "00000001 00000000 00000017 48656c6c6f"
```

**Output:**
```
╔═══════════════════════════════════════════════════════════════╗
║                    XIM Message Decoder                         ║
╚═══════════════════════════════════════════════════════════════╝

  Valid: ✓
  Type: JH_SM (0x00000001)
  Param: 0 (0x00000000)
  DataLen: 23 bytes

  Data (hex): 48656c6c6f20776f726c642066726f6d20646f6f72
  Data (text): "Hello world from door"
```

**Create message:**
```bash
npm run xim:decode -- --type JH_SM --data "Test message"
```

### 3. XIM Protocol Validator (`npm run xim:validate`)

Validates XIM protocol compliance and detects common issues.

**Features:**
- Message structure validation
- Protocol sequence checking
- Timing analysis
- Session completeness verification
- Suggests fixes for detected issues

**Options:**
```bash
npm run xim:validate              # Validate all doors
npm run xim:validate -- --door WHO  # Validate specific door
npm run xim:validate -- --strict   # Strict mode (fail on warnings)
npm run xim:validate -- --fix      # Show fix suggestions
```

**Common Issues Detected:**
- Malformed message structure
- Invalid message sequences
- Response timeouts
- Incomplete sessions
- Protocol violations

### 4. XIM Door State Monitor (`npm run xim:monitor`)

Real-time monitoring dashboard showing all active door sessions.

**Features:**
- Live state tracking (initializing, running, waiting, error, terminated)
- Message counters (sent/received)
- Activity timestamps
- Error/warning indicators
- Auto-refresh display

**Options:**
```bash
npm run xim:monitor                 # Monitor with 2s refresh
npm run xim:monitor -- --refresh 1  # Faster 1s refresh
```

**Example Output:**
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
```

### 5. XIM Message Replay Tool (`npm run xim:replay`)

Send test XIM messages to doors for debugging.

**Features:**
- Send individual messages
- Replay message sequences from file
- Interactive mode for manual testing
- Message creation and encoding

**Options:**
```bash
# Send single message
npm run xim:replay -- --type JH_HK --param 65 --data "A" --door WHO

# Replay sequence from JSON file
npm run xim:replay -- --sequence test-sequence.json

# Interactive mode
npm run xim:replay -- --interactive
```

**Sequence File Format:**
```json
{
  "door": "WHO",
  "node": 1,
  "description": "Test WHO door startup",
  "messages": [
    { "type": "JH_INIT", "param": 1, "delay": 0 },
    { "type": "JH_HK", "param": 13, "data": "\r", "delay": 1000 }
  ]
}
```

### 6. XIM Message Flow Visualizer (`npm run xim:flow`)

Generate visual diagrams of XIM message sequences.

**Features:**
- ASCII art sequence diagrams
- Mermaid diagram format export
- Chronological message flow
- Direction indicators (backend ↔ door)

**Options:**
```bash
npm run xim:flow                    # ASCII diagram
npm run xim:flow -- --door WHO      # Specific door only
npm run xim:flow -- --format mermaid  # Mermaid format
npm run xim:flow -- --last 30       # Last 30 messages
```

**Example Output:**
```
  BACKEND                                  DOOR
  ───────────────────────────────────────────────────────

  12:45:01.234 JH_INIT (1)
           ────────────────────────────→

  12:45:01.456                     JH_SM "Welcome"
           ←────────────────────────────
```

### 7. XIM Access Tracer (`npm run xim:trace`)

Trace file, library, and memory access from doors.

**Features:**
- File access tracking
- Library call tracing
- Memory operation monitoring
- Access pattern summary
- Frequency analysis

**Options:**
```bash
npm run xim:trace                        # Trace all access types
npm run xim:trace -- --door WHO --type file  # File access for WHO
npm run xim:trace -- --type library      # Library access only
npm run xim:trace -- --summary           # Summary only
```

**Output:**
- File operations: Open, Read, Write, Close, Lock, Examine
- Library operations: OpenLibrary, CloseLibrary, FindPort, CreatePort
- Memory operations: AllocMem, FreeMem, CopyMem, Read32, Write32

---

## XIM Protocol Message Types

### Core Messages

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

### Message Structure

All XIM messages follow this structure:

```
Offset | Size | Field    | Description
-------|------|----------|---------------------------
0      | 4    | Type     | Message type code (big-endian)
4      | 4    | Param    | Parameter value (big-endian)
8      | 4    | DataLen  | Data length in bytes (big-endian)
12     | N    | Data     | Optional data (N = DataLen)
```

---

## Common Debugging Scenarios

### Door Not Receiving JH_INIT

**Symptoms:**
- Door starts but shows no output
- Door immediately exits
- No messages in XIM log

**Debugging:**
```bash
# Watch for JH_INIT messages
npm run xim:view -- --live | grep JH_INIT

# Check door reply port discovery
grep "door reply port" logs/backend.log
```

**Common Causes:**
- Door didn't create reply port (`AEDoorRP`)
- Port name mismatch
- Door crashed before entering message loop

### Door Not Responding to Keystrokes

**Symptoms:**
- Keys pressed but door doesn't react
- JH_HK messages sent but no JH_SM response

**Debugging:**
```bash
# Watch JH_HK messages
npm run xim:view -- --live | grep JH_HK

# Look for timeouts
npm run xim:errors
```

**Common Causes:**
- Door stuck in GetMsg() loop
- Door not processing JH_HK type
- Door crashed/hung

### Malformed Messages

**Symptoms:**
- Backend reports parse errors
- Door sends garbage data
- Unexpected disconnects

**Debugging:**
```bash
# View recent errors
npm run xim:errors

# Decode specific message
npm run xim:decode -- "<hex from log>"
```

**Common Causes:**
- Incorrect endianness (should be big-endian)
- Wrong data length field
- Buffer overrun

### Door Timeout/Hang

**Symptoms:**
- Door stops responding
- Backend reports timeout
- No new messages after certain point

**Debugging:**
```bash
# View timeline to see where it stopped
npm run xim:view -- --door WHO --last 50

# Check for missing reply
npm run xim:view -- --live | grep -A 5 "JH_HK"
```

**Common Causes:**
- Door waiting on WaitPort() indefinitely
- Door crashed without sending error
- Infinite loop in door code

---

## Log File Format

### JSON Structure

Each log entry is a single-line JSON object:

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

### Querying with jq

```bash
# Find all JH_INIT messages
jq 'select(.message.type == "JH_INIT")' logs/xim-debug.json

# Count messages by type
jq -r '.message.type' logs/xim-debug.json | sort | uniq -c

# Find errors
jq 'select(.level == "error")' logs/xim-debug.json

# Get messages for specific door
jq 'select(.door == "WHO")' logs/xim-debug.json

# Show last 10 messages
tail -10 logs/xim-debug.json | jq '.'
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| XIM_DEBUG | 0 | Enable legacy console logging |
| XIM_DEBUG_JSON | 0 | Enable structured JSON logging |
| XIM_LOG_FILE | logs/xim-debug.json | Log file path |

**Recommended Development Setup:**
```bash
export XIM_DEBUG_JSON=1
./dev/scripts/start-servers.sh
```

Then in another terminal:
```bash
npm run xim:live
```

---

## Tips & Best Practices

### 1. Always Use Live Mode During Development

```bash
npm run xim:live
```

See messages as they happen. Catch errors immediately.

### 2. Filter Aggressively

```bash
# Focus on one door
npm run xim:view -- --door WHO --live

# Only see problems
npm run xim:errors -- --live
```

### 3. Use Stats to Find Patterns

```bash
npm run xim:view -- --stats
```

See which message types are most common, which doors are chattiest.

### 4. Decode Unknown Messages

Found hex in logs? Decode it:
```bash
npm run xim:decode -- "<hex string>"
```

### 5. Compare Working vs Broken

Run working door, capture log. Run broken door, compare.

```bash
# Working door
npm run xim:view -- --door WORKING > working.log

# Broken door
npm run xim:view -- --door BROKEN > broken.log

# Compare
diff working.log broken.log
```

### 6. Check Message Sequence

XIM protocol has expected sequences:

**Normal door startup:**
```
→ JH_INIT       (backend initializes door)
← JH_SM         (door acknowledges, sends welcome)
→ JH_HK         (user presses key)
← JH_SM         (door processes and responds)
...
→ JH_TERMINATE  (backend closes door)
```

If sequence is different, that's your bug.

---

## Troubleshooting

### "No log file found"

**Solution:**
```bash
export XIM_DEBUG_JSON=1
./dev/scripts/start-servers.sh
```

Make sure `XIM_DEBUG_JSON=1` is set BEFORE starting servers.

### "Messages not appearing"

**Check:**
1. Is `XIM_DEBUG_JSON=1` set?
2. Is backend running?
3. Has door executed yet?
4. Check log file exists: `ls -la logs/xim-debug.json`

### "Viewer shows old messages"

**Solution:**
Use `--live` mode or delete old log:
```bash
rm logs/xim-debug.json
npm run xim:live
```

### "Log file too large"

Auto-rotates at 10MB. Manual rotation:
```bash
mv logs/xim-debug.json logs/xim-debug.json.old
```

---

## Advanced: Message Replay (Future)

Coming soon: Send custom XIM messages to test door responses.

```bash
# Future feature
npm run xim:replay -- --door WHO --messages init.json
```

---

## See Also

- [Door Development Guide](DOOR_DEVELOPMENT.md)
- [68K Door Architecture](68K_DOOR_ARCHITECTURE.md)
- [AEDoor Protocol](AEDOOR_PROTOCOL.md)
- [Door Watcher](../../dev/scripts/DOOR_WATCHER.md)
