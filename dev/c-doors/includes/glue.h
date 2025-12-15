/*
 * Simplified Glue API declarations for vbcc
 * Stub implementations for initial testing
 */

#ifndef GLUE_H
#define GLUE_H

#include "config.h"

/* Core door functions */
VOID Register(int node);
VOID ShutDown(VOID);

/* Output functions */
void sendmessage(char *text, int newline);

/* Input functions */
void prompt(char *prompt_text, char *result, int max_len);
void hotkey(char *prompt_text, char *result);

/* User data access */
void getuserstring(char *result, int field_id);

/* Utility functions */
void end(void);

#endif /* GLUE_H */