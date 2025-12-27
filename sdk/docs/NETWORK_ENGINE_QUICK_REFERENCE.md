# NetworkEngine Quick Reference

Fast lookup for NetworkEngine APIs. See [NETWORK_ENGINE_GUIDE.md](./NETWORK_ENGINE_GUIDE.md) for full documentation.

## Import

```typescript
import { NetworkEngine } from '@amiexpress/sdk/engines/network';
const network = new NetworkEngine();
await network.connect('ws://server.com');
```

## Module Access

```typescript
network.connection     // Socket.IO, reconnection, quality
network.lobby          // Lobbies, teams, voting
network.matchmaking    // Queues, skill-based matching
network.sync           // State synchronization
network.prediction     // Client-side prediction
network.interpolation  // Smooth entity movement
network.presence       // Online status
network.social         // Friends, parties, voice
network.leaderboard    // Rankings, stats, achievements
network.replay         // Recording, playback
network.security       // Anti-cheat, validation
```

## Common Operations

### Matchmaking

```typescript
await network.joinQueue({ queueType: 'ranked', gameMode: 'deathmatch' });
await network.leaveQueue();
await network.acceptMatch();
network.matchmaking.on('match:found', (match) => { });
```

### Lobbies

```typescript
const lobby = await network.createLobby({ name: 'Game', maxPlayers: 4 });
await network.joinLobby(lobbyId);
await network.leaveLobby();
network.lobby.setTeam(1);
network.lobby.setReady(true);
network.lobby.startCountdown();
```

### State Sync

```typescript
network.sync.configure({ strategy: 'delta', snapshotRate: 20 });
network.sync.pushState('game', gameState);
network.sync.pushEntityState({ entityId, position, rotation, velocity });
const snapshot = network.sync.getSnapshot('game');
```

### Prediction

```typescript
network.prediction.setSimulationCallback((state, input) => newState);
network.prediction.setLocalState(initialState);
network.prediction.predictInput({ action: 'jump', axis: { x: 1, y: 0 } });
network.prediction.on('state:reconciled', (state, tick) => { });
```

### Interpolation

```typescript
network.interpolation.configure({ method: 'hermite', bufferSize: 3 });
network.interpolation.addSnapshot(entityId, { position, rotation, velocity, tick, timestamp });
const state = network.interpolation.getInterpolated(entityId, renderTime);
```

### Presence

```typescript
network.setStatus('online');  // online, away, busy, invisible
network.presence.setGameActivity('Tetris', 'Ranked match');
network.presence.setCustomStatus('Looking for party');
const presence = await network.presence.getPresence(playerId);
```

### Social

```typescript
await network.addFriend(playerId);
const friends = await network.social.getFriends();
const party = await network.createParty();
await network.social.inviteToParty(playerId);
await network.inviteToGame(playerId, roomId);
await network.social.startVoice(channelId);
```

### Leaderboard

```typescript
const board = await network.getLeaderboard({ type: 'global', gameMode: 'ranked' });
const stats = await network.getStats(playerId);
const achievements = await network.leaderboard.getAchievements();
network.leaderboard.unlockAchievement('first-win');
```

### Replay

```typescript
network.startRecording(gameId, players);
network.replay.recordFrame(tick, inputMap, state);
const replay = network.stopRecording();
await network.replay.saveReplay(replay);
await network.replay.loadReplay(replayId);
network.replay.play(); network.replay.pause(); network.replay.seek(tick);
```

### Security

```typescript
network.security.validateInput(playerId, input);
network.security.validateMovement(playerId, from, to, deltaTime);
network.security.registerAction(playerId, 'fireball', 5000);  // 5s cooldown
network.security.reportPlayer(playerId, 'Speed hack');
```

## Key Events

| Event | Description |
|-------|-------------|
| `connected` | Connected to server |
| `disconnected` | Lost connection |
| `reconnecting` | Reconnection attempt |
| `quality:changed` | Connection quality changed |
| `match:found` | Match found in queue |
| `match:ready` | All players accepted |
| `game:starting` | Game is starting |
| `player-joined` | Player joined |
| `player-left` | Player left |
| `turn-start` | Turn-based: player's turn |
| `achievement:unlocked` | Achievement earned |

## Configuration Options

### NetworkEngine

```typescript
new NetworkEngine({
  connection: { reconnectAttempts: 5, heartbeatInterval: 30000 },
  lobby: { defaultMaxPlayers: 8 },
  matchmaking: { defaultSkillRange: 200 },
  sync: { strategy: 'delta', snapshotRate: 20 },
  prediction: { maxPredictionFrames: 10, rollbackEnabled: true },
  interpolation: { method: 'hermite', bufferSize: 3 },
  presence: { autoAway: true, autoAwayTimeout: 300000 },
  social: { maxPartySize: 8 },
  replay: { compression: true, maxReplayLength: 3600 },
  security: { serverValidation: true },
});
```

## Sync Strategies

| Strategy | Use Case | Bandwidth |
|----------|----------|-----------|
| `snapshot` | Simple games | High |
| `delta` | Most games | Medium |
| `lockstep` | Deterministic RTS | Low |

## Interpolation Methods

| Method | Quality | Use Case |
|--------|---------|----------|
| `linear` | Basic | Fast objects |
| `cubic` | Smooth | Most games |
| `hermite` | Very smooth | Characters |
| `catmull-rom` | Natural | Vehicles |

## Rank Tiers

| Tier | Rating |
|------|--------|
| bronze | 0-999 |
| silver | 1000-1199 |
| gold | 1200-1399 |
| platinum | 1400-1599 |
| diamond | 1600-1799 |
| master | 1800-1999 |
| grandmaster | 2000+ |

## Cleanup

```typescript
network.dispose();  // Clean up all resources
```
