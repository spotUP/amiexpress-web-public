# XIM Debugging Enhancement Plan

Comprehensive roadmap for implementing all three tiers of XIM debugging improvements.

**Status:** Planning Phase
**Start Date:** 2025-12-29
**Target Completion:** TBD based on priorities

---

## Overview

Current state: **8 foundational tools completed**
- ✅ Real-time viewer, decoder, validator, monitor, replay, flow, trace, errors

Enhancement goal: **Make debugging 10x faster with AI-powered analysis and automation**

---

## PHASE 1: Smart Automation (TIER 1)

**Goal:** Automate 80% of debugging workflow
**Impact:** HIGH - Saves hours of debugging time
**Effort:** MEDIUM - 2-3 days total
**Priority:** IMMEDIATE

### 1.1 Smart Debug Command (`xim:debug`)

**Description:** One command that orchestrates entire debug workflow

**Tasks:**
- [ ] Create `dev/scripts/xim-debug.ts`
- [ ] Implement session management (start/stop/cleanup)
- [ ] Integrate all tools (viewer, validator, monitor, flow)
- [ ] Add split-pane terminal UI (using blessed or tmux)
- [ ] Implement auto-report generation on exit
- [ ] Add `npm run xim:debug -- DOOR` script
- [ ] Write tests for orchestration
- [ ] Document usage in XIM_TOOLS_README.md

**Features:**
```bash
npm run xim:debug -- WHO
```
Automatically:
- Clears old logs for clean session
- Starts live viewer in split pane
- Runs validator in background
- Opens monitor dashboard
- Detects door exit
- Generates comprehensive report
- Shows top 3 issues detected

**Acceptance Criteria:**
- Single command starts all debugging tools
- Report generated automatically on door exit
- Works with any door name
- Handles errors gracefully

---

### 1.2 Pattern-Based Issue Detection

**Description:** Automatically identify common 68K door issues

**Tasks:**
- [ ] Create `dev/scripts/xim-analyzer.ts`
- [ ] Implement pattern matchers for common issues
- [ ] Add confidence scoring system
- [ ] Create issue database (common problems + solutions)
- [ ] Integrate with validator for real-time detection
- [ ] Add CLI: `npm run xim:analyze`
- [ ] Create pattern library (JSON config)
- [ ] Add machine-readable output format

**Patterns to Detect:**
1. GetMsg() infinite loop (no messages sent for 5s+)
2. Protocol violations (JH_SM before JH_INIT)
3. Memory leaks (AllocMem without FreeMem)
4. Timeout patterns (>2000ms response times)
5. Crash detection (sudden silence after specific message)
6. Buffer overruns (dataLen mismatch)
7. Port conflicts (multiple FindPort for same port)
8. Rapid-fire loops (100+ messages in <1s)
9. Resource exhaustion (too many open files)
10. Stuck in WaitPort (no incoming messages)

**Output Format:**
```
[HIGH CONFIDENCE - 95%] GetMsg() infinite loop detected
  Evidence:
    - No outgoing messages for 5234ms after JH_HK
    - Last received: JH_HK at 12:45:03.456
    - Expected: JH_SM response within 2000ms
  Suggested Fix:
    - Check if door has Wait() timeout instead of WaitPort()
    - Verify message loop processes all message types
  Relevant Code: DoorMessageHandler.ts:234
  Similar Issues: 47 matches in knowledge base
```

**Acceptance Criteria:**
- Detects at least 10 common patterns
- Confidence scoring >90% accuracy
- Provides actionable fix suggestions
- Runs in real-time during monitoring

---

### 1.3 Session Diff Tool (`xim:diff`)

**Description:** Compare two door sessions to find differences

**Tasks:**
- [ ] Create `dev/scripts/xim-diff.ts`
- [ ] Implement JSON session loader
- [ ] Build message sequence comparison engine
- [ ] Add timing delta analysis
- [ ] Implement parameter comparison
- [ ] Create diff visualization (ASCII + HTML)
- [ ] Add `npm run xim:diff` script
- [ ] Support multiple diff formats
- [ ] Add regression detection mode

**Features:**
```bash
# Compare working vs broken
npm run xim:diff -- --before logs/working.json --after logs/broken.json

# Compare with baseline
npm run xim:diff -- --baseline baselines/WHO-v1.0.json --current logs/xim-debug.json --door WHO
```

