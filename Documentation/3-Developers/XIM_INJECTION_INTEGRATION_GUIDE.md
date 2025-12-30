# XIM Message Injection - Integration Guide

**Real message replay for automated testing and debugging**

---

## Overview

The XIM Injection system allows external tools to inject XIM messages into running door sessions via Socket.IO. This enables:

- **Automated testing** - Run test sequences without manual interaction
- **Fuzzing** - Send randomized messages to find edge cases
- **Regression testing** - Replay recorded sessions
- **Integration testing** - Automate door testing in CI/CD

---

## Architecture

```
┌─────────────┐                  ┌──────────────┐                  ┌───────────┐
│  xim:replay │  Socket.IO       │   Backend    │    XIM Protocol  │  Door     │
│   (Client)  │─────────────────>│   Injection  │─────────────────>│  Session  │
│             │  xim:inject      │   Handler    │   PutMsg()       │  (68K)    │
└─────────────┘                  └──────────────┘                  └───────────┘
```

**Components:**
1. **Client** - `xim-replay-real.ts` - Sends injection requests
2. **Handler** - `xim-injection.handler.ts` - Validates and routes messages
3. **Session** - AmigaDoorSession - Injects messages into door's reply port

---

## Security

**CRITICAL: XIM injection is ONLY enabled in development mode.**

```typescript
if (process.env.NODE_ENV !== 'development') {
  // Injection handlers NOT registered
  return;
}
```

**Why this is important:**
- Message injection bypasses normal security checks
- Could be used to send malicious input to doors
- Should NEVER be exposed in production
- Development-only feature for testing

---

## Integration Steps

### Step 1: Register Injection Handlers (Already Complete)

The injection handler is in:
```
web/backend/src/handlers/debug/xim-injection.handler.ts
```

To integrate, add to your socket handler registration:

```typescript
import { registerXIMInjectionHandlers } from './handlers/debug/xim-injection.handler';

// In your socket connection handler:
socket.on('connect', () => {
  // ... other handlers ...

  // Register XIM injection (dev mode only)
  registerXIMInjectionHandlers(socket, session, state);
});
```

### Step 2: Add Injection Method to AmigaDoorSession

Add this method to `AmigaDoorSession.ts`:

```typescript
/**
 * Inject XIM message into running door session (for testing)
 * Only available in development mode
 */
async injectMessage(message: {
  type: number;
  typeName: string;
  param: number;
  data: string;
}): Promise<boolean> {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Message injection only available in development mode');
  }

  if (!this.doorProcess || !this.replyPort) {
    return false;
  }

  try {
    // Create XIM message buffer
    const dataBuffer = Buffer.from(message.data, 'utf-8');
    const dataLen = dataBuffer.length;

    const messageBuffer = Buffer.alloc(12 + dataLen);
    messageBuffer.writeUInt32BE(message.type, 0);      // Type
    messageBuffer.writeUInt32BE(message.param, 4);     // Param
    messageBuffer.writeUInt32BE(dataLen, 8);           // DataLen
    dataBuffer.copy(messageBuffer, 12);                // Data

    // Send via reply port (simulates backend sending message)
    // This would use your existing XIM messaging infrastructure
    await this.sendXIMMessage(messageBuffer);

    return true;
  } catch (err) {
    console.error('[XIMInjection] Failed to inject message:', err);
    return false;
  }
}
```

### Step 3: Update package.json

Add npm script:

```json
{
  "scripts": {
    "xim:replay:real": "npx tsx dev/scripts/xim-replay-real.ts"
  }
}
```

---

## Usage

### List Active Door Sessions

```bash
npm run xim:replay:real -- --list
```

Output:
```
Active Door Sessions:

  WHO
    Node: 1
    State: running
    Uptime: 45s

  RTW
    Node: 2
    State: waiting
    Uptime: 120s

Total: 2 active session(s)
```

### Send Single Message

```bash
# Send keystroke 'Q' to quit WHO door
npm run xim:replay:real -- --type JH_HK --param 81 --data "Q" --door WHO
```

### Replay Sequence from File

```bash
npm run xim:replay:real -- --sequence dev/scripts/test-sequences/test-who-door.json
```

### Interactive Mode

```bash
npm run xim:replay:real -- --interactive
```

Then:
```
> list
> send WHO JH_HK 65 A
> send WHO JH_HK 81 Q
> quit
```

---

## Test Sequences

### Example: Test WHO Door

**File:** `dev/scripts/test-sequences/test-who-door.json`

