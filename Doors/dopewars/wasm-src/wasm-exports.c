#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include "wasm-exports.h"
#include "message.h"

/* ─── Callback slots ─────────────────────────────────────── */
DwEventCb    dw_on_event    = NULL;
DwQuestionCb dw_on_question = NULL;

/* ─── Internal player table ──────────────────────────────── */
#define MAX_PLAYERS 64
static Player *players[MAX_PLAYERS];
static int     player_count = 0;

static Player* get_player(int idx) {
  if (idx < 0 || idx >= MAX_PLAYERS) return NULL;
  return players[idx];
}

/* Escape a string for embedding in a JSON value (double-quote delimited). */
static void json_escape(const char *src, char *dst, size_t dstlen) {
  size_t i = 0;
  if (!src) { if (dstlen > 0) dst[0] = '\0'; return; }
  while (*src && i + 2 < dstlen) {
    unsigned char c = (unsigned char)*src++;
    if      (c == '"')  { dst[i++] = '\\'; dst[i++] = '"'; }
    else if (c == '\\') { dst[i++] = '\\'; dst[i++] = '\\'; }
    else if (c == '\n') { dst[i++] = '\\'; dst[i++] = 'n'; }
    else if (c == '\r') { dst[i++] = '\\'; dst[i++] = 'r'; }
    else if (c == '\t') { dst[i++] = '\\'; dst[i++] = 't'; }
    else if (c < 0x20)  { /* skip other control chars */ }
    else                { dst[i++] = (char)c; }
  }
  dst[i] = '\0';
}

/* ─── Helpers called by patched serverside.c ─────────────── */
void dw_fire_event(Player *to, int code, const char *msg) {
  if (!dw_on_event || !to) return;
  char escaped[2048]; json_escape(msg, escaped, sizeof(escaped));
  char json[2200];
  snprintf(json, sizeof(json), "{\"code\":%d,\"msg\":\"%s\"}", code, escaped);
  dw_on_event(to->userdata, code, json);
}

void dw_fire_question(Player *to, int code, const char *prompt) {
  if (!dw_on_question || !to) return;
  char escaped[2048]; json_escape(prompt, escaped, sizeof(escaped));
  char json[2200];
  snprintf(json, sizeof(json), "{\"code\":%d,\"prompt\":\"%s\"}", code, escaped);
  dw_on_question(to->userdata, code, json);
}

/* ─── WASM exports ───────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void wasm_set_callbacks(DwEventCb on_event, DwQuestionCb on_question) {
  dw_on_event    = on_event;
  dw_on_question = on_question;
}

EMSCRIPTEN_KEEPALIVE
void wasm_init_game(int num_turns, double start_cash, double start_debt,
                    int debt_interest, int bank_interest) {
  extern int NumTurns, DebtInterest, BankInterest;
  extern price_t StartCash, StartDebt;
  /* Initialise drug/location/gun arrays with dopewars defaults */
  extern void SetupParameters(GSList *extraconfigs, gboolean antique);
  SetupParameters(NULL, FALSE);
  NumTurns      = num_turns;
  StartCash     = (price_t)start_cash;
  StartDebt     = (price_t)start_debt;
  DebtInterest  = debt_interest;
  BankInterest  = bank_interest;
  memset(players, 0, sizeof(players));
  player_count  = 0;
}

EMSCRIPTEN_KEEPALIVE
void wasm_set_drug_name(int index, const char *name) {
  extern int NumDrug;
  extern struct DRUG *Drug;
  if (index < 0 || index >= NumDrug || !name) return;
  AssignName(&Drug[index].Name, (char*)name);
}

EMSCRIPTEN_KEEPALIVE
void wasm_set_drug_cheap_str(int index, const char *str) {
  extern int NumDrug;
  extern struct DRUG *Drug;
  if (index < 0 || index >= NumDrug || !str) return;
  AssignName(&Drug[index].CheapStr, (char*)str);
}

EMSCRIPTEN_KEEPALIVE
void wasm_set_location_name(int index, const char *name) {
  extern int NumLocation;
  extern struct LOCATION *Location;
  if (index < 0 || index >= NumLocation || !name) return;
  AssignName(&Location[index].Name, (char*)name);
}

EMSCRIPTEN_KEEPALIVE
int wasm_get_num_drugs(void) {
  extern int NumDrug;
  return NumDrug;
}

EMSCRIPTEN_KEEPALIVE
int wasm_get_num_locations(void) {
  extern int NumLocation;
  return NumLocation;
}