**Output:**
```
╔═══════════════════════════════════════════════════════════════╗
║                    XIM Session Diff Report                     ║
╚═══════════════════════════════════════════════════════════════╝

Sessions:
  BEFORE: working-session.json (127 messages, 2.3s duration)
  AFTER:  broken-session.json (89 messages, 0.8s duration)

CRITICAL DIFFERENCES:

[!] Missing messages in AFTER:
    - JH_SM x38 (response messages not sent)
    - JH_GNS x2 (get next string requests missing)

[!] Timing differences:
    - JH_INIT → JH_SM: 12ms → 1850ms (+1838ms slower)
    - Average response: 45ms → 2100ms (+2055ms slower)

[!] Sequence deviation at message #12:
    BEFORE: JH_INIT → JH_SM → JH_HK → JH_SM
    AFTER:  JH_INIT → JH_SM → JH_HK → TIMEOUT

[!] Parameter changes:
    - JH_INIT param: 123 → 0 (user ID lost)

LIKELY CAUSE:
  Door crashed after receiving JH_HK (message #12)
  Last successful operation: JH_SM at 12:45:01.456
```

**Acceptance Criteria:**
- Compares message sequences accurately
- Identifies missing/extra messages
- Shows timing deltas
- Highlights parameter changes
- Suggests likely causes

---

### 1.4 Auto-Report Generator (`xim:report`)

**Description:** Generate comprehensive markdown debugging reports

**Tasks:**
- [ ] Create `dev/scripts/xim-report.ts`
- [ ] Implement session analyzer
- [ ] Build statistics aggregator
- [ ] Create markdown template engine
- [ ] Add issue summarizer
- [ ] Implement performance metrics calculator
- [ ] Add code snippet extractor (if possible)
- [ ] Create HTML export option
- [ ] Add `npm run xim:report` script

**Features:**
```bash
# Generate report for last session
npm run xim:report -- --door WHO --last-session

# Generate report from specific log
npm run xim:report -- --file logs/xim-debug-2025-12-29.json --output report.md

# Generate HTML report
npm run xim:report -- --door WHO --format html --output report.html
```

**Report Structure:**
```markdown
# XIM Debug Report: WHO Door
Generated: 2025-12-29 14:32:15

## Executive Summary
- **Status:** FAILED - Door crashed after 0.8s
- **Messages:** 89 sent/received
- **Issues:** 3 CRITICAL, 2 WARNING, 1 INFO
- **Root Cause:** GetMsg() infinite loop after JH_HK

## Session Overview
- Door: WHO
- Node: 1
- Duration: 0.834s
- Start: 12:45:01.234
- End: 12:45:02.068
- Exit: CRASH

## Statistics
- Total Messages: 89
- Backend → Door: 47 (52.8%)
- Door → Backend: 42 (47.2%)
- Average Response Time: 124ms
- Max Response Time: 1850ms (JH_HK → TIMEOUT)
- Errors: 3
- Warnings: 2

## Issues Detected

### [CRITICAL] GetMsg() Infinite Loop
**Confidence:** 95%
**Evidence:**
- No outgoing messages for 5234ms after JH_HK
- Last received: JH_HK at 12:45:01.456
- Expected: JH_SM response within 2000ms

**Impact:** Door becomes unresponsive, user stuck

**Suggested Fix:**
- Check if door has Wait() timeout instead of WaitPort()
- Verify message loop processes all message types
- Add timeout handling for GetMsg()

**Relevant Code:** DoorMessageHandler.ts:234

### [CRITICAL] Protocol Violation
**Confidence:** 100%
**Evidence:**
- Door sent JH_SM before receiving JH_INIT
- Sequence: JH_SM (illegal) → JH_INIT → JH_SM (correct)

**Impact:** Backend may reject early messages

**Suggested Fix:**
- Add JH_INIT check before sending any messages
- Implement proper door state machine

## Message Flow
[ASCII diagram of message sequence]

## Performance Metrics
- P50 Response Time: 95ms
- P95 Response Time: 450ms
- P99 Response Time: 1850ms
- Throughput: 106 msgs/sec

## Recommendations
1. Fix GetMsg() infinite loop (HIGH PRIORITY)
2. Add protocol compliance check (HIGH PRIORITY)
3. Implement timeout handling (MEDIUM PRIORITY)
```