```json
{
  "door": "WHO",
  "description": "Test WHO door - list users and quit",
  "messages": [
    {
      "type": "JH_HK",
      "param": 13,
      "data": "\r",
      "delay": 0,
      "comment": "Press Enter to start"
    },
    {
      "type": "JH_HK",
      "param": 13,
      "data": "\r",
      "delay": 500,
      "comment": "Press Enter to see user list"
    },
    {
      "type": "JH_HK",
      "param": 81,
      "data": "Q",
      "delay": 1000,
      "comment": "Press Q to quit"
    }
  ]
}
```

**Run:**
```bash
npm run xim:replay:real -- --sequence dev/scripts/test-sequences/test-who-door.json
```

---

## Socket.IO API Reference

### Event: `xim:inject`

**Purpose:** Inject single XIM message

**Request:**
```typescript
{
  door: string;          // Door name (e.g., "WHO")
  node?: number;         // Optional node number
  messageType: string;   // XIM message type (e.g., "JH_HK")
  param?: number;        // Message parameter (default: 0)
  data?: string;         // Message data (default: "")
}
```

**Response:**
```typescript
{
  success: boolean;
  error?: string;
  messagesSent?: number;
  doorState?: string;
}
```

**Example:**
```typescript
socket.emit('xim:inject', {
  door: 'WHO',
  messageType: 'JH_HK',
  param: 81,
  data: 'Q'
}, (response) => {
  if (response.success) {
    console.log('Message sent!');
  } else {
    console.error('Failed:', response.error);
  }
});
```

### Event: `xim:inject:sequence`

**Purpose:** Inject sequence of messages

**Request:** Array of injection requests (same format as `xim:inject`)

**Response:**
```typescript
{
  success: boolean;
  error?: string;
  results?: Array<{
    success: boolean;
    error?: string;
    messagesSent?: number;
  }>;
}
```

### Event: `xim:sessions`

**Purpose:** List active door sessions

**Request:** None

**Response:**
```typescript
{
  sessions: Array<{
    node: number;
    door: string;
    state: string;
    uptime: number;  // milliseconds
  }>;
}
```

---

## XIM Message Types

| Type | Code | Direction | Description |
|------|------|-----------|-------------|
| JH_INIT | 0 | Backend → Door | Initialize door |
| JH_SM | 1 | Door → Backend | Send message (text) |
| JH_STAT | 2 | Backend → Door | Status request |
| JH_TERMINATE | 3 | Backend → Door | Terminate door |
| JH_HK | 4 | Backend → Door | Hot key (keystroke) |
| JH_GNS | 5 | Door → Backend | Get next string |
| JH_PROMPT | 6 | Door → Backend | Show prompt |
| JH_MORE | 7 | Door → Backend | More prompt |
| JH_REQUEST | 8 | Door → Backend | Request data |
| JH_IGNORE | 9 | Door → Backend | Ignore input |
| JH_SMPTR | 10 | Door → Backend | Send message pointer |

---

## Automated Testing Workflow

### 1. Start Backend

```bash
./dev/scripts/start-servers.sh
```

**Important:** XIM injection requires development mode.

### 2. Start Door

In terminal or web browser, run the door you want to test (e.g., WHO).

### 3. Run Test Sequence

```bash
npm run xim:replay:real -- --sequence test-who-door.json
```

### 4. Watch XIM Messages

In another terminal:

```bash
npm run xim:live
```

### 5. Analyze Results

```bash
npm run xim:analyze -- --door WHO
```

---

## Fuzzing Example

Create fuzzing sequence that sends random keystrokes:

```json
{
  "door": "WHO",
  "description": "Fuzz test - random keystrokes",
  "messages": [
    { "type": "JH_HK", "param": 13, "data": "\r", "delay": 0 },
    { "type": "JH_HK", "param": 33, "data": "!", "delay": 10 },
    { "type": "JH_HK", "param": 64, "data": "@", "delay": 10 },
    { "type": "JH_HK", "param": 35, "data": "#", "delay": 10 },
    { "type": "JH_HK", "param": 255, "data": "ÿ", "delay": 10 },
    { "type": "JH_HK", "param": 0, "data": "\0", "delay": 10 },
    { "type": "JH_HK", "param": 27, "data": "\x1b", "delay": 10 }
  ]
}
```

Run:
```bash
npm run xim:replay:real -- --sequence fuzz-test.json
```

Watch for crashes or errors:
```bash
npm run xim:analyze -- --door WHO
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Door Tests

on: [push, pull_request]

jobs:
  test-doors:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Install dependencies
        run: npm install

      - name: Start backend
        run: |
          NODE_ENV=development ./dev/scripts/start-servers.sh &
          sleep 10

      - name: Run door tests
        run: |
          npm run xim:replay:real -- --sequence test-who-door.json
          npm run xim:replay:real -- --sequence test-rtw-door.json

      - name: Analyze results
        run: |
          npm run xim:analyze -- --door WHO
          npm run xim:analyze -- --door RTW

      - name: Upload reports
        uses: actions/upload-artifact@v2
        with:
          name: xim-reports
          path: logs/reports/
```

