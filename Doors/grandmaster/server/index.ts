/**
 * Server-Side Multiplayer Infrastructure
 *
 * Complete anti-cheat and leaderboard system for GRANDMASTER
 */

// Main coordinator
export { MultiplayerServer } from './multiplayer-server';
export type {
  ScoreSubmissionResult,
  MultiplayerConfig,
} from './multiplayer-server';

// Validation
export { GameValidator } from './game-validator';
export type {
  ValidationResult,
  ReplayData,
} from './game-validator';

// Leaderboards
export { LeaderboardManager } from './leaderboard-manager';
export type {
  LeaderboardEntry,
  LeaderboardQuery,
  LeaderboardStats,
} from './leaderboard-manager';

// Replays
export { ReplayManager, ReplayRecorder } from './replay-manager';
export type {
  InputAction,
  ReplayInput,
  ReplaySnapshot,
  ReplayMetadata,
  Replay,
} from './replay-manager';