**Acceptance Criteria:**
- Generates markdown/HTML reports
- Includes all key metrics
- Lists detected issues with fixes
- Provides actionable recommendations
- Can be automated in CI/CD

---

### 1.5 Backend Integration for Real Replay

**Description:** Actually send messages to running doors via backend API

**Tasks:**
- [ ] Add WebSocket endpoint to backend for message injection
- [ ] Implement authentication/authorization for replay API
- [ ] Update `xim-replay.ts` to use real backend connection
- [ ] Add session management (track active doors)
- [ ] Implement response capture and display
- [ ] Add replay verification (expected vs actual)
- [ ] Create test sequence library
- [ ] Document API in XIM_DEBUGGING_GUIDE.md

**API Design:**
```typescript
// POST /api/debug/xim/send
{
  door: "WHO",
  node: 1,
  message: {
    type: "JH_HK",
    param: 65,
    data: "A"
  }
}

// Response
{
  sent: true,
  timestamp: "2025-12-29T12:45:01.234Z",
  response: {
    type: "JH_SM",
    data: "You pressed A",
    latency: 45
  }
}
```

**Features:**
```bash
# Send single message and see response
npm run xim:replay -- --door WHO --live --type JH_HK --param 65

# Replay sequence and validate responses
npm run xim:replay -- --sequence test-who.json --validate
```

**Acceptance Criteria:**
- Messages actually sent to running doors
- Responses captured and displayed
- Validation of expected vs actual responses
- Works with all message types
- Secure (requires authentication)

---

## PHASE 2: Advanced Analysis (TIER 2)

**Goal:** Deep insights and regression prevention
**Impact:** HIGH - Prevents regressions, identifies bottlenecks
**Effort:** MEDIUM-HIGH - 4-5 days total
**Priority:** HIGH

### 2.1 Web Dashboard

**Description:** Unified web interface for all debugging tools

**Tasks:**
- [ ] Create React/Next.js dashboard app
- [ ] Implement WebSocket server for real-time updates
- [ ] Build message viewer component (DataTable with filters)
- [ ] Create monitor dashboard component
- [ ] Add flow visualizer component (interactive timeline)
- [ ] Implement validator results view
- [ ] Add session selector and history
- [ ] Create responsive layout
- [ ] Add dark mode support
- [ ] Deploy as part of unified backend

**Features:**
- Real-time message streaming
- Interactive timeline with zoom/pan
- Click message to see details
- Filter by door/node/type
- Live door state dashboard
- Validation results with fix suggestions
- Session history and comparison
- Export to various formats

**Tech Stack:**
- Frontend: React + TypeScript + Tailwind
- Real-time: Socket.IO
- Visualization: Recharts or D3.js
- State: Zustand or Redux

**Acceptance Criteria:**
- All tools accessible via web UI
- Real-time updates <100ms latency
- Works on mobile/tablet
- Responsive design
- Persists user preferences

---

### 2.2 Record/Replay for Regression Testing

**Description:** Record working sessions and replay to detect regressions

**Tasks:**
- [ ] Create `dev/scripts/xim-record.ts`
- [ ] Implement session recorder with metadata
- [ ] Build baseline storage system
- [ ] Create `dev/scripts/xim-regression.ts`
- [ ] Implement replay engine with comparison
- [ ] Add regression detection algorithm
- [ ] Create test suite generator
- [ ] Add CI/CD integration script
- [ ] Document regression testing workflow

**Features:**
```bash
# Record baseline
npm run xim:record -- --door WHO --output baselines/WHO-v1.0.json

# Run regression test
npm run xim:regression -- --door WHO --baseline baselines/WHO-v1.0.json

# Generate test suite from recordings
npm run xim:generate-tests -- --recordings baselines/*.json --output tests/
```

**Regression Detection:**
- Message sequence changes
- Timing regressions (>10% slower)
- Missing/extra messages
- Parameter changes
- Error rate increases

**CI/CD Integration:**
```yaml
# .github/workflows/door-regression.yml
- name: Run WHO door regression tests
  run: npm run xim:regression -- --door WHO --baseline baselines/WHO-v1.0.json --strict
```

**Acceptance Criteria:**
- Records complete sessions
- Replays with high fidelity
- Detects regressions accurately
- Integrates with CI/CD
- Low false positive rate

