# Fix findings report
1. e8de88263 bulletins test: seeds Access/ACS.255.info in the tmp board, resets ACS loader. 3/3 pass (was 3/3 red).
2. 24b41b650 M5: board-screen-wipe-budget.test.ts; RED with capWipeFrames wiring removed.
3. 188865d2a M6: amigaLogFile writes only `msg request: <n>` (XIMLogger.ts:210), cannot carry OVERFLOW?; comment added.
4. 7f5e4739d M1: gate must be first refusing checkSecurity; O uses second (PAGE_SYSOP). RED with O gate mutated. Six rows (Q WHO WHD 0 1 2) have no outright refusal: express.e wraps in `IF checkSecurity(ACS_X)`; test checks the first checkSecurity of any shape for those, listed explicitly.
5. 4391c3404 M3: bareGateKey() in caller.ts; both preview and live may accept DOWNLOAD and ACS.DOWNLOAD. RED without fix.
