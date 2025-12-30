#!/usr/bin/env npx tsx
/**
 * XIM Pattern Analyzer - Advanced issue detection with pattern matching
 *
 * Analyzes XIM sessions to detect common issues automatically.
 * Uses pattern matching and statistical analysis for high-confidence diagnosis.
 *
 * Usage:
 *   npx tsx dev/scripts/xim-analyzer.ts [options]
 *
 * Examples:
 *   npm run xim:analyze
 *   npm run xim:analyze -- --door WHO
 *   npm run xim:analyze -- --file logs/xim-debug.json --verbose
 */

import * as fs from 'fs';
import * as readline from 'readline';
import { XIMIssueKnowledgeBase, IssueRecord } from './xim-issue-knowledge-base';

export interface XIMLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  direction: 'send' | 'receive';
  door: string;
  node: number;
  message: {
    type: string;
    typeCode: number;
    param?: number;
    dataLen?: number;
    dataText?: string;
    dataHex?: string;
  };
  context?: Record<string, any>;
}

export interface DetectedIssue {
  pattern: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  confidence: number; // 0-100
  evidence: string[];
  suggestedFix: string;
  code?: string;
  relatedMessages?: number[]; // Indices of related messages
  documentation?: string;
  knowledgeBase?: IssueRecord; // Enriched from knowledge base
}

interface PatternMatcher {
  name: string;
  detect: (messages: XIMLogEntry[]) => DetectedIssue | null;
}

export class XIMAnalyzer {
  private patterns: PatternMatcher[] = [];
  private knowledgeBase: XIMIssueKnowledgeBase;

  constructor() {
    this.knowledgeBase = new XIMIssueKnowledgeBase();
    this.registerPatterns();
  }