EMSCRIPTEN_KEEPALIVE
int wasm_add_player(void *userdata, const char *name) {
  extern price_t StartCash, StartDebt;
  extern int NumDrug, NumGun;
  if (player_count >= MAX_PLAYERS) return -1;
  Player *p = g_new0(Player, 1);
  p->Name     = g_strdup(name);
  p->userdata = userdata;
  p->Cash     = StartCash;
  p->Debt     = StartDebt;
  p->Health   = 100;
  p->CoatSize = 100;
  p->Drugs    = g_new0(Inventory, NumDrug > 0 ? NumDrug : 12);
  p->Guns     = g_new0(Inventory, NumGun  > 0 ? NumGun  : 5);
  int idx     = player_count++;
  players[idx] = p;
  return idx;
}

EMSCRIPTEN_KEEPALIVE
void wasm_remove_player(int idx) {
  Player *p = get_player(idx);
  if (!p) return;
  g_free(p->Name); g_free(p->Drugs); g_free(p->Guns); g_free(p);
  players[idx] = NULL;
}

EMSCRIPTEN_KEEPALIVE
void wasm_generate_drugs(int idx) {
  extern void GenerateDrugsHere(Player*, void*);
  Player *p = get_player(idx);
  if (p) GenerateDrugsHere(p, NULL);
}

EMSCRIPTEN_KEEPALIVE
int wasm_random_offer(int idx) {
  extern int RandomOffer(Player*);
  Player *p = get_player(idx);
  return p ? RandomOffer(p) : 0;
}

EMSCRIPTEN_KEEPALIVE
void wasm_buy_drug(int idx, int drug_index, int amount) {
  extern void BuyObject(Player*, char*);
  Player *p = get_player(idx);
  if (!p) return;
  char data[64]; snprintf(data, sizeof(data), "drug^%d^%d", drug_index, amount);
  BuyObject(p, data);
}

EMSCRIPTEN_KEEPALIVE
void wasm_sell_drug(int idx, int drug_index, int amount) {
  extern void BuyObject(Player*, char*);
  Player *p = get_player(idx);
  if (!p) return;
  char data[64]; snprintf(data, sizeof(data), "drug^%d^%d", drug_index, -amount);
  BuyObject(p, data);
}

EMSCRIPTEN_KEEPALIVE
void wasm_move_player(int idx, int location) {
  extern void SendEvent(Player*);
  extern int DebtInterest, BankInterest;
  Player *p = get_player(idx);
  if (!p) return;
  p->IsAt = location;
  p->Turn++;
  if (p->Debt > 0) p->Debt = p->Debt * (1.0 + DebtInterest / 100.0);
  if (p->Bank > 0) p->Bank = p->Bank * (1.0 + BankInterest / 100.0);
  SendEvent(p);
}

EMSCRIPTEN_KEEPALIVE
void wasm_handle_answer(int idx, const char *answer) {
  extern void HandleAnswer(Player*, Player*, char*);
  Player *p = get_player(idx);
  if (p) HandleAnswer(p, NULL, (char*)answer);
}

EMSCRIPTEN_KEEPALIVE
void wasm_cops_attack(int idx) {
  extern void CopsAttackPlayer(Player*);
  Player *p = get_player(idx);
  if (p) CopsAttackPlayer(p);
}

EMSCRIPTEN_KEEPALIVE
void wasm_attack_player(int attacker_idx, int target_idx) {
  extern void AttackPlayer(Player*, Player*);
  Player *a = get_player(attacker_idx);
  Player *t = get_player(target_idx);
  if (a && t) AttackPlayer(a, t);
}

EMSCRIPTEN_KEEPALIVE
void wasm_fire(int idx) {
  extern void Fire(Player*);
  Player *p = get_player(idx);
  if (p) Fire(p);
}

EMSCRIPTEN_KEEPALIVE
void wasm_withdraw_from_combat(int idx) {
  extern void WithdrawFromCombat(Player*);
  Player *p = get_player(idx);
  if (p) WithdrawFromCombat(p);
}

EMSCRIPTEN_KEEPALIVE
void wasm_run_from_combat(int idx, int to_location) {
  extern void RunFromCombat(Player*, int);
  Player *p = get_player(idx);
  if (p) RunFromCombat(p, to_location);
}

