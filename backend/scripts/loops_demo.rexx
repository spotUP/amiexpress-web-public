/* AREXX Loop Demonstrations */
/* Shows DO WHILE, DO UNTIL, DO count, and DO var = start TO end */

SAY "\x1b[36m╔════════════════════════════════════════════════════════════════╗\x1b[0m"
SAY "\x1b[36m║                   AREXX LOOP DEMONSTRATIONS                    ║\x1b[0m"
SAY "\x1b[36m╚════════════════════════════════════════════════════════════════╝\x1b[0m"
SAY ""

/* DO count example */
SAY "\x1b[33m1. DO count (simple counter)\x1b[0m"
DO 5
  SAY "  ★ Loop iteration"
END
SAY ""

/* DO var = start TO end example */
SAY "\x1b[33m2. DO var = start TO end\x1b[0m"
DO i = 1 TO 5
  SAY "  Counter: " || i
END
SAY ""

/* DO var = start TO end BY step */
SAY "\x1b[33m3. DO var = start TO end BY step (count by 2s)\x1b[0m"
DO i = 2 TO 10 BY 2
  SAY "  Even number: " || i
END
SAY ""

/* DO WHILE example */
SAY "\x1b[33m4. DO WHILE condition\x1b[0m"
counter = 1
DO WHILE counter <= 3
  SAY "  WHILE loop: iteration " || counter
  counter = counter + 1
END
SAY ""

/* DO UNTIL example */
SAY "\x1b[33m5. DO UNTIL condition\x1b[0m"
counter = 1
DO UNTIL counter > 3
  SAY "  UNTIL loop: iteration " || counter
  counter = counter + 1
END
SAY ""

/* BREAK example */
SAY "\x1b[33m6. BREAK statement (exit loop early)\x1b[0m"
DO i = 1 TO 10
  IF i = 5 THEN BREAK
  SAY "  Value: " || i
END
SAY "  (Broke at 5)"
SAY ""

/* ITERATE example */
SAY "\x1b[33m7. ITERATE statement (skip to next iteration)\x1b[0m"
DO i = 1 TO 5
  IF i = 3 THEN ITERATE
  SAY "  Number: " || i
END
SAY "  (Skipped 3)"
SAY ""

/* Nested loops */
SAY "\x1b[33m8. Nested loops\x1b[0m"
DO i = 1 TO 3
  DO j = 1 TO 3
    SAY "  [" || i || "," || j || "]"
  END
END
SAY ""

SAY "\x1b[32m✓ All loop demonstrations complete!\x1b[0m"
SAY ""

CALL BBSLOG "info" "User viewed loop demonstrations"
