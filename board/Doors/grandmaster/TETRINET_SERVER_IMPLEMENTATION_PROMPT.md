# TetriNET 1.x Server Implementation Prompt (Jetrix-Parity)

Goal: Implement a production-ready TetriNET 1.13/1.14 server that is 1:1 with Jetrix-style behavior and the published protocol.

Sources:
- `TetriNetProtocol.txt` (Jetrix dev guide + 1.13/1.14, TetriFast, Query)
- `gtetrinet-0.7.11` (client reference: handshake, sendfield diff, clientinfo/version behavior)
- Jetrix 0.2.3 server (message flow and seed handling)

Scope and Required Parity
- Protocols: TetriNET 1.13 + 1.14 (seeded shared blocks), TetriFast (tetrifaster + obfuscated commands), Query protocol (playerquery/listchan/listuser/version), TSpec (spectator port 31458).
- Transport: TCP, messages delimited by 0xFF, Query responses line-delimited with LF and +OK terminators.
- Command handling: in-band slash commands (/list, /join, /who, /help, /kick, etc.)
- Channel behavior: 1–6 player slots, spectators, player join/leave, teams, winlist updates, pause/startgame, ingame/endgame.
- Field updates: full + differential (block index encoding with "012345acnrsbgqo" ordering and '!'+index header).
- Randomization: TetriNET 1.14 LCG (a=0x08088405, c=1, mod 2^32) with deterministic block+orientation per seed; 1.13 unseeded.
- Game rules: piece/special frequency arrays, classic mode cs1/cs2/cs4 line adds, special capacity, average levels.
- Logging/metrics: access logs, connection limits, channel stats, winlist persistence.

Jetrix Architecture Alignment
- Client thread: parse protocol, translate messages, forward to channel.
- Channel thread: apply filters, enforce rules, broadcast messages, maintain per-slot state.
- Server thread: global commands, channel directory, query endpoints.
- Filters: message pipeline with ability to transform/drop/insert events (anti-flood, mods).

Implementation Phases
1) Core networking and protocol parsing (0xFF framing, message map, Query/TetriFast variants).
2) Channel state model (players, spectators, teams, winlist, game state).
3) Game loop + message flow (newgame/startgame/pause/endgame, field updates, sb specials).
4) RNG and rule accuracy (LCG seed, piece/orientation selection, special frequency).
5) Query/TSpec endpoints and admin commands.
6) Validation against gtetrinet and Jetrix behaviors (capture logs, compare flows).

Deliverables
- Server implementation (TypeScript) with channel/filter architecture.
- Protocol test suite using recorded sessions.
- Reference runs proving parity for login, chat, join, newgame, sb, field updates.

Non-Negotiables
- No per-client hacks or heuristics. Behavior must be generic and source-backed.
- Protocol framing, message names, and state transitions must be 1:1 with references.