  private registerPatterns() {
    // Pattern 1: GetMsg() Infinite Loop
    this.patterns.push({
      name: 'GetMsg Infinite Loop',
      detect: (messages: XIMLogEntry[]) => {
        if (messages.length === 0) return null;

        // Find last message sent from backend
        let lastSentIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].direction === 'send') {
            lastSentIndex = i;
            break;
          }
        }

        if (lastSentIndex === -1) return null;

        const lastSent = messages[lastSentIndex];
        const lastTimestamp = new Date(lastSent.timestamp).getTime();
        const now = new Date(messages[messages.length - 1].timestamp).getTime();
        const silenceDuration = now - lastTimestamp;

        // If backend sent message but door hasn't responded in 5s
        if (silenceDuration > 5000 && lastSent.message.type !== 'JH_TERMINATE') {
          // Count how many pending messages
          const pendingCount = messages.slice(lastSentIndex + 1).filter(m => m.direction === 'send').length;

          return {
            pattern: 'GETMSG_LOOP',
            severity: 'critical',
            title: 'GetMsg() infinite loop detected',
            confidence: 95,
            evidence: [
              `No response from door for ${Math.floor(silenceDuration / 1000)}s`,
              `Last message sent: ${lastSent.message.type} at ${lastSent.timestamp}`,
              `Expected response within 2000ms`,
              `Door likely stuck in GetMsg() without timeout`
            ],
            suggestedFix: 'Add timeout handling to GetMsg() loop using Wait() with signal mask',
            code: `// Add timeout:\nULONG signals = Wait(SIGBREAKF_CTRL_C | (1L << replyPort->mp_SigBit));\nif (signals & (1L << replyPort->mp_SigBit)) {\n    msg = (XIMMessage *)GetMsg(replyPort);\n}`,
            relatedMessages: [lastSentIndex],
            documentation: 'XIM_PROTOCOL.md#message-loop-timeout'
          };
        }

        return null;
      }
    });

    // Pattern 2: Protocol Violation - JH_SM before JH_INIT
    this.patterns.push({
      name: 'Protocol Violation',
      detect: (messages: XIMLogEntry[]) => {
        for (let i = 0; i < Math.min(5, messages.length); i++) {
          const msg = messages[i];

          if (msg.message.type === 'JH_SM' && msg.direction === 'receive') {
            // Check if JH_INIT came before this
            const initBefore = messages.slice(0, i).some(m =>
              m.message.type === 'JH_INIT' && m.direction === 'send'
            );

            if (!initBefore) {
              return {
                pattern: 'PROTOCOL_VIOLATION',
                severity: 'critical',
                title: 'Protocol violation: JH_SM before JH_INIT',
                confidence: 100,
                evidence: [
                  `Door sent JH_SM at position ${i} (${msg.timestamp})`,
                  'JH_INIT not yet received from backend',
                  'XIM protocol requires JH_INIT to be first message',
                  'Backend may reject early messages'
                ],
                suggestedFix: 'Add initialization state check before sending any messages',
                code: `BOOL initialized = FALSE;\n\n// In message handler:\nif (msg->type == JH_INIT) {\n    initialized = TRUE;\n}\n\n// Before sending:\nif (!initialized) return; // Wait for JH_INIT`,
                relatedMessages: [i],
                documentation: 'XIM_PROTOCOL.md#initialization-sequence'
              };
            }
          }
        }

        return null;
      }
    });

    // Pattern 3: Memory Leak Detection
    this.patterns.push({
      name: 'Memory Leak',
      detect: (messages: XIMLogEntry[]) => {
        // Count AllocMem vs FreeMem in context (if available)
        let allocCount = 0;
        let freeCount = 0;

        for (const msg of messages) {
          if (msg.context?.operation === 'AllocMem') allocCount++;
          if (msg.context?.operation === 'FreeMem') freeCount++;
        }

        if (allocCount > 0 && freeCount === 0 && allocCount > 10) {
          return {
            pattern: 'MEMORY_LEAK',
            severity: 'warning',
            title: 'Potential memory leak detected',
            confidence: 75,
            evidence: [
              `${allocCount} AllocMem calls detected`,
              `${freeCount} FreeMem calls detected`,
              `Memory allocated but never freed`,
              'Leak will grow with door runtime'
            ],
            suggestedFix: 'Add FreeMem() calls for each AllocMem(), implement cleanup routine',
            code: `void cleanup() {\n    if (buffer) {\n        FreeMem(buffer, bufferSize);\n        buffer = NULL;\n    }\n}\n\n// Call cleanup on exit:\ncleanup();\nCloseLibrary(DOSBase);`,
            documentation: 'MEMORY_MANAGEMENT.md#cleanup'
          };
        }

        if (allocCount > freeCount && allocCount - freeCount > 5) {
          return {
            pattern: 'MEMORY_LEAK',
            severity: 'warning',
            title: 'Memory leak suspected - imbalanced alloc/free',
            confidence: 60,
            evidence: [
              `${allocCount} AllocMem calls`,
              `${freeCount} FreeMem calls`,
              `${allocCount - freeCount} allocations not freed`
            ],
            suggestedFix: 'Ensure every AllocMem has corresponding FreeMem',
            documentation: 'MEMORY_MANAGEMENT.md#alloc-free-balance'
          };
        }

        return null;
      }
    });

    // Pattern 4: Slow Response Times
    this.patterns.push({
      name: 'Slow Response',
      detect: (messages: XIMLogEntry[]) => {
        const slowResponses: Array<{ sent: XIMLogEntry; received: XIMLogEntry; delay: number; index: number }> = [];

        for (let i = 0; i < messages.length - 1; i++) {
          const msg = messages[i];

          if (msg.direction === 'send' && msg.message.type === 'JH_HK') {
            // Find next message from door
            for (let j = i + 1; j < messages.length; j++) {
              const response = messages[j];

              if (response.direction === 'receive') {
                const sentTime = new Date(msg.timestamp).getTime();
                const receivedTime = new Date(response.timestamp).getTime();
                const delay = receivedTime - sentTime;

                if (delay > 2000) {
                  slowResponses.push({ sent: msg, received: response, delay, index: i });
                }
                break;
              }
            }
          }
        }

        if (slowResponses.length > 3) {
          const avgDelay = slowResponses.reduce((sum, r) => sum + r.delay, 0) / slowResponses.length;
          const maxDelay = Math.max(...slowResponses.map(r => r.delay));

          return {
            pattern: 'SLOW_RESPONSE',
            severity: 'warning',
            title: 'Slow keystroke response times',
            confidence: 85,
            evidence: [
              `${slowResponses.length} slow responses detected`,
              `Average delay: ${Math.floor(avgDelay)}ms (expected <100ms)`,
              `Peak delay: ${Math.floor(maxDelay)}ms`,
              'User input feels sluggish'
            ],
            suggestedFix: 'Optimize keystroke handler, avoid blocking I/O operations',
            code: `// Avoid:\nchar *buffer = ReadFile(fh, 1024); // SLOW!\nProcessKey(key, buffer);\n\n// Instead:\nProcessKey(key);  // Fast path\nif (needsData) ReadFileAsync(fh); // Async I/O`,
            relatedMessages: slowResponses.map(r => r.index),
            documentation: 'PERFORMANCE.md#response-times'
          };
        }

        return null;
      }
    });

    // Pattern 5: Rapid-Fire Message Loop
    this.patterns.push({
      name: 'Rapid-Fire Loop',
      detect: (messages: XIMLogEntry[]) => {
        // Check for >100 messages in <1 second
        if (messages.length < 100) return null;

        const typeCount = new Map<string, number>();

        for (const msg of messages) {
          if (msg.direction === 'receive') {
            typeCount.set(msg.message.type, (typeCount.get(msg.message.type) || 0) + 1);
          }
        }

        for (const [type, count] of typeCount) {
          if (count > 100) {
            // Check timing
            const typeMsgs = messages.filter(m => m.message.type === type && m.direction === 'receive');
            const first = new Date(typeMsgs[0].timestamp).getTime();
            const last = new Date(typeMsgs[typeMsgs.length - 1].timestamp).getTime();
            const duration = last - first;

            if (duration < 1000) {
              return {
                pattern: 'RAPID_FIRE',
                severity: 'warning',
                title: `Rapid-fire message loop detected (${type})`,
                confidence: 90,
                evidence: [
                  `${count} ${type} messages in ${duration}ms`,
                  `Rate: ${Math.floor(count / (duration / 1000))} msgs/sec`,
                  'Possible infinite loop or missing delay',
                  'May cause performance issues'
                ],
                suggestedFix: 'Add delay between messages or check loop condition',
                code: `// Add delay:\nDelay(1); // 1/50th second\n\n// Or check condition:\nif (!shouldContinue) break;`,
                documentation: 'PERFORMANCE.md#message-throttling'
              };
            }
          }
        }

        return null;
      }
    });

    // Pattern 6: Door Crash Detection
    this.patterns.push({
      name: 'Door Crash',
      detect: (messages: XIMLogEntry[]) => {
        if (messages.length === 0) return null;

        const firstTime = new Date(messages[0].timestamp).getTime();
        const lastTime = new Date(messages[messages.length - 1].timestamp).getTime();
        const duration = lastTime - firstTime;

        // Very short session with few messages
        if (duration < 2000 && messages.length < 10) {
          const hasInit = messages.some(m => m.message.type === 'JH_INIT');
          const lastMsg = messages[messages.length - 1];

          return {
            pattern: 'CRASH',
            severity: 'critical',
            title: 'Door crashed or exited immediately',
            confidence: 90,
            evidence: [
              `Session lasted only ${duration}ms`,
              `Only ${messages.length} messages exchanged`,
              hasInit ? 'Received JH_INIT but crashed shortly after' : 'Never received JH_INIT',
              `Last message: ${lastMsg.message.type} at ${lastMsg.timestamp}`
            ],
            suggestedFix: 'Check door logs for crash dump, illegal instruction, or startup errors',
            documentation: 'DEBUGGING.md#crash-analysis'
          };
        }

        return null;
      }
    });

    // Pattern 7: Data Length Mismatch (Buffer Overrun)
    this.patterns.push({
      name: 'Buffer Overrun',
      detect: (messages: XIMLogEntry[]) => {
        const mismatches: Array<{ msg: XIMLogEntry; index: number }> = [];

        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];

          if (msg.message.dataLen !== undefined && msg.message.dataHex) {
            const declaredLen = msg.message.dataLen;
            const actualLen = msg.message.dataHex.length / 2; // Hex is 2 chars per byte

            if (declaredLen !== actualLen && Math.abs(declaredLen - actualLen) > 0) {
              mismatches.push({ msg, index: i });
            }
          }
        }

        if (mismatches.length > 0) {
          const first = mismatches[0];

          return {
            pattern: 'BUFFER_OVERRUN',
            severity: 'critical',
            title: 'Data length mismatch detected (possible buffer overrun)',
            confidence: 95,
            evidence: [
              `${mismatches.length} message(s) with length mismatch`,
              `First mismatch: ${first.msg.message.type}`,
              `Declared length: ${first.msg.message.dataLen}`,
              `Actual length: ${first.msg.message.dataHex!.length / 2}`,
              'May indicate memory corruption'
            ],
            suggestedFix: 'Verify buffer size calculations, ensure proper null termination',
            code: `// Ensure correct length:\nULONG dataLen = strlen(buffer);\nmsg.dataLen = dataLen;\nCopyMem(buffer, msg.data, dataLen);`,
            relatedMessages: mismatches.map(m => m.index),
            documentation: 'MEMORY_MANAGEMENT.md#buffer-safety'
          };
        }

        return null;
      }
    });

    // Pattern 8: Missing JH_INIT
    this.patterns.push({
      name: 'Missing Init',
      detect: (messages: XIMLogEntry[]) => {
        const hasInit = messages.some(m => m.message.type === 'JH_INIT' && m.direction === 'send');

        if (!hasInit && messages.length > 0) {
          return {
            pattern: 'NO_INIT',
            severity: 'critical',
            title: 'No JH_INIT message received',
            confidence: 95,
            evidence: [
              'Door never received JH_INIT from backend',
              `Session has ${messages.length} messages`,
              'Backend failed to send initialization',
              'Or door crashed before receiving it'
            ],
            suggestedFix: 'Check backend logs for door startup errors, verify reply port creation',
            documentation: 'XIM_PROTOCOL.md#initialization'
          };
        }

        return null;
      }
    });

    // Pattern 9: No Response Pattern
    this.patterns.push({
      name: 'No Response',
      detect: (messages: XIMLogEntry[]) => {
        const sent = messages.filter(m => m.direction === 'send');
        const received = messages.filter(m => m.direction === 'receive');

        if (sent.length > received.length + 10 && sent.length > 20) {
          return {
            pattern: 'NO_RESPONSE',
            severity: 'warning',
            title: 'Door not responding to backend messages',
            confidence: 80,
            evidence: [
              `Backend sent ${sent.length} messages`,
              `Door responded ${received.length} times`,
              `${sent.length - received.length} messages unanswered`,
              'Door may be stuck or ignoring messages'
            ],
            suggestedFix: 'Verify message loop processes all message types, check for GetMsg() hang',
            code: `// Handle all message types:\nswitch (msg->type) {\n    case JH_INIT: /* ... */ break;\n    case JH_HK: /* ... */ break;\n    case JH_STAT: /* ... */ break;\n    case JH_TERMINATE: /* ... */ break;\n    default: /* Log unknown */ break;\n}`,
            documentation: 'XIM_PROTOCOL.md#message-handling'
          };
        }

        return null;
      }
    });

    // Pattern 10: Incomplete Session (No JH_TERMINATE)
    this.patterns.push({
      name: 'Incomplete Session',
      detect: (messages: XIMLogEntry[]) => {
        if (messages.length === 0) return null;

        const hasTerminate = messages.some(m => m.message.type === 'JH_TERMINATE');
        const hasInit = messages.some(m => m.message.type === 'JH_INIT');

        if (hasInit && !hasTerminate && messages.length > 5) {
          // Check if session seems "done" (no new messages recently)
          const lastTime = new Date(messages[messages.length - 1].timestamp).getTime();
          const now = Date.now();

          if (now - lastTime > 10000) { // 10 seconds since last message
            return {
              pattern: 'INCOMPLETE',
              severity: 'info',
              title: 'Incomplete session - no JH_TERMINATE received',
              confidence: 70,
              evidence: [
                'Session started (JH_INIT received)',
                'But never properly terminated (no JH_TERMINATE)',
                `Last message: ${messages[messages.length - 1].message.type}`,
                'Door may have exited abruptly'
              ],
              suggestedFix: 'Ensure door waits for JH_TERMINATE before cleanup, handle Ctrl+C gracefully',
              code: `// Wait for terminate:\nwhile (running) {\n    msg = GetMsg(replyPort);\n    if (msg && msg->type == JH_TERMINATE) {\n        running = FALSE;\n    }\n}`,
              documentation: 'XIM_PROTOCOL.md#graceful-shutdown'
            };
          }
        }

        return null;
      }
    });
  }

  async analyze(logFile: string, doorFilter?: string): Promise<DetectedIssue[]> {
    const messages = await this.loadMessages(logFile, doorFilter);

    if (messages.length === 0) {
      return [{
        pattern: 'NO_MESSAGES',
        severity: 'critical',
        title: 'No XIM messages found',
        confidence: 100,
        evidence: [
          doorFilter ? `No messages for door: ${doorFilter}` : 'No messages in log file',
          'XIM logging may not be enabled',
          'Or door has not executed yet'
        ],
        suggestedFix: 'Ensure XIM_DEBUG_JSON=1 is set and door has been run',
        documentation: 'XIM_DEBUGGING_GUIDE.md#quick-start'
      }];
    }

    const issues: DetectedIssue[] = [];

    for (const pattern of this.patterns) {
      const issue = pattern.detect(messages);
      if (issue) {
        // Enrich with knowledge base data if available
        const kbIssues = this.knowledgeBase.getIssuesByPattern(issue.pattern);
        if (kbIssues.length > 0) {
          // Use first matching issue from knowledge base
          issue.knowledgeBase = kbIssues[0];

          // Enhance with knowledge base data
          if (!issue.code && issue.knowledgeBase.codeExample) {
            issue.code = `// Before (Wrong):\n${issue.knowledgeBase.codeExample.before}\n\n// After (Correct):\n${issue.knowledgeBase.codeExample.after}`;
          }

          // Add KB references to documentation
          if (issue.knowledgeBase.references.length > 0) {
            issue.documentation = issue.knowledgeBase.references.join(', ');
          }
        }

        issues.push(issue);
      }
    }

    // Sort by severity and confidence
    issues.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.confidence - a.confidence;
    });

    return issues;
  }

  private async loadMessages(logFile: string, doorFilter?: string): Promise<XIMLogEntry[]> {
    if (!fs.existsSync(logFile)) {
      return [];
    }

    const messages: XIMLogEntry[] = [];
    const fileStream = fs.createReadStream(logFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const entry: XIMLogEntry = JSON.parse(line);

          // Skip system messages
          if (entry.door === 'SYSTEM') continue;

          // Apply filter
          if (doorFilter && entry.door !== doorFilter) continue;

          messages.push(entry);
        } catch (err) {
          // Ignore invalid JSON
        }
      }
    }

    return messages;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  let doorFilter: string | undefined;
  let logFile = process.env.XIM_LOG_FILE || 'logs/xim-debug.json';
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--door') {
      doorFilter = args[++i];
    } else if (args[i] === '--file') {
      logFile = args[++i];
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      verbose = true;
    } else if (args[i] === '--help') {
      console.log(`
XIM Pattern Analyzer - Advanced issue detection

Usage:
  npx tsx dev/scripts/xim-analyzer.ts [options]

Options:
  --door NAME         Analyze specific door only
  --file PATH        Custom log file path
  --verbose, -v      Show detailed output
  --help             Show this help

Examples:
  npm run xim:analyze
  npm run xim:analyze -- --door WHO
  npm run xim:analyze -- --file logs/xim-debug.json --verbose
`);
      process.exit(0);
    }
  }

  const analyzer = new XIMAnalyzer();

  analyzer.analyze(logFile, doorFilter).then(issues => {
    console.log('\x1b[1;36m╔═══════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;36m║                    XIM Pattern Analyzer                        ║\x1b[0m');
    console.log('\x1b[1;36m╚═══════════════════════════════════════════════════════════════╝\x1b[0m\n');

    if (doorFilter) {
      console.log(`  Door: \x1b[1;37m${doorFilter}\x1b[0m`);
    }
    console.log(`  Log: \x1b[0;37m${logFile}\x1b[0m`);
    console.log('');

    if (issues.length === 0) {
      console.log('  \x1b[1;32m✓ No issues detected\x1b[0m\n');
    } else {
      console.log(`  \x1b[1;33mIssues Found: ${issues.length}\x1b[0m\n`);

      for (let i = 0; i < issues.length; i++) {
        const issue = issues[i];
        const icon = issue.severity === 'critical' ? '\x1b[1;31m✗\x1b[0m' : issue.severity === 'warning' ? '\x1b[1;33m!\x1b[0m' : '\x1b[0;36mⓘ\x1b[0m';

        console.log(`  ${icon} [${issue.severity.toUpperCase()}] ${issue.title}`);
        console.log(`     Confidence: ${issue.confidence}%`);
        console.log(`     Pattern: ${issue.pattern}`);

        if (verbose) {
          console.log('');
          console.log('     Evidence:');
          for (const evidence of issue.evidence) {
            console.log(`       - ${evidence}`);
          }
          console.log('');
          console.log(`     Fix: ${issue.suggestedFix}`);

          if (issue.code) {
            console.log('');
            console.log('     Code:');
            console.log('     ```');
            issue.code.split('\n').forEach(line => console.log(`     ${line}`));
            console.log('     ```');
          }

          if (issue.documentation) {
            console.log(`     Docs: ${issue.documentation}`);
          }
        }

        console.log('');
      }

      if (!verbose) {
        console.log('  \x1b[0;37mRun with --verbose for detailed output\x1b[0m\n');
      }
    }
  }).catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}