---

## Troubleshooting

### "Not in development mode"

**Error:** `XIM injection disabled - not in development mode`

**Solution:** Set `NODE_ENV=development` before starting backend:
```bash
export NODE_ENV=development
./dev/scripts/start-servers.sh
```

### "No active session found"

**Error:** `No active session found for door: WHO`

**Solution:** Start the door first in terminal or browser, then run injection.

### "Failed to connect to backend"

**Error:** `Failed to connect to backend: Connection refused`

**Solution:** Ensure backend is running on port 3001:
```bash
lsof -ti:3001  # Should return PID if running
```

### "Door session does not support message injection"

**Error:** `Door session does not support message injection`

**Solution:** Ensure `injectMessage()` method is implemented in AmigaDoorSession (see Step 2).

---

## Best Practices

1. **Always test in development mode** - Never enable in production
2. **Use test sequences** - Document expected behavior
3. **Watch XIM logs** - Use `npm run xim:live` during testing
4. **Analyze results** - Run `xim:analyze` after each test
5. **Start simple** - Begin with single messages, then sequences
6. **Add delays** - Use `delay` field to simulate realistic timing
7. **Clean sessions** - Clear XIM logs between tests for clarity
8. **Version sequences** - Keep test sequences in version control

---

## Security Considerations

**Development Only:**
- XIM injection MUST only be enabled in NODE_ENV=development
- Handler checks environment before registering
- Production builds should NEVER include injection code

**Input Validation:**
- All messages are validated before injection
- Message types must be in XIM_MESSAGE_TYPES
- Parameters must be valid 32-bit unsigned integers
- Data must be strings and under 10KB

**Access Control:**
- Socket.IO connection required (authenticated users only)
- No unauthenticated HTTP endpoint
- Requires active session to target

**Audit Logging:**
- All injections logged to `logs/xim-debug.json`
- Includes timestamp, door, message type, user session
- Can be reviewed for security audits

---

## Record/Replay Workflow

The XIM toolkit includes session recording for comprehensive regression testing.

### Recording Live Sessions

**Capture real user interactions:**

```bash
# Start backend
./dev/scripts/start-servers.sh

# In another terminal - start recording
npm run xim:record -- --door WHO

# Use the door normally (browser/terminal)
# All your keystrokes and interactions are captured

# Press Ctrl+C when done
# Recording saved to: recordings/WHO-2025-12-29-HHMMSS.json
```

**Recording captures:**
- Every XIM message sent to the door
- Precise timing between messages (millisecond accuracy)
- Session metadata (door name, duration, message count)
- Human-readable comments for each message

### Replaying Recorded Sessions

**Replay the exact session:**

```bash
# Start backend
./dev/scripts/start-servers.sh

# Start the door (browser/terminal)

# In another terminal - replay the recording
npm run xim:replay:real -- --sequence recordings/WHO-2025-12-29-103045.json

# Recording plays back with exact timing
```

### Regression Testing Workflow

**1. Establish Baseline**

```bash
# Record working session
npm run xim:record -- --door WHO --output recordings/WHO-baseline.json

# Verify it replays correctly
npm run xim:replay:real -- --sequence recordings/WHO-baseline.json
```

**2. Make Code Changes**

```bash
# Edit door code
# Fix bug, add feature, refactor, etc.
```

**3. Verify Behavior**

```bash
# Replay baseline session
npm run xim:replay:real -- --sequence recordings/WHO-baseline.json

# Compare XIM logs
npm run xim:diff -- logs/xim-debug-before.json logs/xim-debug-after.json

# Analyze for issues
npm run xim:analyze -- --door WHO
```

**4. Validate Changes**

```bash
# Check protocol compliance
npm run xim:validate -- --door WHO

# Visualize flow differences
npm run xim:flow -- --door WHO --format mermaid
```

### Building a Test Library

**Capture different scenarios:**

```bash
# Normal workflow
npm run xim:record -- --door WHO --output recordings/WHO-normal-workflow.json

# Edge cases
npm run xim:record -- --door WHO --output recordings/WHO-empty-user-list.json
npm run xim:record -- --door WHO --output recordings/WHO-many-users.json

# Error conditions
npm run xim:record -- --door WHO --output recordings/WHO-invalid-input.json

# Performance baselines
npm run xim:record -- --door WHO --output recordings/WHO-stress-test.json
```

**Organize by category:**

