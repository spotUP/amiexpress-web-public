/**
 * NetworkEngine Types
 *
 * Comprehensive type definitions for modern multiplayer game networking.
 * Supports real-time, turn-based, and hybrid multiplayer modes.
 */

// ============================================================================
// Core Types
// ============================================================================

/** Network message for inter-player communication */
export interface NetworkMessage {
  type: string;
  from: number;
  to: number;  // 0 = broadcast
  data: any;
  timestamp: number;
  reliable?: boolean;
  channel?: string;
}

/** Vector3 for 3D positions */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** Vector2 for 2D positions */
export interface Vector2 {
  x: number;
  y: number;
}

/** Quaternion for rotations */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Player input state */
export interface PlayerInput {
  tick: number;
  timestamp: number;
  keys: Record<string, boolean>;
  mouse?: {
    x: number;
    y: number;
    buttons: number;
  };
  actions?: string[];
  custom?: Record<string, any>;
}

// ============================================================================
// Connection Types
// ============================================================================

/** Connection status */
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/** Connection quality level */
export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

/** Connection state with metrics */
export interface ConnectionState {
  status: ConnectionStatus;
  latency: number;           // RTT in ms
  packetLoss: number;        // 0-1 percentage
  jitter: number;            // Latency variance in ms
  quality: ConnectionQuality;
  bytesReceived: number;
  bytesSent: number;
  connectedAt?: Date;
  reconnectAttempts: number;
}

/** Connection configuration */
export interface ConnectionConfig {
  serverUrl: string;
  autoConnect?: boolean;
  reconnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  reconnectDelayMax?: number;
  heartbeatInterval?: number;
  timeout?: number;
  transports?: ('websocket' | 'polling')[];
  auth?: Record<string, any>;
}

/** Connection events */
export interface ConnectionEvents {
  'connect': () => void;
  'disconnect': (reason: string) => void;
  'reconnect': (attempt: number) => void;
  'reconnect_attempt': (attempt: number) => void;
  'reconnect_failed': () => void;
  'error': (error: Error) => void;
  'latency': (ms: number) => void;
  'quality_change': (quality: ConnectionQuality) => void;
}

// ============================================================================
// Room/Lobby Types
// ============================================================================

/** Room state */
export type RoomState = 'waiting' | 'countdown' | 'starting' | 'playing' | 'paused' | 'finished';

/** Room configuration */
export interface RoomConfig {
  id?: string;
  name: string;
  maxPlayers: number;
  minPlayers?: number;
  password?: string;
  isPrivate?: boolean;
  turnBased?: boolean;
  turnTimeLimit?: number;
  allowSpectators?: boolean;
  allowLateJoin?: boolean;
  autoStart?: boolean;
  countdownSeconds?: number;
  data?: Record<string, any>;
}

/** Room instance */
export interface Room {
  id: string;
  config: RoomConfig;
  players: NetworkPlayer[];
  spectators: NetworkPlayer[];
  state: RoomState;
  hostId: number;
  currentTurn?: number;
  countdown?: number;
  created: Date;
  started?: Date;
  ended?: Date;
  inviteCode?: string;
}

/** Player in network context */
export interface NetworkPlayer {
  id: number;
  username: string;
  node: number;
  latency: number;
  ready: boolean;
  spectator: boolean;
  team?: number;
  slot?: number;
  joinedAt: Date;
  data: Record<string, any>;
}

// ============================================================================
// Lobby Types
// ============================================================================

/** Lobby player with additional lobby state */
export interface LobbyPlayer extends NetworkPlayer {
  isHost: boolean;
  color?: string;
  character?: string;
  loadingProgress?: number;
}

/** Team definition */
export interface Team {
  id: number;
  name: string;
  color: string;
  players: LobbyPlayer[];
  maxSize: number;
  score?: number;
}

/** Game settings for lobby */
export interface GameSettings {
  mode: string;
  map?: string;
  duration?: number;
  scoreLimit?: number;
  difficulty?: string;
  matchmaking?: boolean;
  customRules: Record<string, any>;
}

/** Vote option */
export interface VoteOption {
  id: string;
  label: string;
  votes: number;
  voters: number[];
}

