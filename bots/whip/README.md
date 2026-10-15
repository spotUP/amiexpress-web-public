# WHIP Discord mirror bot

Full WHIP use from Discord. Plan:
`thoughts/shared/plans/2026-09-09-whip-discord-bot.md`.

## Commands

- `/link code:XXXXXXXX` — bind your Discord account (code from BBS `LINKDISCORD`, 10 min, single use).
- `/whip help` — usage screen. Mention the bot or DM it for the same text.
- `/whip projects|tasks|my-tasks|leaderboard|achievements|parties|users` — reads.
  `my-tasks` and `achievements` default to your linked BBS user.
- `/whip task id:` — one task with Complete / Move / Delete buttons.
- `/whip task-new|project-new` — popup forms.
- `/whip task-edit|task-delete|task-complete|task-move|project-delete` — writes.
  Deletes ask first. Completing awards points, checks achievements, and posts
  to the feed exactly like a door-side completion.
- Writes need a linked account; the backend verifies link on every write.

## Setup

```bash
cd bots/whip
cp .env.example .env   # fill in tokens
npm install
npm test               # no Discord needed
npm run dev            # logs in, registers commands on the guild
```

Discord application: `Guilds` + `GuildMessages` + `DirectMessages` intents
(none privileged — no Message Content, channel chatter stays unreadable),
scopes `bot` + `applications.commands`, permissions View Channels, Send
Messages, Embed Links.

## Linking

1. On the BBS: `LINKDISCORD` → 8-character code, 10 minutes, single use.
2. In Discord: `/link code:XXXXXXXX` → ephemeral confirmation (or a
   fresh-code hint when unknown/expired/spent).

## Feed

Logs in to `POST /api/chat/login` as `WHIP_BBS_USER`, opens a chatOnly
socket, posts WHIP door activity to `DISCORD_FEED_CHANNEL_ID`. Silent when
unset, fail-soft on start. Bridge account: register a BBS user named
`discord-bridge` (any password); it never posts, only listens.

## Layout

- `src/whip-api.ts` — typed axios client, injectable transport.
- `src/feed.ts` — pure formatter + socket wiring.
- `src/format.ts` — pure `/whip` output formatters.
- `src/writes.ts` — modals, buttons, selects, custom-id codec.
- `src/health.ts` — `/health` for compose and the admin status probe.
