---
date: 2026-04-27
topic: dopewars-door
tags: [door, wasm, multiplayer, game]
status: final
---

# Dopewars Door — Design Spec

A fully authentic, multiplayer Dopewars door for AmiExpress-Web. Game logic is 100% original C
(dopewars `benmwebb/dopewars`, `develop` branch) compiled to WASM. TypeScript handles session
management, persistence, multi-node coordination, and UI. No BBS backend (`web/backend/`) code
is modified. SDK changes are permitted.

---

## Constraints

- Zero changes to `web/backend/` (core BBS must not be touched)
- SDK (`sdk/`) changes are permitted
- Door is self-contained and distributable as a standalone zip
- Game logic completeness is guaranteed by shipping the original C source as WASM
- TypeScript layer must be 100% complete — no stubs, no TODOs, no skipped handlers
- World state is persistent across BBS restarts
- World tick is turn-based: world advances one day when a player jets to a new location

---

## Architecture

Four layers, each with a single clear responsibility:

```
┌─────────────────────────────────────────────────────────┐
│  WASM Module  (dopewars-wasm)                           │
│  dopewars.c + serverside.c + configfile.c + util.c      │
│  + tstring.c                                            │
│  GLib stubbed, NetBuf stripped, message functions       │
│  replaced with callback pointers.                       │
│  Compiled with Emscripten. No main(), no sockets.       │
├─────────────────────────────────────────────────────────┤
│  DopewarsServer  (TypeScript singleton)                 │
│  Wraps WASM. Manages player sessions. Persists state    │
│  to dopewars.db after every action. Broadcasts state    │
│  changes via LobbyBroker.                               │
├─────────────────────────────────────────────────────────┤
│  dopewars.db  (SQLite, door-owned)                      │
│  Stores all player and world state. Independent of      │
│  the BBS database.                                      │
├─────────────────────────────────────────────────────────┤
│  TypeScript Door  (Doors/dopewars/)                     │
│  neo-blessed UI. DoorInputManager. Per-node session.    │
│  All game actions delegated to DopewarsServer.          │
└─────────────────────────────────────────────────────────┘
```

### Multi-node coordination

`DopewarsServer` is a process-level singleton registered as
`global[Symbol.for('dopewars-server')]`. The first door instance to start creates it; all
subsequent instances on other nodes attach to the same object. After every action,
`DopewarsServer` publishes events via `LobbyBroker`:

- `dopewars:state:<playerId>` — full state update for the acting player
- `dopewars:presence:<location>` — presence update for all players at that location

All door instances subscribe to these events and re-render on receipt.

---

## Distribution

```
Doors/dopewars/
  dopewars.wasm         <- pre-compiled, platform-agnostic (ships in zip)
  dopewars.info         <- door registration
  package.json
  src/
    index.ts            <- door entry point
    app.ts              <- UI / session orchestration
    server.ts           <- DopewarsServer singleton
    wasm.ts             <- WASM loader and typed bindings
    db.ts               <- SQLite schema and queries
    broker.ts           <- LobbyBroker subscription helpers
    ui/
      layout.ts         <- panel layout and blessed screen setup
      market.ts         <- market panel
      inventory.ts      <- inventory panel
      events.ts         <- events panel
      players.ts        <- players-here panel
      actions.ts        <- action bar and overlays
      combat.ts         <- combat action bar
  data/
    dopewars.db         <- created on first run (gitignored)
  wasm-src/             <- C source for WASM compilation
    dopewars.c
    dopewars.h
    serverside.c
    serverside.h
    configfile.c
    configfile.h
    tstring.c
    tstring.h
    util.c
    util.h
    glib-stub.h         <- GLib type stubs
    wasm-exports.c      <- EMSCRIPTEN_KEEPALIVE export wrappers
    Makefile            <- Emscripten build
```

Sysop installation: unzip into `Doors/`, run `npm install`. No Emscripten required (`.wasm`
ships pre-compiled).

---

## WASM Surgery

Four targeted changes to the C source. All other code untouched.

