# Card Game Lobby Prompt

You are building a multiplayer Card Game Lobby for AmiExpress BBS using SDK v2.0.
The lobby is the central hub where players discover, create, and join card games.
It must be fast, clear on 80x24 terminals, and optimized for repeat play.

## Goals

- Make it effortless to start or join multiplayer card games.
- Keep players coming back via leaderboards, achievements, and live event feeds.
- Integrate with LiveChat by broadcasting lobby events (tables created, games started, big wins).

## Core Features

1) Lobby Home
- List active tables with game type, stakes, player count, status (open/starting/in-progress), and time since created.
- Quick actions: Join, Observe, Create.
- Filters: Game type, stakes, open seats, friends.
- Hotkeys for navigation (single key).

2) Table Creation and Matchmaking
- Create a new table with game selection (e.g., Texas Hold'em, Blackjack, UNO, etc.).
- Table settings: stakes/entry, max players, private/public, invite code, time per turn.
- Auto-start option when min players reached.
- Allow quick join to auto-seat into a matching table.

3) Player Profiles and Presence
- Show user status (in lobby, at table, away).
- Show per-game stats (wins, hands played, biggest pot).
- Allow invites and friend joins.

4) Leaderboards
- Daily/weekly/all-time views.
- Metrics: wins, win rate, hands played, total chips won.
- Highlight current leader and personal rank.
- Leaderboards should be posted weekly to the bulletins

5) Achievements
- Multi-tier achievements: first win, 100 hands, win streaks, rare hand events.
- Achievement popups and a profile badge list.

6) LiveChat Integration
- Post events to LiveChat with short, readable messages.
- Example: "TABLE OPEN: 1/6 seats at HOLD'EM $10/$20 — /JOIN 42"
- Post big wins, streaks, and tournaments starting.

7) Game Catalog
- SDK-powered card games list with short descriptions.
- Each game can be launched into a table with its own ruleset and engine.

8) Persistence and Storage
- Use SDK storage for player stats, achievements, and leaderboard data.
- Store game history for audit/review.

## Poker Engine Integration (Texas Hold'em)

- Texas Hold'em tables must use the SDK PokerEngine wrapper (based on @pokertools/engine).
- Core flow: sit -> deal -> act -> state/view updates -> showdown -> history export.
- Use PokerEngine view masking for public state; only show full hands to the owner.
- Use CardEngine for board/hand rendering (ASCII + ANSI).
- Log hand history using PokerEngine history export for audits and achievements.

## BBS Economy (No Real Money)

- Use a chips-based economy (BBS Chips) that is purely virtual and cannot be cashed out.
- Provide daily login chips and small activity rewards (games played, achievements).
- Track a player wallet (current chips, lifetime earned, lifetime spent).
- Sinks: table entry fees, cosmetic badges, chat flair, tournament buy-ins.
- Protect against inflation: caps on daily rewards, minimum buy-ins, rake-like sinks for high-stakes tables.
- Allow private tables to use "for fun" mode with no chip stakes.
- Show chip balance clearly in the lobby header and player profile.

## SDK Constraints and Rules

- Use SDK v2 CoreDoor patterns for all lobby logic.
- Output must be ANSI-safe; default to ASCII art. Use CardEngine for rendering cards.
- No background processes; rely on the SDK lifecycle hooks and game loop patterns.
- Must respect terminal size (80x24) and avoid overflow.
- Use amigafs and existing BBS storage rules.
- Provide clean separation between lobby UI, matchmaking logic, and game sessions.
- The lobby architecture must make it easy to add new card games (registry-based catalog, game metadata, and a consistent table/session interface).

## UX Requirements

- Clear, compact UI with minimal scrolling.
- Single-key controls for speed (J=join, C=create, L=leaderboard, A=achievements, Q=quit).
- Staggered refresh for lobby list to avoid flicker.

## Deliverables

- Lobby door architecture (modules, data flow).
- CLI-style UX layout sketches (ASCII).
- Data models for tables, players, stats, achievements.
- LiveChat event schema.
- Implementation plan using SDK v2 and game engines.
