/**
 * Network Engine - Comprehensive Multiplayer Framework
 *
 * A complete multiplayer game framework for BBS doors providing:
 * - Real-time and turn-based multiplayer
 * - Matchmaking with skill-based ranking (Glicko-2)
 * - Pre-game lobbies with team management
 * - State synchronization (snapshot, delta, lockstep)
 * - Client-side prediction and server reconciliation
 * - Entity interpolation for smooth movement
 * - Player presence and activity tracking
 * - Social features (friends, parties, WebRTC voice chat)
 * - Leaderboards, statistics, and achievements
 * - Game replay recording and playback
 * - Anti-cheat and security validation
 *
 * @example Basic Usage
 * ```typescript
 * import { NetworkEngine } from '@amiexpress/sdk/engines/network';
 *
 * const network = new NetworkEngine();
 * await network.connect('ws://game-server.com');
 *
 * // Create a lobby
 * const lobby = await network.createLobby({ name: 'My Game', maxPlayers: 4 });
 *
 * // Or join matchmaking
 * await network.joinQueue({ queueType: 'ranked', gameMode: 'deathmatch' });
 * ```
 *
 * @example Direct Module Access
 * ```typescript
 * // Each module is accessible directly
 * network.matchmaking.joinQueue({ queueType: 'ranked' });
 * network.lobby.create({ name: 'Game' });
 * network.prediction.predictInput(input);
 * network.replay.startRecording();
 * network.social.addFriend(playerId);
 * ```
 *
 * @packageDocumentation
 */

// Main engine
export { NetworkEngine } from './network-engine';
export { default } from './network-engine';

// Sub-modules
export { ConnectionManager } from './modules/connection';
export { default as LobbySystem } from './modules/lobby';
export { MatchmakingEngine } from './modules/matchmaking';
export { StateSynchronizer } from './modules/sync';
export { PredictionEngine } from './modules/prediction';
export { InterpolationEngine } from './modules/interpolation';
export { PresenceManager } from './modules/presence';
export { SocialManager } from './modules/social';
export { LeaderboardManager } from './modules/leaderboard';
export { ReplaySystem } from './modules/replay';
export { SecurityManager } from './modules/security';

// All types
export type {
  // Core types
  Vector2,
  Vector3,
  Quaternion,
  PlayerInput,
  NetworkMessage,

  // Connection
  ConnectionConfig,
  ConnectionState,
  ConnectionStatus,
  ConnectionQuality,
  ConnectionEvents,

  // Rooms & Lobbies
  RoomConfig,
  Room,
  RoomState,
  NetworkPlayer,
  Lobby,
  LobbyConfig,
  LobbyPlayer,
  LobbyChatMessage,
  Team,
  GameSettings,
  Vote,
  VoteOption,

  // Matchmaking
  MatchmakingConfig,
  MatchmakingResult,
  MatchedPlayer,
  MatchFound,
  MatchRequirements,
  PlayerSkill,
  RankTier,
  QueueType,
  QueueStatus,

  // Synchronization
  SyncConfig,
  SyncStrategy,
  SyncState,
  Snapshot,
  DeltaUpdate,
  EntityState,
  EntityChange,
  AreaOfInterestConfig,
  PriorityZone,

  // Prediction
  PredictionConfig,
  PredictionState,
  InputFrame,
  RollbackState,

  // Interpolation
  InterpolationConfig,
  InterpolationMethod,
  EntitySnapshot,
  InterpolatedEntity,
  DeadReckoningConfig,

  // Presence
  PresenceConfig,
  PlayerPresence,
  PlayerStatus,
  PlayerActivity,
  ActivityType,

  // Social
  Friend,
  FriendRequest,
  Party,
  PartyMember,
  PartyInvite,
  GameInvite,
  BlockedPlayer,
  VoiceChatConfig,
  VoiceChannel,
  VoiceParticipant,

  // Leaderboards
  LeaderboardQuery,
  LeaderboardType,
  Leaderboard,
  LeaderboardEntry,
  PlayerStats,
  Achievement,
  AchievementCategory,
  AchievementRarity,
  MatchResult,
  MatchResultPlayer,

  // Replays
  ReplayConfig,
  ReplayMetadata,
  Replay,
  ReplayFrame,
  ReplayEvent,
  ReplayPlayer,
  ReplayPlayback,

  // Security
  SecurityConfig,
  RateLimitConfig,
  MovementValidationConfig,
  ActionValidationConfig,
  EncryptionConfig,
  AnticheatConfig,
  ValidationResult,
  PlayerReport,
  ReportReason,

  // Module interfaces
  NetworkModule,
  IConnectionManager,
  ILobbySystem,
  IMatchmakingEngine,
  IStateSynchronizer,
  IPredictionEngine,
  IInterpolationEngine,
  IPresenceManager,
  ISocialManager,
  ILeaderboardManager,
  IReplaySystem,
  ISecurityManager,

  // Events
  NetworkEvents,
} from './types';

// Re-export NetworkEngineConfig from main engine
export type { NetworkEngineConfig } from './network-engine';
