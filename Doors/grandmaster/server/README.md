# GRANDMASTER Server Infrastructure

Complete server-side multiplayer system with anti-cheat validation, leaderboard persistence, and replay storage.

## Architecture

```
MultiplayerServer (coordinator)
├── GameValidator (anti-cheat)
├── LeaderboardManager (rankings)
└── ReplayManager (replay storage)
```

## Components

### 1. GameValidator (`game-validator.ts`)

**Purpose**: Validates game results to prevent cheating

**Features**:
- Score sanity checks (per-mode maximums, correlations)
- Timing validation (minimum/maximum times, lines-per-minute)
- Grade progression validation (GM requires level 999)
- Statistical analysis from replay data
- Anomaly score calculation (0-100 suspicion rating)

**Usage**:
```typescript
import { GameValidator } from './server';

const validator = new GameValidator();
const result = validator.validate(gameResult, replayData);

if (result.valid) {
  console.log(`Validation score: ${result.score}/100`);
} else {
  console.log('Violations:', result.violations);
}
```

**Validation Checks**:
- **Score Range**: Per-mode maximums (Master: 2M, Sprint: 500K, etc.)
- **Score vs Level**: Scores must correlate with level achieved
- **Timing**: Minimum times (no impossibly fast completions)
- **Lines/Minute**: Max 300 LPM (5 lines/second sustained)
- **Grade vs Level**: GM requires level 999, M grades require 500+
- **Replay Consistency**: State progression (score/lines/level only increase)
- **Input Rate**: Max 30 inputs/second (human limitation)

### 2. LeaderboardManager (`leaderboard-manager.ts`)

**Purpose**: Persistent score storage and ranking

**Features**:
- Per-mode leaderboards (Master, Death, Sprint, etc.)
- Personal best tracking
- Global rankings with pagination
- Validation score filtering
- Statistics (average score, unique players, fastest times)
- Export/import for backups

**Usage**:
```typescript
import { LeaderboardManager } from './server';

const leaderboard = new LeaderboardManager();

// Submit a score
const submission = await leaderboard.submitScore(
  userId,
  username,
  gameResult,
  validationResult,
  replayId
);

console.log(`Rank: ${submission.rank}`);
console.log(`Personal Best: ${submission.isPersonalBest}`);
console.log(`Top 10: ${submission.isTopTen}`);

// Get leaderboard
const entries = leaderboard.getLeaderboard({
  mode: 'master',
  limit: 20,
  minValidationScore: 70  // Only trusted scores
});
```

**Queries**:
- Filter by mode, user, validation score, date range
- Sort by score descending
- Pagination with offset/limit
- Personal best and rank tracking

### 3. ReplayManager (`replay-manager.ts`)

**Purpose**: Record, store, and verify game replays

**Features**:
- **ReplayRecorder**: Live recording during gameplay
  - Input recording (every action with timestamp)
  - State snapshots (periodic game state every 5 seconds)
  - Automatic frame counting
- **ReplayManager**: Storage and retrieval
  - Compression for large replays
  - Replay verification (timestamp consistency, state progression)
  - User replay history
  - Top replay rankings
  - Export/import JSON format

**Recording Usage**:
```typescript
import { ReplayRecorder } from './server';

// Create recorder at game start
const recorder = new ReplayRecorder(userId, username, 'master', seed);

// During gameplay
recorder.recordInput('move_left', 'T');
recorder.recordInput('rotate_cw', 'T');
recorder.recordSnapshot(gameState);  // Every 300 frames
recorder.updateFrame();  // Every frame

// At game end
const replay = recorder.finalize(finalGameState);
```

**Storage Usage**:
```typescript
import { ReplayManager } from './server';

const manager = new ReplayManager();

// Store replay
const replayId = await manager.storeReplay(replay);

// Retrieve replay
const replay = await manager.getReplay(replayId);

// Get user's replays
const replays = await manager.getUserReplays(userId, 'master', 10);

// Verify integrity
const verification = await manager.verifyReplay(replayId);
if (!verification.valid) {
  console.log('Errors:', verification.errors);
}
```

### 4. MultiplayerServer (`multiplayer-server.ts`)

**Purpose**: Unified API coordinating all components

**Features**:
- Score submission with validation + replay
- Anti-cheat analysis
- Leaderboard queries
- Replay management
- User banning
- Data export/import
- Automatic cleanup