### 1. GLib stubs (`glib-stub.h`)

```c
typedef int          gboolean;
typedef char         gchar;
typedef int          gint;
typedef unsigned int guint;
typedef void*        gpointer;
#define TRUE  1
#define FALSE 0
#define G_GNUC_UNUSED

typedef struct _GSList { void *data; struct _GSList *next; } GSList;
GSList* g_slist_append(GSList *list, void *data);
GSList* g_slist_remove(GSList *list, const void *data);
void    g_slist_free(GSList *list);
guint   g_slist_length(GSList *list);
GSList* g_slist_nth(GSList *list, guint n);
```

### 2. Strip `NetBuf` from `Player`

Remove `NetworkBuffer NetBuf` from the Player struct in `dopewars.h`. Replace with:

```c
void *userdata;  // TypeScript-side player ID (passed back in callbacks)
```

Game logic functions do not use `NetBuf` internally — this field is only accessed by
`network.c` and `message.c`, both of which are excluded from the WASM build.

### 3. Message callbacks

Replace `SendServerMessage()` and `SendQuestion()` with global callback function pointers
registered at init time by TypeScript:

```c
// Registered once at startup by TypeScript via wasm_set_callbacks()
extern void (*dw_on_event)   (void *userdata, int event_code, const char *json);
extern void (*dw_on_question)(void *userdata, int event_code, const char *prompt_json);
```

All calls to `SendServerMessage(To, ...)` and `SendQuestion(To, ...)` in `serverside.c`
become `dw_on_event(To->userdata, ...)` and `dw_on_question(To->userdata, ...)`.

### 4. WASM exports (`wasm-exports.c`)

All exported functions are marked `EMSCRIPTEN_KEEPALIVE` and have C linkage:

```c
void  wasm_set_callbacks(void *on_event, void *on_question);
void  wasm_init_game(const char *config_json);
int   wasm_add_player(const char *id, const char *name);
void  wasm_remove_player(int player_index);
void  wasm_generate_drugs(int player_index);
int   wasm_random_offer(int player_index);
void  wasm_buy_object(int player_index, int drug_index, int amount);
void  wasm_sell_object(int player_index, int drug_index, int amount);
void  wasm_move_player(int player_index, int location);   // advances turn
void  wasm_handle_answer(int player_index, const char *answer);
void  wasm_cops_attack(int player_index);
void  wasm_attack_player(int attacker_index, int target_index);
void  wasm_fire(int player_index);
void  wasm_withdraw_from_combat(int player_index);
void  wasm_run_from_combat(int player_index, int to_location);
char* wasm_get_player_state(int player_index);   // returns JSON, caller frees
char* wasm_get_market(int player_index);         // returns JSON, caller frees
void  wasm_end_turn(int player_index);
void  wasm_send_high_scores(int player_index, int end_game);
```

---

## TypeScript Game Server API

