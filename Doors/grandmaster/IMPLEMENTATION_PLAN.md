# GRANDMASTER - Complete Implementation Plan

**Status**: Phases 1, 2A, 3, 8 completed. Phase 2B/C, 4, 6, 7 partial.

**Current Completion**: ~80-85% (See Documentation/6-Progress/GRANDMASTER_STATUS.md)

**Total Estimated Lines**: ~25,000 lines across all phases
**Actual Implemented**: 15,718 lines across 37 TypeScript files

**⚠️ WARNING**: This plan's percentage estimates are OUTDATED. See GRANDMASTER_STATUS.md for accurate implementation status.

---

## TetriNET Protocol Parity (External Servers)

**Goal**: 1:1 TetriNET 1.x protocol and gameplay parity (no per-door hacks).

- [x] TetriFast command variants (`tetrifaster`, obfuscated `playernum`/`newgame`)
- [x] Next-block delay: 1000ms standard, 0ms TetriFast
- [x] Parse v1.14 seed string in `newgame`
- [x] Seed-driven RNG parity for TetriNET 1.14 (LCG, big-endian seed)
- [ ] External game screen uses engine (piece sync, fields, specials, targets)
- [ ] Jetrix-parity server plan (see `Doors/grandmaster/TETRINET_SERVER_IMPLEMENTATION_PROMPT.md`)

---

## Phase 1: Core Engine ✅ COMPLETED

**Status**: Done (3,200 lines)
**Files**: 17 TypeScript modules

- [x] Game engine (60 FPS, frame accumulator)
- [x] SRS rotation with wall kicks
- [x] Board management (collision, line clearing)
- [x] Input handler (DAS/ARR)
- [x] TGM3 gravity curves (Master, Death, Sprint, Marathon)
- [x] TGM3 grading system (9 → GM)
- [x] Section system (COOL/REGRET)
- [x] Basic UI (menu, game screen)
- [x] Audio engine stub
- [x] Command registration
- [x] Build system working

**Known Issues**:
- [x] Game loop fixed (setInterval instead of async while)
- [ ] Tags rendering (needs verification)

---

## Phase 2: Visual Polish & Effects 🎨

**Estimated**: ~2,500 lines
**Priority**: HIGH (makes game feel amazing)
**Dependencies**: Phase 1

### Batch 2A: Core Visual Effects (800 lines)
```
effects/
├── screen-shake.ts      - Screen shake engine (200 lines)
├── particles.ts         - Particle system (300 lines)
├── transitions.ts       - Fade/wipe transitions (150 lines)
└── animations.ts        - Grade up, COOL/REGRET (150 lines)
```

**Tasks**:
- [ ] Screen shake presets (lock, clear, tetris, perfect, garbage, topout)
- [ ] Particle explosion system (20-200 particles)
- [ ] Screen transition effects (fade, wipe, slide)
- [ ] Grade-up animation with sparkles
- [ ] COOL/REGRET banner animations
- [ ] Line clear flash effect
- [ ] Lock piece glow effect

### Batch 2B: Advanced Block Rendering (400 lines)
```
ui/
├── block-renderer.ts    - Enhanced ANSI blocks (250 lines)
└── background.ts        - Animated backgrounds (150 lines)
```

**Tasks**:
- [ ] Glow effect around pieces (dim halo)
- [ ] Lock flash (2-frame white flash)
- [ ] Ghost piece with gradient fade
- [ ] 20G border pulse (rainbow cycling)
- [ ] Bone blocks at S13+ (white brackets)
- [ ] Invisible piece fade stages (credit roll)
- [ ] Background pattern animations

### Batch 2C: HUD Enhancements (500 lines)
```
ui/
├── hud-enhanced.ts      - Advanced HUD elements (300 lines)
└── indicators.ts        - Status indicators (200 lines)
```

**Tasks**:
- [ ] Animated grade display (pulse, rainbow for GM)
- [ ] Combo counter with multiplier animation
- [ ] Back-to-back indicator
- [ ] T-Spin indicator
- [ ] Perfect clear celebration
- [ ] Section time comparison (target vs actual)
- [ ] 20G warning indicator

