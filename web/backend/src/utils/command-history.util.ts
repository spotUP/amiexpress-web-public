/**
 * Command History Utility
 * 1:1 port from AmiExpress express.e:2158-2168, 2669-2713
 * Manages command history storage, retrieval, and persistence
 *
 * Updated to use SQLite database for persistence instead of files
 */

import { BBSSession } from '../index';
import { getDatabase } from '../handlers/command-handler/dependency-injection';

// Maximum history size (express.e:2159)
const MAX_HISTORY_SIZE = 20;

/**
 * Add command to history (express.e:2158-2168)
 * Uses circular buffer with 20-item limit
 * @param session - BBS session
 * @param text - Command text to add
 */
export function addToHistory(session: BBSSession, text: string): void {
  // Don't add empty commands
  if (!text || text.trim().length === 0) {
    return;
  }

  // express.e:2159-2161 - If buffer not full, append
  if (session.commandHistory.length < MAX_HISTORY_SIZE) {
    session.historyIndex = session.commandHistory.length;
    session.commandHistory.push(text);
    session.historyCycle = session.historyIndex;
  } else {
    // express.e:2162-2166 - Buffer full, use circular replacement
    session.commandHistory[session.historyIndex] = text;
    session.historyCycle = session.historyIndex;
    session.historyIndex++;
    if (session.historyIndex >= session.commandHistory.length) {
      session.historyIndex = 0;
    }
  }
}

/**
 * Get previous command from history (Up Arrow) (express.e:2258-2274)
 * @param session - BBS session
 * @returns Previous command or null if at start
 */
export function getPreviousCommand(session: BBSSession): string | null {
  if (session.commandHistory.length === 0) {
    return null;
  }

  // express.e:2268-2270 - Get command at current cycle position and decrement
  const command = session.commandHistory[session.historyCycle];
  session.historyCycle--;
  if (session.historyCycle < 0) {
    session.historyCycle = session.commandHistory.length - 1;
  }
  return command;
}

/**
 * Get next command from history (Down Arrow) (express.e:2275-2291)
 * @param session - BBS session
 * @returns Next command or null if at end
 */
export function getNextCommand(session: BBSSession): string | null {
  if (session.commandHistory.length === 0) {
    return null;
  }

  // express.e:2285-2287 - Get command at current cycle position and increment
  const command = session.commandHistory[session.historyCycle];
  session.historyCycle++;
  if (session.historyCycle >= session.commandHistory.length) {
    session.historyCycle = 0;
  }
  return command;
}

/**
 * Clear command history (Ctrl-B) (express.e:2236-2239)
 * @param session - BBS session
 */
export function clearHistory(session: BBSSession): void {
  session.commandHistory = [];
  session.historyIndex = 0;
  session.historyCycle = 0;
}

/**
 * Load command history from database (express.e:2669-2688)
 * Loads user's command history from persistent storage
 * @param session - BBS session
 * @param userId - User ID (string for database)
 */
export async function loadHistory(session: BBSSession, userId: number | string): Promise<void> {
  try {
    const db = getDatabase();
    if (!db) {
      console.log('[CommandHistory] Database not available for loadHistory');
      return;
    }

    // Query command history from database
    const userIdStr = String(userId);
    const result = await db.query(
      'SELECT history_num, history_cycle, commands FROM command_history WHERE user_id = ?',
      [userIdStr]
    );

    if (!result.rows || result.rows.length === 0) {
      // No history for this user yet - normal for new users
      console.log(`[CommandHistory] No history found for user ${userIdStr}`);
      return;
    }

    const row = result.rows[0];

    // Restore session state from database
    session.historyIndex = row.history_num || 0;
    session.historyCycle = row.history_cycle || 0;

    // Parse commands JSON array
    try {
      const commands = JSON.parse(row.commands || '[]');
      if (Array.isArray(commands)) {
        session.commandHistory = commands;
        console.log(`[CommandHistory] Loaded ${commands.length} commands for user ${userIdStr}`);
      }
    } catch {
      // Invalid JSON - reset history
      session.commandHistory = [];
      console.log(`[CommandHistory] Invalid JSON for user ${userIdStr}, resetting history`);
    }
  } catch (error) {
    // Database error - no history to load
    console.error('[CommandHistory] Error loading history:', error);
  }
}

/**
 * Save command history to database (express.e:2690-2713)
 * Persists user's command history for next session
 * @param session - BBS session
 * @param userId - User ID (string for database)
 */
export async function saveHistory(session: BBSSession, userId: number | string): Promise<void> {
  try {
    const db = getDatabase();
    if (!db) {
      console.log('[CommandHistory] Database not available for saveHistory');
      return;
    }

    const userIdStr = String(userId);
    const commandsJson = JSON.stringify(session.commandHistory);
    const now = Math.floor(Date.now() / 1000);

    // Upsert command history (insert or replace)
    await db.run(
      `INSERT INTO command_history (user_id, history_num, history_cycle, commands, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         history_num = excluded.history_num,
         history_cycle = excluded.history_cycle,
         commands = excluded.commands,
         updated_at = excluded.updated_at`,
      [userIdStr, session.historyIndex, session.historyCycle, commandsJson, now]
    );
    console.log(`[CommandHistory] Saved ${session.commandHistory.length} commands for user ${userIdStr}`);
  } catch (error) {
    console.error('[CommandHistory] Error saving history:', error);
    // Don't throw - history save failures shouldn't break logout
  }
}
