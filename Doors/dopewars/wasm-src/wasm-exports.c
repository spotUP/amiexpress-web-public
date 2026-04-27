#include <emscripten.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "wasm-exports.h"

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

/* ─── Helpers called by patched serverside.c ─────────────── */
void dw_fire_event(Player *to, int code, const char *msg) {
  if (!dw_on_event || !to) return;
  char json[2048];
  snprintf(json, sizeof(json), "{\"code\":%d,\"msg\":\"%s\"}", code, msg ? msg : "");
  dw_on_event(to->userdata, code, json);
}

void dw_fire_question(Player *to, int code, const char *prompt) {
  if (!dw_on_question || !to) return;
  char json[2048];
  snprintf(json, sizeof(json), "{\"code\":%d,\"prompt\":\"%s\"}", code, prompt ? prompt : "");
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
  NumTurns      = num_turns;
  StartCash     = (price_t)start_cash;
  StartDebt     = (price_t)start_debt;
  DebtInterest  = debt_interest;
  BankInterest  = bank_interest;
  memset(players, 0, sizeof(players));
  player_count  = 0;
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
  char data[64]; snprintf(data, sizeof(data), "%d %d", drug_index, amount);
  BuyObject(p, data);
}

EMSCRIPTEN_KEEPALIVE
void wasm_sell_drug(int idx, int drug_index, int amount) {
  extern void BuyObject(Player*, char*);
  Player *p = get_player(idx);
  if (!p) return;
  char data[64]; snprintf(data, sizeof(data), "%d -%d", drug_index, amount);
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
    "\"eventNum\":%d,\"flags\":%d,\"inCombat\":false,\"drugs\":%s,\"guns\":%s}",
    p->IsAt, (double)p->Cash, (double)p->Debt, (double)p->Bank,
    p->Health, p->CoatSize, p->Turn, NumTurns,
    p->EventNum, (int)p->Flags, drugs, guns);
  return state_buf;
}

static char market_buf[4096];

EMSCRIPTEN_KEEPALIVE
const char* wasm_get_market(int idx) {
  extern int NumDrug;
  extern Drug *Drugs;
  Player *p = get_player(idx);
  if (!p) return "null";

  char prices[3000] = "[";
  int nd = NumDrug > 0 ? NumDrug : 12;
  for (int i = 0; i < nd; i++) {
    char entry[256];
    snprintf(entry, sizeof(entry),
      "%s{\"index\":%d,\"name\":\"%s\",\"price\":%.2f,\"cheap\":%s,\"expensive\":%s}",
      i > 0 ? "," : "", i,
      Drugs[i].Name ? Drugs[i].Name : "",
      (double)(p->Drugs[i].Price),
      Drugs[i].Cheap     ? "true" : "false",
      Drugs[i].Expensive ? "true" : "false");
    strncat(prices, entry, sizeof(prices)-strlen(prices)-1);
  }
  strncat(prices, "]", sizeof(prices)-strlen(prices)-1);

  snprintf(market_buf, sizeof(market_buf),
    "{\"location\":%d,\"prices\":%s}", p->IsAt, prices);
  return market_buf;
}
