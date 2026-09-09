# WHIP Discord mirror bot — sysop setup

Full WHIP use from Discord: link, read commands, live activity feed.
Plan: `thoughts/shared/plans/2026-09-09-whip-discord-bot.md`.

## 1. Discord application (5 min, Discord Developer Portal)

1. New application → Bot → Reset Token → copy it.
2. OAuth2 → URL Generator → scopes `bot` + `applications.commands` →
   permissions View Channels, Send Messages, Embed Links → open the URL,
   pick the server, Authorize. No privileged intents needed, ever.
3. Server Settings → Advanced → Developer Mode → right-click server →
   Copy Server ID (the guild ID).

## 2. Bridge user (on the BBS)

Register a normal BBS user named `discord-bridge` (any password). It only
listens for the live feed; it never posts.

## 3. Configure (admin UI → WHIP Bot, or env file)

Fields: bot token, guild ID, service token (must match the board's
`WHIP_SERVICE_TOKEN`), board URL (`http://bbs:3001` in compose),
bridge user + password, feed channel ID. The admin writes them to the
shared volume file; the bot reads them on boot. Restart the bot after
changes. Rotate a leaked token at step 1 and update the field.

## 4. Run it

- Production: `docker compose --profile bots up -d whip-bot` (or Start in
  the admin Bot page). Not started by default — the `bots` profile keeps
  it out of plain `up`.
- Local test: `cd bots/whip && cp .env.example .env`, fill in, `npm run dev`.
- Users link with `LINKDISCORD` on the BBS, then `/link code:…` in Discord.

## 5. Troubleshooting

- `/link` missing: wait 5 min for Discord's command cache, or re-invite.
- `Unknown/expired code`: codes live 10 min, single use — mint a fresh one.
- No feed posts: bridge user/password wrong, or feed channel unset.
- Bot offline in compose: `docker compose logs whip-bot`; health is the
  bot's own `/health` (same shape the admin status card polls).