/** Active vote */
export interface Vote {
  id: string;
  type: 'map' | 'mode' | 'kick' | 'custom';
  options: VoteOption[];
  deadline: Date;
  required: number;  // Votes needed to pass
}

/** Lobby configuration */
export interface LobbyConfig {
  name: string;
  maxPlayers: number;
  teamCount?: number;
  teamSize?: number;
  isPrivate?: boolean;
  password?: string;
  settings?: Partial<GameSettings>;
  allowVoting?: boolean;
  readyTimeout?: number;
}

/** Lobby instance */
export interface Lobby {
  id: string;
  name: string;
  host: LobbyPlayer;
  players: LobbyPlayer[];
  teams: Team[];
  settings: GameSettings;
  state: RoomState;
  countdown: number;
  maxPlayers: number;
  isPrivate: boolean;
  inviteCode?: string;
  votes: Vote[];
  chat: LobbyChatMessage[];
  created: Date;
}

/** Lobby chat message */
export interface LobbyChatMessage {
  id: string;
  playerId: number;
  username: string;
  message: string;
  timestamp: Date;
  type: 'chat' | 'system' | 'emote';
}

// ============================================================================
// Matchmaking Types
// ============================================================================

/** Queue type */
export type QueueType = 'ranked' | 'casual' | 'custom' | 'tournament';

/** Matchmaking configuration */
export interface MatchmakingConfig {
  queueType: QueueType;
  gameMode: string;
  skillRange?: number;
  maxWaitTime?: number;
  partyId?: string;
  preferredRegions?: string[];
  crossPlay?: boolean;
  requirements?: MatchRequirements;
}

/** Match requirements */
export interface MatchRequirements {
  minLevel?: number;
  maxLevel?: number;
  minRank?: string;
  maxRank?: string;
  requiredDLC?: string[];
}

/** Player skill rating */
export interface PlayerSkill {
  rating: number;           // ELO/MMR value
  uncertainty: number;      // Glicko-2 RD
  volatility?: number;      // Glicko-2 sigma
  peakRating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  streak: number;
  tier?: RankTier;
}

/** Rank tier */
export interface RankTier {
  name: string;
  division?: number;
  icon?: string;
  minRating: number;
  maxRating?: number;
  color: string;
}

/** Matched player info */
export interface MatchedPlayer {
  id: number;
  username: string;
  skill: PlayerSkill;
  partyId?: string;
  team?: number;
  region: string;
}

/** Matchmaking result */
export interface MatchmakingResult {
  matchId: string;
  players: MatchedPlayer[];
  teams?: MatchedPlayer[][];
  averageSkill: number;
  skillSpread: number;
  estimatedQuality: number;
  region: string;
  serverInfo?: ServerInfo;
}

/** Server info for dedicated servers */
export interface ServerInfo {
  address: string;
  port: number;
  region: string;
  name?: string;
}

/** Queue status */
export interface QueueStatus {
  inQueue: boolean;
  queueType?: QueueType;
  position?: number;
  estimatedWait?: number;
  searchTime: number;
  skillRange: number;
  playersInQueue?: number;
}

/** Match found notification */
export interface MatchFound {
  matchId: string;
  players: MatchedPlayer[];
  acceptDeadline: Date;
  accepted: number[];
  declined: number[];
}

// ============================================================================
// Synchronization Types
// ============================================================================

/** Sync strategy */
export type SyncStrategy = 'snapshot' | 'delta' | 'lockstep' | 'client-auth';

/** Sync configuration */
export interface SyncConfig {
  strategy: SyncStrategy;
  tickRate: number;           // Ticks per second
  snapshotRate?: number;      // Snapshots per second
  interpolationDelay?: number; // ms of buffer
  maxDeltaSize?: number;      // Force full snapshot above this
  compression?: boolean;
  checksumValidation?: boolean;
  priorityLevels?: number;
  areaOfInterest?: AreaOfInterestConfig;
}

/** Area of interest configuration */
export interface AreaOfInterestConfig {
  enabled: boolean;
  radius: number;
  updateInterval: number;
  priorityZones?: PriorityZone[];
}

/** Priority zone for area of interest */
export interface PriorityZone {
  center: Vector3;
  radius: number;
  priority: number;
}

