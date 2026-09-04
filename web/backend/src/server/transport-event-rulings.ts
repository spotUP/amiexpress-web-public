/**
 * THE RULING TABLE - 242 event names, each with a written reason.
 *
 * Split out of `server/transport-adapter.ts` for the repo's 2000-line ceiling
 * (`.husky` pre-commit size check): the adapter is BEHAVIOUR, this file is the
 * DATA it decides from, and nothing else changed in the split. The adapter
 * re-exports `EventRuling` and `EVENT_RULINGS`, so every importer still reaches
 * them at `server/transport-adapter`.
 *
 * THE CENSUS, AND HOW TO RE-RUN IT. Three greps, unioned, re-run against the
 * working tree on 2026-09-03. Scope is `web/backend/src` + `sdk` +
 * `Doors/<door>/[a-z]*.ts` - the backend is not the only thing holding a
 * caller's socket. `tests/transport/transport-adapter.test.ts` re-runs all
 * three from the tree on every run and fails BY NAME for anything unruled, so
 * the census cannot drift silently.
 *
 *   A - every quoted event name in the backend (149):
 *       cd web/backend/src && grep -rhoE "\.emit\(\s*['\"][a-zA-Z0-9:_-]+['\"]" \
 *         --include="*.ts" . | sed -E "s/.*['\"]([^'\"]+)['\"]/\1/" | sort -u
 *
 *   B - emits on a SESSION-SOCKET receiver outside the backend (101). A plain
 *       file grep over `sdk/` returns 392 names, nearly all blessed-widget and
 *       engine-internal EventEmitter traffic; anchoring on the RECEIVER is what
 *       separates "reaches a caller" from "reaches a widget". 86 come from
 *       `sdk/engines|utils|types`, 16 from `Doors/<door>/[a-z]*.ts` (one, and
 *       only one, in both).
 *
 *       CORRECTION TO THE PLAN, measured: the plan records the `Doors/` arm as
 *       "0 hits today". It is not - it is 16 names, 10 of which no other arm
 *       sees. The zero was a SHELL artefact: with an unquoted glob under zsh's
 *       default `nomatch`, every doorless directory aborts the loop before any
 *       file is listed. Quoted, and with `ls`'s error discarded, the arm
 *       returns Doors/livechat, card-lobby, rip-browser, telnet-front,
 *       neo-blessed-showcase and the eight `ansi-output` doors.
 *
 *   C - the emits whose NAME IS A VARIABLE, which A and B cannot see at all.
 *       Not a name census but a SITE census: see PATTERN_RULINGS and
 *       FORWARDING_EMIT_SITES in `server/transport-adapter.ts`.
 *
 * UNION: 242 names. 149 from A; 93 new from B (80 of which are SDK
 * network-engine traffic addressed to an in-process `BrokerClient` shim, 3 of
 * which are real session-socket emits from the SDK audio engine, and 10 of
 * which are emitted by a DOOR onto the caller's own socket).
 *
 * RE-MEASURED WHEN THIS LANDED ON MAIN: A is 150, B is 99 (86 sdk, 14 Doors,
 * `ansi-output` in both), and the UNION IS STILL 242 - not one name was added
 * or lost. Two names simply changed arms, and the same two move both counts:
 *   - `get-active-users` left `Doors/telnet-front/index.ts` when the node table
 *     stopped asking for it over the socket. `src/doors/who-is-online.ts` is
 *     that read now, and its header QUOTES the dead call, so grep A - a text
 *     scan, comments included - counts the name where B used to.
 *   - `bbs:event` moved from `Doors/card-lobby/index.ts` to
 *     `Doors/card-lobby/lib/live-chat.ts`, which the `Doors/<door>/[a-z]*.ts`
 *     arm does not descend into. The backend emits it too, so A still sees it.
 * Only the arms' split moved; the union is what proves nothing is unruled, and
 * the suite asserts that by name.
 *
 * NO `any` crosses this module's boundary, and it imports nothing at all.
 */
/**
 * What happens to one event name on a byte transport.
 *
 * EVERY entry carries a `note`. A ruling with an empty note fails the
 * enumeration test: the point of the table is the written reason, not the
 * classification.
 */
export type EventRuling =
  /** The adapter turns it into bytes for a byte terminal. */
  | { kind: "render"; note: string }
  /** The adapter turns it into server-side connection/session state. */
  | { kind: "translate"; note: string }
  /**
   * Meaningful only to a browser. Dropped on a byte transport, counted, and
   * logged ONCE PER NAME PER CONNECTION.
   */
  | { kind: "web-only"; note: string }
  /**
   * Emitted, but NO consumer exists on ANY transport. A defect in its own
   * right; ruled here so it cannot masquerade as a transport gap.
   */
  | { kind: "dead"; note: string }
  /**
   * Not a session socket at all - an EventEmitter on a server, a manager, a
   * bridge, a socket.io room, or the in-process broker shim. `owner` names it
   * so the claim can be checked.
   */
  | { kind: "not-transport"; owner: string; note: string };

/**
 * The 80 SDK network-engine names, each with the module that emits it. They
 * share one ruling because they share one reason, and the site keeps each
 * entry's note specific enough to check. Built as a table rather than 80
 * copy-pasted objects: one reason, one place.
 */
const BROKER_SITES: Readonly<Record<string, string>> = {
  'achievements:get': 'engines/network/modules/leaderboard.ts:211',
  'achievements:progress': 'engines/network/modules/leaderboard.ts:255',
  'achievements:unlock': 'engines/network/modules/leaderboard.ts:245',
  'game:input': 'engines/network/modules/prediction.ts:173',
  'game:invite': 'engines/network/modules/social.ts:162',
  'join_room': 'engines/network/modules/connection.ts:574',
  'leaderboard:get': 'engines/network/modules/leaderboard.ts:99',
  'leaderboard:get_around': 'engines/network/modules/leaderboard.ts:149',
  'leaderboard:get_rank': 'engines/network/modules/leaderboard.ts:124',
  'leaderboard:top_by_stat': 'engines/network/modules/leaderboard.ts:333',
  'leave_room': 'engines/network/modules/connection.ts:583',
  'lobby:auto_balance': 'engines/network/modules/lobby.ts:660',
  'lobby:ban': 'engines/network/modules/lobby.ts:498',
  'lobby:cancel_countdown': 'engines/network/modules/lobby.ts:548',
  'lobby:chat': 'engines/network/modules/lobby.ts:184',
  'lobby:create': 'engines/network/broker/broker-client.ts:28',
  'lobby:emote': 'engines/network/modules/lobby.ts:472',
  'lobby:force_start': 'engines/network/modules/lobby.ts:590',
  'lobby:game_over': 'engines/network/modules/lobby.ts:569',
  'lobby:get_invite_code': 'engines/network/modules/lobby.ts:613',
  'lobby:join': 'engines/network/modules/lobby.ts:294',
  'lobby:join_by_code': 'engines/network/modules/lobby.ts:317',
  'lobby:kick': 'engines/network/modules/lobby.ts:485',
  'lobby:leave': 'engines/network/modules/lobby.ts:337',
  'lobby:list': 'engines/network/modules/lobby.ts:687',
  'lobby:matchmake': 'engines/network/modules/lobby.ts:709',
  'lobby:ready': 'engines/network/modules/lobby.ts:354',
  'lobby:set_character': 'engines/network/modules/lobby.ts:410',
  'lobby:set_color': 'engines/network/modules/lobby.ts:397',
  'lobby:set_settings': 'engines/network/modules/lobby.ts:424',
  'lobby:set_team': 'engines/network/modules/lobby.ts:385',
  'lobby:shuffle_teams': 'engines/network/modules/lobby.ts:672',
  'lobby:start_countdown': 'engines/network/modules/lobby.ts:536',
  'lobby:start_game': 'engines/network/modules/lobby.ts:578',
  'lobby:start_vote': 'engines/network/modules/lobby.ts:436',
  'lobby:transfer_host': 'engines/network/modules/lobby.ts:511',
  'lobby:vote': 'engines/network/modules/lobby.ts:448',
  'matches:get': 'engines/network/modules/leaderboard.ts:291',
  'matches:history': 'engines/network/modules/leaderboard.ts:270',
  'matches:submit': 'engines/network/modules/leaderboard.ts:312',
  'matchmaking:accept': 'engines/network/modules/matchmaking.ts:229',
  'matchmaking:decline': 'engines/network/modules/matchmaking.ts:241',
  'matchmaking:estimate_wait': 'engines/network/modules/matchmaking.ts:426',
  'matchmaking:get_skill': 'engines/network/modules/matchmaking.ts:258',
  'matchmaking:join': 'engines/network/modules/matchmaking.ts:191',
  'matchmaking:leave': 'engines/network/modules/matchmaking.ts:212',
  'matchmaking:queue_population': 'engines/network/modules/matchmaking.ts:447',
  'party:create': 'engines/network/modules/social.ts:386',
  'party:invite': 'engines/network/modules/social.ts:142',
  'party:join': 'engines/network/modules/social.ts:408',
  'party:leave': 'engines/network/modules/social.ts:427',
  'ping': 'node_modules/@types/node/events.d.ts:781',
  'presence:get': 'engines/network/modules/presence.ts:206',
  'presence:get_batch': 'engines/network/modules/presence.ts:233',
  'presence:subscribe': 'engines/network/modules/presence.ts:259',
  'presence:unsubscribe': 'engines/network/modules/presence.ts:276',
  'presence:update': 'engines/network/modules/presence.ts:83',
  'replay:delete': 'engines/network/modules/replay.ts:308',
  'replay:list': 'engines/network/modules/replay.ts:497',
  'replay:load': 'engines/network/modules/replay.ts:260',
  'replay:save': 'engines/network/modules/replay.ts:296',
  'security:report': 'engines/network/modules/security.ts:372',
  'social:accept_friend': 'engines/network/modules/social.ts:291',
  'social:add_friend': 'engines/network/modules/social.ts:248',
  'social:block': 'engines/network/modules/social.ts:336',
  'social:decline_friend': 'engines/network/modules/social.ts:314',
  'social:get_blocked': 'engines/network/modules/social.ts:228',
  'social:get_friends': 'engines/network/modules/social.ts:208',
  'social:remove_friend': 'engines/network/modules/social.ts:269',
  'social:unblock': 'engines/network/modules/social.ts:364',
  'stats:compare': 'engines/network/modules/leaderboard.ts:354',
  'stats:get': 'engines/network/modules/leaderboard.ts:178',
  'sync:aoi': 'engines/network/modules/sync.ts:420',
  'sync:delta': 'engines/network/modules/sync.ts:219',
  'sync:lockstep': 'engines/network/modules/sync.ts:269',
  'sync:request_full': 'engines/network/modules/sync.ts:405',
  'sync:snapshot': 'engines/network/modules/sync.ts:174',
  'voice:deafen': 'engines/network/modules/social.ts:541',
  'voice:join': 'engines/network/modules/social.ts:503',
  'voice:leave': 'engines/network/modules/social.ts:513',
};

