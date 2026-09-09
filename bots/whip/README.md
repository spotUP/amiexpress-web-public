# WHIP Discord mirror bot

Full WHIP use from Discord. Plan:
`thoughts/shared/plans/2026-09-09-whip-discord-bot.md`.

## Phase 0 (this scaffold)

- Gateway login + `/link` command skeleton (shape validation only).
- Backend pieces live in `web/backend`: `user_discord_links` table +
  repository, `LINKDISCORD` BBS command (mints the code),
  `authenticateServiceToken` for the Phase 1 REST routes.

## Phase 1 (implemented)

- `/link code:XXXXXXXX` verifies the code against
  `POST /api/whip/link` (ephemeral success, ephemeral retry hint on
  unknown/expired/spent codes).
- `/whip projects|tasks|my-tasks|leaderboard|achievements|parties` —
  read-only embeds over the service-token REST API. `my-tasks` (and
  `achievements`) with no `user` option resolve the caller's link via
  `GET /api/whip/link-status` and ask for `/link` when unlinked.
- Live WHIP feed: the bot logs in to `POST /api/chat/login` as
  `WHIP_BBS_USER`, opens a chatOnly socket, and posts WHIP door activity
  (`custom_door_event` with `doorName` WHIP) to
  `DISCORD_FEED_CHANNEL_ID`. The feed stays silent when that var is unset
  and never takes the bot down (fail-soft on start).
- `src/whip-api.ts` (typed axios client, injectable transport),
  `src/feed.ts` (`formatWhipEvent` pure formatter + `startFeed` wiring).

## Setup

```bash
cd bots/whip
cp .env.example .env   # fill in tokens
npm install
npm test               # config tests, no Discord needed
npm run dev            # logs in, registers /link on the guild
```

Bot needs a Discord application with the `Guilds` intent only (no
privileged intents in any phase — slash commands carry all input).

## Linking

1. On the BBS: `LINKDISCORD` → 8-character code, 10 minutes, single use.
2. In Discord: `/link code:XXXXXXXX` → bot verifies it against the backend
   and replies ephemerally with the linked BBS username (or a fresh-code
   hint when the code is unknown, expired, or spent).

## Feed bridge account

The live feed needs a BBS account to listen on: register a user named
`discord-bridge` (any password, no special level) and put it in
`WHIP_BBS_USER` / `WHIP_BBS_PASSWORD`. It never posts, only listens.
