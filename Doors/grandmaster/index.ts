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

import { ServerDoor, DoorContext } from '@amiexpress/bbs-door-sdk';
import { createApp } from './app';

/**
 * Metadata
 */
export const metadata = {
  name: 'GRANDMASTER',
  version: '1.0.0',
  description: 'TGM3-Inspired Multiplayer Tetris',
  author: 'AmiExpress SDK',
  command: 'GMASTER',
};

/**
 * Main door class
 */
const door = new ServerDoor(metadata);

door.onStart(async (ctx: DoorContext) => {
  const session = ctx;
  const args = session.params || [];
  const mode = args[0]?.toUpperCase();

  // Create and run the app
  await createApp(session as any, mode);
});

export default door;
export { createApp };