EMSCRIPTEN_KEEPALIVE
void wasm_spy_player(int spy_idx, int target_idx) {
  extern void SpyPlayer(Player*, Player*);
  Player *spy    = get_player(spy_idx);
  Player *target = get_player(target_idx);
  if (spy && target) SpyPlayer(spy, target);
}

EMSCRIPTEN_KEEPALIVE
void wasm_tip_player(int tipper_idx, int target_idx) {
  extern void TipPlayer(Player*, Player*);
  Player *tipper = get_player(tipper_idx);
  Player *target = get_player(target_idx);
  if (tipper && target) TipPlayer(tipper, target);
}

EMSCRIPTEN_KEEPALIVE
void wasm_send_high_scores(int idx, int end_game) {
  extern void SendHighScores(Player*, int, char*);
  Player *p = get_player(idx);
  if (p) SendHighScores(p, end_game, NULL);
}

/* ─── State serialisation ────────────────────────────────── */
static char state_buf[8192];

EMSCRIPTEN_KEEPALIVE
const char* wasm_get_player_state(int idx) {
  extern int NumDrug, NumGun, NumTurns;
  Player *p = get_player(idx);
  if (!p) return "null";

  char drugs[3000] = "[";
  for (int i = 0; i < (NumDrug > 0 ? NumDrug : 12); i++) {
    char entry[128];
    snprintf(entry, sizeof(entry), "%s{\"index\":%d,\"carried\":%d,\"totalValue\":%.2f}",
      i > 0 ? "," : "", i, p->Drugs[i].Carried, (double)p->Drugs[i].TotalValue);
    strncat(drugs, entry, sizeof(drugs)-strlen(drugs)-1);
  }
  strncat(drugs, "]", sizeof(drugs)-strlen(drugs)-1);

  char guns[1024] = "[";
  for (int i = 0; i < (NumGun > 0 ? NumGun : 5); i++) {
    char entry[128];
    snprintf(entry, sizeof(entry), "%s{\"index\":%d,\"carried\":%d}",
      i > 0 ? "," : "", i, p->Guns[i].Carried);
    strncat(guns, entry, sizeof(guns)-strlen(guns)-1);
  }
  strncat(guns, "]", sizeof(guns)-strlen(guns)-1);

  snprintf(state_buf, sizeof(state_buf),
    "{\"location\":%d,\"cash\":%.2f,\"debt\":%.2f,\"bank\":%.2f,"
    "\"health\":%d,\"coatSize\":%d,\"turn\":%d,\"totalTurns\":%d,"
    "\"eventNum\":%d,\"flags\":%d,\"inCombat\":%s,\"drugs\":%s,\"guns\":%s}",
    p->IsAt, (double)p->Cash, (double)p->Debt, (double)p->Bank,
    p->Health, p->CoatSize, p->Turn, NumTurns,
    p->EventNum, (int)p->Flags,
    (p->EventNum == E_FIGHT || p->EventNum == E_FIGHTASK || (p->Flags & FIGHTING)) ? "true" : "false",
    drugs, guns);
  return state_buf;
}

static char market_buf[4096];

EMSCRIPTEN_KEEPALIVE
const char* wasm_get_market(int idx) {
  extern int NumDrug;
  extern struct DRUG *Drug;
  Player *p = get_player(idx);
  if (!p) return "null";

  char prices[3000] = "[";
  int nd = NumDrug > 0 ? NumDrug : 12;
  for (int i = 0; i < nd; i++) {
    char entry[256];
    snprintf(entry, sizeof(entry),
      "%s{\"index\":%d,\"name\":\"%s\",\"price\":%.2f,\"cheap\":%s,\"expensive\":%s}",
      i > 0 ? "," : "", i,
      Drug[i].Name ? Drug[i].Name : "",
      (double)(p->Drugs[i].Price),
      Drug[i].Cheap     ? "true" : "false",
      Drug[i].Expensive ? "true" : "false");
    strncat(prices, entry, sizeof(prices)-strlen(prices)-1);
  }
  strncat(prices, "]", sizeof(prices)-strlen(prices)-1);

  snprintf(market_buf, sizeof(market_buf),
    "{\"location\":%d,\"prices\":%s}", p->IsAt, prices);
  return market_buf;
}

/* ─── Stubs for networking/messaging layer (replaced by callbacks) ─── */

/*
 * GetNextWord / GetNextInt: string-parsing utilities normally defined in
 * message.c, which is not compiled for WASM. Implemented here so that
 * BuyObject and other serverside.c helpers work correctly.
 *
 * GetNextWord: advances *Data past leading whitespace, returns a newly
 * allocated copy of the next whitespace-delimited token, or g_strdup(Default)
 * if none is found. *Data is left pointing to the character after the token.
 */