**Configuration**:
```typescript
import { MultiplayerServer } from './server';

const server = new MultiplayerServer({
  minValidationScore: 50,    // Reject scores below 50/100
  requireReplay: false,       // Replay optional for submission
  enableAntiCheat: true,      // Anomaly detection enabled
  maxReplayAge: 30 * 24 * 60 * 60 * 1000  // 30 days
});
```

**Complete Workflow**:
```typescript
// 1. Create recorder at game start
const recorder = server.createReplayRecorder(userId, username, 'master');

// 2. Record during gameplay
recorder.recordInput('hard_drop', 'I');
recorder.recordSnapshot(gameState);
recorder.updateFrame();

// 3. Finalize at game end
const replay = recorder.finalize(finalGameState);

// 4. Submit score with replay
const result = await server.submitScore(userId, username, gameResult, replay);

if (result.accepted) {
  console.log(`Score accepted! Rank: ${result.rank}`);
  console.log(`Validation: ${result.validationScore}/100`);
  console.log(`Replay ID: ${result.replayId}`);
} else {
  console.log(`Score rejected: ${result.reason}`);
}

// 5. Query leaderboard
const top10 = server.getLeaderboard({ mode: 'master', limit: 10 });
const userBest = server.getUserBest(userId, 'master');
const userRank = server.getUserRank(userId, 'master');
```

## Integration Example

### Game Engine Integration

```typescript
import { MultiplayerServer, ReplayRecorder } from './server';

class GameEngine {
  private server: MultiplayerServer;
  private recorder: ReplayRecorder | null = null;

  async startGame(userId: string, username: string, mode: GameMode) {
    // Create recorder
    this.recorder = this.server.createReplayRecorder(userId, username, mode);

    // Start game loop
    this.gameLoop();
  }

  handleInput(action: InputAction) {
    // Record input
    if (this.recorder && this.state.currentPiece) {
      this.recorder.recordInput(action, this.state.currentPiece.type);
    }

    // Process input
    this.processInput(action);
  }

  updateFrame(deltaTime: number) {
    // Update game
    this.update(deltaTime);

    // Record frame
    if (this.recorder) {
      this.recorder.updateFrame();
      this.recorder.recordSnapshot(this.state);
    }
  }

  async endGame() {
    if (!this.recorder) return;

    // Finalize replay
    const replay = this.recorder.finalize(this.state);

    // Create game result
    const result: GameResult = {
      mode: this.state.mode,
      score: this.state.score,
      level: this.state.level,
      grade: this.state.grade,
      linesCleared: this.state.lines,
      time: Date.now() - this.startTime,
      // ... other fields
    };

    // Submit to server
    const submission = await this.server.submitScore(
      userId,
      username,
      result,
      replay
    );

    return submission;
  }
}
```

## Database Integration

The current implementation uses in-memory storage with placeholders for database persistence. To integrate with a real database:

### 1. Leaderboard Persistence

Implement `LeaderboardManager.persistEntry()`:
```sql
CREATE TABLE leaderboard (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  mode TEXT NOT NULL,
  score INTEGER NOT NULL,
  level INTEGER NOT NULL,
  grade TEXT NOT NULL,
  lines INTEGER NOT NULL,
  time INTEGER,
  finesse_rate REAL,
  finesse_errors INTEGER,
  timestamp INTEGER NOT NULL,
  validation_score INTEGER NOT NULL,
  flags TEXT,  -- JSON array
  replay_id TEXT,
  FOREIGN KEY (replay_id) REFERENCES replays(id)
);

CREATE INDEX idx_leaderboard_mode_score ON leaderboard(mode, score DESC);
CREATE INDEX idx_leaderboard_user ON leaderboard(user_id);
```

### 2. Replay Storage

Implement `ReplayManager.persistReplay()`:
```sql
CREATE TABLE replays (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  mode TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  duration INTEGER NOT NULL,
  final_score INTEGER NOT NULL,
  final_level INTEGER NOT NULL,
  final_grade TEXT NOT NULL,
  final_lines INTEGER NOT NULL,
  seed INTEGER,
  version TEXT NOT NULL,
  compressed BOOLEAN DEFAULT 0
);

CREATE TABLE replay_inputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  replay_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  frame INTEGER NOT NULL,
  action TEXT NOT NULL,
  piece TEXT,
  FOREIGN KEY (replay_id) REFERENCES replays(id) ON DELETE CASCADE
);

CREATE TABLE replay_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  replay_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  frame INTEGER NOT NULL,
  state_json TEXT NOT NULL,  -- JSON snapshot
  FOREIGN KEY (replay_id) REFERENCES replays(id) ON DELETE CASCADE
);

CREATE INDEX idx_replays_user ON replays(user_id);
CREATE INDEX idx_replays_mode_score ON replays(mode, final_score DESC);
```