```typescript
// server.ts
export class DopewarsServer {
  static getInstance(): DopewarsServer

  // Lifecycle
  async init(): Promise<void>       // load WASM, restore SQLite state into WASM
  async shutdown(): Promise<void>   // flush all state to SQLite

  // Player management
  async joinGame(bbsUser: User): Promise<DopewarsPlayer>
  async leaveGame(playerId: string): Promise<void>
  async getActivePlayers(): Promise<PlayerSummary[]>
  async getPlayersAt(location: number): Promise<PlayerSummary[]>

  // Actions — all return ActionResult
  async buyDrug(id: string, drugIndex: number, amount: number): Promise<ActionResult>
  async sellDrug(id: string, drugIndex: number, amount: number): Promise<ActionResult>
  async jetTo(id: string, location: number): Promise<ActionResult>

  // handleAnswer drives all event-machine interactions: bank deposit/withdraw,
  // loan shark repayment, gun shop buy/sell, doc healing, random offer responses.
  // These are triggered by dw_on_question callbacks fired during jetTo().
  // The UI presents the relevant prompt/buttons only when a question is pending.
  async handleAnswer(id: string, answer: string): Promise<ActionResult>

  // Player-vs-player (multiplayer interactions, player-initiated)
  async spy(id: string, targetId: string): Promise<ActionResult>
  async sendTip(id: string, targetId: string): Promise<ActionResult>

  // Combat
  async fight(id: string): Promise<ActionResult>
  async runFrom(id: string, toLocation: number): Promise<ActionResult>
  async surrender(id: string): Promise<ActionResult>

  // State queries
  async getPlayerState(id: string): Promise<PlayerState>
  async getMarket(id: string): Promise<MarketState>
  async getHighScores(): Promise<HighScore[]>
}

interface ActionResult {
  ok: boolean
  events: GameEvent[]   // event codes + display strings from WASM callbacks
  questions: GameQuestion[]  // pending questions awaiting handleAnswer()
  newState: PlayerState
}

interface PlayerState {
  id: string
  name: string
  location: number
  locationName: string
  turn: number
  totalTurns: number
  cash: number
  debt: number
  bank: number
  health: number
  coatSize: number
  coatUsed: number
  drugs: InventoryItem[]
  guns: InventoryItem[]
  inCombat: boolean
  eventNum: number
}

interface MarketState {
  location: number
  locationName: string
  prices: DrugPrice[]
}

interface DrugPrice {
  index: number
  name: string
  price: number
  trend: 'cheap' | 'expensive' | 'normal'
  cheapStr?: string
  expensiveStr?: string
}
```

---

## Persistence Schema

`Doors/dopewars/data/dopewars.db` — created on first run.

```sql
CREATE TABLE dw_players (
  id TEXT PRIMARY KEY,
  bbs_handle TEXT NOT NULL,
  location INTEGER NOT NULL DEFAULT 0,
  cash REAL NOT NULL DEFAULT 2000,
  debt REAL NOT NULL DEFAULT 5500,
  bank REAL NOT NULL DEFAULT 0,
  health INTEGER NOT NULL DEFAULT 100,
  coat_size INTEGER NOT NULL DEFAULT 100,
  turn INTEGER NOT NULL DEFAULT 0,
  total_turns INTEGER NOT NULL DEFAULT 30,
  event_num INTEGER NOT NULL DEFAULT 0,
  flags INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  last_seen DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dw_inventory (
  player_id TEXT NOT NULL REFERENCES dw_players(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK(item_type IN ('drug','gun')),
  item_index INTEGER NOT NULL,
  carried INTEGER NOT NULL DEFAULT 0,
  total_value REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, item_type, item_index)
);

CREATE TABLE dw_world_prices (
  location INTEGER NOT NULL,
  drug_index INTEGER NOT NULL,
  price REAL NOT NULL,
  trend TEXT NOT NULL DEFAULT 'normal',
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (location, drug_index)
);

CREATE TABLE dw_high_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  bbs_handle TEXT NOT NULL,
  score REAL NOT NULL,
  turns INTEGER NOT NULL,
  achieved_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dw_combat (
  player_id TEXT PRIMARY KEY REFERENCES dw_players(id) ON DELETE CASCADE,
  opponent_id TEXT,
  cop_index INTEGER,
  num_deputies INTEGER,
  fight_array TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE dw_spy_tips (
  player_id TEXT NOT NULL REFERENCES dw_players(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  tip_type TEXT NOT NULL CHECK(tip_type IN ('spy','tip')),
  PRIMARY KEY (player_id, target_id, tip_type)
);
```

State is flushed to SQLite after every action. On startup, all `active=1` players are
restored into WASM via `wasm_add_player`.

---

## Door UI