/** Entity state for synchronization */
export interface EntityState {
  id: string;
  type: string;
  ownerId?: number;
  position?: Vector3;
  rotation?: Quaternion;
  velocity?: Vector3;
  health?: number;
  state?: string;
  priority: number;
  lastUpdate: number;
  custom: Record<string, any>;
}

/** Entity change for delta updates */
export interface EntityChange {
  entityId: string;
  changeType: 'create' | 'update' | 'delete';
  fields?: Partial<EntityState>;
  timestamp: number;
}

/** State snapshot */
export interface Snapshot {
  tick: number;
  timestamp: number;
  serverTime: number;
  entities: EntityState[];
  checksum: string;
  compressed?: boolean;
}

/** Delta update */
export interface DeltaUpdate {
  baseTick: number;
  targetTick: number;
  timestamp: number;
  changes: EntityChange[];
  compressed?: boolean;
}

/** Sync state */
export interface SyncState {
  localTick: number;
  serverTick: number;
  tickDelta: number;
  lastSnapshot: Snapshot | null;
  pendingDeltas: DeltaUpdate[];
  desyncCount: number;
}

// ============================================================================
// Prediction Types
// ============================================================================

/** Prediction configuration */
export interface PredictionConfig {
  enabled: boolean;
  maxPredictionFrames: number;
  correctionSmoothing: number;  // 0-1
  rollbackEnabled: boolean;
  maxRollbackFrames: number;
  inputDelay?: number;
}

/** Input frame for prediction */
export interface InputFrame {
  tick: number;
  timestamp: number;
  inputs: PlayerInput;
  predicted: boolean;
  acknowledged: boolean;
  serverState?: any;
}

/** Prediction state */
export interface PredictionState {
  predictedTick: number;
  serverTick: number;
  pendingInputs: InputFrame[];
  mispredictions: number;
  correctionAmount: number;
  lastReconcile: number;
}

/** Rollback state for fighting games */
export interface RollbackState {
  tick: number;
  gameState: any;
  inputs: Map<number, PlayerInput>;
}

// ============================================================================
// Interpolation Types
// ============================================================================

/** Interpolation method */
export type InterpolationMethod = 'linear' | 'cubic' | 'hermite' | 'catmull-rom';

/** Interpolation configuration */
export interface InterpolationConfig {
  method: InterpolationMethod;
  bufferSize: number;
  bufferTime: number;          // ms
  extrapolationLimit: number;  // ms
  snapThreshold: number;       // Distance to teleport
  rotationSnapThreshold: number;
}

/** Entity snapshot for interpolation */
export interface EntitySnapshot {
  entityId: string;
  tick: number;
  timestamp: number;
  position: Vector3;
  rotation: Quaternion;
  velocity?: Vector3;
  angularVelocity?: Vector3;
  custom?: Record<string, any>;
}

/** Interpolated entity state */
export interface InterpolatedEntity {
  entityId: string;
  position: Vector3;
  rotation: Quaternion;
  velocity?: Vector3;
  interpolationFactor: number;
  isExtrapolating: boolean;
}

/** Dead reckoning config */
export interface DeadReckoningConfig {
  enabled: boolean;
  maxExtrapolation: number;
  physics?: {
    gravity: number;
    friction: number;
    maxSpeed: number;
  };
}

// ============================================================================
// Presence Types
// ============================================================================

/** Player status */
export type PlayerStatus = 'online' | 'away' | 'busy' | 'dnd' | 'invisible' | 'offline';

/** Activity type */
export type ActivityType = 'idle' | 'in-menu' | 'in-lobby' | 'in-queue' | 'in-game' | 'spectating';

/** Player activity */
export interface PlayerActivity {
  type: ActivityType;
  game?: string;
  gameMode?: string;
  room?: string;
  details?: string;
  partySize?: number;
  partyMax?: number;
  startedAt?: Date;
}

/** Player presence */
export interface PlayerPresence {
  playerId: number;
  username: string;
  status: PlayerStatus;
  activity: PlayerActivity;
  lastSeen: Date;
  platform: string;
  version?: string;
  customStatus?: string;
}