gchar *GetNextWord(gchar **Data, gchar *Default) {
  gchar *start, *end, *ret;
  if (!Data || !*Data) return g_strdup(Default ? Default : "");
  start = *Data;
  /* The dopewars protocol uses '^' as the field separator. Skip leading ones. */
  while (*start == '^') start++;
  if (!*start) { *Data = start; return g_strdup(Default ? Default : ""); }
  end = start;
  while (*end && *end != '^') end++;
  ret = g_strndup(start, end - start);
  if (*end == '^') end++;
  *Data = end;
  return ret;
}

/*
 * GetNextInt: parses the next integer token from *Data, returning Default
 * if the token is absent or non-numeric.
 */
int GetNextInt(gchar **Data, int Default) {
  gchar *word = GetNextWord(Data, NULL);
  int val = Default;
  if (word && *word) val = atoi(word);
  g_free(word);
  return val;
}

/*
 * InitAbilities: sets all local abilities to TRUE so the server-side code
 * believes it can use every protocol extension.
 */
void InitAbilities(Player *Play) {
  if (!Play) return;
  for (int i = 0; i < A_NUM; i++) {
    Play->Abil.Local[i]  = TRUE;
    Play->Abil.Remote[i] = TRUE;
    Play->Abil.Shared[i] = TRUE;
  }
  Play->Abil.RemoteNum = A_NUM;
}

/*
 * HaveAbility: in WASM mode we support all abilities.
 */
gboolean HaveAbility(Player *Play, gint Type) {
  (void)Play; (void)Type;
  return TRUE;
}

/*
 * SendPlayerData: fires a C_UPDATE event so TypeScript can refresh the
 * player state display after any state-changing serverside call.
 */
void SendPlayerData(Player *To) {
  dw_fire_event(To, (int)'U' /* C_UPDATE */, "");
}

/*
 * SendPrintMessage: delivers a text message to the target player.
 * We encode the message text in the JSON payload.
 */
void SendPrintMessage(Player *From, AICode AI, Player *To, char *Data) {
  (void)From; (void)AI;
  if (!To || !Data) return;
  char json[2048];
  snprintf(json, sizeof(json), "{\"code\":%d,\"msg\":\"%s\"}", (int)C_PRINTMESSAGE, Data);
  dw_fire_event(To, (int)C_PRINTMESSAGE, json);
}

/*
 * SendFightMessage: fires a fight event to the attacker and/or defender.
 */
void SendFightMessage(Player *Attacker, Player *Defender,
                      int BitchesKilled, FightPoint fp, price_t Loot,
                      gboolean Broadcast, gchar *Msg) {
  (void)Broadcast;
  char json[512];
  snprintf(json, sizeof(json),
    "{\"fp\":%d,\"bitchesKilled\":%d,\"loot\":%.2f,\"msg\":\"%s\"}",
    (int)fp, BitchesKilled, (double)Loot, Msg ? Msg : "");
  if (Attacker) dw_fire_event(Attacker, (int)C_FIGHTPRINT, json);
  if (Defender && Defender != Attacker)
    dw_fire_event(Defender, (int)C_FIGHTPRINT, json);
}

/*
 * SendFightLeave: notifies the player that a fight has ended.
 */
void SendFightLeave(Player *Play, gboolean FightOver) {
  char json[64];
  snprintf(json, sizeof(json), "{\"fightOver\":%s}", FightOver ? "true" : "false");
  dw_fire_event(Play, (int)C_FIGHTACT, json);
}

/*
 * BroadcastToClients: in WASM single-player mode there are no other clients,
 * so this is a no-op.
 */
void BroadcastToClients(AICode AI, MsgCode Code, char *Data,
                        Player *From, Player *Except) {
  (void)AI; (void)Code; (void)Data; (void)From; (void)Except;
}

/*
 * SpyPlayer: fires a spy-report event. The TypeScript layer interprets this
 * and shows the target's stats.
 */
void SpyPlayer(Player *Spy, Player *Target) {
  dw_fire_event(Spy, (int)C_SPYON, Target ? Target->Name : "");
}

/*
 * TipPlayer: fires a tip-off event.
 */
void TipPlayer(Player *Tipper, Player *Target) {
  dw_fire_event(Tipper, (int)C_TIPOFF, Target ? Target->Name : "");
}