---

### 2.3 Performance Profiler (`xim:perf`)

**Description:** Detailed performance analysis with bottleneck identification

**Tasks:**
- [ ] Create `dev/scripts/xim-perf.ts`
- [ ] Implement latency histogram builder
- [ ] Add throughput calculator
- [ ] Build percentile analyzer (P50/P95/P99)
- [ ] Create bottleneck detector
- [ ] Implement CPU time estimator
- [ ] Add memory usage tracker
- [ ] Generate flame graphs (if feasible)
- [ ] Create performance report generator
- [ ] Add `npm run xim:perf` script

**Features:**
```bash
# Profile door performance
npm run xim:perf -- --door WHO --duration 60s

# Compare performance across versions
npm run xim:perf -- --compare baseline.json current.json
```

**Metrics:**
- Message throughput (msgs/sec)
- Latency distribution (histogram)
- P50/P95/P99 response times
- Peak latency
- CPU time per message type
- Memory allocations
- I/O operations

**Output:**
```
╔═══════════════════════════════════════════════════════════════╗
║                    Performance Profile: WHO                    ║
╚═══════════════════════════════════════════════════════════════╝

Duration: 60.3s
Messages: 4,521 (75 msgs/sec)

LATENCY DISTRIBUTION:
  Min:    8ms
  P50:   45ms  ████████████████████
  P95:  120ms  ████████████████████████████████
  P99:  450ms  ████████████████████████████████████████████
  Max: 1850ms

BOTTLENECKS DETECTED:
  [!] JH_HK → JH_SM: P95 = 450ms (expected <100ms)
      Cause: Slow string processing in door code
      Impact: User input feels sluggish
      Fix: Optimize keystroke handler

  [!] File I/O during JH_INIT: 380ms
      Cause: Reading user stats from disk
      Impact: Slow door startup
      Fix: Cache user data or use async I/O

THROUGHPUT:
  Overall:  75 msgs/sec
  Peak:    142 msgs/sec
  Lowest:   12 msgs/sec (during file I/O)
```

**Acceptance Criteria:**
- Accurate latency measurements
- Identifies performance bottlenecks
- Compares versions effectively
- Actionable recommendations
- Integrates with CI/CD for perf regression detection

---

### 2.4 Timeline Visualizer (Chrome DevTools Style)

**Description:** Interactive timeline with zoom/pan like Chrome Performance tab

**Tasks:**
- [ ] Create HTML/JavaScript timeline renderer
- [ ] Implement canvas-based rendering for performance
- [ ] Add zoom/pan controls
- [ ] Create message detail popups
- [ ] Implement filtering and search
- [ ] Add annotation support
- [ ] Create export to Chrome Trace Format
- [ ] Build standalone HTML viewer
- [ ] Integrate with web dashboard

**Features:**
- Interactive timeline with mouse controls
- Color-coded message types
- Hover to see message details
- Click to inspect full data
- Zoom in/out with mouse wheel
- Pan with click-drag
- Filter by door/node/type
- Highlight slow operations
- Show concurrency (multiple doors)
- Export to `.json` for Chrome DevTools

**Tech:**
- Canvas API for rendering
- D3.js for timeline management
- React for controls
- Chrome Trace Format for export

**Acceptance Criteria:**
- Smooth 60fps rendering
- Handles 10,000+ messages
- Exportable to Chrome DevTools
- Intuitive controls
- Works in all modern browsers

---

### 2.5 Integration with Door Watcher

**Description:** Auto-validate on every door code change

**Tasks:**
- [ ] Update `watch-doors.ts` to run validation
- [ ] Add configurable validation rules
- [ ] Implement notification system (desktop/console)
- [ ] Create validation cache (skip if no issues)
- [ ] Add auto-fix suggestions
- [ ] Support selective validation (only changed doors)
- [ ] Add performance checks
- [ ] Document in DOOR_DEVELOPMENT.md

**Features:**
```bash
# Auto-validation enabled by default
WATCH_DOORS=true XIM_AUTO_VALIDATE=1 ./dev/scripts/start-servers.sh

# Disable auto-validation
WATCH_DOORS=true XIM_AUTO_VALIDATE=0 ./dev/scripts/start-servers.sh
```

