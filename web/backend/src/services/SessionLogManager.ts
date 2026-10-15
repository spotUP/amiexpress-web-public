/**
 * Session Log Manager
 * Captures and stores terminal output for each BBS session
 * Enables real-time viewing of session logs in admin interface
 */

import * as fs from 'fs';
import * as path from 'path';
import { getSystemTime } from '../utils/date-time.util';

interface SessionLog {
  sessionId: string;
  userId?: string;
  username?: string;
  nodeId?: number;
  startTime: Date;
  lastActivity: Date;
  output: string[];  // Array of ANSI output strings
  maxLines: number;  // Maximum lines to keep in memory
  /** Bytes currently held, so the budget is measured in what was actually written. */
  outputBytes: number;
}

class SessionLogManager {
  private logs: Map<string, SessionLog> = new Map();
  /**
   * WHY THE BUDGET IS BYTES, NOT CHUNKS.
   *
   * This kept the last 5000 CHUNKS, and a chunk is whatever one `emit` wrote
   * - which for a blessed door is a handful of cells. A door repainting its
   * screen produces thousands of them a second, so opening one door evicted
   * the caller's whole session and left a tail of cursor fragments that
   * rendered as nothing at all: "no typescript doors seem logged at all... or
   * no doors at all", and "a lot of stuff is still wiped from the scrollback"
   * (the sysop, 2026-09-24).
   *
   * Two megabytes is about a full evening of a caller's screen and costs less
   * than a single screenshot; the line cap stays as a ceiling on how many
   * pieces are held, far above what any door produces in a sitting.
   */
  private readonly MAX_BYTES_PER_SESSION = 2 * 1024 * 1024;
  private readonly MAX_LINES_PER_SESSION = 200000;
  private readonly LOG_RETENTION_MS = 3600000;    // Keep logs for 1 hour after disconnect

  /**
   * Start tracking a new session
   */
  startSession(sessionId: string, userId?: string, username?: string, nodeId?: number): void {
    this.logs.set(sessionId, {
      sessionId,
      userId,
      username,
      nodeId,
      startTime: getSystemTime(),
      lastActivity: getSystemTime(),
      output: [],
      maxLines: this.MAX_LINES_PER_SESSION,
      outputBytes: 0,
    });
console.log(`[SessionLogManager] Started tracking session: ${sessionId} (${username || 'guest'})`);
  }

  /**
   * Capture terminal output for a session
   */
  captureOutput(sessionId: string, output: string): void {
    const log = this.logs.get(sessionId);
    if (!log) {
      // Session not tracked yet - start tracking
      this.startSession(sessionId);
      return this.captureOutput(sessionId, output);
    }

    log.output.push(output);
    log.outputBytes += output.length;
    log.lastActivity = getSystemTime();
    this.trim(log);
  }

  /**
   * Drop the OLDEST chunks until the log is inside its budget.
   *
   * From the front, chunk by chunk: the log is a transcript, and the end of
   * it - what the caller is looking at now - is the part worth keeping.
   */
  private trim(log: SessionLog): void {
    while (log.output.length > 0
      && (log.outputBytes > this.MAX_BYTES_PER_SESSION || log.output.length > log.maxLines)) {
      const dropped = log.output.shift();
      log.outputBytes -= dropped ? dropped.length : 0;
    }
  }

  /**
   * Capture user input (keypresses) for debugging
   */
  captureInput(sessionId: string, input: string): void {
    const log = this.logs.get(sessionId);
    if (!log) {
      return;
    }

    // Format input with visual markers for debugging
    // Show actual key codes so you can see Enter, Backspace, etc.
    let displayInput = input;
    if (input === '\r' || input === '\n') {
      displayInput = '[ENTER]';
    } else if (input === '\x08' || input === '\x7f') {
      displayInput = '[BACKSPACE]';
    } else if (input === '\x1b') {
      displayInput = '[ESC]';
    } else if (input === '\t') {
      displayInput = '[TAB]';
    } else if (input.charCodeAt(0) < 32) {
      // Control character
      displayInput = `[CTRL-${String.fromCharCode(input.charCodeAt(0) + 64)}]`;
    }

    const marked = `\x1b[33m[INPUT: ${displayInput}]\x1b[0m`;
    log.output.push(marked);
    log.outputBytes += marked.length;
    log.lastActivity = getSystemTime();
    this.trim(log);
  }