## Anti-Cheat Details

### Validation Scoring

Scores start at 100 and are reduced based on violations:
- Invalid score range: -30
- Invalid timing: -25
- Invalid grade progression: -20
- Invalid statistics: -15

**Acceptance threshold**: 50/100 (configurable)

### Anomaly Detection

Separate 0-100 score based on suspicion:
- Perfect finesse (100%): +15
- Perfect zero finesse errors: +10
- High LPM (>200): +20
- Very high LPM (>250): +30
- Grade/level mismatch: +30-50

**Auto-rejection threshold**: 80/100 (configurable)

### Flags vs Violations

- **Flags**: Warnings that don't fail validation (logged for review)
- **Violations**: Hard failures that reduce validation score

Examples:
- Flag: "Score unusually high for level achieved"
- Violation: "Score exceeds maximum for master mode"

## Statistics

### Leaderboard Stats
```typescript
const stats = server.getLeaderboardStats('master');
// {
//   totalEntries: 1523,
//   uniquePlayers: 87,
//   averageScore: 345678,
//   averageLevel: 523,
//   highestGrade: 'GM',
//   fastestTime: 456789
// }
```

### Replay Stats
```typescript
const stats = server.getServerStats();
// {
//   leaderboard: { ... },
//   replays: {
//     totalReplays: 245,
//     totalInputs: 125678,
//     totalSnapshots: 12456,
//     averageInputsPerReplay: 512,
//     averageSnapshotsPerReplay: 50,
//     oldestReplay: 1234567890000,
//     newestReplay: 1234567899999
//   },
//   config: { ... }
// }
```

## Maintenance

### Cleanup Old Replays
```typescript
// Remove replays older than 30 days
const removed = await server.cleanup();
console.log(`Removed ${removed.replaysRemoved} old replays`);
```

### Ban User
```typescript
// Remove all entries for a user
const result = await server.banUser(userId);
console.log(`Removed ${result.entriesRemoved} entries`);
```

### Backup/Restore
```typescript
// Export data
const backup = server.exportData();
fs.writeFileSync('backup.json', JSON.stringify(backup));

// Import data
const backup = JSON.parse(fs.readFileSync('backup.json', 'utf-8'));
const imported = server.importData(backup);
console.log(`Imported ${imported} entries`);
```

## Testing

### Unit Tests
```bash
cd sdk/doors/grandmaster
npm test server/
```

### Integration Test
```typescript
// Create server
const server = new MultiplayerServer();

// Submit test score
const result = await server.submitScore(
  'test-user',
  'TestPlayer',
  {
    mode: 'master',
    score: 123456,
    level: 500,
    grade: 'S5',
    linesCleared: 250,
    time: 300000,  // 5 minutes
  }
);

console.log('Score accepted:', result.accepted);
console.log('Rank:', result.rank);
```

## Future Enhancements

- [ ] Real-time leaderboard updates via WebSocket
- [ ] Tournament system with brackets
- [ ] Replay playback in browser
- [ ] Advanced compression (delta encoding, RLE)
- [ ] Machine learning-based cheat detection
- [ ] Global ELO rating system
- [ ] Challenge system (beat my score)
- [ ] Replay sharing and social features

## Production Checklist

Before deploying to production:

- [ ] Implement database persistence
- [ ] Add proper error handling and logging
- [ ] Set up monitoring and alerts
- [ ] Configure backup/restore automation
- [ ] Tune validation thresholds based on data
- [ ] Add rate limiting for submissions
- [ ] Implement caching layer (Redis)
- [ ] Add database indexes for performance
- [ ] Set up replay cleanup cron job
- [ ] Add admin API for moderation
- [ ] Write comprehensive unit tests
- [ ] Load testing with realistic traffic
- [ ] Security audit (SQL injection, XSS, etc.)
- [ ] GDPR compliance (user data deletion)