**Behavior:**
1. Door file changes detected
2. Backend restarts automatically
3. Validator runs on next door execution
4. Results shown in terminal
5. Desktop notification if errors found

**Acceptance Criteria:**
- Validates on every door restart
- Low performance overhead
- Configurable (can disable)
- Clear notifications
- Doesn't interfere with development

---

## PHASE 3: Intelligence (TIER 3)

**Goal:** AI-powered insights and advanced testing
**Impact:** MEDIUM-HIGH - Future-proofing, advanced use cases
**Effort:** HIGH - 6-8 days total
**Priority:** MEDIUM (after TIER 1 & 2)

### 3.1 Learning-Based Anomaly Detection

**Description:** Learn normal behavior and detect deviations

**Tasks:**
- [ ] Create `dev/scripts/xim-learn.ts`
- [ ] Implement behavior profiler (build baselines)
- [ ] Build statistical model (mean, stddev, percentiles)
- [ ] Create anomaly detector (>2σ from mean)
- [ ] Add confidence scoring
- [ ] Implement alert system
- [ ] Create baseline storage (per door)
- [ ] Add adaptive learning (update baselines)
- [ ] Build anomaly report generator

**Learning Process:**
```bash
# Learn normal behavior for WHO door
npm run xim:learn -- --door WHO --sessions 50

# Detect anomalies
npm run xim:detect -- --door WHO --session logs/xim-debug.json
```

**Baseline Storage:**
```json
{
  "door": "WHO",
  "version": "1.0",
  "sessions": 50,
  "learned": "2025-12-29T12:00:00Z",
  "metrics": {
    "avgDuration": { "mean": 2.3, "stddev": 0.4 },
    "msgCount": { "mean": 127, "stddev": 15 },
    "responseTime": { "p50": 45, "p95": 120, "p99": 450 },
    "messageTypes": {
      "JH_INIT": { "count": 1, "timing": { "mean": 12, "stddev": 3 } },
      "JH_SM": { "count": 42, "timing": { "mean": 45, "stddev": 12 } }
    }
  }
}
```

**Anomaly Detection:**
```
[ANOMALY DETECTED] WHO door session deviates from baseline

Deviations:
  [HIGH] Duration: 0.8s (expected 2.3±0.4s, -65% deviation)
  [HIGH] Message count: 89 (expected 127±15, -30% deviation)
  [MEDIUM] Response time P95: 450ms (expected 120ms, +275% deviation)

Confidence: 87%
Likely cause: Door crashed early or stuck in loop
```

**Acceptance Criteria:**
- Learns from historical data
- Detects anomalies accurately
- Low false positive rate (<5%)
- Updates baselines adaptively
- Clear confidence scores

---

### 3.2 Fuzzing Tool (`xim:fuzz`)

**Description:** Send randomized/malformed messages to find crashes

**Tasks:**
- [ ] Create `dev/scripts/xim-fuzz.ts`
- [ ] Implement message generator (valid + invalid)
- [ ] Build mutation engine (modify valid messages)
- [ ] Add crash detector
- [ ] Create corpus manager (interesting inputs)
- [ ] Implement coverage tracking (if possible)
- [ ] Add crash report generator
- [ ] Build test case minimizer
- [ ] Document fuzzing guide

**Features:**
```bash
# Fuzz WHO door for 1 hour
npm run xim:fuzz -- --door WHO --duration 1h

# Fuzz with custom corpus
npm run xim:fuzz -- --door WHO --corpus fuzzing/corpus/ --iterations 10000

# Minimize crashing input
npm run xim:fuzz -- --minimize crash-12345.json
```

**Fuzzing Strategies:**
1. Random valid messages
2. Mutated valid messages (flip bits, change lengths)
3. Invalid message types
4. Malformed data (wrong lengths, corrupt data)
5. Timing attacks (rapid-fire, delays)
6. State confusion (send out-of-order)

**Crash Reporting:**
```
[CRASH FOUND] Input: crash-12345.json

Message:
  Type: JH_HK (0x00000004)
  Param: 4294967295 (0xFFFFFFFF)  # Max uint32
  Data: "\x00\x00\x00..." (4096 bytes)

Crash:
  Signal: SIGSEGV
  Address: 0xDEADBEEF
  Last message: JH_SM at 12:45:01.234

Minimized Input: crash-12345-min.json (12 bytes)
```