/** Presence configuration */
export interface PresenceConfig {
  autoAway: boolean;
  autoAwayTimeout: number;  // ms
  showActivity: boolean;
  showGame: boolean;
  allowInvites: boolean;
}

// ============================================================================
// Social Types
// ============================================================================

/** Friend relationship */
export interface Friend {
  playerId: number;
  username: string;
  presence: PlayerPresence;
  friendSince: Date;
  nickname?: string;
  favorite?: boolean;
  notes?: string;
}

/** Friend request */
export interface FriendRequest {
  id: string;
  from: number;
  fromUsername: string;
  to: number;
  message?: string;
  sentAt: Date;
  status: 'pending' | 'accepted' | 'declined';
}

/** Blocked player */
export interface BlockedPlayer {
  playerId: number;
  username: string;
  blockedAt: Date;
  reason?: string;
}

/** Party member */
export interface PartyMember {
  playerId: number;
  username: string;
  presence: PlayerPresence;
  isLeader: boolean;
  isReady: boolean;
  joinedAt: Date;
}

/** Party instance */
export interface Party {
  id: string;
  leader: PartyMember;
  members: PartyMember[];
  maxSize: number;
  isOpen: boolean;
  inviteOnly: boolean;
  invites: PartyInvite[];
  created: Date;
}

/** Party invite */
export interface PartyInvite {
  id: string;
  partyId: string;
  from: number;
  fromUsername: string;
  to: number;
  expiresAt: Date;
}

/** Game invite */
export interface GameInvite {
  id: string;
  from: number;
  fromUsername: string;
  to: number;
  roomId: string;
  roomName: string;
  gameMode: string;
  message?: string;
  expiresAt: Date;
}

/** Voice chat configuration */
export interface VoiceChatConfig {
  enabled: boolean;
  inputDevice?: string;
  outputDevice?: string;
  inputVolume: number;
  outputVolume: number;
  pushToTalk: boolean;
  pushToTalkKey?: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

/** Voice channel */
export interface VoiceChannel {
  id: string;
  name: string;
  type: 'lobby' | 'team' | 'party' | 'custom';
  participants: VoiceParticipant[];
  maxParticipants?: number;
}

/** Voice participant */
export interface VoiceParticipant {
  playerId: number;
  username: string;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  volume: number;
}

// ============================================================================
// Leaderboard Types
// ============================================================================

/** Leaderboard type */
export type LeaderboardType = 'global' | 'friends' | 'regional' | 'seasonal' | 'weekly' | 'daily';

/** Leaderboard entry */
export interface LeaderboardEntry {
  rank: number;
  playerId: number;
  username: string;
  score: number;
  tier?: RankTier;
  stats?: Record<string, number>;
  trend?: 'up' | 'down' | 'same';
  previousRank?: number;
}

/** Leaderboard */
export interface Leaderboard {
  id: string;
  name: string;
  type: LeaderboardType;
  gameMode?: string;
  season?: number;
  entries: LeaderboardEntry[];
  totalEntries: number;
  updatedAt: Date;
  resetAt?: Date;
}

/** Leaderboard query */
export interface LeaderboardQuery {
  type: LeaderboardType;
  gameMode?: string;
  season?: number;
  limit?: number;
  offset?: number;
  aroundPlayer?: number;
}

/** Player statistics */
export interface PlayerStats {
  playerId: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
  worstStreak: number;
  totalPlayTime: number;
  averageGameTime: number;
  firstPlayed: Date;
  lastPlayed: Date;
  customStats: Record<string, number>;
}

/** Achievement rarity */
export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** Achievement */
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: string;
  rarity: AchievementRarity;
  points: number;
  progress: number;
  maxProgress: number;
  unlocked: boolean;
  unlockedAt?: Date;
  secret?: boolean;
}

/** Achievement category */
export interface AchievementCategory {
  id: string;
  name: string;
  icon?: string;
  achievements: Achievement[];
  progress: number;
  total: number;
}

/** Match result for history */
export interface MatchResult {
  matchId: string;
  gameMode: string;
  players: MatchResultPlayer[];
  winner?: number;
  winningTeam?: number;
  duration: number;
  startedAt: Date;
  endedAt: Date;
  map?: string;
  stats?: Record<string, any>;
}

