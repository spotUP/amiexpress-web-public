# CHATBOT-DATA-API — one read layer for every chatbot

New in 2026-09-10 (plan `thoughts/shared/plans/2026-09-10-chatbot-data-api.md`).
All new symbols carry `WEB_`/`BOT_` prefixes: this is a new feature with no
express.e counterpart.

## The shape

`web/backend/src/services/bot-data/` — pure read functions. Every function
takes an actor (`{ secLevel, username?, userId?, confAccess? }`), filters
before returning, and answers `{ text, truncated, total? }`. Lists clamp to
10 by default, 50 max; text cuts at 1800 chars. Two transports share them:

- **Chat tools** (`handlers/sysop-ai/tools.ts`): `user_lookup`,
  `user_search`, `top_callers`, `recent_messages`, `search_messages`,
  `search_board_files`, `board_files_stats`, `whip_projects`, `whip_tasks`,
  `whip_my_tasks`, `whip_leaderboard`, `whip_achievements`, `board_info`,
  `board_totals`, `recent_callers`, `door_data`, plus general knowledge
  `ask_wikipedia`, `wikidata_facts`, `weather_now`, `texttv_page`,
  `openalex_search`, `recent_quakes`, `hn_search`. All caller tier,
  all read-only.
- **HTTP** (`GET /api/bot/v1/*`, `api/bot-data-routes.ts`): same functions,
  same answers (pinned by test). Per-bot Bearer tokens, GET only.

## Tool picker (which tool answers what)

| Ask about | Tool | Not |
|---|---|---|
| Demos, scene groups, parties | `search_demozoo` | `lookup_game`, `ask_wikipedia` |
| Commercial video games | `lookup_game` | `search_demozoo` |
| Doors in the archive | `search_doors` | `door_data` |
| Files in the releases listing | `search_listing` | `search_files`, `search_board_files` |
| Files in a board conference | `search_files`, `search_board_files` | `search_listing` |
| Board users, messages, totals | `user_lookup`, `recent_messages`, `board_totals` | externals |
| WHIP tasks, leaderboard | `whip_*` | — |
| A door's stored scores | `door_data` (allowlisted doors/keys only) | `search_doors` |
| What/who is X, how Y works | `ask_wikipedia` | `search_demozoo`, `lookup_game` |
| Dates, identity, "when was" | `wikidata_facts` | `ask_wikipedia` |
| Weather anywhere | `weather_now` | — |
| Swedish news/sport/weather headlines | `texttv_page` (100 news, 300 sport, 400 weather) | — |
| Papers, studies | `openalex_search` | `ask_wikipedia` |
| Earthquakes, tech news | `recent_quakes`, `hn_search` | — |

## Tokens (HTTP)

`BOT_DATA_TOKENS="botid:secret,other:secret2:whip+board"` — comma pairs of
id and secret, optional third segment with `+`-separated read domains
(board, users, messages, files, conferences, whip, doors, activity;
default all). A token is a sysop-trusted READER. Revoke by removing the
pair and restarting. Add the variable to `.env.local` (see `.env.example`).

## Adding a domain or an external

1. Board data: new function in `services/bot-data/<domain>.ts` reusing a
   repository or service (never SQL inline when a repository exists, never
   a second implementation of a tool's backend). Actor-filtered, capped.
2. External: new file in `handlers/sysop-ai/external/` following
   `demozoo.ts` verbatim — axios + `amiexpress-web-bbs/1.0` UA, 3s/8s
   timeout, 24h `cachedLookup`, 1800 cap, `setXFetcher` seam,
   `q.slice(0,80)`, honest failure sentence. Keyless preferred; a key goes
   through `ToolContext` with a keyless fallback (`games.ts` pattern).
3. Thin tool in `tools.ts` (caller tier for reads) + thin route in
   `bot-data-routes.ts` + tests: recorded-shape (never live net in tests),
   privacy pins (erased/higher-level/private/conf-gated refused),
   HTTP/chat parity.
4. Document the tool in the picker table above.

## No-go rules

- No writes through this layer (WHIP writes stay in `WhipService` via the
  bot/door; chat `post_message` stays where it is).
- No secrets ever: password hashes, tokens, mail creds, JWT secrets. Tests
  assert their absence.
- No per-door branches (Rule 9): `door_data` is one generic reader + the
  `BOT_DOOR_ALLOWLIST`. A new door adds allowlist rows, never code paths.
- Tool names stay unique (pinned by test — the `search_files` collision).
- `texttv.nu` is an unofficial mirror, not SVT: the bot says so if asked.