### Batch 2D: Attract Mode (800 lines)
```
ui/
├── attract.ts           - Attract sequence (400 lines)
├── logo-animation.ts    - Animated logo (200 lines)
└── demo-ai.ts           - AI demo player (200 lines)
```

**Tasks**:
- [ ] Cinematic boot sequence with logo
- [ ] Piece-fall logo build animation
- [ ] Demo AI gameplay loop
- [ ] Leaderboard scrolling
- [ ] Tournament announcements
- [ ] Tips & tricks rotation

---

## Phase 3: Advanced Mechanics ⚙️

**Estimated**: ~2,000 lines
**Priority**: HIGH (core gameplay depth)
**Dependencies**: Phase 1

### Batch 3A: T-Spin System (400 lines)
```
core/
├── t-spin.ts            - T-Spin detection (200 lines)
└── scoring-advanced.ts  - Enhanced scoring (200 lines)
```

**Tasks**:
- [ ] T-Spin Mini detection (1-corner rule)
- [ ] T-Spin Full detection (3-corner rule)
- [ ] T-Spin Double/Triple scoring
- [ ] T-Spin audio cues
- [ ] T-Spin visual indicator

### Batch 3B: Combo & Scoring (300 lines)
```
core/
└── combo.ts             - Advanced combo system (300 lines)
```

**Tasks**:
- [ ] Combo chain tracking
- [ ] Combo multiplier (2x, 3x, etc.)
- [ ] Combo break detection
- [ ] Combo counter display
- [ ] Combo sound effects

### Batch 3C: Back-to-Back System (200 lines)
```
core/
└── back-to-back.ts      - B2B bonus (200 lines)
```

**Tasks**:
- [ ] B2B Tetris detection
- [ ] B2B T-Spin detection
- [ ] B2B bonus points
- [ ] B2B indicator display
- [ ] B2B chain tracking

### Batch 3D: Finesse & Perfect Clear (400 lines)
```
core/
├── finesse.ts           - Finesse detection (200 lines)
└── perfect-clear.ts     - PC detection/reward (200 lines)
```

**Tasks**:
- [ ] Finesse error detection
- [ ] Optimal path calculation
- [ ] Finesse statistics tracking
- [ ] Perfect clear celebration
- [ ] Perfect clear bonus points

### Batch 3E: IRS/IHS (300 lines)
```
core/
├── irs.ts               - Initial Rotation System (150 lines)
└── ihs.ts               - Initial Hold System (150 lines)
```

**Tasks**:
- [ ] IRS (rotate during spawn)
- [ ] IHS (hold during spawn)
- [ ] Input buffering during ARE

### Batch 3F: Credit Roll (400 lines)
```
core/
├── credit-roll.ts       - Invisible challenge (250 lines)
└── invisible.ts         - Piece fading logic (150 lines)
```

**Tasks**:
- [ ] 60-second invisible challenge
- [ ] Piece fade after lock (5 stages)
- [ ] Stack becomes invisible
- [ ] 32-line clear for MO grade
- [ ] Credit roll UI overlay

---

## Phase 4: Audio System 🎵

**Estimated**: ~1,800 lines
**Priority**: MEDIUM (enhances experience)
**Dependencies**: Phase 1

### Batch 4A: TrackerEngine Integration (600 lines)
```
audio/
├── tracker.ts           - MOD/XM playback (300 lines)
├── music-manager.ts     - Track selection (200 lines)
└── music-assets.ts      - Track metadata (100 lines)
```

**Tasks**:
- [ ] TrackerEngine setup (libopenmpt)
- [ ] Track loading and streaming
- [ ] Crossfade between tracks
- [ ] Music volume control
- [ ] Per-mode music selection

### Batch 4B: Sound Effects (400 lines)
```
audio/
├── sfx.ts               - Sound effect manager (200 lines)
└── sfx-assets.ts        - SFX samples (200 lines)
```

**Tasks**:
- [ ] TGM3-style SFX samples
- [ ] Move, rotate, lock sounds
- [ ] Line clear sound variations
- [ ] Tetris, T-Spin sounds
- [ ] Grade up fanfare
- [ ] COOL/REGRET audio cues