/** Player in match result */
export interface MatchResultPlayer {
  playerId: number;
  username: string;
  team?: number;
  placement?: number;
  score: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  stats?: Record<string, number>;
  ratingChange?: number;
}

// ============================================================================
// Replay Types
// ============================================================================

/** Replay configuration */
export interface ReplayConfig {
  enabled: boolean;
  compression: boolean;
  maxLength: number;        // seconds
  keyframeInterval: number; // ticks
  saveLocally: boolean;
  autoSave: boolean;
  includeChat: boolean;
}

/** Replay metadata */
export interface ReplayMetadata {
  id: string;
  name?: string;
  gameId: string;
  gameMode: string;
  map?: string;
  players: ReplayPlayer[];
  duration: number;
  ticks: number;
  startTime: Date;
  endTime: Date;
  winner?: number;
  winningTeam?: number;
  version: string;
  size: number;
  tags?: string[];
}

/** Player in replay */
export interface ReplayPlayer {
  id: number;
  username: string;
  team?: number;
  character?: string;
  color?: string;
}

/** Replay frame */
export interface ReplayFrame {
  tick: number;
  timestamp: number;
  inputs: Map<number, PlayerInput>;
  events?: ReplayEvent[];
  isKeyframe: boolean;
  state?: any;
}

/** Replay event */
export interface ReplayEvent {
  tick: number;
  type: string;
  playerId?: number;
  data: any;
}

/** Full replay data */
export interface Replay {
  metadata: ReplayMetadata;
  frames: ReplayFrame[];
  chat?: LobbyChatMessage[];
}

/** Replay playback state */
export interface ReplayPlayback {
  replayId: string;
  isPlaying: boolean;
  isPaused: boolean;
  currentTick: number;
  currentTime: number;
  speed: number;
  following?: number;  // Player ID to follow
}

// ============================================================================
// Security Types
// ============================================================================

/** Security configuration */
export interface SecurityConfig {
  serverValidation: boolean;
  clientValidation: boolean;
  rateLimiting: RateLimitConfig;
  movementValidation: MovementValidationConfig;
  actionValidation: ActionValidationConfig;
  encryption: EncryptionConfig;
  anticheat: AnticheatConfig;
}

/** Rate limit configuration */
export interface RateLimitConfig {
  enabled: boolean;
  maxInputsPerSecond: number;
  maxMessagesPerSecond: number;
  maxBytesPerSecond: number;
  burstLimit: number;
}

/** Movement validation configuration */
export interface MovementValidationConfig {
  enabled: boolean;
  maxSpeed: number;
  maxAcceleration: number;
  tolerance: number;
  teleportThreshold: number;
}

/** Action validation configuration */
export interface ActionValidationConfig {
  enabled: boolean;
  validateCooldowns: boolean;
  validateResources: boolean;
  validateRange: boolean;
}

/** Encryption configuration */
export interface EncryptionConfig {
  enabled: boolean;
  algorithm: 'aes-256-gcm' | 'chacha20-poly1305';
  keyExchange: 'ecdh' | 'rsa';
}

/** Anticheat configuration */
export interface AnticheatConfig {
  enabled: boolean;
  checksumValidation: boolean;
  speedHackDetection: boolean;
  wallhackDetection: boolean;
  aimAssistDetection: boolean;
  reportThreshold: number;
}

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  severity?: 'info' | 'warning' | 'violation' | 'critical';
  details?: Record<string, any>;
}

/** Player report */
export interface PlayerReport {
  id: string;
  reporterId: number;
  reportedId: number;
  reason: ReportReason;
  description?: string;
  matchId?: string;
  evidence?: string[];
  timestamp: Date;
  status: 'pending' | 'reviewed' | 'resolved';
}

/** Report reason */
export type ReportReason =
  | 'cheating'
  | 'hacking'
  | 'exploiting'
  | 'toxic'
  | 'harassment'
  | 'griefing'
  | 'afk'
  | 'other';

// ============================================================================
// Event Types
// ============================================================================

