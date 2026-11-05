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
import { ServerDoor } from '@amiexpress/bbs-door-sdk';
import { createApp } from './app';
/**
 * Metadata
 */
export declare const metadata: {
    name: string;
    version: string;
    description: string;
    author: string;
    command: string;
};
/**
 * Main door class
 */
declare const door: ServerDoor;
export default door;
export { createApp };
//# sourceMappingURL=index.d.ts.map