**Acceptance Criteria:**
- Generates diverse test cases
- Detects crashes reliably
- Minimizes crashing inputs
- Saves corpus for replay
- Integrates with CI/CD

---

### 3.3 Multi-Door Correlation

**Description:** Detect resource contention between concurrent doors

**Tasks:**
- [ ] Create `dev/scripts/xim-correlate.ts`
- [ ] Implement multi-session analyzer
- [ ] Build resource conflict detector
- [ ] Add timing correlation engine
- [ ] Create contention report generator
- [ ] Implement visualization (Gantt chart)
- [ ] Add recommendations engine
- [ ] Document multi-door debugging

**Resource Conflicts:**
1. File lock conflicts (same file accessed)
2. Memory exhaustion (multiple AllocMem)
3. Port conflicts (same port name)
4. CPU starvation (one door hogging CPU)
5. I/O contention (disk/network)

**Features:**
```bash
# Analyze multi-door session
npm run xim:correlate -- --sessions logs/session-*.json

# Find resource conflicts
npm run xim:correlate -- --conflicts --sessions logs/*.json
```

**Output:**
```
╔═══════════════════════════════════════════════════════════════╗
║                  Multi-Door Correlation Analysis               ║
╚═══════════════════════════════════════════════════════════════╝

Sessions: 3 doors (WHO, RTOP, MultiTop)
Duration: 10.5s
Overlapping time: 8.2s

RESOURCE CONFLICTS DETECTED:

[CRITICAL] File Lock Contention
  File: ~/Code/amiexpress-web/User.data
  Doors: WHO (N1), RTOP (N2)
  Timeline:
    12:45:01.234 - WHO locks file (Open)
    12:45:01.456 - RTOP attempts lock (BLOCKED for 1850ms)
    12:45:03.306 - WHO releases lock (Close)
    12:45:03.306 - RTOP acquires lock

  Impact: RTOP delayed by 1850ms
  Fix: Use shorter lock duration or different file

[WARNING] Memory Pressure
  Total allocated: 47MB across 3 doors
  Peak: 52MB at 12:45:05.678
  Doors: MultiTop (30MB), WHO (12MB), RTOP (10MB)

  Impact: Potential memory exhaustion if more doors start
  Fix: Implement memory limits per door

TIMING CORRELATION:
  - RTOP slowdown coincides with WHO file I/O
  - MultiTop message rate drops when WHO starts
```

**Acceptance Criteria:**
- Detects resource conflicts
- Correlates timing issues
- Actionable recommendations
- Visualization of contention
- Works with 10+ concurrent doors

---

### 3.4 Smart Suggestions with Confidence

**Description:** AI-powered issue diagnosis with confidence scoring

**Tasks:**
- [ ] Create `dev/scripts/xim-suggest.ts`
- [ ] Build issue classifier (pattern matching + ML)
- [ ] Implement confidence scoring algorithm
- [ ] Create knowledge base (issues + solutions)
- [ ] Add code snippet extractor
- [ ] Build suggestion ranker
- [ ] Implement explanation generator
- [ ] Add feedback loop (user confirms/rejects)
- [ ] Document suggestion system

**Features:**
```bash
# Get suggestions for current session
npm run xim:suggest -- --door WHO

# Get suggestions from log file
npm run xim:suggest -- --file logs/xim-debug-error.json --top 5
```