/** All network events */
export interface NetworkEvents extends ConnectionEvents {
  // Room events
  'room:created': (room: Room) => void;
  'room:joined': (room: Room) => void;
  'room:left': (roomId: string) => void;
  'room:updated': (room: Room) => void;
  'room:closed': (roomId: string) => void;

  // Player events
  'player:joined': (player: NetworkPlayer) => void;
  'player:left': (player: NetworkPlayer) => void;
  'player:ready': (playerId: number, ready: boolean) => void;
  'player:kicked': (playerId: number, reason?: string) => void;

  // Game events
  'game:countdown': (seconds: number) => void;
  'game:start': () => void;
  'game:pause': () => void;
  'game:resume': () => void;
  'game:end': (result: MatchResult) => void;

  // Turn events
  'turn:start': (playerId: number) => void;
  'turn:end': (playerId: number) => void;
  'turn:timeout': (playerId: number) => void;

  // Sync events
  'sync:snapshot': (snapshot: Snapshot) => void;
  'sync:delta': (delta: DeltaUpdate) => void;
  'sync:desync': (details: any) => void;

  // Matchmaking events
  'matchmaking:queued': (status: QueueStatus) => void;
  'matchmaking:update': (status: QueueStatus) => void;
  'matchmaking:found': (match: MatchFound) => void;
  'matchmaking:accepted': (playerId: number) => void;
  'matchmaking:declined': (playerId: number) => void;
  'matchmaking:ready': (result: MatchmakingResult) => void;
  'matchmaking:cancelled': (reason: string) => void;

  // Lobby events
  'lobby:created': (lobby: Lobby) => void;
  'lobby:joined': (lobby: Lobby) => void;
  'lobby:updated': (lobby: Lobby) => void;
  'lobby:chat': (message: LobbyChatMessage) => void;
  'lobby:vote': (vote: Vote) => void;

  // Social events
  'friend:request': (request: FriendRequest) => void;
  'friend:added': (friend: Friend) => void;
  'friend:removed': (playerId: number) => void;
  'party:invite': (invite: PartyInvite) => void;
  'party:updated': (party: Party) => void;
  'game:invite': (invite: GameInvite) => void;

  // Presence events
  'presence:update': (presence: PlayerPresence) => void;

  // Voice events
  'voice:joined': (channel: VoiceChannel) => void;
  'voice:left': (channelId: string) => void;
  'voice:speaking': (playerId: number, speaking: boolean) => void;

  // Achievement events
  'achievement:unlocked': (achievement: Achievement) => void;
  'achievement:progress': (achievementId: string, progress: number) => void;

  // Replay events
  'replay:started': (metadata: ReplayMetadata) => void;
  'replay:stopped': (metadata: ReplayMetadata) => void;
  'replay:saved': (metadata: ReplayMetadata) => void;

  // Security events
  'security:violation': (result: ValidationResult) => void;
  'security:kicked': (reason: string) => void;

  // Message events
  'message': (message: NetworkMessage) => void;
  'message:broadcast': (message: NetworkMessage) => void;
}

// ============================================================================
// Module Interfaces
// ============================================================================

/** Base module interface */
export interface NetworkModule {
  readonly name: string;
  init(): Promise<void>;
  dispose(): void;
}

/** Connection manager interface */
export interface IConnectionManager extends NetworkModule {
  readonly state: ConnectionState;
  connect(config?: Partial<ConnectionConfig>): Promise<void>;
  disconnect(): void;
  getSocket(): any;
  measureLatency(): Promise<number>;
  getQuality(): ConnectionQuality;
}

/** Matchmaking engine interface */
export interface IMatchmakingEngine extends NetworkModule {
  readonly status: QueueStatus;
  joinQueue(config: MatchmakingConfig): Promise<void>;
  leaveQueue(): void;
  acceptMatch(): void;
  declineMatch(): void;
  getSkill(playerId?: number): Promise<PlayerSkill>;
}

/** Lobby system interface */
export interface ILobbySystem extends NetworkModule {
  readonly current: Lobby | null;
  create(config: LobbyConfig): Promise<Lobby>;
  join(lobbyId: string, password?: string): Promise<Lobby>;
  leave(): void;
  setReady(ready: boolean): void;
  setTeam(teamId: number): void;
  vote(voteId: string, optionId: string): void;
  chat(message: string): void;
  kick(playerId: number): void;
  startGame(): void;
}