function brokerRuling(site: string): EventRuling {
  return {
    kind: "not-transport",
    owner: "BrokerClient",
    note:
      "SDK network-engine broker traffic. Emitted by " +
      "sdk/engines/network/modules/* onto a BrokerClient, which is an " +
      "in-process socket SHIM, not a transport: \"acts as a socket for " +
      "in-process multiplayer... The SDK's LobbySystem calls socket dot emit " +
      "with 'lobby:create' and socket dot on with 'lobby:player_joined'\" " +
      // The quote is paraphrased around the call punctuation ON PURPOSE: this
      // file lives inside the census's own grep A scope, so writing the literal
      // call form here would add `lobby:create` to the backend's name list and
      // make the module contaminate the census it defines. The self-check in
      // tests/transport/transport-adapter.test.ts pins that rule.
      "(sdk/engines/network/broker/broker-client.ts:25-30). It never reaches a " +
      "caller's connection, so it is not a transport concern on any transport. " +
      "Site: sdk/" + site + ".",
  };
}

/**
 * The 162 names that are not broker traffic, in the order the census prints
 * them, so a diff against a re-run of greps A and B reads straight down.
 */
const NAMED_RULINGS: Readonly<Record<string, EventRuling>> = {
  "active-users": {
    kind: "not-transport",
    owner: "socket.io Socket (registerSocketHandlers)",
    note:
    "server/socket-handlers.ts:220, reached only from the web socket handler " +
    "table. One door listens for it (Doors/telnet-front/index.ts) but on web " +
    "only, because the emit site is unreachable from a byte transport.",
  },
  "ansi-output": {
    kind: "render",
    note:
    "The ANSI byte stream itself. The emitter renders it in its own first " +
    "branch (server/connection-emitter.ts:92-116) and never reaches this table; " +
    "the entry exists so the census is total and so a reader of EVENT_RULINGS " +
    "finds every name in one place. 1832 emit sites in web/backend/src.",
  },
  "audio-speaking-status": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/audio-video.handler.ts:1147. Door-side listener: " +
    "Doors/voice-chat/src/index.ts, Doors/livechat/features/voice-chat.ts. A " +
    "byte terminal has no media stack at all, so there is nothing to translate " +
    "this into.",
  },
  "audio:data": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/audio-video.handler.ts:257. Browser consumer: " +
    "packages/terminal/src/utils/media-handler.ts. Door-side listener: " +
    "Doors/voice-chat/src/client.ts, Doors/grandmaster/app.ts. A byte terminal " +
    "has no media stack at all, so there is nothing to translate this into.",
  },
  "audio:levels": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/audio-video.handler.ts:220. Door-side listener: " +
    "Doors/neo-blessed-showcase/app.ts, Doors/voice-chat/src/index.ts. A byte " +
    "terminal has no media stack at all, so there is nothing to translate this " +
    "into.",
  },
  "audio:muted": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/audio-video.handler.ts:157. Browser consumer: " +
    "packages/terminal/src/utils/media-handler.ts. A byte terminal has no media " +
    "stack at all, so there is nothing to translate this into.",
  },
  "audio:play-sfx": {
    kind: "web-only",
    note:
    "A real session-socket emit the backend census could never see: the SDK " +
    "audio engine writes it to `this.socket`, the caller's own socket, assigned " +
    "from the constructor argument (sdk/engines/audio/audio-engine.ts:102). " +
    "Sites: sdk/engines/audio/audio-engine.ts:1196, :1214, :1231. A byte " +
    "terminal has no Web Audio context, so there is nothing to play.",
  },
  "audio:set-ui-sounds": {
    kind: "web-only",
    note:
    "A real session-socket emit the backend census could never see: the SDK " +
    "audio engine writes it to `this.socket`, the caller's own socket, assigned " +
    "from the constructor argument (sdk/engines/audio/audio-engine.ts:102). " +
    "Sites: sdk/engines/audio/audio-engine.ts:243. A byte terminal has no Web " +
    "Audio context, so there is nothing to play.",
  },
  "audio:set-volume": {
    kind: "web-only",
    note:
    "A real session-socket emit the backend census could never see: the SDK " +
    "audio engine writes it to `this.socket`, the caller's own socket, assigned " +
    "from the constructor argument (sdk/engines/audio/audio-engine.ts:102). " +
    "Sites: sdk/engines/audio/audio-engine.ts:266. A byte terminal has no Web " +
    "Audio context, so there is nothing to play.",
  },
  "audio:start-streaming": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/audio-video.handler.ts:115. Browser consumer: " +
    "packages/terminal/src/components/BBSTerminal.tsx. Door-side listener: " +
    "Doors/neo-blessed-showcase/client.ts, Doors/voice-chat/src/client.ts. A " +
    "byte terminal has no media stack at all, so there is nothing to translate " +
    "this into.",
  },
  "audio:stop-streaming": {
    kind: "web-only",
    note:
    "Browser media API channel. Emitted by a DOOR onto the caller's socket - " +
    "Doors/neo-blessed-showcase/app.ts:3445, whose own comment says \"Tell " +
    "browser client to start audio capture\" three lines above the start half. " +
    "The backend also registers an INBOUND handler of the same name " +
    "(handlers/audio-video.handler.ts:131) and the browser an outbound one " +
    "(packages/terminal/src/components/BBSTerminal.tsx:1558). A byte terminal " +
    "has no capture device and no Web Audio context.",
  },
  "audio:stream-started": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/audio-video.handler.ts:120. A byte terminal has no media stack at " +
    "all, so there is nothing to translate this into.",
  },
  "audio:stream-stopped": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/audio-video.handler.ts:141. A byte terminal has no media stack at " +
    "all, so there is nothing to translate this into.",
  },
  "bbs:event": {
    kind: "not-transport",
    owner: "BBSEventEmitter",
    note:
    "services/bbs-event-emitter.ts:275 (`this.io.emit`, a broadcast the config " +
    "app's RealtimeProvider subscribes to) and :279 (`super.emit`, the " +
    "in-process bus the LiveChat pipeline reads). Neither is a session socket.",
  },
  "c64-detected": {
    kind: "not-transport",
    owner: "TelnetServer",
    note:
    "The DEL-probe result, raised on the server (server/telnet-server.ts:756) " +
    "and handled by server/c64-detected-handler.ts. Not a session socket.",
  },
  "chat-only-login-error": {
    kind: "web-only",
    note:
    "Emitted at server/chat-socket-handlers.ts:63, " +
    "server/chat-socket-handlers.ts:78, server/chat-socket-handlers.ts:94; " +
    "listener Doors/livechat/chat-only-login.ts. Browser-only flow, as above.",
  },
  "chat-only-login-success": {
    kind: "web-only",
    note:
    "The chat-only (LiveChat-direct) browser login, emitted at " +
    "server/chat-socket-handlers.ts:87, handlers/chat-only-login.handler.ts:43. " +
    "Its listener is the door's own chat-only client " +
    "(Doors/livechat/chat-only-login.ts); that flow exists only for a browser.",
  },
  "chat:auth-token": {
    kind: "web-only",
    note:
    "LiveChat's chat-only browser login hands the client a token. Emitted at " +
    "Doors/livechat/chat-only-login.ts:130; consumed by " +
    "web/frontend/src/chat/ChatTerminal.tsx:421. That whole flow is a browser " +
    "login into the chat door and has no byte-transport equivalent.",
  },
  "chat:banned": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "server/moderation-socket-handlers.ts:60. Its consumer is the LiveChat " +
    "door's SERVER half (Doors/livechat/server.ts), which receives it through " +
    "createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "chat:declined": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/internode-chat.handler.ts:450. Measured 2026-09-03: no " +
    "listener in packages/terminal/src, web/frontend/src, web/config-app/src, " +
    "Doors/ or sdk/. No frontend listens for it (the plan's draft named " +
    "RealtimeProvider.tsx and web/frontend/src/chat; measured, they do not). A " +
    "byte terminal cannot render a structured object; the BBS-side chat a " +
    "telnet caller CAN reach travels as ansi-output and is TP-10's work, not " +
    "this table's.",
  },
  "chat:dm": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/dm.handler.ts:66, handlers/chat/dm.handler.ts:69, " +
    "handlers/chat/dm.handler.ts:139. Its consumer is the LiveChat door's " +
    "SERVER half (Doors/livechat/handlers/chat-socket-handlers.ts), which " +
    "receives it through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "chat:dm-error": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/dm.handler.ts:36, handlers/chat/dm.handler.ts:40, " +
    "handlers/chat/dm.handler.ts:45. Measured 2026-09-03: no listener in " +
    "packages/terminal/src, web/frontend/src, web/config-app/src, Doors/ or " +
    "sdk/. No frontend listens for it (the plan's draft named " +
    "RealtimeProvider.tsx and web/frontend/src/chat; measured, they do not). A " +
    "byte terminal cannot render a structured object; the BBS-side chat a " +
    "telnet caller CAN reach travels as ansi-output and is TP-10's work, not " +
    "this table's.",
  },
  "chat:dm-history": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/dm.handler.ts:171. Its consumer is the LiveChat door's " +
    "SERVER half (Doors/livechat/handlers/dm-sidebar-handlers.ts), which " +
    "receives it through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "chat:dm-threads": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "server/chat-socket-handlers.ts:411, " +
    "handlers/chat/dm-thread-list.handler.ts:97. Its consumer is the LiveChat " +
    "door's SERVER half (Doors/livechat/handlers/dm-sidebar-handlers.ts), which " +
    "receives it through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "chat:dm-threads:list": {
    kind: "dead",
    note:
    "An INBOUND name emitted OUTBOUND. `chat-socket-handlers.ts:403` registers " +
    "`socket.on(\"chat:dm-threads:list\")` for a browser REQUEST, and " +
    "Doors/livechat/server.ts:2969 emits it on the session socket - which sends " +
    "it AWAY from that handler on every transport, to a browser that has no " +
    "listener for it (measured 2026-09-03). It is not in " +
    "createDoorSocketWrapper's server-side intercept list either " +
    "(handlers/door.handler.ts:175-360), so nothing serves it on web or on " +
    "telnet. A door defect, filed by this ruling rather than hidden by it.",
  },
  "chat:ended": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/internode-chat.handler.ts:768. Measured 2026-09-03: no " +
    "listener in packages/terminal/src, web/frontend/src, web/config-app/src, " +
    "Doors/ or sdk/. No frontend listens for it (the plan's draft named " +
    "RealtimeProvider.tsx and web/frontend/src/chat; measured, they do not). A " +
    "byte terminal cannot render a structured object; the BBS-side chat a " +
    "telnet caller CAN reach travels as ansi-output and is TP-10's work, not " +
    "this table's.",
  },
  "chat:error": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "server/pin-socket-handlers.ts:23, server/pin-socket-handlers.ts:38, " +
    "server/pin-socket-handlers.ts:57. Measured 2026-09-03: no listener in " +
    "packages/terminal/src, web/frontend/src, web/config-app/src, Doors/ or " +
    "sdk/. No frontend listens for it (the plan's draft named " +
    "RealtimeProvider.tsx and web/frontend/src/chat; measured, they do not). A " +
    "byte terminal cannot render a structured object; the BBS-side chat a " +
    "telnet caller CAN reach travels as ansi-output and is TP-10's work, not " +
    "this table's.",
  },
  "chat:invite": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/internode-chat.handler.ts:202. Measured 2026-09-03: no " +
    "listener in packages/terminal/src, web/frontend/src, web/config-app/src, " +
    "Doors/ or sdk/. No frontend listens for it (the plan's draft named " +
    "RealtimeProvider.tsx and web/frontend/src/chat; measured, they do not). A " +
    "byte terminal cannot render a structured object; the BBS-side chat a " +
    "telnet caller CAN reach travels as ansi-output and is TP-10's work, not " +
    "this table's.",
  },
  "chat:invite-cancelled": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/internode-chat.handler.ts:229. Measured 2026-09-03: no " +
    "listener in packages/terminal/src, web/frontend/src, web/config-app/src, " +
    "Doors/ or sdk/. No frontend listens for it (the plan's draft named " +
    "RealtimeProvider.tsx and web/frontend/src/chat; measured, they do not). A " +
    "byte terminal cannot render a structured object; the BBS-side chat a " +
    "telnet caller CAN reach travels as ansi-output and is TP-10's work, not " +
    "this table's.",
  },
  "chat:keystroke": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "server/chat-socket-handlers.ts:443, handlers/door.handler.ts:245. Its " +
    "consumer is the LiveChat door's SERVER half " +
    "(Doors/livechat/core/socket-typing.ts, " +
    "Doors/livechat/handlers/chat-socket-handlers.ts), which receives it " +
    "through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "chat:keystroke-clear": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "server/chat-socket-handlers.ts:476, handlers/door.handler.ts:278. Its " +
    "consumer is the LiveChat door's SERVER half " +
    "(Doors/livechat/handlers/chat-socket-handlers.ts), which receives it " +
    "through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "chat:keystroke-submit": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "server/chat-socket-handlers.ts:460, handlers/door.handler.ts:262. Its " +
    "consumer is the LiveChat door's SERVER half " +
    "(Doors/livechat/handlers/chat-socket-handlers.ts), which receives it " +
    "through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "chat:kicked": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "server/moderation-socket-handlers.ts:26. Its consumer is the LiveChat " +
    "door's SERVER half (Doors/livechat/server.ts), which receives it through " +
    "createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "chat:message": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "server/moderation-socket-handlers.ts:31, " +
    "server/moderation-socket-handlers.ts:36, " +
    "server/moderation-socket-handlers.ts:65. Its consumer is the LiveChat " +
    "door's SERVER half (Doors/livechat/core/socket-msg.ts, " +
    "Doors/livechat/handlers/chat-socket-handlers.ts), which receives it " +
    "through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "chat:message-received": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/internode-chat.handler.ts:672. Measured 2026-09-03: no " +
    "listener in packages/terminal/src, web/frontend/src, web/config-app/src, " +
    "Doors/ or sdk/. No frontend listens for it (the plan's draft named " +
    "RealtimeProvider.tsx and web/frontend/src/chat; measured, they do not). A " +
    "byte terminal cannot render a structured object; the BBS-side chat a " +
    "telnet caller CAN reach travels as ansi-output and is TP-10's work, not " +
    "this table's.",
  },
  "chat:muted": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "server/moderation-socket-handlers.ts:108. Its consumer is the LiveChat " +
    "door's SERVER half (Doors/livechat/server.ts), which receives it through " +
    "createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "chat:partner-disconnected": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/internode-chat.handler.ts:869. Measured 2026-09-03: no " +
    "listener in packages/terminal/src, web/frontend/src, web/config-app/src, " +
    "Doors/ or sdk/. No frontend listens for it (the plan's draft named " +
    "RealtimeProvider.tsx and web/frontend/src/chat; measured, they do not). A " +
    "byte terminal cannot render a structured object; the BBS-side chat a " +
    "telnet caller CAN reach travels as ansi-output and is TP-10's work, not " +
    "this table's.",
  },
  "chat:pin:list": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "server/pin-socket-handlers.ts:66. Its consumer is the LiveChat door's " +
    "SERVER half (Doors/livechat/handlers/pin-handlers.ts), which receives it " +
    "through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "chat:pin:updated": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "server/pin-socket-handlers.ts:34, server/pin-socket-handlers.ts:35, " +
    "server/pin-socket-handlers.ts:53. Its consumer is the LiveChat door's " +
    "SERVER half (Doors/livechat/handlers/pin-handlers.ts), which receives it " +
    "through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "chat:request-sent": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/internode-chat.handler.ts:175. Measured 2026-09-03: no " +
    "listener in packages/terminal/src, web/frontend/src, web/config-app/src, " +
    "Doors/ or sdk/. No frontend listens for it (the plan's draft named " +
    "RealtimeProvider.tsx and web/frontend/src/chat; measured, they do not). A " +
    "byte terminal cannot render a structured object; the BBS-side chat a " +
    "telnet caller CAN reach travels as ansi-output and is TP-10's work, not " +
    "this table's.",
  },
  "chat:search:results": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "server/search-socket-handlers.ts:35. Its consumer is the LiveChat door's " +
    "SERVER half (Doors/livechat/handlers/search-handlers.ts), which receives " +
    "it through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "chat:started": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/internode-chat.handler.ts:366. Measured 2026-09-03: no " +
    "listener in packages/terminal/src, web/frontend/src, web/config-app/src, " +
    "Doors/ or sdk/. No frontend listens for it (the plan's draft named " +
    "RealtimeProvider.tsx and web/frontend/src/chat; measured, they do not). A " +
    "byte terminal cannot render a structured object; the BBS-side chat a " +
    "telnet caller CAN reach travels as ansi-output and is TP-10's work, not " +
    "this table's.",
  },
  "chat:thread:created": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "server/thread-socket-handlers.ts:29. Its consumer is the LiveChat door's " +
    "SERVER half (Doors/livechat/handlers/thread-handlers.ts), which receives " +
    "it through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "chat:thread:messages": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "server/thread-socket-handlers.ts:88. Its consumer is the LiveChat door's " +
    "SERVER half (Doors/livechat/handlers/thread-handlers.ts), which receives " +
    "it through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "chat:thread:reply": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "server/thread-socket-handlers.ts:61, server/thread-socket-handlers.ts:66. " +
    "Its consumer is the LiveChat door's SERVER half " +
    "(Doors/livechat/handlers/thread-handlers.ts), which receives it through " +
    "createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "chat:timeout": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/internode-chat.handler.ts:221. Measured 2026-09-03: no " +
    "listener in packages/terminal/src, web/frontend/src, web/config-app/src, " +
    "Doors/ or sdk/. No frontend listens for it (the plan's draft named " +
    "RealtimeProvider.tsx and web/frontend/src/chat; measured, they do not). A " +
    "byte terminal cannot render a structured object; the BBS-side chat a " +
    "telnet caller CAN reach travels as ansi-output and is TP-10's work, not " +
    "this table's.",
  },
  "close": {
    kind: "not-transport",
    owner: "TelnetConnection / SSHConnection / WSTerminalConnection",
    note:
    "The connection's own close event (server/telnet-server.ts:547, " +
    "server/ssh-server.ts:180, server/ws-terminal-server.ts:59). The emitter " +
    "forwards `close` to the connection rather than rendering it " +
    "(server/connection-emitter.ts:157).",
  },
  "command": {
    kind: "not-transport",
    owner: "the emitter's synthetic bus / socket.io inbound channel",
    note:
    "INBOUND: on web socket.io delivers it from the browser; on telnet the " +
    "entry point raises it with emitInternal (server/transport-session.ts), " +
    "which goes to the emitter's EventEmitter and never to this chain. The only " +
    "only literal `command` emit in web/backend/src is the corpus test harness " +
    "(scripts/corpus-integration-runner.ts:358).",
  },
  "complete": {
    kind: "not-transport",
    owner: "XmodemTransferService / YmodemTransferService / PunterTransferService / TransferProtocolService",
    note:
    "A transfer service's own EventEmitter " +
    "(services/xmodem-transfer.service.ts:572 and siblings). Not a socket.",
  },
  "connection": {
    kind: "not-transport",
    owner: "TelnetServer / SSHServer / WSTerminalServer",
    note:
    "The server's own EventEmitter announcing a new connection " +
    "(server/telnet-server.ts:718, server/ssh-server.ts:336, " +
    "server/ws-terminal-server.ts:131). Never a session socket.",
  },
  "cursor-style": {
    kind: "web-only",
    note:
    "THE MOUSE POINTER, NOT THE TEXT CURSOR - re-ruled by TP-4 after reading " +
    "both ends. TP-3 ruled this `render` and said a byte terminal would get the " +
    "DECSCUSR escape; the plan says the same. Measured 2026-09-03: " +
    "doors/BBSApi.ts:532-538 documents the argument as the CSS cursor property " +
    "('default', 'pointer', 'grab', 'crosshair', 'not-allowed', ...), the SDK " +
    "raises it for mouse HOVER feedback " +
    "(sdk/engines/ui/blessed/core/screen.ts:2392, " +
    "sdk/utils/blessed-helpers.ts:1050-1052) and the browser consumer sets " +
    "terminalRef.current.style.cursor " +
    "(packages/terminal/src/components/BBSTerminal.tsx:2289-2292). DECSCUSR is " +
    "the TEXT cursor's shape and has no mapping from a CSS pointer name; a byte " +
    "terminal has no pointer to shape at all. So this is browser chrome, the " +
    "same class as set-font and theme-preference, and writing an escape for it " +
    "would have been a guess dressed as a translation.",
  },
  "data": {
    kind: "not-transport",
    owner: "TelnetConnection / SSHConnection / WSTerminalConnection",
    note:
    "The connection's inbound byte event (server/telnet-server.ts:351,700; " +
    "server/ssh-server.ts:110,318; server/ws-terminal-server.ts:55). Inbound, " +
    "and on the connection, not the emitter.",
  },
  "disconnect": {
    kind: "not-transport",
    owner: "TelnetServer / SSHServer",
    note:
    "The server's per-connection disconnect notice " +
    "(server/telnet-server.ts:710, server/ssh-server.ts:328). NOT the emitter's " +
    "`disconnect()` method, which closes the connection " +
    "(server/connection-emitter.ts:175).",
  },
  "door-active": {
    kind: "translate",
    note:
    "A door owns the terminal. Emitted at handlers/door.handler.ts:881, " +
    "handlers/door.handler.ts:936, handlers/door.handler.ts:2255; the browser " +
    "consumer bypasses client pacing " +
    "(packages/terminal/src/components/BBSTerminal.tsx, " +
    "web/frontend/src/chat/ChatTerminal.tsx). TP-4 records it on the " +
    "connection (transportState.doorActive) and deliberately does NOT touch " +
    "the server ModemEmulator: what the browser bypasses is its own CLIENT " +
    "pacer, and a byte transport's only pacer is the SERVER one that web keeps " +
    "running during a door for 68K fidelity. See translateDoorActive in " +
    "server/transport-adapter.ts for the measurement.",
  },
  "door-message": {
    kind: "web-only",
    note:
    "Card Lobby's sound cue to its browser bundle: `emitSound` at " +
    "Doors/card-lobby/server.ts:28, whose doc comment reads \"Emit a sound event " +
    "to the client\". Note it is NOT the `door:message:<id>` family the pattern " +
    "arm rules - a different, unprefixed name. No listener in this repo's " +
    "frontends (measured 2026-09-03); a byte terminal has no audio path " +
    "regardless.",
  },
  "door:await-key": {
    kind: "dead",
    note:
    "Parks the 68K emulator waiting for a `door:keypress` that nothing in this " +
    "repo ever sends (amiga-emulation/session/DoorMessageHandler.ts). It hangs " +
    "on EVERY transport, so it is not a telnet/SSH divergence and the plan's " +
    "non-goals leave it unfixed; it is filed as its own defect. Ruled here so " +
    "it cannot masquerade as a transport gap. Emitted at " +
    "amiga-emulation/session/DoorMessageHandler.ts:2813.",
  },
  "door:close": {
    kind: "web-only",
    note:
    "RIP Browser's close signal to its browser half " +
    "(Doors/rip-browser/index.ts:24, the `close` callback handed to `execute`). " +
    "No listener in packages/terminal/src, web/frontend/src or " +
    "web/config-app/src as measured 2026-09-03; the door is a browser door " +
    "either way, and TP-6's gate refuses it on a byte transport before this " +
    "name can be reached.",
  },
  "door:error": {
    kind: "dead",
    note:
    "Door failure notice. Emitted from six modules in amiga-emulation/; " +
    "measured 2026-09-03: no listener in packages/terminal/src, " +
    "web/frontend/src, web/config-app/src, Doors/ or sdk/. Dead on every " +
    "transport. Emitted at amiga-emulation/doorHandler.ts:41, " +
    "amiga-emulation/doorHandler.ts:56, amiga-emulation/doorHandler.ts:100.",
  },
  "door:exit": {
    kind: "dead",
    note:
    "Door teardown notice. No listener anywhere - the real exit path is the " +
    "door handler's own return, not this event. Emitted at " +
    "amiga-emulation/AREXXDoorSession.ts:147, " +
    "amiga-emulation/AREXXDoorSession.ts:154, " +
    "amiga-emulation/PythonDoorSession.ts:154.",
  },
  "door:input": {
    kind: "dead",
    note:
    "Emitted from amiga-emulation; its only `.on` sites are inside " +
    "web/backend/src itself (the 68K session's own bus), never a frontend. Dead " +
    "as a session-socket event. Emitted at server/socket-handlers.ts:784, " +
    "server/transport-session.ts:261, scripts/run-amiga-door.ts:163.",
  },
  "door:input-mode": {
    kind: "translate",
    note:
    "A door's input mode. Emitted at doors/BBSApi.ts:524; browser consumer " +
    "packages/terminal/src/components/BBSTerminal.tsx. TP-4 records it on the " +
    "connection (transportState.inputMode), the same field set-input-mode " +
    "writes - one question, one answer. TP-8's input pipeline reads it.",
  },
  "door:load-client": {
    kind: "web-only",
    note:
    "A client door's bundle URL, fetched and run by the browser. Emitted at " +
    "handlers/door.handler.ts:4452; consumers " +
    "packages/terminal/src/components/BBSTerminal.tsx, " +
    "web/frontend/src/chat/ChatTerminal.tsx. On a byte transport this " +
    "evaporating is the FREEZE that TP-1 case 3 names: executeClientDoor " +
    "installs a no-op input handler and a 30 s ping loop. TP-6 refuses the door " +
    "before it gets here, so after TP-6 a drop of this name means the gate was " +
    "bypassed.",
  },
  "door:output": {
    kind: "dead",
    note:
    "Door output notice. No listener on any transport; door output reaches a " +
    "caller as ansi-output. Emitted at amiga-emulation/AREXXDoorSession.ts:142, " +
    "amiga-emulation/PythonDoorSession.ts:139, " +
    "amiga-emulation/PythonDoorSession.ts:147.",
  },
  "door:password-mode": {
    kind: "dead",
    note:
    "No listener in packages/terminal/src, web/frontend/src, " +
    "web/config-app/src, Doors/ or sdk/ - measured 2026-09-03. The live masking " +
    "path is `password-mode` / `mask-input`, which ARE translated (TP-4). NOTE: " +
    "the plan's TP-4 table lists this name among the fold-into-maskEcho group; " +
    "TP-3's own class table rules it dead, and the measurement agrees with TP-3 " +
    "- there is nothing to fold, because nothing emits it to a consumer. " +
    "Emitted at amiga-emulation/session/DoorMessageHandler.ts:2634.",
  },
  "door:ready": {
    kind: "dead",
    note:
    "Door-ready notice. No listener on any transport. Emitted at " +
    "amiga-emulation/PythonDoorSession.ts:173.",
  },
  "door:status": {
    kind: "dead",
    note:
    "Door status notice, emitted repeatedly while a door runs. No listener on " +
    "any transport - and the reason the drop log is " +
    "once-per-name-per-connection rather than per occurrence. Emitted at " +
    "handlers/door.handler.ts:2254, handlers/door.handler.ts:2275, " +
    "handlers/door.handler.ts:2292.",
  },
  "download-file": {
    kind: "web-only",
    note:
    "The browser's HTTP download trigger. Emitted at " +
    "handlers/file/download.handler.ts:563, " +
    "handlers/transfer/batch-download.handler.ts:214; consumer " +
    "packages/terminal/src/components/BBSTerminal.tsx. A byte transport gets " +
    "ZMODEM or a refusal instead - handlers/file/download.handler.ts:515-531 " +
    "already branches, and TP-11 makes the batch path do the same, after which " +
    "no reachable path emits this name to a byte transport at all.",
  },
  "error": {
    kind: "not-transport",
    owner: "TelnetConnection / SSHConnection / WSTerminalConnection",
    note:
    "The connection's error event (server/telnet-server.ts:539,829; " +
    "server/ssh-server.ts:172,344; server/ws-terminal-server.ts:63). The one " +
    "session-socket emit of this name is the example handler at " +
    "handlers/examples/modern-handler.example.ts:50, which is documentation and " +
    "is not wired into any route.",
  },
  "example-data": {
    kind: "not-transport",
    owner: "the documentation handler",
    note:
    "handlers/examples/modern-handler.example.ts:81. An example file wired into " +
    "no route.",
  },
  "example-result": {
    kind: "not-transport",
    owner: "the documentation handler",
    note:
    "handlers/examples/modern-handler.example.ts:59. An example file wired into " +
    "no route.",
  },
  "font-changed": {
    kind: "web-only",
    note:
    "Browser chrome. Emitted at server/preference-socket-handlers.ts:120, " +
    "handlers/commands/user-commands.handler.ts:1136. Measured 2026-09-03: no " +
    "frontend listener at all, so it is unconsumed on web too; it stays " +
    "web-only rather than dead because it is a browser-chrome name and TP-15 " +
    "owns any deletion.",
  },
  "font-preference": {
    kind: "web-only",
    note:
    "Browser chrome. Emitted at server/preference-socket-handlers.ts:24, " +
    "server/preference-socket-handlers.ts:30; consumer " +
    "packages/terminal/src/components/BBSTerminal.tsx. Same reason as set-font.",
  },
  "force-disconnect": {
    kind: "translate",
    note:
    "Emitted at handlers/commands/system-commands.handler.ts:216; browser " +
    "consumer packages/terminal/src/components/BBSTerminal.tsx. TP-4 flushes " +
    "the output buffer (utils/output.util.ts flushOutput - emitText batches for " +
    "16ms, so the sign-off line would still be in it) and then calls " +
    "connection.close().",
  },
  "forced-pwd-change-complete": {
    kind: "web-only",
    note:
    "Emitted at server/auth-socket-handlers.ts:1040. The byte path simply " +
    "continues the server loop; there is no view to switch.",
  },
  "game-mode": {
    kind: "translate",
    note:
    "Emitted at doors/client-door-bridge.ts:513, handlers/door.handler.ts:4475, " +
    "services/game-mode.service.ts:28; browser consumer " +
    "packages/terminal/src/components/BBSTerminal.tsx. TP-4 makes it a " +
    "documented no-op, which IS the translation: services/game-mode.service.ts " +
    "already sets session.gameModeEnabled before the emit, and a byte transport " +
    "has no key edges to turn on (TP-7 makes that the door's answer through " +
    "transportCapabilities().keyEvents). A second copy of the flag on the " +
    "connection would be a second answer to a settled question.",
  },
  "get-active-users": {
    kind: "dead",
    note:
    "An INBOUND name emitted OUTBOUND, the same shape as chat:dm-threads:list. " +
    "`server/socket-handlers.ts:204` registers `socket.on('get-active-users')` " +
    "for a browser request; Doors/telnet-front/index.ts:141 emits it on the " +
    "session socket, which sends it away from that handler on every transport. " +
    "The door then waits on `active-users`, which only that handler emits. " +
    "Nothing serves the request on web either - a door defect, not a transport " +
    "gap.",
  },
  "hangup": {
    kind: "translate",
    note:
    "BB_DROPDTR. Emitted at amiga-emulation/session/DoorMessageHandler.ts:1676; " +
    "no consumer on any transport before TP-4, which was the defect (divergence " +
    "12): a 68K door could not drop a telnet carrier. TP-4 calls " +
    "connection.close() - on a byte transport, dropping the carrier IS closing " +
    "the connection.",
  },
  "import:progress": {
    kind: "not-transport",
    owner: "BBSEventEmitter admin room",
    note:
    "services/bbs-event-emitter.ts:262 - `this.io.to('admin').emit(...)`, a " +
    "socket.io ROOM broadcast to the config app, not a session socket.",
  },
  "login-failed": {
    kind: "web-only",
    note:
    "Emitted at server/auth-socket-handlers.ts:288, " +
    "server/auth-socket-handlers.ts:326, server/auth-socket-handlers.ts:493. " +
    "The byte path prints its own failure line as ansi-output.",
  },
  "login-success": {
    kind: "web-only",
    note:
    "Emitted at server/auth-socket-handlers.ts:561, " +
    "server/auth-socket-handlers.ts:595, " +
    "handlers/user/new-user.handler.ts:1512. It is what tells the React shell " +
    "to leave the login view and what seeds the session font; a byte terminal " +
    "has neither view nor font preference.",
  },
  "mask-input": {
    kind: "translate",
    note:
    "Emitted at server/auth-socket-handlers.ts:814, " +
    "server/auth-socket-handlers.ts:848, server/auth-socket-handlers.ts:887 (17 " +
    "sites); browser consumer packages/terminal/src/components/BBSTerminal.tsx. " +
    "TP-4 sets session.maskInput - the field index.ts already declares and " +
    "handlers/command.handler.ts:2299, :2333 and :2422 already read " +
    "(the server-side echo, emitText(socket, session.maskInput ? asterisk : " +
    "data)). NOT the plan's new session.maskEcho: that would be a second body " +
    "of a fact three live readers already consult. The system-password gate " +
    "(command.handler.ts:1667-1671) keeps its own local masking and is " +
    "TP-8/TP-9a's to fold in; this ruling gives the seventeen emit-only sites " +
    "their effect.",
  },
  "modem-speed": {
    kind: "translate",
    note:
    "Emitted at server/auth-socket-handlers.ts:217, doors/BBSApi.ts:554, " +
    "doors/client-door-bridge.ts:526 (11 sites); browser consumer " +
    "packages/terminal/src/components/BBSTerminal.tsx. TP-4 calls " +
    "getModemEmulator(emitter).install() + .enable(bps) / .disable() - the server " +
    "emulator, the only pacer a byte caller has (telnet has no client pacer). " +
    "install() is what makes enable() reach the wire at all; without it the " +
    "call lands on a throwaway object and the caller keeps running at full " +
    "speed. Before TP-4 a door that zeroed the speed stayed throttled on telnet.",
  },
  "network-pong": {
    kind: "not-transport",
    owner: "socket.io Socket (registerSocketHandlers)",
    note:
    "handlers/network-monitor.handler.ts:18, reached only from the web socket " +
    "handler table. Cannot be emitted on a connection emitter.",
  },
  "olm-quiet-status": {
    kind: "not-transport",
    owner: "io broadcast",
    note:
    "handlers/transfer/olm.handler.ts:397 - `io.emit(...)`, a broadcast to " +
    "every socket.io client, not a session socket.",
  },
  "operator:chat-accepted": {
    kind: "web-only",
    note:
    "Operator-chat control channel, emitted at " +
    "handlers/operator-chat.handler.ts:662. Measured 2026-09-03: no frontend " +
    "listener. A byte terminal cannot render the structured payload; the " +
    "operator page a telnet caller must actually SEE is an ansi-output push and " +
    "is TP-10's work.",
  },
  "operator:chat-ended": {
    kind: "web-only",
    note:
    "Operator-chat control channel, emitted at " +
    "handlers/operator-chat.handler.ts:836. Browser consumer: " +
    "web/config-app/src/realtime/RealtimeProvider.tsx, " +
    "web/config-app/src/pages/OperatorChatPage.tsx. A byte terminal cannot " +
    "render the structured payload; the operator page a telnet caller must " +
    "actually SEE is an ansi-output push and is TP-10's work.",
  },
  "operator:chat-started": {
    kind: "web-only",
    note:
    "Operator-chat control channel, emitted at " +
    "handlers/operator-chat.handler.ts:681. Measured 2026-09-03: no frontend " +
    "listener. A byte terminal cannot render the structured payload; the " +
    "operator page a telnet caller must actually SEE is an ansi-output push and " +
    "is TP-10's work.",
  },
  "operator:error": {
    kind: "web-only",
    note:
    "Operator-chat control channel, emitted at " +
    "handlers/operator-chat.handler.ts:103, " +
    "handlers/operator-chat.handler.ts:115, " +
    "handlers/operator-chat.handler.ts:134. Browser consumer: " +
    "web/config-app/src/pages/OperatorChatPage.tsx. A byte terminal cannot " +
    "render the structured payload; the operator page a telnet caller must " +
    "actually SEE is an ansi-output push and is TP-10's work.",
  },
  "operator:message": {
    kind: "web-only",
    note:
    "Operator-chat control channel, emitted at " +
    "handlers/operator-chat.handler.ts:765. Browser consumer: " +
    "web/config-app/src/pages/OperatorChatPage.tsx. A byte terminal cannot " +
    "render the structured payload; the operator page a telnet caller must " +
    "actually SEE is an ansi-output push and is TP-10's work.",
  },
  "operator:message-history": {
    kind: "web-only",
    note:
    "Operator-chat control channel, emitted at " +
    "handlers/operator-chat.handler.ts:643. Browser consumer: " +
    "web/config-app/src/pages/OperatorChatPage.tsx. A byte terminal cannot " +
    "render the structured payload; the operator page a telnet caller must " +
    "actually SEE is an ansi-output push and is TP-10's work.",
  },
  "operator:page": {
    kind: "web-only",
    note:
    "Operator-chat control channel, emitted at " +
    "handlers/operator-chat.handler.ts:480. Browser consumer: " +
    "web/config-app/src/realtime/RealtimeProvider.tsx, " +
    "web/config-app/src/pages/OperatorChatPage.tsx. A byte terminal cannot " +
    "render the structured payload; the operator page a telnet caller must " +
    "actually SEE is an ansi-output push and is TP-10's work.",
  },
  "operator:page-accepted": {
    kind: "web-only",
    note:
    "Operator-chat control channel, emitted at " +
    "handlers/operator-chat.handler.ts:691. Browser consumer: " +
    "web/config-app/src/realtime/RealtimeProvider.tsx. A byte terminal cannot " +
    "render the structured payload; the operator page a telnet caller must " +
    "actually SEE is an ansi-output push and is TP-10's work.",
  },
  "operator:pending-pages": {
    kind: "web-only",
    note:
    "Operator-chat control channel, emitted at " +
    "handlers/operator-chat.handler.ts:129. Browser consumer: " +
    "web/config-app/src/realtime/RealtimeProvider.tsx, " +
    "web/config-app/src/pages/OperatorChatPage.tsx. A byte terminal cannot " +
    "render the structured payload; the operator page a telnet caller must " +
    "actually SEE is an ansi-output push and is TP-10's work.",
  },
  "operator:status-updated": {
    kind: "web-only",
    note:
    "Operator-chat control channel, emitted at " +
    "handlers/operator-chat.handler.ts:108. Measured 2026-09-03: no frontend " +
    "listener. A byte terminal cannot render the structured payload; the " +
    "operator page a telnet caller must actually SEE is an ansi-output push and " +
    "is TP-10's work.",
  },
  "operator:typing-status": {
    kind: "web-only",
    note:
    "Operator-chat control channel, emitted at " +
    "handlers/operator-chat.handler.ts:163, " +
    "handlers/operator-chat.handler.ts:1178. Browser consumer: " +
    "web/config-app/src/pages/OperatorChatPage.tsx. A byte terminal cannot " +
    "render the structured payload; the operator page a telnet caller must " +
    "actually SEE is an ansi-output push and is TP-10's work.",
  },
  "operator:user-typing": {
    kind: "web-only",
    note:
    "Operator-chat control channel, emitted at " +
    "handlers/operator-chat.handler.ts:1169. Browser consumer: " +
    "web/config-app/src/pages/OperatorChatPage.tsx. A byte terminal cannot " +
    "render the structured payload; the operator page a telnet caller must " +
    "actually SEE is an ansi-output push and is TP-10's work.",
  },
  "password-mode": {
    kind: "translate",
    note:
    "Emitted at handlers/user/gdpr.handler.ts:62, " +
    "handlers/user/new-user.handler.ts:663; browser consumer " +
    "packages/terminal/src/components/BBSTerminal.tsx. TP-4 folds it into " +
    "session.maskInput, the same field mask-input writes and the same one both " +
    "of those emit sites already set beside their emit.",
  },
  "petscii-bytes": {
    kind: "render",
    note:
    "Raw .seq bytes, base64. Rendered by the emitter's third branch " +
    "(server/connection-emitter.ts:125-139) - forwarded untouched to a PETSCII " +
    "caller, converted to PetMe64 otherwise.",
  },
  "petscii-output": {
    kind: "render",
    note:
    "Legacy PUA PETSCII text. Rendered by the emitter's second branch " +
    "(server/connection-emitter.ts:117-124): transduced for a C64 caller, " +
    "written straight through otherwise.",
  },
  "pong-test": {
    kind: "not-transport",
    owner: "socket.io Socket (registerSocketHandlers)",
    note:
    "server/socket-handlers.ts:368. registerSocketHandlers is called for web " +
    "sockets only; the telnet/SSH entry point never calls it, so this name can " +
    "never be emitted on a connection emitter.",
  },
  "progress": {
    kind: "not-transport",
    owner: "ImportTransactionService",
    note:
    "The import service's own EventEmitter " +
    "(services/import-transaction.service.ts:823). Not a socket.",
  },
  "prompt-forced-pwd-change": {
    kind: "web-only",
    note:
    "Emitted at services/login-post.service.ts:425. Telnet/SSH gets " +
    "services/login-prompt.service.ts's line-buffered forced-change flow.",
  },
  "prompt-login": {
    kind: "web-only",
    note:
    "The browser's cue to show its login form. Emitted at " +
    "handlers/command.handler.ts:1083, handlers/command.handler.ts:1580, " +
    "handlers/command.handler.ts:1634 (seven server-side sites). KEPT, not " +
    "deleted: TP-9b re-points its browser handler instead of removing the " +
    "event. A byte transport needs no cue - the server loop's own `Username: ` " +
    "prompt travels as ansi-output.",
  },
  "prompt-password": {
    kind: "web-only",
    note:
    "Emitted at server/auth-socket-handlers.ts:414, " +
    "server/auth-socket-handlers.ts:495, server/auth-socket-handlers.ts:687. " +
    "The byte-transport equivalent is the server loop's own `Password: ` prompt " +
    "(handlers/command.handler.ts), already on the wire as ansi-output.",
  },
  "prompt-password-reset": {
    kind: "web-only",
    note:
    "Emitted at server/auth-socket-handlers.ts:455. Telnet/SSH gets the " +
    "line-buffered equivalent in services/login-prompt.service.ts.",
  },
  "ready": {
    kind: "not-transport",
    owner: "SSHConnection",
    note:
    "The SSH shell-accepted event (server/ssh-server.ts:120). A transport-level " +
    "event the emitter forwards to the connection " +
    "(server/connection-emitter.ts:157).",
  },
  "retry-login": {
    kind: "web-only",
    note:
    "Emitted at server/auth-socket-handlers.ts:667, " +
    "server/auth-socket-handlers.ts:701, server/auth-socket-handlers.ts:747. " +
    "The server loop re-prompts by writing the prompt again.",
  },
  "rip-mode": {
    kind: "web-only",
    note:
    "RIP Browser tells the caller's terminal to enter RIPscrip mode " +
    "(Doors/rip-browser/app.ts:300); the consumer is " +
    "packages/terminal/src/components/BBSTerminal.tsx:2329, which drives " +
    "RIPtermJS. There is no server-side rasteriser, which is exactly what " +
    "transportCapabilities().rip records and what TP-6's `R` answer refuses.",
  },
  "room:created": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/group-chat.handler.ts:285. Its consumer is the LiveChat " +
    "door's SERVER half (Doors/livechat/handlers/room-socket-handlers.ts), " +
    "which receives it through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "room:error": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/door.handler.ts:195, handlers/door.handler.ts:233, " +
    "handlers/chat/mode.handler.ts:45. Its consumer is the LiveChat door's " +
    "SERVER half (Doors/livechat/handlers/room-socket-handlers.ts), which " +
    "receives it through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "room:invite-received": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/room-invite.handler.ts:58. Its consumer is the LiveChat " +
    "door's SERVER half (Doors/livechat/handlers/chat-socket-handlers.ts), " +
    "which receives it through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "room:invite-revoked": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/room-invite.handler.ts:48. Its consumer is the LiveChat " +
    "door's SERVER half (Doors/livechat/handlers/chat-socket-handlers.ts), " +
    "which receives it through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "room:invited": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/room-invite.handler.ts:53. Its consumer is the LiveChat " +
    "door's SERVER half (Doors/livechat/handlers/chat-socket-handlers.ts), " +
    "which receives it through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "room:join": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/door.handler.ts:93, handlers/door.handler.ts:2341. Measured " +
    "2026-09-03: no listener in packages/terminal/src, web/frontend/src, " +
    "web/config-app/src, Doors/ or sdk/. No frontend listens for it (the plan's " +
    "draft named RealtimeProvider.tsx and web/frontend/src/chat; measured, they " +
    "do not). A byte terminal cannot render a structured object; the BBS-side " +
    "chat a telnet caller CAN reach travels as ansi-output and is TP-10's work, " +
    "not this table's.",
  },
  "room:joined": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/group-chat.handler.ts:361, " +
    "handlers/chat/group-chat.handler.ts:517. Its consumer is the LiveChat " +
    "door's SERVER half (Doors/livechat/server.ts, " +
    "Doors/livechat/handlers/room-socket-handlers.ts), which receives it " +
    "through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "room:kicked": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/group-chat.handler.ts:774. Its consumer is the LiveChat " +
    "door's SERVER half (Doors/livechat/handlers/room-socket-handlers.ts), " +
    "which receives it through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "room:leave": {
    kind: "not-transport",
    owner: "createDoorSocketWrapper (handlers/door.handler.ts:190)",
    note:
    "An INBOUND chat-room request a door makes, and one of the fourteen names " +
    "the door socket wrapper INTERCEPTS: `wrappedSocket.emit` calls the " +
    "server-side handler directly and returns, so the name never reaches the " +
    "connection emitter on any transport. That interception is why `room:join` " +
    "/ `room:leave` / `room:list` work for a door and `chat:dm-threads:list` " +
    "and `get-active-users`, which are not on the list, do not.",
  },
  "room:left": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/group-chat.handler.ts:581. Its consumer is the LiveChat " +
    "door's SERVER half (Doors/livechat/handlers/room-socket-handlers.ts), " +
    "which receives it through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "room:list": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/door.handler.ts:230, handlers/chat/group-chat.handler.ts:663. Its " +
    "consumer is the LiveChat door's SERVER half " +
    "(Doors/livechat/handlers/room-socket-handlers.ts), which receives it " +
    "through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "room:mode": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/mode.handler.ts:115. Its consumer is the LiveChat door's " +
    "SERVER half (Doors/livechat/handlers/chat-socket-handlers.ts), which " +
    "receives it through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "room:motd": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/room-motd.handler.ts:32. Its consumer is the LiveChat door's " +
    "SERVER half (Doors/livechat/handlers/chat-socket-handlers.ts), which " +
    "receives it through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "room:user-joined": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/group-chat.handler.ts:494. Its consumer is the LiveChat " +
    "door's SERVER half (Doors/livechat/handlers/room-socket-handlers.ts), " +
    "which receives it through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "room:user-left": {
    kind: "web-only",
    note:
    "LiveChat's structured chat surface, emitted at " +
    "handlers/chat/group-chat.handler.ts:555, " +
    "handlers/chat/group-chat.handler.ts:887. Its consumer is the LiveChat " +
    "door's SERVER half (Doors/livechat/handlers/room-socket-handlers.ts), " +
    "which receives it through createDoorSocketWrapper's outgoing dispatch " +
    "(handlers/door.handler.ts:130-170) BEFORE this chain runs - so the drop " +
    "recorded here is of the structured payload only, never of the door's copy. " +
    "No frontend listens for it (the plan's draft named RealtimeProvider.tsx " +
    "and web/frontend/src/chat; measured, they do not). A byte terminal cannot " +
    "render a structured object; the BBS-side chat a telnet caller CAN reach " +
    "travels as ansi-output and is TP-10's work, not this table's.",
  },
  "session-restore-failed": {
    kind: "web-only",
    note:
    "Emitted at server/auth-socket-handlers.ts:103, " +
    "server/auth-socket-handlers.ts:110, server/auth-socket-handlers.ts:118. " +
    "Same reason as session-restored.",
  },
  "session-restored": {
    kind: "web-only",
    note:
    "Emitted at server/auth-socket-handlers.ts:226. Session restore is a " +
    "browser reconnect concept: `restore-session` is registered only inside " +
    "registerSocketHandlers, which the telnet/SSH entry point never calls.",
  },
  "set-font": {
    kind: "web-only",
    note:
    "Browser chrome. Emitted at " +
    "handlers/commands/info-commands.handler.ts:1384; consumer " +
    "packages/terminal/src/components/BBSTerminal.tsx. A byte terminal's font " +
    "is the caller's own business - the board cannot and must not set it.",
  },
  "set-input-mode": {
    kind: "translate",
    note:
    "Emitted at server/file-socket-handlers.ts:285, " +
    "services/rename-prompt.service.ts:99. Measured 2026-09-03: NO listener in " +
    "packages/terminal/src, web/frontend/src, web/config-app/src, Doors/ or " +
    "sdk/ - so unlike the rest of this group it has no live web consumer " +
    "either. It is still `translate` and not `dead`, because TP-4 gives it a " +
    "server-side meaning (transportState.inputMode on the connection, shared " +
    "with door:input-mode) that it has never had on any transport.",
  },
  "show-file-upload": {
    kind: "web-only",
    note:
    "The browser's file-picker trigger. Emitted at doors/BBSApi.ts:1565; " +
    "consumer packages/terminal/src/components/BBSTerminal.tsx. A byte " +
    "transport uploads through ZMODEM/rz, not a DOM dialog.",
  },
  "supervisor:command": {
    kind: "not-transport",
    owner: "socket.io room (node-control)",
    note:
    "api/node-control-routes.ts:86 - `io.to(socketId).emit(...)`, addressed by " +
    "socket.io id. A byte transport has no socket.io id, which is the gap " +
    "TP-10's registry closes for the pushes that matter; this one is a " +
    "supervisor channel the config app owns.",
  },
  "system-message": {
    kind: "render",
    note:
    "A sysop notice (the node-control kick line, api/node-control-routes.ts). " +
    "Emitted at api/node-control-routes.ts:271. No frontend in " +
    "packages/terminal/src, web/frontend/src or web/config-app/src listens for " +
    "it - measured 2026-09-03 - so on WEB it is as unconsumed as it is on " +
    "telnet, which is exactly why TP-4 renders its `text` as an ansi-output " +
    "line for every transport rather than treating it as browser chrome. The " +
    "payload's text is already wire-ready (node-control-routes.ts writes its " +
    "own CRLFs) and goes out through utils/output.util.ts's emitText.",
  },
  "system:notice": {
    kind: "render",
    note:
    "Same shape as system-message; emitted at " +
    "services/restart-notice.service.ts:82. Its one listener is a door " +
    "(Doors/livechat/handlers/system-notice.handler.ts), reached through " +
    "createDoorSocketWrapper's outgoing dispatch on every transport. TP-4 " +
    "renders the payload's `message` (services/restart-notice.service.ts:35-39 " +
    "- there is no `text` field on this one) as a line of its own, for the " +
    "caller whose door has no such handler: every 68K door, which would " +
    "otherwise be told nothing before the server restarts.",
  },
  "terminal-mode": {
    kind: "translate",
    note:
    "Emitted at doors/BBSApi.ts:483 (doors/BBSApi.ts); browser consumers " +
    "packages/terminal/src/components/BBSTerminal.tsx, " +
    "web/frontend/src/chat/ChatTerminal.tsx. TP-4 records it on the connection " +
    "(transportState.terminalMode); nothing server-side reads it yet, and a byte " +
    "terminal's width is settled by TTYPE/NAWS through " +
    "applyClientReportedGeometry, so this is a state-only record by design.",
  },
  "terminal-resize": {
    kind: "translate",
    note:
    "Emitted at handlers/command-handler/pre-login.ts:162; browser consumers " +
    "packages/terminal/src/components/BBSTerminal.tsx, " +
    "web/frontend/src/chat/ChatTerminal.tsx. TP-4 makes it a documented no-op, " +
    "which IS the translation: on a byte transport the caller's terminal is the " +
    "authority and applyClientReportedGeometry " +
    "(amiga-emulation/xim/screen-width.util.ts:60-70) already refuses to be " +
    "told otherwise for a PETSCII session. Recording the reported geometry here " +
    "would be a second copy of a number that gate already owns.",
  },
  "terminal-type": {
    kind: "not-transport",
    owner: "TelnetConnection",
    note:
    "The TTYPE report, raised on the connection " +
    "(server/telnet-server.ts:388,808) and forwarded by the emitter to the " +
    "connection (server/connection-emitter.ts:157). TP-12 makes SSH raise the " +
    "same one.",
  },
  "theme-changed": {
    kind: "web-only",
    note:
    "Browser chrome. Emitted at server/preference-socket-handlers.ts:64, " +
    "server/preference-socket-handlers.ts:101. Measured 2026-09-03: no frontend " +
    "listener. Same reasoning as font-changed.",
  },
  "theme-preference": {
    kind: "web-only",
    note:
    "Browser chrome. Emitted at server/preference-socket-handlers.ts:44, " +
    "server/preference-socket-handlers.ts:81. Measured 2026-09-03: no frontend " +
    "listener. Same reasoning as font-changed.",
  },
  "transfer-raw:cancelled": {
    kind: "web-only",
    note:
    "Browser transfer channel, emitted at server/socket-handlers.ts:968. " +
    "Browser consumer: packages/terminal/src/components/BBSTerminal.tsx. A byte " +
    "transport uses transferRawSend / ZMODEM instead " +
    "(server/transport-session.ts, moved from index.ts:1111-1131), which " +
    "deliberately bypasses this emitter.",
  },
  "transfer-raw:complete": {
    kind: "web-only",
    note:
    "Browser transfer channel, emitted at server/socket-handlers.ts:957, " +
    "amiga-emulation/xim/system-commands.ts:1527. Browser consumer: " +
    "packages/terminal/src/components/BBSTerminal.tsx. A byte transport uses " +
    "transferRawSend / ZMODEM instead (server/transport-session.ts, moved from " +
    "index.ts:1111-1131), which deliberately bypasses this emitter.",
  },
  "transfer-raw:data": {
    kind: "web-only",
    note:
    "Browser transfer channel, emitted at server/socket-handlers.ts:924, " +
    "handlers/commands/transfer-misc-commands.handler.ts:128, " +
    "handlers/commands/user-commands.handler.ts:120. Browser consumer: " +
    "packages/terminal/src/components/BBSTerminal.tsx. A byte transport uses " +
    "transferRawSend / ZMODEM instead (server/transport-session.ts, moved from " +
    "index.ts:1111-1131), which deliberately bypasses this emitter.",
  },
  "transfer-raw:echo": {
    kind: "web-only",
    note:
    "Browser transfer channel, emitted at " +
    "amiga-emulation/LibraryManager.ts:587, " +
    "amiga-emulation/LibraryManager.ts:597. No frontend listener - the " +
    "`transfer:*` half is dead scaffold. A byte transport uses transferRawSend " +
    "/ ZMODEM instead (server/transport-session.ts, moved from " +
    "index.ts:1111-1131), which deliberately bypasses this emitter.",
  },
  "transfer-raw:init": {
    kind: "web-only",
    note:
    "Browser transfer channel, emitted at " +
    "handlers/commands/transfer-misc-commands.handler.ts:349, " +
    "handlers/commands/transfer-misc-commands.handler.ts:407, " +
    "handlers/commands/user-commands.handler.ts:269. Browser consumer: " +
    "packages/terminal/src/components/BBSTerminal.tsx. A byte transport uses " +
    "transferRawSend / ZMODEM instead (server/transport-session.ts, moved from " +
    "index.ts:1111-1131), which deliberately bypasses this emitter.",
  },
  "transfer:cancelled": {
    kind: "web-only",
    note:
    "Browser transfer channel, emitted at server/socket-handlers.ts:912. No " +
    "frontend listener - the `transfer:*` half is dead scaffold. A byte " +
    "transport uses transferRawSend / ZMODEM instead " +
    "(server/transport-session.ts, moved from index.ts:1111-1131), which " +
    "deliberately bypasses this emitter.",
  },
  "transfer:complete": {
    kind: "web-only",
    note:
    "Browser transfer channel, emitted at server/socket-handlers.ts:903. No " +
    "frontend listener - the `transfer:*` half is dead scaffold. A byte " +
    "transport uses transferRawSend / ZMODEM instead " +
    "(server/transport-session.ts, moved from index.ts:1111-1131), which " +
    "deliberately bypasses this emitter.",
  },
  "transfer:data": {
    kind: "web-only",
    note:
    "Browser transfer channel, emitted at server/socket-handlers.ts:869. No " +
    "frontend listener - the `transfer:*` half is dead scaffold. A byte " +
    "transport uses transferRawSend / ZMODEM instead " +
    "(server/transport-session.ts, moved from index.ts:1111-1131), which " +
    "deliberately bypasses this emitter.",
  },
  "transfer:end": {
    kind: "web-only",
    note:
    "Browser transfer channel, emitted at server/socket-handlers.ts:871. No " +
    "frontend listener - the `transfer:*` half is dead scaffold. A byte " +
    "transport uses transferRawSend / ZMODEM instead " +
    "(server/transport-session.ts, moved from index.ts:1111-1131), which " +
    "deliberately bypasses this emitter.",
  },
  "transfer:error": {
    kind: "web-only",
    note:
    "Browser transfer channel, emitted at server/socket-handlers.ts:851, " +
    "server/socket-handlers.ts:875, server/socket-handlers.ts:880. No frontend " +
    "listener - the `transfer:*` half is dead scaffold. A byte transport uses " +
    "transferRawSend / ZMODEM instead (server/transport-session.ts, moved from " +
    "index.ts:1111-1131), which deliberately bypasses this emitter.",
  },
  "unoEventBroadcast": {
    kind: "web-only",
    note:
    "Card Lobby's table-event fan-out to the browser bundle " +
    "(Doors/card-lobby/server.ts:78, \"Emit event via socket to all connected " +
    "clients\"). No listener in this repo's frontends as measured 2026-09-03; a " +
    "byte terminal has no bundle to receive it.",
  },
  "user-not-found": {
    kind: "web-only",
    note:
    "Emitted at server/auth-socket-handlers.ts:374, " +
    "server/auth-socket-handlers.ts:680. The byte path prints its own line and, " +
    "after TP-9a, offers registration - which today has exactly one, web-only, " +
    "caller.",
  },
  "video:cells": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/audio-video.handler.ts:1094, " +
    "handlers/audio-video.handler.ts:1111. Door-side listener: " +
    "Doors/livechat/features/voice-channel-ux.ts, sdk/client/index.ts. A byte " +
    "terminal has no media stack at all, so there is nothing to translate this " +
    "into.",
  },
  "video:frame": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/audio-video.handler.ts:1073, " +
    "handlers/audio-video.handler.ts:1129. Door-side listener: " +
    "Doors/livechat/features/voice-channel-ux.ts, sdk/client/index.ts. A byte " +
    "terminal has no media stack at all, so there is nothing to translate this " +
    "into.",
  },
  "video:start-stream": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/door.handler.ts:337, handlers/audio-video.handler.ts:178. Browser " +
    "consumer: packages/terminal/src/components/BBSTerminal.tsx. Door-side " +
    "listener: Doors/livechat/client.ts, sdk/client/index.ts. A byte terminal " +
    "has no media stack at all, so there is nothing to translate this into.",
  },
  "video:stop-stream": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/door.handler.ts:361. Browser consumer: " +
    "packages/terminal/src/components/BBSTerminal.tsx. Door-side listener: " +
    "Doors/livechat/client.ts, sdk/client/index.ts. A byte terminal has no " +
    "media stack at all, so there is nothing to translate this into.",
  },
  "video:stream-started": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/door.handler.ts:342, handlers/audio-video.handler.ts:183. A byte " +
    "terminal has no media stack at all, so there is nothing to translate this " +
    "into.",
  },
  "video:stream-stopped": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/door.handler.ts:366, handlers/audio-video.handler.ts:204. A byte " +
    "terminal has no media stack at all, so there is nothing to translate this " +
    "into.",
  },
  "voice:joined": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/voice-channel.handler.ts:140, " +
    "handlers/voice-channel.handler.ts:283. Door-side listener: " +
    "Doors/livechat/features/voice-chat.ts, " +
    "Doors/livechat/features/voice-channel-ux.ts. A byte terminal has no media " +
    "stack at all, so there is nothing to translate this into.",
  },
  "voice:left": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/voice-channel.handler.ts:183, " +
    "handlers/voice-channel.handler.ts:330, " +
    "handlers/voice-channel.handler.ts:438. Door-side listener: " +
    "Doors/livechat/features/voice-chat.ts, " +
    "Doors/livechat/features/voice-channel-ux.ts. A byte terminal has no media " +
    "stack at all, so there is nothing to translate this into.",
  },
  "voice:mute": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/voice-channel.handler.ts:209. Door-side listener: " +
    "Doors/livechat/features/voice-channel-ux.ts. A byte terminal has no media " +
    "stack at all, so there is nothing to translate this into.",
  },
  "voice:mute-remote": {
    kind: "web-only",
    note:
    "LiveChat asks the caller's browser to mute one remote participant's audio " +
    "(Doors/livechat/server.ts:1604). Browser WebRTC; a byte terminal has no " +
    "media stack at all.",
  },
  "voice:screenshare-toggle": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/voice-channel.handler.ts:387. A byte terminal has no media stack " +
    "at all, so there is nothing to translate this into.",
  },
  "voice:speaking": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/voice-channel.handler.ts:413. Door-side listener: " +
    "Doors/livechat/features/voice-chat.ts, " +
    "Doors/grandmaster/ui/versus-screen.ts. A byte terminal has no media stack " +
    "at all, so there is nothing to translate this into.",
  },
  "voice:video-toggle": {
    kind: "web-only",
    note:
    "Browser media API channel (WebRTC / Web Audio), emitted at " +
    "handlers/voice-channel.handler.ts:232. Door-side listener: " +
    "Doors/livechat/features/voice-chat.ts, " +
    "Doors/livechat/features/voice-channel-ux.ts. A byte terminal has no media " +
    "stack at all, so there is nothing to translate this into.",
  },
  "window-size": {
    kind: "not-transport",
    owner: "TelnetConnection / SSHConnection",
    note:
    "NAWS / pty geometry, raised on the connection " +
    "(server/telnet-server.ts:321,705; server/ssh-server.ts:98,323) and " +
    "forwarded by the emitter to the connection " +
    "(server/connection-emitter.ts:157).",
  },
};

/**
 * The complete table: 242 entries.
 *
 * render 6 - translate 11 - dead 10 - web-only 113 - not-transport 102
 * (22 named owners + 80 BrokerClient).
 */
export const EVENT_RULINGS: Readonly<Record<string, EventRuling>> = Object.freeze({
  ...NAMED_RULINGS,
  ...Object.fromEntries(
    Object.entries(BROKER_SITES).map(([name, site]) => [name, brokerRuling(site)]),
  ),
});