### Batch 4C: Voice Announcer (500 lines)
```
audio/
├── voice.ts             - Voice announcer (300 lines)
└── voice-assets.ts      - Voice samples (200 lines)
```

**Tasks**:
- [ ] "READY... GO!" countdown
- [ ] "TETRIS!" announcement
- [ ] "PERFECT!" on perfect clear
- [ ] "COOL!" / "REGRET!" section calls
- [ ] Grade announcements (S, M, GM)

### Batch 4D: Spatial Audio (300 lines)
```
audio/
└── spatial.ts           - 3D positioning (300 lines)
```

**Tasks**:
- [ ] Left/right panning for multiplayer
- [ ] Distance-based volume
- [ ] Opponent action audio

---

## Phase 5: Additional Rotation Systems 🔄

**Estimated**: ~1,200 lines
**Priority**: LOW (nice to have)
**Dependencies**: Phase 1

### Batch 5A: ARS Implementation (400 lines)
```
core/
└── rotation-ars.ts      - Arika system (400 lines)
```

**Tasks**:
- [ ] ARS piece shapes
- [ ] ARS rotation tables
- [ ] ARS wall kicks
- [ ] ARS spawn positions

### Batch 5B: NRS Implementation (400 lines)
```
core/
└── rotation-nrs.ts      - Nintendo system (400 lines)
```

**Tasks**:
- [ ] NRS piece shapes
- [ ] NRS rotation behavior
- [ ] Retro kick tables

### Batch 5C: BARS Implementation (400 lines)
```
core/
└── rotation-bars.ts     - Bombliss system (400 lines)
```

**Tasks**:
- [ ] BARS hybrid mechanics
- [ ] Extended kick tables

---

## Phase 6: Multiplayer & Networking 🌐

**Estimated**: ~4,500 lines
**Priority**: HIGH (core feature)
**Dependencies**: Phase 1, Phase 3A-3D

### Batch 6A: NetworkEngine Setup (800 lines)
```
network/
├── network-manager.ts   - NetworkEngine wrapper (300 lines)
├── matchmaking.ts       - Glicko-2 integration (300 lines)
└── connection.ts        - Connection management (200 lines)
```

**Tasks**:
- [ ] NetworkEngine initialization
- [ ] Glicko-2 ranked matchmaking
- [ ] Connection state management
- [ ] Disconnect handling
- [ ] Reconnection logic

### Batch 6B: Lobby System (1,000 lines)
```
network/
├── lobby.ts             - Pre-game lobby (400 lines)
├── lobby-ui.ts          - Lobby interface (300 lines)
└── room-manager.ts      - Room management (300 lines)
```

**Tasks**:
- [ ] Create/join room UI
- [ ] Player list display
- [ ] Ready/unready system
- [ ] Chat in lobby
- [ ] Room settings (mode, rules)
- [ ] Spectator slots

### Batch 6C: State Synchronization (1,200 lines)
```
network/
├── sync.ts              - State sync (400 lines)
├── prediction.ts        - Client prediction (400 lines)
└── rollback.ts          - Rollback netcode (400 lines)
```

**Tasks**:
- [ ] Server-authoritative state
- [ ] 10 FPS state sync
- [ ] Client-side prediction
- [ ] Input buffering
- [ ] Rollback on misprediction
- [ ] Lag compensation

### Batch 6D: Attack System (800 lines)
```
network/
├── attack.ts            - Garbage calculation (400 lines)
└── garbage.ts           - Garbage queue (400 lines)
```

**Tasks**:
- [ ] Line clear → garbage formula
- [ ] T-Spin attack bonuses
- [ ] Combo attack multiplier
- [ ] Back-to-back bonus
- [ ] Perfect clear bonus
- [ ] Garbage queue management
- [ ] Counter-attack cancellation
- [ ] Garbage hole randomization

### Batch 6E: Versus UI (700 lines)
```
network/
├── versus-ui.ts         - Split-screen layout (400 lines)
└── opponent-display.ts  - Opponent board (300 lines)
```

