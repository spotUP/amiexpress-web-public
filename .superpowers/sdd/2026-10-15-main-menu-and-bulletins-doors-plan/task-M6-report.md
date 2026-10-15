# M6 report - AEW_MENU (10900)

Status: DONE_WITH_CONCERNS. Landed 0376bc813 (feature) + test follow-up (runText) + docs tick.

Built: xim/menu.ts (OPEN, LOGO, ROW, OVERFLOW, OVERFLOW?, RUN, SHOW), services/menu-catalogue/logos.ts,
handlers/commands/menu-door-exit.ts (arming half), route in XIMProtocol.ts (a throw answers empty, log shows the verb only),
XIMIOHandler.emitDoorText, redact.ts (RUN withheld; hex dump skipped for AEW_MENU), menuPromptText extracted,
users.menuoverflow column + repository + type, fixtures cat.txt / wide.txt / cat.seq.

Tests: menu-command (11), menu-logos (6), password-never-reaches-a-log (seven sinks, now also AEW_MENU: sinks shown to
carry 'OVERFLOW?' / AEW_MENU first, then the RUN secret absent). tsc backend + config-app: 0 errors.
RED: with the RUN redaction rule and hex-dump skip removed, the seven-sink test and the loggable test failed; with RUN forced
'typed', the SysCmd test failed; with the width check removed, "wider than the screen is never chosen" failed. All restored.

Deviations / concerns:
1. Brief's rotate test used wide.txt (100 cols) at 80 columns while Decision 16 forbids drawing it; the test uses widthClass wide at 120 columns.
2. Brief test expected `RUN [18 bytes withheld]` for 'RUN J 5 secretpass' but its own code (s.length - 4) gives 14 (the payload); kept the code, test says 14.
3. mayDumpRawString now skips AEW_MENU entirely: the parser hex-dumps the String before the verb is known, so a RUN secret would leak otherwise.
4. vicToSgr256 is not exported from the SDK petscii index; C64 logos use vicToSgrForeground (truecolor), which the transducer maps back exactly (exact palette hit wins).
5. menuPromptText answers the built-in prompt only; a conference MENU_PROMPT tooltype (async MCI) stays in displayMenuPrompt.
6. Password test: the seven-sink check had to extend the existing test, not a new one (the stream loggers close once per process).