```
recordings/
  WHO/
    baseline.json           # Standard workflow
    empty-list.json         # Edge case
    many-users.json         # Performance
    bug-123-repro.json      # Bug reproduction
  RTW/
    normal-game.json
    quick-exit.json
    error-recovery.json
```

### Automated Regression Testing

**Run all tests:**

```bash
#!/bin/bash
# test-all-recordings.sh

RECORDINGS=(
  "recordings/WHO-baseline.json"
  "recordings/RTW-normal-game.json"
  "recordings/MultiTop-full-cycle.json"
)

for recording in "${RECORDINGS[@]}"; do
  echo "Testing: $recording"

  # Replay recording
  npm run xim:replay:real -- --sequence "$recording"

  # Validate protocol
  npm run xim:validate -- --door "$(basename "$recording" .json)"

  # Check for errors
  if npm run xim:errors | grep -q "ERROR"; then
    echo "FAILED: $recording"
    exit 1
  fi

  echo "PASSED: $recording"
done

echo "All tests passed!"
```

### CI/CD Integration with Recordings

**GitHub Actions example:**

```yaml
name: Door Regression Tests

on: [push, pull_request]

jobs:
  test-doors:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Install dependencies
        run: npm install

      - name: Start backend
        run: |
          NODE_ENV=development ./dev/scripts/start-servers.sh &
          sleep 10

      - name: Run WHO baseline test
        run: npm run xim:replay:real -- --sequence recordings/WHO-baseline.json

      - name: Validate WHO protocol
        run: npm run xim:validate -- --door WHO --strict

      - name: Run RTW baseline test
        run: npm run xim:replay:real -- --sequence recordings/RTW-baseline.json

      - name: Validate RTW protocol
        run: npm run xim:validate -- --door RTW --strict

      - name: Upload XIM logs
        if: failure()
        uses: actions/upload-artifact@v2
        with:
          name: xim-logs
          path: logs/xim-debug.json
```

### Recording Format

Recordings are JSON files compatible with `xim:replay:real`:

```json
{
  "version": "1.0",
  "door": "WHO",
  "recorded": "2025-12-29T10:30:00.000Z",
  "duration": 45.123,
  "messageCount": 25,
  "description": "Auto-recorded session: WHO",
  "messages": [
    {
      "type": "JH_HK",
      "param": 13,
      "data": "\r",
      "delay": 0,
      "timestamp": "2025-12-29T10:30:00.000Z",
      "comment": "Press Enter"
    },
    {
      "type": "JH_HK",
      "param": 81,
      "data": "Q",
      "delay": 1500,
      "timestamp": "2025-12-29T10:30:01.500Z",
      "comment": "Press Q to quit"
    }
  ]
}
```

### Best Practices

1. **Record Focused Sessions** - Keep recordings short and focused on specific workflows
2. **Descriptive Names** - Use meaningful filenames: `WHO-complete-workflow.json`
3. **Version Control** - Commit important recordings for regression testing
4. **Validate Immediately** - Replay recording after capturing to verify it works
5. **Document Purpose** - Update `description` field in recording JSON
6. **Organize by Door** - Use subdirectories: `recordings/WHO/`, `recordings/RTW/`
7. **Clean Up** - Delete temporary recordings, keep only important ones
8. **Test Regularly** - Run regression tests before each release

### Troubleshooting Recordings

**Recording captures no messages:**
- Ensure backend is running
- Verify XIM logging is enabled (default in dev mode)
- Check logs/xim-debug.json exists and is being written to
- Verify door is actually running

**Replay fails:**
- Ensure backend is running in development mode
- Verify door is running before starting replay
- Check recording format is valid JSON
- Validate message types are correct

**Timing issues during replay:**
- Recordings use exact timing from capture
- Door behavior may vary (CPU load, network latency)
- Adjust `delay` values in recording if needed
- Consider adding buffer time for slow operations

---

## Future Enhancements

- **HTTP endpoint** - REST API for injection (currently Socket.IO only)
- **Assertion framework** - Verify expected door responses
- **Coverage reporting** - Track which door code paths were tested
- **Performance profiler** - Track execution time and bottlenecks
- **Web dashboard** - Visual interface for debugging and monitoring

---

## Related Documentation

- **XIM Protocol:** `XIM_PROTOCOL.md`
- **Debugging Tools:** `XIM_TOOLS_README.md`
- **Door Development:** `DOOR_DEVELOPMENT.md`
- **Testing Guide:** `TESTING.md`

---

## Support

**Issues:** Report at https://github.com/anthropics/amiexpress-web/issues

**Questions:** See `XIM_DEBUGGING_GUIDE.md` or `CLAUDE_68K_DEBUGGING_PROTOCOL.md`