**Tasks**:
- [ ] Split-screen board layout
- [ ] Opponent board rendering
- [ ] Attack queue indicators
- [ ] Player health/KO display
- [ ] Spectator view

---

## Phase 7: AI Bot System 🤖

**Estimated**: ~2,500 lines
**Priority**: MEDIUM (solo practice)
**Dependencies**: Phase 1, Phase 3

### Batch 7A: Board Evaluation (800 lines)
```
ai/
├── evaluator.ts         - Heuristic evaluation (500 lines)
└── weights.ts           - Difficulty weights (300 lines)
```

**Tasks**:
- [ ] Height evaluation
- [ ] Hole counting
- [ ] Bumpiness calculation
- [ ] Line clear potential
- [ ] T-Spin setup detection
- [ ] Well formation
- [ ] Per-difficulty weight tuning

### Batch 7B: AI Controller (1,000 lines)
```
ai/
├── controller.ts        - AI decision making (500 lines)
├── search.ts            - Move search (300 lines)
└── paths.ts             - Path finding (200 lines)
```

**Tasks**:
- [ ] Best move search
- [ ] Hold piece consideration
- [ ] T-Spin detection
- [ ] Perfect clear recognition
- [ ] Path execution
- [ ] Mistake injection (lower difficulty)

### Batch 7C: Difficulty Levels (700 lines)
```
ai/
└── difficulty.ts        - 10 difficulty levels (700 lines)
```

**Tasks**:
- [ ] Beginner (9) - Random moves
- [ ] Easy (8-7) - Basic clearing
- [ ] Normal (6-5) - Competent play
- [ ] Hard (4-3) - T-Spin aware
- [ ] Expert (2-1) - Perfect clear hunting
- [ ] Master (S1-S9) - GM-level
- [ ] Grand Master (m-GM) - Unbeatable

---

## Phase 8: Competitive Systems 🏆

**Estimated**: ~3,000 lines
**Priority**: MEDIUM (long-term engagement)
**Dependencies**: Phase 6

### Batch 8A: Ranked Ladder (800 lines)
```
competitive/
├── ladder.ts            - ELO/Glicko-2 (400 lines)
└── ladder-ui.ts         - Rank display (400 lines)
```

**Tasks**:
- [ ] Rank tiers (Bronze → GM)
- [ ] MMR calculation
- [ ] Rank up/down
- [ ] Placement matches
- [ ] Rank decay
- [ ] Leaderboards

### Batch 8B: Seasonal System (600 lines)
```
competitive/
├── seasons.ts           - Season management (300 lines)
└── season-ui.ts         - Season UI (300 lines)
```

**Tasks**:
- [ ] Season structure (3 months)
- [ ] Season rewards
- [ ] Rank reset
- [ ] Season leaderboard
- [ ] Season cosmetics

### Batch 8C: Tournament System (1,000 lines)
```
competitive/
├── tournament.ts        - Tournament logic (500 lines)
├── brackets.ts          - Bracket management (300 lines)
└── tournament-ui.ts     - Tournament UI (200 lines)
```

**Tasks**:
- [ ] Tournament creation
- [ ] Single/double elimination
- [ ] Swiss rounds
- [ ] Round robin
- [ ] Bracket display
- [ ] Match scheduling

### Batch 8D: Replay System (600 lines)
```
competitive/
├── replay.ts            - Replay recording (300 lines)
└── replay-player.ts     - Replay playback (300 lines)
```

**Tasks**:
- [ ] Input recording
- [ ] Replay compression
- [ ] Replay playback
- [ ] Seek controls
- [ ] Highlight clips
- [ ] Replay sharing

---

## Phase 9: Progression & Customization 🎨

**Estimated**: ~2,000 lines
**Priority**: LOW (retention)
**Dependencies**: Phase 1

### Batch 9A: Achievement System (600 lines)
```
progression/
├── achievements.ts      - Achievement tracking (400 lines)
└── achievement-ui.ts    - Achievement display (200 lines)
```

