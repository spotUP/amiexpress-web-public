/* PROCEDURE Definition Demonstration */
/* Shows user-defined procedures with parameters */

SAY "\x1b[36m╔════════════════════════════════════════════════════════════════╗\x1b[0m"
SAY "\x1b[36m║              PROCEDURE DEMONSTRATION                           ║\x1b[0m"
SAY "\x1b[36m╚════════════════════════════════════════════════════════════════╝\x1b[0m"
SAY ""

/* Define a greeting procedure */
PROCEDURE Greet(name, level)
  SAY "\x1b[32mHello, " || name || "!\x1b[0m"
  IF level >= 100 THEN SAY "  → You have privileged access"
  IF level < 100 THEN SAY "  → Standard user access"
  RETURN "Greeted " || name
END

/* Define a calculation procedure */
PROCEDURE Calculate(a, b, operation)
  result = 0

  SELECT
    WHEN operation = "add" THEN result = a + b
    WHEN operation = "sub" THEN result = a - b
    WHEN operation = "mul" THEN result = a * b
    OTHERWISE result = 0
  END

  RETURN result
END

/* Define a formatting procedure */
PROCEDURE FormatMessage(username, message, color)
  formatted = "\x1b[" || color || "m[" || username || "] " || message || "\x1b[0m"
  RETURN formatted
END

/* Use the procedures */
SAY "\x1b[33m━━━ Calling Greet Procedure ━━━\x1b[0m"
username = BBSGETUSERNAME()
userlevel = BBSGETUSERLEVEL()

result = Greet(username, userlevel)
SAY "Result: " || result
SAY ""

SAY "\x1b[33m━━━ Calling Calculate Procedure ━━━\x1b[0m"
sum = Calculate(10, 5, "add")
SAY "10 + 5 = \x1b[32m" || sum || "\x1b[0m"

diff = Calculate(10, 5, "sub")
SAY "10 - 5 = \x1b[32m" || diff || "\x1b[0m"

product = Calculate(10, 5, "mul")
SAY "10 * 5 = \x1b[32m" || product || "\x1b[0m"
SAY ""

SAY "\x1b[33m━━━ Calling FormatMessage Procedure ━━━\x1b[0m"
msg1 = FormatMessage(username, "Hello from procedure!", "32")
SAY msg1

msg2 = FormatMessage("System", "Welcome to the BBS", "33")
SAY msg2

msg3 = FormatMessage("Admin", "Important announcement", "31")
SAY msg3
SAY ""

/* Nested procedure calls */
SAY "\x1b[33m━━━ Nested Procedure Calls ━━━\x1b[0m"
a = 7
b = 3
result = Calculate(a, b, "add")
formatted = FormatMessage("Calculator", "Result: " || result, "36")
SAY formatted
SAY ""

SAY "\x1b[32m✓ PROCEDURE demonstration complete!\x1b[0m"
SAY ""

CALL BBSLOG "info" "User " || username || " completed PROCEDURE demo"
