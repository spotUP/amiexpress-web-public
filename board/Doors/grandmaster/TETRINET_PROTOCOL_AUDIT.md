# TetriNET 1.x Protocol Audit (gtetrinet + Jetrix)

Source references:
- `~/Downloads/gtetrinet-0.7.11/src/client.h`
- `~/Downloads/gtetrinet-0.7.11/src/client.c`
- `~/Downloads/gtetrinet-0.7.11/src/tetrinet.c`
- `~/Code/Reference/Reference Code/TetriNetProtocol.txt`
- `~/Downloads/jetrix-0.2.3/lib/jetrix-0.2.3.pack` (TSpec listener/protocol via `unpack200`)

## Inbound (server -> client)
- [x] `connect`
- [x] `disconnect`
- [x] `noconnecting`
- [x] `playernum`
- [x] `playerjoin`
- [x] `playerleave`
- [x] `kick`
- [x] `team`
- [x] `pline`
- [x] `plineact`
- [x] `playerlost`
- [x] `playerwon`
- [x] `newgame` (1.13)
- [x] `btrixnewgame`
- [x] `ingame`
- [x] `pause`
- [x] `endgame`
- [x] `f`
- [x] `sb`
- [x] `lvl`
- [x] `gmsg`
- [x] `winlist`
- [x] `speclist`
- [x] `specjoin`
- [x] `specleave`
- [x] `smsg`
- [x] `sact`
## Query Protocol (TetriNET port 31457)
- [x] `playerquery` (single-line response)
- [x] `listchan` (LF-terminated lines, `+OK` terminator)
- [x] `listuser` (LF-terminated lines, `+OK` terminator)
- [x] `version` (LF-terminated lines, `+OK` terminator)

## TSpec
- [x] Port 31458 listener (`TSpecListener`)
- [x] Login uses `tetrisstart` encoding with token (Jetrix agent uses name + password)
- [x] `speclist` format: `speclist #<channel> <name> <name> ...`
- [x] `specjoin`/`specleave` are sent without a space: `specjoin<name>` / `specleave<name>`
- [x] `smsg` is sent without a space: `smsg<name> <text>`
- [x] Spectator chat from client uses `pline 0 <text>` (private) or `pline 0 //<text>` (public)

## Outbound (client -> server)
- [x] `connected`
- [x] `team`
- [x] `pline`
- [x] `plineact`
- [x] `playerlost`
- [x] `f`
- [x] `sb`
- [x] `lvl`
- [x] `gmsg`
- [x] `startgame`
- [x] `pause`
- [x] `version` (gtetrinet sends when spectating)
- [x] `clientinfo` (gtetrinet sends on `lvl 0 0`)

## TetriFast differences
- [x] Login uses `tetrifaster`
- [x] `playernum` obfuscated as `)#)(!@(*3`
- [x] `newgame` obfuscated as `*******`
- [x] Next-block delay 0ms

## TetriNET 1.14
- [x] Parse seed string (8 hex chars) appended to `newgame`
- [x] LCG-based block RNG when seed present
- [x] Seed parsed as big-endian hex (per user confirmation)
