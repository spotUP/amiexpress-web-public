#ifndef WASM_EXPORTS_H
#define WASM_EXPORTS_H

#include "dopewars.h"

/* Callback types registered by TypeScript at init */
typedef void (*DwEventCb)   (void *userdata, int code, const char *json);
typedef void (*DwQuestionCb)(void *userdata, int code, const char *prompt_json);

extern DwEventCb    dw_on_event;
extern DwQuestionCb dw_on_question;

/* Called by patched serverside.c instead of SendServerMessage/SendQuestion */
void dw_fire_event   (Player *to, int code, const char *msg);
void dw_fire_question(Player *to, int code, const char *prompt);

#endif
