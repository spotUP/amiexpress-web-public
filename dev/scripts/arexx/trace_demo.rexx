/* AREXX Phase 4 Demo: TRACE and OPTIONS */
/* Demonstrates debugging and tracing features */

SAY "\x1b[36m=== TRACE and OPTIONS Demo ===\x1b[0m"
SAY ""

/* Example 1: Basic TRACE usage */
SAY "\x1b[33mExample 1: Enabling TRACE\x1b[0m"
SAY "Trace is now OFF"
SAY "Executing code without trace:"
x = 10
y = 20
sum = x + y
SAY "Result: " || sum
SAY ""

SAY "Enabling TRACE..."
TRACE ON
SAY "Executing code with trace:"
a = 5
b = 3
product = a * b
SAY "Result: " || product
TRACE OFF
SAY "Trace disabled"
SAY ""

/* Example 2: OPTIONS command */
SAY "\x1b[33mExample 2: OPTIONS command\x1b[0m"
SAY "Setting options: TRACE"
OPTIONS TRACE

counter = 0
DO i = 1 TO 3
  counter = counter + i
END
SAY "Counter value: " || counter

OPTIONS NOTRACE
SAY "Trace disabled via OPTIONS"
SAY ""

/* Example 3: Tracing procedure calls */
SAY "\x1b[33mExample 3: Tracing procedures\x1b[0m"

PROCEDURE Calculate(num1, num2)
  result = num1 + num2
  RETURN result
END

SAY "Calling procedure without trace:"
answer = Calculate(15, 25)
SAY "Answer: " || answer
SAY ""

SAY "Calling procedure with trace:"
TRACE ON
answer = Calculate(100, 50)
SAY "Answer: " || answer
TRACE OFF
SAY ""

/* Example 4: Debugging complex logic */
SAY "\x1b[33mExample 4: Debugging complex logic\x1b[0m"
SAY "Finding maximum value with trace:"

TRACE ON
values = "5 12 8 15 3"
maxVal = 0
currentPos = 1

DO i = 1 TO 5
  num = WORD(values, i)
  IF num > maxVal THEN maxVal = num
END

SAY "Maximum value: " || maxVal
TRACE OFF
SAY ""

/* Example 5: Conditional tracing */
SAY "\x1b[33mExample 5: Conditional tracing\x1b[0m"
debugMode = 1

IF debugMode = 1 THEN TRACE ON

SAY "Processing items..."
DO item = 1 TO 3
  SAY "  Processing item " || item
  status = "OK"
  IF item = 2 THEN status = "WARN"
END

IF debugMode = 1 THEN TRACE OFF
SAY ""

/* Example 6: Error detection with trace */
SAY "\x1b[33mExample 6: Error detection\x1b[0m"
SAY "Testing error conditions with trace:"

TRACE ON
testValue = 10
IF testValue > 5 THEN DO
  SAY "Value is greater than 5"
  result = testValue * 2
  SAY "Doubled value: " || result
END
TRACE OFF
SAY ""

/* Example 7: Performance monitoring */
SAY "\x1b[33mExample 7: Performance monitoring\x1b[0m"
SAY "Monitoring loop performance:"

startTime = TIME('S')
TRACE ON

operations = 0
DO i = 1 TO 10
  operations = operations + 1
END

TRACE OFF
endTime = TIME('S')
elapsed = endTime - startTime

SAY "Operations completed: " || operations
SAY "Time elapsed: " || elapsed || " seconds"
SAY ""

/* Example 8: Nested execution tracing */
SAY "\x1b[33mExample 8: Nested execution\x1b[0m"

PROCEDURE Level1()
  SAY "→ Entering Level1"
  CALL Level2
  SAY "← Leaving Level1"
  RETURN
END

PROCEDURE Level2()
  SAY "  → Entering Level2"
  CALL Level3
  SAY "  ← Leaving Level2"
  RETURN
END

PROCEDURE Level3()
  SAY "    → Entering Level3"
  SAY "    → Processing..."
  SAY "    ← Leaving Level3"
  RETURN
END

SAY "Tracing nested procedure calls:"
TRACE ON
CALL Level1
TRACE OFF
SAY ""

/* Example 9: Variable inspection */
SAY "\x1b[33mExample 9: Variable state inspection\x1b[0m"
SAY "Inspecting variable changes:"

TRACE ON
username = BBSGETUSERNAME()
userLevel = BBSGETUSERLEVEL()
conference = BBSGETCONF()
TRACE OFF

SAY "Current state:"
SAY "  Username: " || username
SAY "  Level: " || userLevel
SAY "  Conference: " || conference
SAY ""

/* Example 10: OPTIONS variations */
SAY "\x1b[33mExample 10: Various OPTIONS settings\x1b[0m"
SAY "Testing different OPTIONS:"

OPTIONS RESULTS
SAY "→ RESULTS mode enabled"
testFunc = UPPER("hello")
SAY "  Function result: " || testFunc

OPTIONS NORESULTS
SAY "→ NORESULTS mode enabled"
testFunc2 = LOWER("WORLD")
SAY "  Function result: " || testFunc2
SAY ""

SAY "\x1b[32m✓ TRACE and OPTIONS demo completed!\x1b[0m"
SAY ""
SAY "TRACE/OPTIONS features:"
SAY "  • TRACE ON/OFF for debugging"
SAY "  • Line-by-line execution tracing"
SAY "  • Procedure call tracing"
SAY "  • Variable state inspection"
SAY "  • Performance monitoring"
SAY "  • Conditional debugging"
SAY "  • OPTIONS for behavior control"
SAY ""
SAY "Debugging workflow:"
SAY "  1. Enable TRACE before suspicious code"
SAY "  2. Run script and observe execution"
SAY "  3. Identify problem lines"
SAY "  4. Disable TRACE after debugging"
SAY "  5. Use OPTIONS for fine-tuning"