**Output:**
```
╔═══════════════════════════════════════════════════════════════╗
║                    Smart Diagnostic Suggestions                ║
╚═══════════════════════════════════════════════════════════════╝

[1] GetMsg() Infinite Loop - CONFIDENCE: 95%

Evidence:
  - No outgoing messages for 5234ms after JH_HK
  - Last received: JH_HK at 12:45:01.456 (param=65, key='A')
  - Expected: JH_SM response within 2000ms
  - CPU likely at 100% (tight loop)

Root Cause:
  Door is stuck in GetMsg() waiting for message that never arrives.
  Possible causes:
    1. Missing timeout in Wait() call
    2. Wrong signal mask in WaitPort()
    3. Reply port not properly configured

Suggested Fix:
  Check door code at message loop entry point:

  // Before:
  msg = (XIMMessage *)GetMsg(replyPort);  // Blocks forever

  // After:
  msg = (XIMMessage *)GetMsg(replyPort);
  if (!msg) {
      // Add timeout handling
      if (Wait(SIGBREAKF_CTRL_C | (1L << replyPort->mp_SigBit))) {
          // Check which signal
      }
  }

Related Code: DoorMessageHandler.ts:234
Similar Issues: 47 matches in knowledge base (98% resolved)
Documentation: XIM_PROTOCOL.md#message-loop

[2] Memory Leak Suspected - CONFIDENCE: 72%

Evidence:
  - 47 AllocMem calls detected
  - 0 FreeMem calls detected
  - Total allocated: ~12MB

Root Cause:
  Door allocates memory but never frees it.

Suggested Fix:
  Add FreeMem calls for each AllocMem:

  // Ensure cleanup:
  void cleanup() {
      if (buffer) {
          FreeMem(buffer, bufferSize);
          buffer = NULL;
      }
  }

[3] Protocol Violation - CONFIDENCE: 100%

Evidence:
  - Door sent JH_SM before receiving JH_INIT
  - Timestamp: 12:45:01.123 (3ms after door start)

Root Cause:
  Door doesn't wait for JH_INIT before sending messages.

Suggested Fix:
  Add state check:

  if (!initialized) {
      // Wait for JH_INIT first
      return;
  }
```

**Confidence Scoring:**
- Pattern match strength (0-100%)
- Historical accuracy (how often this suggestion was correct)
- Evidence quality (direct vs indirect)
- Knowledge base matches
- User feedback (confirmed/rejected)

**Acceptance Criteria:**
- Top suggestion is correct >90% of time
- Confidence scores are calibrated
- Provides code examples
- Links to documentation
- Learns from feedback

---

## Implementation Schedule

### Sprint 1: TIER 1 Foundation (Week 1-2)
- [ ] Smart Debug Command (xim:debug)
- [ ] Pattern-Based Issue Detection
- [ ] Session Diff Tool (xim:diff)

### Sprint 2: TIER 1 Completion (Week 3)
- [ ] Auto-Report Generator (xim:report)
- [ ] Backend Integration for Replay
- [ ] Documentation & Testing

### Sprint 3: TIER 2 Advanced Tools (Week 4-5)
- [ ] Web Dashboard
- [ ] Record/Replay for Regression
- [ ] Performance Profiler (xim:perf)

### Sprint 4: TIER 2 Visualization (Week 6)
- [ ] Timeline Visualizer
- [ ] Integration with Door Watcher
- [ ] Documentation & Testing

### Sprint 5: TIER 3 Intelligence (Week 7-8)
- [ ] Learning-Based Anomaly Detection
- [ ] Fuzzing Tool (xim:fuzz)

### Sprint 6: TIER 3 Advanced (Week 9-10)
- [ ] Multi-Door Correlation
- [ ] Smart Suggestions with Confidence
- [ ] Final Documentation & Polish

---

## Success Metrics

### TIER 1 Success:
- Average debugging time: 30min → 5min (83% reduction)
- Issues auto-detected: 0% → 80%
- Developer satisfaction: +90%

### TIER 2 Success:
- Regression detection: 0% → 95%
- Performance issues found: +300%
- Web dashboard adoption: 80% of devs

### TIER 3 Success:
- Anomaly detection accuracy: >90%
- Crashes found via fuzzing: 10+ per door
- Smart suggestions accuracy: >85%

---

## Risk & Mitigation

### Risks:
1. **Backend API changes** - Mitigation: Use versioned API
2. **Performance overhead** - Mitigation: Make tools opt-in
3. **False positives** - Mitigation: Tune confidence thresholds
4. **Scope creep** - Mitigation: Stick to phased plan

### Dependencies:
- Backend API stability
- Door watcher reliability
- XIM protocol stability

---

## Maintenance Plan

### Ongoing:
- Update pattern library with new issues
- Tune confidence scoring based on feedback
- Add new regression baselines
- Update knowledge base
- Performance optimization

### Quarterly:
- Review suggestion accuracy
- Update documentation
- Add new fuzzing strategies
- Optimize web dashboard

---

## Next Steps

1. Review and approve this plan
2. Prioritize phases based on immediate needs
3. Start with TIER 1 Smart Debug Command
4. Iterate based on feedback

---

**Document Version:** 1.0
**Last Updated:** 2025-12-29
**Owner:** Development Team
