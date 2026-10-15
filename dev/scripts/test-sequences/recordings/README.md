# XIM Session Recordings

This directory contains recorded XIM sessions captured from live door executions.

## Purpose

- **Regression Testing** - Replay sessions to verify behavior hasn't changed
- **Bug Reproduction** - Capture exact sequence that triggers a bug
- **Test Library** - Build collection of real user interaction patterns
- **Performance Baseline** - Compare execution time across versions

## Recording Sessions

**Record a single door:**
```bash
npm run xim:record -- --door WHO
```

**Record for specific duration:**
```bash
npm run xim:record -- --door WHO --duration 60
```

**Record all doors:**
```bash
npm run xim:record -- --all
```

## Replaying Sessions

**Replay a recording:**
```bash
npm run xim:replay:real -- --sequence recordings/WHO-2025-12-29-103045.json
```

**List recordings:**
```bash
ls -lh dev/scripts/test-sequences/recordings/
```

## Recording Format

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

## Fields

- **version** - Recording format version (currently 1.0)
- **door** - Door name that was recorded
- **recorded** - ISO timestamp when recording started
- **duration** - Total recording duration in seconds
- **messageCount** - Number of messages captured
- **description** - Human-readable description
- **messages** - Array of XIM messages with timing

### Message Fields

- **type** - XIM message type (JH_INIT, JH_HK, JH_SM, etc.)
- **param** - Message parameter (e.g., ASCII code for keystrokes)
- **data** - Message data/text
- **delay** - Milliseconds since previous message
- **timestamp** - ISO timestamp of this message
- **comment** - Human-readable description of message

## Workflow

### 1. Record a Session

```bash
# Start backend
./dev/scripts/start-servers.sh

# In another terminal - start recording
npm run xim:record -- --door WHO

# In browser/terminal - run the door and interact normally
# Recording captures all your input

# Press Ctrl+C when done
# Recording saved to: recordings/WHO-2025-12-29-HHMMSS.json
```

### 2. Replay the Session

```bash
# Start backend (if not running)
./dev/scripts/start-servers.sh

# Start the door
# (open browser and navigate to door, or telnet)

# In another terminal - replay the recording
npm run xim:replay:real -- --sequence recordings/WHO-2025-12-29-103045.json

# Recording plays back exactly as recorded
```

### 3. Regression Testing

```bash
# Record "working" session
npm run xim:record -- --door WHO --output recordings/WHO-baseline.json

# Make code changes
# ...

# Replay baseline to verify it still works
npm run xim:replay:real -- --sequence recordings/WHO-baseline.json

# Compare results
npm run xim:diff -- logs/xim-debug-before.json logs/xim-debug-after.json
```

## Naming Convention

**Auto-generated filenames:**
- Format: `{DOOR}-{TIMESTAMP}.json`
- Example: `WHO-2025-12-29-103045.json`

**Manual filenames (recommended for important tests):**
```bash
npm run xim:record -- --door WHO --output recordings/WHO-complete-workflow.json
npm run xim:record -- --door WHO --output recordings/WHO-bug-123-repro.json
npm run xim:record -- --door WHO --output recordings/WHO-stress-test.json
```

## Best Practices

1. **Descriptive Names** - Use meaningful filenames for manual recordings
2. **Keep Focused** - Record specific workflows, not long sessions
3. **Version Control** - Commit important recordings to git
4. **Document Purpose** - Update `description` field for manual recordings
5. **Validate First** - Replay recording immediately to verify it captured correctly
6. **Clean Up** - Delete temporary/experimental recordings

## Integration with CI/CD

Add recordings to automated tests:

```yaml
# .github/workflows/door-tests.yml
- name: Test WHO door
  run: |
    npm run xim:replay:real -- --sequence recordings/WHO-baseline.json
    npm run xim:validate -- --door WHO
```

## Storage

- **Auto-recordings**: Gitignored by default (can be large)
- **Test recordings**: Commit important ones for regression testing
- **Location**: `dev/scripts/test-sequences/recordings/`

## Tools

- **xim:record** - Record sessions
- **xim:replay:real** - Replay recordings
- **xim:diff** - Compare recordings
- **xim:validate** - Validate recording format

## Troubleshooting

**No messages captured:**
- Ensure backend is running
- Check XIM logging is enabled (default in dev mode)
- Verify door is actually running
- Check logs/xim-debug.json exists

**Replay fails:**
- Verify door is running before replay
- Check recording format is valid
- Ensure backend is in development mode
- Verify message types are valid

**Timing issues:**
- Recordings capture exact timing
- Door behavior may vary (CPU load, etc.)
- Use `delay` field to adjust timing if needed