**Tasks**:
- [ ] 50+ achievements
- [ ] Achievement notifications
- [ ] Achievement progress tracking
- [ ] Rare/epic achievements
- [ ] Achievement points

### Batch 9B: Cosmetic System (800 lines)
```
progression/
├── cosmetics.ts         - Cosmetic management (400 lines)
└── cosmetic-ui.ts       - Cosmetic selection (400 lines)
```

**Tasks**:
- [ ] Block skins (15 styles)
- [ ] Board themes (10 themes)
- [ ] Particle effects (custom colors)
- [ ] Music packs (5 packs)
- [ ] Unlock conditions
- [ ] Cosmetic preview

### Batch 9C: Player Profiles (600 lines)
```
progression/
├── profile.ts           - Profile management (300 lines)
└── profile-ui.ts        - Profile display (300 lines)
```

**Tasks**:
- [ ] Profile page
- [ ] Statistics display
- [ ] Match history
- [ ] Grade history
- [ ] Personal records
- [ ] Equipped cosmetics

---

## Phase 10: Database & Persistence 💾

**Estimated**: ~1,500 lines
**Priority**: HIGH (required for features)
**Dependencies**: All phases

### Batch 10A: Database Schema (400 lines)
```
data/
└── schema.sql           - Full schema (400 lines)
```

**Tables**:
- [ ] gm_users (stats, settings)
- [ ] gm_matches (match history)
- [ ] gm_replays (replay data)
- [ ] gm_achievements (unlocks)
- [ ] gm_cosmetics (owned/equipped)
- [ ] gm_leaderboards (global ranks)
- [ ] gm_seasons (seasonal data)
- [ ] gm_tournaments (tournament records)

### Batch 10B: Repository Layer (700 lines)
```
data/
├── user-repository.ts   - User data (200 lines)
├── match-repository.ts  - Match data (200 lines)
├── stats-repository.ts  - Statistics (150 lines)
└── leaderboard-repository.ts - Rankings (150 lines)
```

**Tasks**:
- [ ] User CRUD operations
- [ ] Match recording
- [ ] Statistics queries
- [ ] Leaderboard updates
- [ ] Transaction handling

### Batch 10C: Migration System (400 lines)
```
data/
└── migrations/          - Schema versions
```

**Tasks**:
- [ ] Schema versioning
- [ ] Migration scripts
- [ ] Rollback support
- [ ] Data integrity checks

---

## Phase 11: Polish & Testing 🔧

**Estimated**: ~1,000 lines
**Priority**: HIGH (quality assurance)
**Dependencies**: All phases

### Batch 11A: Performance Optimization (300 lines)
**Tasks**:
- [ ] Render optimization (dirty rectangles)
- [ ] Garbage collection tuning
- [ ] Memory profiling
- [ ] 60 FPS guarantee

### Batch 11B: Bug Fixes (400 lines)
**Tasks**:
- [ ] Edge case handling
- [ ] Input edge cases
- [ ] Network edge cases
- [ ] Race condition fixes

### Batch 11C: Accessibility (300 lines)
**Tasks**:
- [ ] Colorblind modes
- [ ] Screen reader support
- [ ] Keyboard-only mode
- [ ] Adjustable timing

---

## Summary

**Total Phases**: 11
**Total Batches**: 40+
**Estimated Total Lines**: ~25,000
**Current Progress**: Phase 1 (100%), Overall (~15%)

**Recommended Order**:
1. **Phase 2** (Visual Polish) - Makes game feel amazing
2. **Phase 3** (Advanced Mechanics) - Adds depth
3. **Phase 6** (Multiplayer) - Core feature
4. **Phase 4** (Audio) - Enhances experience
5. **Phase 7** (AI) - Solo practice
6. **Phase 8** (Competitive) - Long-term
7. **Phase 5** (Rotation Systems) - Nice to have
8. **Phase 9** (Progression) - Retention
9. **Phase 10** (Database) - Required for many features
10. **Phase 11** (Polish) - Final quality pass

**Next Steps**:
1. Fix current issues (tags, game loop verified)
2. Start Phase 2A (Core Visual Effects)
3. Implement in order of priority
