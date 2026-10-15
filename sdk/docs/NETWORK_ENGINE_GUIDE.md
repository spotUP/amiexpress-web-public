# NetworkEngine - Comprehensive Multiplayer Framework

A complete multiplayer game framework for BBS doors providing everything modern multiplayer games need.

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [Modules](#modules)
   - [Connection](#connection-manager)
   - [Lobby](#lobby-manager)
   - [Matchmaking](#matchmaking-engine)
   - [State Sync](#state-synchronizer)
   - [Prediction](#prediction-engine)
   - [Interpolation](#interpolation-engine)
   - [Presence](#presence-manager)
   - [Social](#social-manager)
   - [Leaderboard](#leaderboard-manager)
   - [Replay](#replay-system)
   - [Security](#security-manager)
5. [Common Patterns](#common-patterns)
6. [API Reference](#api-reference)
7. [Backend Requirements](#backend-requirements)

---

## Overview

The NetworkEngine is a modular multiplayer framework that handles:

- **Real-time & Turn-based**: Both modes supported with seamless switching
- **Matchmaking**: Skill-based ranking using Glicko-2 algorithm
- **Lobbies**: Pre-game coordination with teams, voting, ready checks
- **State Sync**: Multiple strategies (snapshot, delta, lockstep)
- **Prediction**: Client-side prediction with server reconciliation
- **Interpolation**: Smooth entity movement between updates
- **Presence**: Online status and activity tracking
- **Social**: Friends, parties, game invites, WebRTC voice chat
- **Leaderboards**: Rankings, statistics, achievements
- **Replays**: Game recording and playback
- **Security**: Anti-cheat validation and rate limiting

## Quick Start

### Installation

The NetworkEngine is included in the SDK:

```typescript
import { NetworkEngine } from '@amiexpress/sdk/engines/network';
```

### Basic Usage

```typescript
// Create engine instance
const network = new NetworkEngine();

// Connect to server
await network.connect('ws://game-server.com');

// Create a lobby
const lobby = await network.createLobby({
  name: 'My Awesome Game',
  maxPlayers: 4,
  isPrivate: false,
});

// Or join matchmaking
await network.joinQueue({
  queueType: 'ranked',
  gameMode: 'deathmatch',
});

// Listen for events
network.on('player-joined', (player) => {
  console.log(`${player.username} joined!`);
});

// Clean up when done
network.dispose();
```

### Real-time Game with Prediction

```typescript
// Setup prediction simulation
network.prediction.setSimulationCallback((state, input) => {
  // Apply physics/game logic to state
  return simulateGameTick(state, input);
});

// Set initial state
network.prediction.setLocalState(gameState);

// Handle player input - predicted locally, sent to server
function handleInput(input: PlayerInput) {
  network.prediction.predictInput(input);
}

// Reconcile with server state
network.on('game:state', (serverState, tick) => {
  network.prediction.reconcile(serverState, tick);
});

// Get current predicted state for rendering
const renderState = network.prediction.getLocalState();
```

### Turn-based Game

```typescript
// Create turn-based lobby
const lobby = await network.createLobby({
  name: 'Chess Match',
  maxPlayers: 2,
  settings: { turnBased: true, turnTimeLimit: 60 },
});

// Listen for turn changes
network.on('turn-start', (player) => {
  if (player.playerId === myPlayerId) {
    enableInputs();
  } else {
    disableInputs();
  }
});

// End your turn
network.endTurn();
```

---

## Architecture

```
NetworkEngine (main entry point)
├── ConnectionManager     - Socket.IO connection handling
├── LobbyManager         - Pre-game lobbies and teams
├── MatchmakingEngine    - Skill-based player matching
├── StateSynchronizer    - Game state synchronization
├── PredictionEngine     - Client-side prediction
├── InterpolationEngine  - Smooth entity movement
├── PresenceManager      - Online status tracking
├── SocialManager        - Friends, parties, voice
├── LeaderboardManager   - Rankings and achievements
├── ReplaySystem         - Game recording/playback
└── SecurityManager      - Anti-cheat and validation
```

All modules are accessible directly:

```typescript
network.connection    // ConnectionManager
network.lobby         // LobbyManager
network.matchmaking   // MatchmakingEngine
network.sync          // StateSynchronizer
network.prediction    // PredictionEngine
network.interpolation // InterpolationEngine
network.presence      // PresenceManager
network.social        // SocialManager
network.leaderboard   // LeaderboardManager
network.replay        // ReplaySystem
network.security      // SecurityManager
```

---

## Modules

### Connection Manager

Handles Socket.IO connection with automatic reconnection and quality monitoring.

```typescript
// Connect with options
await network.connection.connect('ws://server.com', {
  reconnectAttempts: 5,
  reconnectDelay: 1000,
  heartbeatInterval: 30000,
  timeout: 10000,
});

// Check connection state
const state = network.connection.getState();
// { status: 'connected', latency: 45, packetLoss: 0.01, jitter: 5, quality: 'good' }

// Monitor quality changes
network.connection.on('quality:changed', (quality) => {
  // 'excellent' | 'good' | 'fair' | 'poor'
  showConnectionIndicator(quality);
});

// Manual disconnect
await network.connection.disconnect();
```

**Connection States:**
- `connecting` - Initial connection attempt
- `connected` - Successfully connected
- `reconnecting` - Lost connection, attempting to reconnect
- `disconnected` - Not connected

**Quality Levels:**
- `excellent` - Latency < 50ms, packet loss < 1%
- `good` - Latency < 100ms, packet loss < 3%
- `fair` - Latency < 200ms, packet loss < 5%
- `poor` - Higher latency or packet loss

---

### Lobby Manager

Pre-game coordination with teams, voting, and ready checks.

```typescript
// Create a lobby
const lobby = await network.lobby.create({
  name: 'Epic Battle',
  maxPlayers: 8,
  isPrivate: false,
  password: undefined,  // Optional password
  settings: {
    mode: 'capture-the-flag',
    map: 'desert',
    duration: 600,
  },
  teams: [
    { id: 1, name: 'Red Team', color: '#ff0000', maxSize: 4 },
    { id: 2, name: 'Blue Team', color: '#0000ff', maxSize: 4 },
  ],
});

// Join existing lobby
const lobby = await network.lobby.join('lobby-id-123');
const lobby = await network.lobby.join('lobby-id-123', 'password');

// Join by invite code
const lobby = await network.lobby.joinByCode('ABC123');

// Team management
network.lobby.setTeam(1);  // Join team 1
network.lobby.setTeam(2);  // Switch to team 2

// Voting system
network.lobby.vote('map', 'forest');
network.lobby.on('vote:updated', (option, votes) => {
  updateVoteDisplay(option, votes);
});

// Ready check
network.lobby.setReady(true);
network.lobby.on('player:ready', (player, ready) => {
  updatePlayerCard(player, ready);
});

// Start game (host only)
network.lobby.startCountdown();  // 5 second countdown
network.lobby.cancelCountdown(); // Cancel if needed

// Events
network.lobby.on('player:joined', (player) => { });
network.lobby.on('player:left', (player, reason) => { });
network.lobby.on('host:changed', (newHost) => { });
network.lobby.on('settings:changed', (settings) => { });
network.lobby.on('countdown:started', (seconds) => { });
network.lobby.on('countdown:tick', (remaining) => { });
network.lobby.on('game:starting', () => { });

// Leave lobby
await network.lobby.leave();
```

**Lobby States:**
- `waiting` - Waiting for players
- `countdown` - Countdown to game start
- `starting` - Game is starting
- `in-game` - Game in progress

---

### Matchmaking Engine

Skill-based matchmaking with Glicko-2 rating system.

```typescript
// Join ranked queue
await network.matchmaking.joinQueue({
  queueType: 'ranked',      // 'ranked' | 'casual' | 'custom'
  gameMode: 'deathmatch',
  skillRange: 200,          // Max skill difference
  maxWaitTime: 120000,      // Expand range after 2 min
  preferredRegions: ['us-east', 'us-west'],
});

// Join with party
await network.matchmaking.joinQueue({
  queueType: 'ranked',
  gameMode: 'team-battle',
  partyId: 'party-123',     // Queue with party members
});

// Monitor queue status
network.matchmaking.on('queue:status', (status) => {
  // { position: 5, estimatedWait: 30000, playersInQueue: 127 }
  showQueuePosition(status);
});

// Match found!
network.matchmaking.on('match:found', async (match) => {
  // { matchId, players, averageSkill, estimatedQuality, region }
  showMatchFoundUI(match);

  // Players must accept within time limit
  await network.matchmaking.acceptMatch();
});

// Match ready (all players accepted)
network.matchmaking.on('match:ready', (match) => {
  // Auto-transitions to lobby
});

// Someone declined
network.matchmaking.on('match:cancelled', (reason) => {
  // Back to queue automatically
});

// Leave queue
await network.matchmaking.leaveQueue();

// Get player skill
const skill = await network.matchmaking.getSkill();
// { rating: 1500, uncertainty: 100, gamesPlayed: 47, winRate: 0.55, tier: 'gold' }
```

**Rank Tiers:**
- `bronze` (0-999)
- `silver` (1000-1199)
- `gold` (1200-1399)
- `platinum` (1400-1599)
- `diamond` (1600-1799)
- `master` (1800-1999)
- `grandmaster` (2000+)

---

### State Synchronizer

Game state synchronization with multiple strategies.

```typescript
// Configure sync strategy
network.sync.configure({
  strategy: 'delta',           // 'snapshot' | 'delta' | 'lockstep'
  snapshotRate: 20,            // Snapshots per second
  interpolationDelay: 100,     // Buffer delay (ms)
  maxDeltaSize: 1024,          // Force full snapshot above this
  compression: true,
  areaOfInterest: {
    enabled: true,
    radius: 1000,              // Only sync nearby entities
  },
});

// Push state update (host/server)
network.sync.pushState('game', gameState);
network.sync.pushState('player:123', playerState);

// Push entity state
network.sync.pushEntityState({
  entityId: 'player-1',
  type: 'player',
  position: { x: 100, y: 50, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  velocity: { x: 5, y: 0, z: 0 },
  custom: { health: 100, ammo: 30 },
});

// Get latest snapshot
const snapshot = network.sync.getSnapshot('game');

// Get interpolated entities for rendering
const entities = network.sync.getInterpolatedEntities(renderTime);

// Set area of interest (optimize bandwidth)
network.sync.setAreaOfInterest({ x: 100, y: 50, z: 0 }, 500);

// Request full resync
network.sync.requestFullSync();

// Events
network.sync.on('snapshot', (key, snapshot) => { });
network.sync.on('delta', (key, delta) => { });
network.sync.on('desync', (expected, actual) => {
  // Checksum mismatch detected
  network.sync.requestFullSync();
});
```

**Sync Strategies:**

| Strategy | Use Case | Bandwidth | Latency |
|----------|----------|-----------|---------|
| `snapshot` | Simple games, low player count | High | Low |
| `delta` | Most games, optimized bandwidth | Medium | Low |
| `lockstep` | Deterministic games (RTS) | Low | High |

---

### Prediction Engine

Client-side prediction with server reconciliation and rollback support.

```typescript
// Configure prediction
network.prediction.configure({
  enabled: true,
  maxPredictionFrames: 10,
  correctionSmoothing: 0.2,    // 0 = instant, 1 = very smooth
  rollbackEnabled: true,       // For fighting games
  maxRollbackFrames: 7,
  inputDelay: 0,               // Optional input delay
});

// Set simulation callback (REQUIRED)
network.prediction.setSimulationCallback((state, input) => {
  // Apply input to state, return new state
  // This must be DETERMINISTIC
  const newState = { ...state };

  if (input.action === 'jump') {
    newState.velocity.y = 10;
  }
  if (input.axis) {
    newState.velocity.x = input.axis.x * 5;
  }

  // Apply physics
  newState.position.x += newState.velocity.x * DELTA;
  newState.position.y += newState.velocity.y * DELTA;

  return newState;
});

// Set initial state
network.prediction.setLocalState(initialGameState);

// Predict input (called on player input)
network.prediction.predictInput({
  action: 'jump',
  axis: { x: 1, y: 0 },
  buttons: { fire: true },
});

// Events
network.prediction.on('state:predicted', (state, tick) => {
  // Use for rendering
});

network.prediction.on('state:reconciled', (state, tick) => {
  // Server state applied, predictions replayed
});

network.prediction.on('rollback', (toTick) => {
  // Rollback occurred (fighting game netcode)
});

// Get prediction stats
const errorRate = network.prediction.getPredictionErrorRate();
const pendingInputs = network.prediction.getPendingInputCount();
```

**How Prediction Works:**

1. Player presses input
2. Input applied locally immediately (prediction)
3. Input sent to server
4. Server processes and sends authoritative state
5. Client compares prediction to server state
6. If different, correct by replaying inputs from server state

---

### Interpolation Engine

Smooth entity movement between network updates.

```typescript
// Configure interpolation
network.interpolation.configure({
  method: 'hermite',           // 'linear' | 'cubic' | 'hermite' | 'catmull-rom'
  bufferSize: 3,               // Snapshot buffer size
  extrapolationLimit: 200,     // Max ms to extrapolate
  snapThreshold: 100,          // Distance to teleport instead
  smoothingFactor: 0.1,
});

// Add entity snapshots (from server)
network.interpolation.addSnapshot('player-1', {
  entityId: 'player-1',
  tick: 1234,
  timestamp: Date.now(),
  position: { x: 100, y: 50, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  velocity: { x: 5, y: 0, z: 0 },
});

// Get interpolated state for rendering
const renderTime = Date.now() - 100; // 100ms in the past
const state = network.interpolation.getInterpolated('player-1', renderTime);
// { position, rotation, velocity, extrapolated: false }

// Enable dead reckoning (physics-based prediction)
network.interpolation.setDeadReckoning('player-1', {
  enabled: true,
  gravity: -9.8,
  drag: 0.1,
  maxExtrapolation: 500,
});

// Batch update for all entities
const allStates = network.interpolation.getInterpolatedBatch(
  ['player-1', 'player-2', 'enemy-1'],
  renderTime
);
```

**Interpolation Methods:**

| Method | Quality | CPU Cost | Best For |
|--------|---------|----------|----------|
| `linear` | Basic | Low | Fast-moving objects |
| `cubic` | Smooth | Medium | Most games |
| `hermite` | Very smooth | Medium | Character movement |
| `catmull-rom` | Natural curves | High | Vehicles, projectiles |

---

### Presence Manager

Online status and activity tracking.

```typescript
// Set your status
network.presence.setStatus('online');  // 'online' | 'away' | 'busy' | 'invisible' | 'offline'

// Set custom status message
network.presence.setCustomStatus('Looking for ranked matches');

// Set activity
network.presence.setGameActivity('Tetris', 'In ranked match', 2, 4);
network.presence.setLobbyActivity('Waiting Room', 'Waiting for players');
network.presence.setSpectatingActivity('Chess', 'Watching finals');
network.presence.clearActivity();  // Go idle

// Configure auto-away
network.presence.configure({
  autoAway: true,
  autoAwayTimeout: 300000,  // 5 minutes
  showActivity: true,
  showGame: true,
  allowInvites: true,
});

// Record activity (resets auto-away timer)
network.presence.recordActivity();

// Get other player's presence
const presence = await network.presence.getPresence(playerId);
// { playerId, username, status, activity, lastSeen, platform }

// Subscribe to presence updates
network.presence.subscribe([playerId1, playerId2]);
network.presence.on('presence:update', (presence) => {
  updateFriendsList(presence);
});

// Unsubscribe
network.presence.unsubscribe([playerId1]);
```

**Activity Types:**
- `idle` - Not doing anything specific
- `in-menu` - Browsing menus
- `in-lobby` - In a game lobby
- `in-game` - Playing a game
- `spectating` - Watching a game

---

### Social Manager

Friends, parties, game invites, and voice chat.

```typescript
// --- Friends ---

// Send friend request
await network.social.addFriend(playerId);

// Get friend requests
const incoming = await network.social.getFriendRequests('incoming');
const outgoing = await network.social.getFriendRequests('outgoing');

// Accept/decline
await network.social.acceptFriendRequest(requestId);
await network.social.declineFriendRequest(requestId);

// Get friends list
const friends = await network.social.getFriends();
// [{ playerId, username, presence, friendSince, nickname }]

// Remove friend
await network.social.removeFriend(playerId);

// Block player
await network.social.blockPlayer(playerId, 'Toxic behavior');
await network.social.unblockPlayer(playerId);

// --- Parties ---

// Create party
const party = await network.social.createParty();

// Invite to party
await network.social.inviteToParty(playerId);

// Join party
await network.social.joinParty(partyId);

// Leave party
await network.social.leaveParty();

// Kick from party (leader only)
await network.social.kickFromParty(playerId);

// Promote to leader
await network.social.promotePartyLeader(playerId);

// --- Game Invites ---

// Send game invite
await network.social.inviteToGame(playerId, roomId);

// Listen for invites
network.social.on('invite:received', (invite) => {
  showInvitePopup(invite);
});

// Accept invite
await network.social.acceptGameInvite(inviteId);

// --- Voice Chat (WebRTC) ---

// Configure voice
network.social.setVoiceSettings({
  enabled: true,
  pushToTalk: false,
  pushToTalkKey: 'v',
  volume: 0.8,
  noiseSuppression: true,
});

// Join voice channel
await network.social.startVoice(channelId);

// Mute/unmute
network.social.setMuted(true);

// Deafen (stop hearing others)
network.social.setDeafened(true);

// Leave voice
await network.social.stopVoice();

// Events
network.social.on('voice:userJoined', (userId) => { });
network.social.on('voice:userLeft', (userId) => { });
network.social.on('voice:userSpeaking', (userId, speaking) => { });
```

---

### Leaderboard Manager

Rankings, statistics, achievements, and match history.

```typescript
// --- Leaderboards ---

// Get global leaderboard
const leaderboard = await network.leaderboard.getLeaderboard({
  type: 'global',
  gameMode: 'ranked',
  limit: 100,
  offset: 0,
});

// Get friends leaderboard
const friendsBoard = await network.leaderboard.getLeaderboard({
  type: 'friends',
  gameMode: 'ranked',
});

// Get seasonal leaderboard
const seasonBoard = await network.leaderboard.getLeaderboard({
  type: 'seasonal',
  season: 3,
});

// Get your rank
const myRank = await network.leaderboard.getPlayerRank();

// Get leaderboard around your position
const nearby = await network.leaderboard.getLeaderboardAroundPlayer(myId, 'global', 5);

// --- Statistics ---

// Get player stats
const stats = await network.leaderboard.getStats(playerId);
// { playerId, gamesPlayed, wins, losses, winRate, currentStreak, totalPlayTime, customStats }

// Compare stats with another player
const comparison = await network.leaderboard.compareStats(otherPlayerId);
// { self: PlayerStats, other: PlayerStats }

// --- Achievements ---

// Get all achievements
const categories = await network.leaderboard.getAchievements();
// [{ name, description, icon, achievements: [...] }]

// Get specific achievement
const achievement = await network.leaderboard.getAchievement('first-win');

// Unlock achievement (server validates)
network.leaderboard.unlockAchievement('first-win');

// Update progress
network.leaderboard.updateAchievementProgress('win-100-games', 47);

// Listen for unlocks
network.leaderboard.on('achievement:unlocked', (achievement) => {
  showAchievementPopup(achievement);
});

// --- Match History ---

// Get recent matches
const history = await network.leaderboard.getMatchHistory(playerId, 20);

// Get specific match
const match = await network.leaderboard.getMatch(matchId);

// Submit match result (host/server)
await network.leaderboard.submitMatchResult({
  matchId: 'match-123',
  gameMode: 'ranked',
  startTime: new Date(),
  endTime: new Date(),
  duration: 600,
  players: [
    { playerId: 1, team: 1, score: 10, stats: { kills: 10 } },
    { playerId: 2, team: 2, score: 5, stats: { kills: 5 } },
  ],
  winner: 1,
});
```

**Achievement Rarity:**
- `common` - Most players unlock
- `rare` - Some effort required
- `epic` - Significant achievement
- `legendary` - Very difficult

---

### Replay System

Game recording and playback.

```typescript
// --- Recording ---

// Start recording
network.replay.startRecording(gameId, [
  { playerId: 1, username: 'Player1', team: 1 },
  { playerId: 2, username: 'Player2', team: 2 },
]);

// Record frames during gameplay
network.replay.recordFrame(tick, inputMap, gameState);

// Check recording status
if (network.replay.isRecording()) {
  const duration = network.replay.getRecordingDuration();
}

// Stop and get replay
const replay = network.replay.stopRecording();

// Save replay
const replayId = await network.replay.saveReplay(replay);

// --- Playback ---

// Load a replay
const replay = await network.replay.loadReplay(replayId);

// Playback controls
network.replay.play();
network.replay.pause();
network.replay.resume();
network.replay.stop();

// Seek to position
network.replay.seek(tickNumber);

// Speed control
network.replay.setSpeed(0.5);  // Half speed
network.replay.setSpeed(1);    // Normal
network.replay.setSpeed(2);    // Double speed
network.replay.setSpeed(4);    // 4x speed

// Get playback state
const state = network.replay.getPlaybackState();
// { isPlaying, currentTick, speed, isPaused }

// Events
network.replay.on('playback:frame', (frame) => {
  // Apply inputs to simulation
});
network.replay.on('playback:keyframe', (state, tick) => {
  // Full state snapshot for seeking
});
network.replay.on('playback:ended', () => { });

// --- Sharing ---

// Get shareable URL
const shareUrl = await network.replay.shareReplay(replayId);

// Export to file
const jsonData = network.replay.exportReplay('json');
const binaryData = network.replay.exportReplay('binary');

// Import from file
const replay = network.replay.importReplay(fileData);

// Delete replay
await network.replay.deleteReplay(replayId);
```

---

### Security Manager

Anti-cheat validation and rate limiting.

```typescript
// Configure security
network.security.configure({
  serverValidation: true,
  rateLimiting: {
    enabled: true,
    maxInputsPerSecond: 60,
    maxMessagesPerSecond: 10,
  },
  movementValidation: {
    enabled: true,
    maxSpeed: 100,
    maxAcceleration: 200,
    tolerance: 1.1,  // 10% tolerance
  },
  encryption: {
    enabled: false,
    algorithm: 'aes-256-gcm',
  },
});

// Validate input
const result = network.security.validateInput(playerId, input);
if (!result.valid) {
  console.warn(`Invalid input: ${result.reason}`);
}

// Validate movement
const moveResult = network.security.validateMovement(
  playerId,
  fromPosition,
  toPosition,
  deltaTimeMs
);
if (!moveResult.valid) {
  // Possible speed hack
  console.warn(moveResult.reason);
}

// Register action with cooldown
network.security.registerAction(playerId, 'fireball', 5000);  // 5s cooldown

// Validate action
const actionResult = network.security.validateAction(
  playerId,
  'fireball',
  50,   // Mana cost
  100   // Current mana
);

// Report suspicious player
network.security.reportPlayer(playerId, 'Possible speed hack', {
  observedSpeed: 500,
  maxAllowed: 100,
});

// Events
network.security.on('violation', (data) => {
  // { playerId, type, severity }
});

network.security.on('player:suspicious', (playerId, count, severity) => {
  // Player has accumulated violations
});

// Get violation stats
const count = network.security.getViolationCount(playerId);
const severity = network.security.getViolationSeverity(playerId);
```

**Validation Severity:**
- `warning` - Minor issue, log but allow
- `violation` - Significant issue, may reject action
- `critical` - Severe issue, disconnect player

---

## Common Patterns

### Competitive Ranked Game

```typescript
const network = new NetworkEngine();
await network.connect(serverUrl);

// Join ranked queue
await network.matchmaking.joinQueue({
  queueType: 'ranked',
  gameMode: 'deathmatch',
});

// Wait for match
network.matchmaking.on('match:found', async (match) => {
  await network.matchmaking.acceptMatch();
});

// Match ready - auto-join lobby
network.lobby.on('joined', (lobby) => {
  // Show lobby UI
});

// Game starting
network.lobby.on('game:starting', () => {
  startGame();
  network.replay.startRecording(gameId, players);
});

// During game
function gameLoop() {
  // Predict input
  network.prediction.predictInput(getPlayerInput());

  // Render interpolated state
  const state = network.prediction.getLocalState();
  render(state);
}

// Game over
function endGame(winner) {
  const replay = network.replay.stopRecording();
  await network.leaderboard.submitMatchResult(result);
}
```

### Casual Party Game

```typescript
const network = new NetworkEngine();
await network.connect(serverUrl);

// Create party
const party = await network.social.createParty();

// Invite friends
for (const friend of friends) {
  await network.social.inviteToParty(friend.playerId);
}

// Create lobby when ready
const lobby = await network.lobby.create({
  name: 'Party Game Night',
  maxPlayers: 8,
  isPrivate: true,
});

// Share invite code
const code = network.lobby.getInviteCode();
displayInviteCode(code);

// Start when everyone's ready
network.lobby.on('all:ready', () => {
  network.lobby.startCountdown();
});
```

### Turn-based Strategy

```typescript
const network = new NetworkEngine();
await network.connect(serverUrl);

// Create turn-based lobby
const lobby = await network.lobby.create({
  name: 'Chess Match',
  maxPlayers: 2,
  settings: {
    turnBased: true,
    turnTimeLimit: 120,  // 2 minutes per turn
  },
});

// Handle turns
network.on('turn-start', (player) => {
  if (player.playerId === myId) {
    enableBoard();
    startTurnTimer(120);
  } else {
    disableBoard();
    showOpponentThinking();
  }
});

// Make move
function makeMove(move) {
  network.sync.pushState('move', move);
  network.endTurn();
}
```

---

## Common Mistakes & Troubleshooting

### ⚠️ Critical: Use Top-Level Methods, Not Module Properties

**THE #1 MISTAKE**: Trying to access internal modules directly.

The NetworkEngine exposes **convenience methods at the top level** that properly configure and delegate to internal modules. **Always use the top-level methods**.

#### ❌ WRONG - Direct Module Access

```typescript
// These will cause TypeScript errors or runtime issues:
await network.matchmaking.joinQueue({ ... });  // ✗ Type mismatch
await network.lobby.createLobby({ ... });      // ✗ Method doesn't exist
network.sync.sendUpdate({ ... });              // ✗ Method doesn't exist
```

#### ✅ CORRECT - Top-Level Methods

```typescript
// Always use these instead:
await network.joinQueue({ ... });     // ✓ Works perfectly
await network.createLobby({ ... });   // ✓ Works perfectly
network.emit('game:update', { ... }); // ✓ Works perfectly
```

### Issue: Property 'region' does not exist

**Error**: `Object literal may only specify known properties, and 'region' does not exist in type 'MatchmakingConfig'`

**Cause**: The `region` property was removed in favor of `preferredRegions` array.

**Solution**:
```typescript
// ✗ WRONG
await network.joinQueue({
  gameMode: 'my-mode',
  region: 'us-west',  // No longer valid
});

// ✓ CORRECT
await network.joinQueue({
  gameMode: 'my-mode',
  preferredRegions: ['us-west', 'us-east'],  // Use array
});
```

### Issue: Cannot call sendUpdate()

**Error**: `Property 'sendUpdate' does not exist on type 'StateSynchronizer'`

**Cause**: The StateSynchronizer doesn't have a public `sendUpdate()` method.

**Solution**: Use the event system instead:
```typescript
// ✗ WRONG
network.sync.sendUpdate(myGameState);

// ✓ CORRECT
network.emit('game:update', {
  playerId: myPlayerId,
  timestamp: Date.now(),
  ...myGameState
});
```

### Issue: Method doesn't exist on lobby/matchmaking

**Error**: `Property 'createLobby' does not exist on type 'LobbySystem'`

**Cause**: Using module properties instead of top-level convenience methods.

**Solution**: Always use NetworkEngine's top-level methods:
```typescript
// ✗ WRONG
const lobby = await network.lobby.createLobby({ name: 'Game' });
await network.lobby.joinLobby(lobbyId);
await network.lobby.setReady(true);

// ✓ CORRECT
const lobby = await network.createLobby({ name: 'Game' });
await network.joinLobby(lobbyId);
network.setReady(true);
```

### Valid Configuration Properties

#### MatchmakingConfig

```typescript
interface MatchmakingConfig {
  queueType: 'casual' | 'ranked' | 'competitive';
  gameMode: string;              // Your custom game mode
  partyId?: string;              // Optional party ID
  preferredRegions?: string[];   // NOT 'region' (singular)
  skillRange?: {                 // Optional skill matching
    min: number;
    max: number;
  };
  maxWaitTime?: number;          // Optional timeout (ms)
}
```

#### LobbyConfig

```typescript
interface LobbyConfig {
  name: string;           // Required
  maxPlayers: number;     // Required
  isPrivate: boolean;     // Required
  password?: string;      // Optional
  teamCount?: number;     // Optional (for team games)
  teamSize?: number;      // Optional (players per team)
  settings?: any;         // Optional custom settings
}
```

### Event System Patterns

The NetworkEngine extends EventEmitter. Use standard event patterns:

```typescript
// Subscribe to events
network.on('player:joined', (player) => {
  console.log(`${player.name} joined`);
});

// Custom game events (no built-in sendUpdate method)
network.emit('game:update', myState);
network.emit('game:attack', attackData);

// Receive custom events
network.on('game:update', (opponentState) => {
  updateOpponent(opponentState);
});
```

### Browser APIs in Node.js Context

**Error**: `Cannot find name 'localStorage'` or `Cannot find name 'RTCPeerConnection'`

**Cause**: Some NetworkEngine modules (replay.ts, social.ts) use browser APIs for optional features.

**Solution**: Add type stubs in your door's `global.d.ts`:

```typescript
// global.d.ts
declare global {
  var localStorage: Storage;
  var RTCPeerConnection: any;
  var MediaStream: any;
  var Audio: any;
  var navigator: any;
}
export {};
```

See `/sdk/doors/grandmaster/global.d.ts` for a complete example.

---

## API Reference

### NetworkEngine

| Method | Description |
|--------|-------------|
| `connect(url?, options?)` | Connect to server |
| `disconnect()` | Disconnect from server |
| `isConnected()` | Check connection status |
| `getConnectionState()` | Get full connection state |
| `getLatency()` | Get current latency |
| `createLobby(config)` | Create a lobby |
| `joinLobby(id, password?)` | Join a lobby |
| `leaveLobby()` | Leave current lobby |
| `joinQueue(config)` | Join matchmaking queue |
| `leaveQueue()` | Leave queue |
| `acceptMatch()` | Accept found match |
| `setStatus(status)` | Set online status |
| `addFriend(playerId)` | Send friend request |
| `createParty()` | Create a party |
| `getLeaderboard(query)` | Get leaderboard |
| `getStats(playerId?)` | Get player stats |
| `startRecording(gameId, players)` | Start replay recording |
| `stopRecording()` | Stop and get replay |
| `dispose()` | Clean up all resources |

### Events

| Event | Data | Description |
|-------|------|-------------|
| `connected` | - | Connected to server |
| `disconnected` | reason | Lost connection |
| `reconnecting` | attempt | Attempting reconnect |
| `quality:changed` | quality | Connection quality changed |
| `match:ready` | MatchmakingResult | Match found and accepted |
| `game:starting` | - | Game is starting |
| `player-joined` | player | Player joined lobby/room |
| `player-left` | player, reason | Player left |
| `achievement:unlocked` | Achievement | Achievement unlocked |
| `security:warning` | ValidationResult | Security validation failed |

---

## Backend Requirements

The NetworkEngine requires backend support for full functionality. Required Socket.IO events:

### Connection
- `ping` / `pong` - Latency measurement

### Matchmaking
- `matchmaking:join` / `matchmaking:leave`
- `matchmaking:status` / `matchmaking:match_found`
- `matchmaking:accept` / `matchmaking:decline`

### Lobbies
- `lobby:create` / `lobby:join` / `lobby:leave`
- `lobby:ready` / `lobby:team` / `lobby:vote`
- `lobby:start` / `lobby:cancel`
- `lobby:settings` / `lobby:kick`

### Game State
- `game:input` / `game:state`
- `sync:push` / `sync:snapshot` / `sync:delta`

### Social
- `friend:request` / `friend:accept` / `friend:remove`
- `party:create` / `party:invite` / `party:join`
- `invite:send` / `invite:accept`
- `voice:join` / `voice:leave` / `voice:signal`

### Leaderboard
- `leaderboard:get` / `leaderboard:rank`
- `stats:get` / `stats:compare`
- `achievements:get` / `achievements:unlock`
- `matches:history` / `matches:submit`

### Presence
- `presence:update` / `presence:subscribe` / `presence:get`

### Replay
- `replay:save` / `replay:load` / `replay:share`

### Security
- `security:report` / `security:violation`

---

## See Also

- [Door Development Guide](../../Documentation/4-Door-Developers/DOOR_DEVELOPMENT.md)
- [Neo-Blessed UI Guide](./NEO_BLESSED_GUIDE.md)
- [SDK Architecture](../../Documentation/3-Developers/ARCHITECTURE.md)