/** State synchronizer interface */
export interface IStateSynchronizer extends NetworkModule {
  readonly state: SyncState;
  configure(config: Partial<SyncConfig>): void;
  pushState(entities: EntityState[]): void;
  getSnapshot(tick?: number): Snapshot | null;
  requestFullSync(): void;
  setAreaOfInterest(position: Vector3, radius: number): void;
}

/** Prediction engine interface */
export interface IPredictionEngine extends NetworkModule {
  readonly state: PredictionState;
  configure(config: Partial<PredictionConfig>): void;
  predictInput(input: PlayerInput): void;
  reconcile(serverState: any, serverTick: number): void;
  rollback(toTick: number): void;
  getLocalState(): any;
}

/** Interpolation engine interface */
export interface IInterpolationEngine extends NetworkModule {
  configure(config: Partial<InterpolationConfig>): void;
  addSnapshot(entityId: string, snapshot: EntitySnapshot): void;
  getInterpolated(entityId: string, time?: number): InterpolatedEntity | null;
  setDeadReckoning(entityId: string, config: DeadReckoningConfig): void;
  clear(entityId?: string): void;
}

/** Presence manager interface */
export interface IPresenceManager extends NetworkModule {
  readonly self: PlayerPresence | null;
  setStatus(status: PlayerStatus): void;
  setActivity(activity: PlayerActivity): void;
  setCustomStatus(status: string): void;
  getPresence(playerId: number): Promise<PlayerPresence | null>;
  subscribe(playerIds: number[]): void;
  unsubscribe(playerIds: number[]): void;
}

/** Social manager interface */
export interface ISocialManager extends NetworkModule {
  readonly friends: Friend[];
  readonly blocked: BlockedPlayer[];
  readonly party: Party | null;
  addFriend(playerId: number, message?: string): Promise<void>;
  removeFriend(playerId: number): Promise<void>;
  acceptFriendRequest(requestId: string): Promise<void>;
  declineFriendRequest(requestId: string): Promise<void>;
  blockPlayer(playerId: number, reason?: string): Promise<void>;
  unblockPlayer(playerId: number): Promise<void>;
  createParty(): Promise<Party>;
  joinParty(partyId: string): Promise<Party>;
  leaveParty(): void;
  inviteToParty(playerId: number): Promise<void>;
  inviteToGame(playerId: number, roomId: string): Promise<void>;
  startVoice(channelId: string): Promise<void>;
  stopVoice(): void;
}

/** Leaderboard manager interface */
export interface ILeaderboardManager extends NetworkModule {
  getLeaderboard(query: LeaderboardQuery): Promise<Leaderboard>;
  getPlayerRank(playerId?: number, type?: LeaderboardType): Promise<LeaderboardEntry | null>;
  getStats(playerId?: number): Promise<PlayerStats>;
  getAchievements(playerId?: number): Promise<AchievementCategory[]>;
  getMatchHistory(playerId?: number, limit?: number): Promise<MatchResult[]>;
}

/** Replay system interface */
export interface IReplaySystem extends NetworkModule {
  readonly isRecording: boolean;
  readonly playback: ReplayPlayback | null;
  configure(config: Partial<ReplayConfig>): void;
  startRecording(): void;
  stopRecording(): Promise<ReplayMetadata>;
  loadReplay(replayId: string): Promise<Replay>;
  play(): void;
  pause(): void;
  seek(tick: number): void;
  setSpeed(speed: number): void;
  exportReplay(format: 'json' | 'binary'): Promise<Blob>;
}

/** Security manager interface */
export interface ISecurityManager extends NetworkModule {
  configure(config: Partial<SecurityConfig>): void;
  validateInput(playerId: number, input: PlayerInput): ValidationResult;
  validateMovement(playerId: number, from: Vector3, to: Vector3, dt: number): ValidationResult;
  validateAction(playerId: number, action: string, data?: any): ValidationResult;
  reportPlayer(playerId: number, reason: ReportReason, description?: string): Promise<void>;
  encrypt(data: any): string;
  decrypt(encrypted: string): any;
}
