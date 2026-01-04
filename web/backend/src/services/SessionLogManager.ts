/**
 * Session Log Manager
 * Captures and stores terminal output for each BBS session
 * Enables real-time viewing of session logs in admin interface
 */

import * as fs from 'fs';
import * as path from 'path';

interface SessionLog {
  sessionId: string;
  userId?: string;
  username?: string;
  nodeId?: number;
  startTime: Date;
  lastActivity: Date;
  output: string[];  // Array of ANSI output strings
  maxLines: number;  // Maximum lines to keep in memory
}

class SessionLogManager {
  private logs: Map<string, SessionLog> = new Map();
  private readonly MAX_LINES_PER_SESSION = 5000;  // Keep last 5000 lines
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
      startTime: new Date(),
      lastActivity: new Date(),
      output: [],
      maxLines: this.MAX_LINES_PER_SESSION
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
    log.lastActivity = new Date();

    // Trim if exceeds max lines
    if (log.output.length > log.maxLines) {
      log.output = log.output.slice(-log.maxLines);
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

    log.output.push(`\x1b[33m[INPUT: ${displayInput}]\x1b[0m`);
    log.lastActivity = new Date();

    // Trim if exceeds max lines
    if (log.output.length > log.maxLines) {
      log.output = log.output.slice(-log.maxLines);
    }
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
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
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