80x24 neo-blessed layout. Five regions:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ DOPEWARS | Day 8 of 30 | Brooklyn | HP: 87 | Cash: $4,320 | Debt: $5,500   │
├────────────────────────┬──────────────────────┬──────────────────────────── ┤
│ MARKET                 │ INVENTORY            │ EVENTS                      │
│ Cocaine   $18,000  **  │ Cocaine      3 units │ > Cheap heroin here!        │
│ Heroin     $5,500  --  │ Heroin       0 units │ > Cop took 3 acid           │
│ Acid         $900  --  │ Acid         7 units │ > SPOT bought cocaine in    │
│ Weed         $430  ↑   │ Coat: 90/100         │   Manhattan                 │
│ Speed        $210  --  │                      │ > You arrived safely        │
│ Ludes        $180  ↓   │ GUNS                 │                             │
│ Shrooms      $760  --  │ .38 Revolver  x2     │                             │
│ PCP        $1,100  --  │                      │                             │
│ Hashish      $490  --  │ Bank: $12,000         │                             │
│ Opium      $2,300  --  │                      │                             │
├────────────────────────┴──────────────────────┴─────────────────────────────┤
│ HERE: RETRO (4hp), AMIGAFAN                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ [B]uy [S]ell [J]et [K]bank [L]oan [G]uns [D]oc [A]ttack [H]iscores [Q]uit │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Price trend indicators:**
- `**` — expensive event active (drug name + `ExpensiveStr` shown in events)
- `!!` — cheap event active (drug name + `CheapStr` shown in events)
- `↑` / `↓` — price above/below rolling average (cosmetic only, not in C source)
- `--` — normal

**Overlays (modal, centered):**
- Buy/Sell: drug picker + quantity input
- Jet: location list with police presence indicator
- Bank: deposit/withdraw amount input
- Loan shark: repay amount input
- Gun shop: buy/sell picker with prices and space cost
- Doc: confirmation + cost display
- High scores: scrollable table

**Combat mode** — action bar replaced with:
```
[F]ight [R]un to... [S]urrender
```
Combat events stream into the events panel in real time.

**Question mode** — when WASM fires `dw_on_question`, a prompt overlay appears with the
question text and valid answer keys. `handleAnswer()` called on keypress.

**Events panel:**
- Newest event at top
- Shows events for the acting player AND presence events for other players in the same
  location (e.g. "SPOT arrived in Brooklyn", "RETRO bought cocaine")
- Scrollable with arrow keys when focused

**Players Here row:**
- Updated on every `dopewars:presence:<location>` broker event
- Shows BBS handle + current health for all players at current location
- "---" if no other players present

**DoorInputManager:** enabled on `run()`, disabled on `quit()`. Game mode enabled.

---

## SDK Changes

Permitted additions to `sdk/` only. Anticipated:

- WASM module loader utility (`sdk/utils/wasm-loader.ts`) — generic helper for loading
  `.wasm` files from a door's own directory, registering callbacks, and exposing typed
  bindings. Reusable by future doors.
- LobbyBroker event type additions for `dopewars:state` and `dopewars:presence` namespaces.
  LobbyBroker is EventEmitter-based — no explicit registration needed, any event name works.

No existing SDK files modified in breaking ways.

---

## Completeness Guarantee

The WASM layer guarantees game logic completeness — every event type, pricing algorithm,
combat function, and state machine in `serverside.c` is present because we compile the
original C.

The TypeScript layer is complete when:
- Every WASM export listed above has a corresponding TypeScript caller in `server.ts`
- Every `dw_on_event` event code has a handler that persists state and formats an event
  string for the UI
- Every `dw_on_question` event code has a handler that presents the correct overlay
- Every action in the action bar is wired end-to-end: key → handler → server method →
  WASM call → callback → SQLite flush → broker broadcast → UI re-render
- All six SQLite tables are populated correctly after every action
- High scores are written on game end
- Combat is fully handled (fight, run, surrender, cop attacks, player attacks)
- Spy and tip interactions are handled
- Bank, loan shark, gun shop, and doc are fully implemented
- Player state is correctly restored from SQLite on server restart

---

## Build

```bash
# Compile WASM (requires Emscripten — done by maintainers, output ships in zip)
cd Doors/dopewars/wasm-src
make

# Build TypeScript door
cd Doors/dopewars
npm install
npm run build

# Dev
npm run build:watch
```