  /**
   * Update session metadata (when user logs in)
   */
  updateSession(sessionId: string, userId: string, username: string, nodeId?: number): void {
    const log = this.logs.get(sessionId);
    if (log) {
      log.userId = userId;
      log.username = username;
      log.nodeId = nodeId;
console.log(`[SessionLogManager] Updated session metadata: ${sessionId} -> ${username}`);
    }
  }

  /**
   * End session tracking
   */
  endSession(sessionId: string): void {
    const log = this.logs.get(sessionId);
    if (log) {
console.log(`[SessionLogManager] Session ended: ${sessionId} (${log.username || 'guest'})`);

      // Keep log for retention period, then delete
      setTimeout(() => {
        this.logs.delete(sessionId);
console.log(`[SessionLogManager] Deleted old session log: ${sessionId}`);
      }, this.LOG_RETENTION_MS);
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Array<{
    sessionId: string;
    userId?: string;
    username?: string;
    nodeId?: number;
    startTime: Date;
    lastActivity: Date;
    lineCount: number;
  }> {
    const sessions: Array<any> = [];

    for (const [sessionId, log] of this.logs.entries()) {
      sessions.push({
        sessionId,
        userId: log.userId,
        username: log.username,
        nodeId: log.nodeId,
        startTime: log.startTime,
        lastActivity: log.lastActivity,
        lineCount: log.output.length
      });
    }

    // Sort by last activity (most recent first)
    sessions.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());

    return sessions;
  }

  /**
   * Get log for a specific session
   */
  getSessionLog(sessionId: string): {
    sessionId: string;
    userId?: string;
    username?: string;
    nodeId?: number;
    startTime: Date;
    lastActivity: Date;
    output: string[];
  } | null {
    const log = this.logs.get(sessionId);
    if (!log) {
      return null;
    }

    return {
      sessionId: log.sessionId,
      userId: log.userId,
      username: log.username,
      nodeId: log.nodeId,
      startTime: log.startTime,
      lastActivity: log.lastActivity,
      output: log.output
    };
  }

  /**
   * Get combined output as single string
   */
  getSessionOutput(sessionId: string): string | null {
    const log = this.logs.get(sessionId);
    if (!log) {
      return null;
    }

    return log.output.join('');
  }

  /**
   * Clear all logs (for testing/debugging)
   */
  clearAllLogs(): void {
    this.logs.clear();
console.log('[SessionLogManager] Cleared all session logs');
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalSessions: number;
    totalLines: number;
    oldestSession?: Date;
  } {
    let totalLines = 0;
    let oldestSession: Date | undefined;

    for (const log of this.logs.values()) {
      totalLines += log.output.length;
      if (!oldestSession || log.startTime < oldestSession) {
        oldestSession = log.startTime;
      }
    }

    return {
      totalSessions: this.logs.size,
      totalLines,
      oldestSession
    };
  }

  /**
   * Save session log to disk file
   * Returns the file path
   */
  saveToFile(sessionId: string): string | null {
    const log = this.logs.get(sessionId);
    if (!log) {
      return null;
    }

    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs', 'sessions');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Generate filename with timestamp and username
    const timestamp = getSystemTime().toISOString().replace(/[:.]/g, '-');
    const username = log.username || 'guest';
    const filename = `session_${username}_${timestamp}.log`;
    const filePath = path.join(logsDir, filename);

    // Write log to file
    const content = log.output.join('');
    fs.writeFileSync(filePath, content, 'utf8');

console.log(`[SessionLogManager] Saved session log to: ${filePath}`);
    return filePath;
  }
}

// Export singleton instance
export const sessionLogManager = new SessionLogManager();
