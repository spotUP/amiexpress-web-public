/**
 * GRANDMASTER - TGM3-Inspired Multiplayer Tetris
 *
 * A next-generation Tetris experience for BBS featuring:
 * - Authentic TGM3 mechanics (20G gravity, IRS/IHS, lock delay)
 * - Full grading system (9 -> S13 -> m9 -> GM)
 * - Real-time multiplayer with garbage attacks
 * - 14 game modes including Battle Royale
 * - 4 rotation systems (SRS, ARS, NRS, BARS)
 * - AI opponents with 10 difficulty levels
 *
 * Commands:
 *   GMASTER           - Launch (main menu)
 *   GMASTER MASTER    - Master mode solo
 *   GMASTER VERSUS    - Multiplayer lobby
 *   GMASTER SPRINT    - 40-line sprint
 *   GMASTER STATS     - Your statistics
 */

import { createApp } from './app';

/**
 * Door session interface
 */
interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params?: string[];
  args?: string[];
}

export { createApp };

/**
 * Door entry point - called by BBS when user runs GMASTER command
 */
export async function runDoor(session: DoorSession): Promise<void> {
  // Parse command arguments for direct mode launch
  const args = session.args || [];
  const mode = args[0]?.toUpperCase();

  // Create and run the app
  await createApp(session, mode);
}

// Default export for compatibility
export default runDoor;
