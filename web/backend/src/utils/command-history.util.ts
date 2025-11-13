/**
 * Command History Utility
 * 1:1 port from AmiExpress express.e:2158-2168, 2669-2713
 * Manages command history storage, retrieval, and persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { BBSSession } from '../index';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);

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
 * Load command history from disk (express.e:2669-2688)
 * Loads user's command history from persistent storage
 * @param session - BBS session
 * @param userId - User ID (slot number)
 */
export async function loadHistory(session: BBSSession, userId: number): Promise<void> {
  // express.e:31794-31795 - Check if history folder is configured
  const historyFolder = process.env.HISTORY_FOLDER || path.join(process.cwd(), 'data', 'history');

  if (!historyFolder) {
    return; // History disabled
  }

  // express.e:2674 - Build history filename with user slot number
  const historyFile = path.join(historyFolder, `history${userId}`);

  try {
    // express.e:2675 - Check if file exists and open
    await access(historyFile, fs.constants.R_OK);
    const content = await readFile(historyFile, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim().length > 0);

    if (lines.length < 2) {
      return; // Invalid file format
    }

    // express.e:2676-2679 - Read historyNum and historyCycle from first 2 lines
    session.historyIndex = parseInt(lines[0], 10);
    session.historyCycle = parseInt(lines[1], 10);

    // express.e:2681-2685 - Clear and load history buffer
    session.commandHistory = [];
    for (let i = 2; i < lines.length; i++) {
      if (lines[i].trim().length > 0) {
        session.commandHistory.push(lines[i]);
      }
    }
  } catch (error) {
    // File doesn't exist or can't be read - no history to load (express.e:2675)
    // This is normal for new users
  }
}

/**
 * Save command history to disk (express.e:2690-2713)
 * Persists user's command history for next session
 * @param session - BBS session
 * @param userId - User ID (slot number)
 */
export async function saveHistory(session: BBSSession, userId: number): Promise<void> {
  // express.e:31794-31795 - Check if history folder is configured
  const historyFolder = process.env.HISTORY_FOLDER || path.join(process.cwd(), 'data', 'history');

  if (!historyFolder) {
    return; // History disabled
  }

  try {
    // express.e:2695-2697 - Create history directory if it doesn't exist
    await mkdir(historyFolder, { recursive: true });

    // express.e:2699 - Build history filename with user slot number
    const historyFile = path.join(historyFolder, `history${userId}`);

    // express.e:2700-2707 - Write historyNum, historyCycle, and history entries
    const lines: string[] = [];
    lines.push(session.historyIndex.toString()); // express.e:2701-2702
    lines.push(session.historyCycle.toString()); // express.e:2703-2704

    // express.e:2705-2706 - Write all history entries
    for (const command of session.commandHistory) {
      lines.push(command);
    }

    await writeFile(historyFile, lines.join('\n') + '\n', 'utf-8');
  } catch (error) {
    console.error('[CommandHistory] Error saving history:', error);
    // Don't throw - history save failures shouldn't break logout
  }
}
