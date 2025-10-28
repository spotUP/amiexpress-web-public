/* AREXX Phase 4 Comprehensive Demo */
/* Demonstrates all Phase 4 features in a practical BBS admin tool */

SAY "\x1b[36m╔══════════════════════════════════════════════╗\x1b[0m"
SAY "\x1b[36m║  AREXX Phase 4 - Advanced Features Demo     ║\x1b[0m"
SAY "\x1b[36m║  BBS Administration Toolkit                  ║\x1b[0m"
SAY "\x1b[36m╚══════════════════════════════════════════════╝\x1b[0m"
SAY ""

/* Parse command-line arguments */
ARG command, param1, param2

/* Show help if no arguments */
IF command = "" THEN SIGNAL ShowHelp

/* Enable trace for debugging if requested */
IF param1 = "DEBUG" THEN DO
  SAY "\x1b[33m[DEBUG MODE ENABLED]\x1b[0m"
  TRACE ON
  OPTIONS TRACE
END

/* Route to appropriate handler using SIGNAL */
IF UPPER(command) = "FILEOPS" THEN SIGNAL FileOperations
IF UPPER(command) = "SYSINFO" THEN SIGNAL SystemInfo
IF UPPER(command) = "DOORS" THEN SIGNAL DoorManagement
IF UPPER(command) = "DYNAMIC" THEN SIGNAL DynamicExecution
IF UPPER(command) = "STRESS" THEN SIGNAL StressTest
SIGNAL InvalidCommand

/* ============================================================ */
/* File Operations Demo */
/* ============================================================ */
FileOperations:
SAY "\x1b[36m→ File Operations Module\x1b[0m"
SAY ""

/* Check disk space */
diskSpace = BBSGETDISKSPACE()
diskMB = diskSpace / 1048576
SAY "Disk space available: " || diskMB || " MB"
SAY ""

/* List available files */
SAY "File area operations:"
fileCount = BBSGETFILECOUNT(1)
SAY "  • Files in area 1: " || fileCount

areaName = BBSGETAREANAME(1)
SAY "  • Area name: " || areaName

totalAreas = BBSGETFILEAREAS()
SAY "  • Total file areas: " || totalAreas
SAY ""

/* Create a test file */
SAY "Creating test file..."
testData = "Test file created by AREXX Phase 4" || "\n"
testData = testData || "Timestamp: " || TIME() || " " || DATE() || "\n"
testData = testData || "User: " || BBSGETUSERNAME() || "\n"

success = BBSWRITEFILE("test_phase4.txt", testData)
IF success THEN DO
  SAY "  ✓ File created successfully"

  /* Read it back */
  content = BBSREADFILE("test_phase4.txt")
  SAY "  ✓ File read successfully"
  SAY "  Content preview: " || LEFT(content, 40) || "..."

  /* Rename it */
  renamed = BBSRENAMEFILE("test_phase4.txt", "test_phase4_renamed.txt")
  IF renamed THEN SAY "  ✓ File renamed successfully"

  /* Delete it */
  deleted = BBSDELETEFILE("test_phase4_renamed.txt")
  IF deleted THEN SAY "  ✓ File deleted successfully"
END
ELSE SAY "  ✗ File creation failed"

SIGNAL Finished

/* ============================================================ */
/* System Information Demo */
/* ============================================================ */
SystemInfo:
SAY "\x1b[36m→ System Information Module\x1b[0m"
SAY ""

/* Gather BBS statistics */
SAY "BBS System Report:"
SAY "  Generated: " || DATE() || " at " || TIME()
SAY ""

username = BBSGETUSERNAME()
userLevel = BBSGETUSERLEVEL()
SAY "Current User:"
SAY "  • Username: " || username
SAY "  • Security Level: " || userLevel
SAY ""

confName = BBSGETCONFNAME()
confCount = BBSGETCONFERENCES()
SAY "Conferences:"
SAY "  • Current: " || confName
SAY "  • Total: " || confCount
SAY ""

onlineCount = BBSGETONLINECOUNT()
SAY "Online Users: " || onlineCount
SAY ""

/* List available doors */
doors = BBSGETDOORLIST()
SAY "Available Doors:"
IF doors ~= "" THEN DO
  SAY "  " || doors
END
ELSE SAY "  (No doors configured)"
SAY ""

/* List available menus */
menus = BBSGETMENULIST()
SAY "Available Menus:"
IF menus ~= "" THEN DO
  SAY "  " || menus
END
ELSE SAY "  (No custom menus)"
SAY ""

/* Disk and capacity info */
diskSpace = BBSGETDISKSPACE()
diskGB = diskSpace / 1073741824
SAY "Storage:"
SAY "  • Available: " || diskGB || " GB"
SAY ""

SIGNAL Finished

/* ============================================================ */
/* Door Management Demo */
/* ============================================================ */
DoorManagement:
SAY "\x1b[36m→ Door Management Module\x1b[0m"
SAY ""

IF param1 = "" THEN DO
  SAY "Usage: advanced_phase4.rexx DOORS <doorname>"
  SIGNAL Finished
END

doorName = param1
SAY "Launching door: " || doorName
SAY ""

/* Create DOOR.SYS drop file */
SAY "Creating DOOR.SYS drop file..."
created = BBSCREATEDROPFILE(doorName, "DOOR.SYS")
IF created THEN SAY "  ✓ DOOR.SYS created"
ELSE SAY "  ✗ Failed to create DOOR.SYS"

/* Create DORINFO1.DEF drop file */
SAY "Creating DORINFO1.DEF drop file..."
created = BBSCREATEDROPFILE(doorName, "DORINFO1.DEF")
IF created THEN SAY "  ✓ DORINFO1.DEF created"
ELSE SAY "  ✗ Failed to create DORINFO1.DEF"

SAY ""
SAY "Drop files created in: data/doors/dropfiles/"
SAY ""

/* Simulate door launch */
SAY "Launching door..."
exitCode = BBSLAUNCHDOOR(doorName)
SAY "Door exit code: " || exitCode
SAY ""

SIGNAL Finished

/* ============================================================ */
/* Dynamic Code Execution Demo */
/* ============================================================ */
DynamicExecution:
SAY "\x1b[36m→ Dynamic Code Execution Module\x1b[0m"
SAY ""

/* Example 1: Dynamic BBS function calls */
SAY "Dynamic function calls:"
funcName = "BBSGETUSERNAME"
codeStr = "user = " || funcName || "()"
INTERPRET codeStr
SAY "  • Executed: " || funcName
SAY "  • Result: " || user
SAY ""

/* Example 2: Generate reports dynamically */
SAY "Generating dynamic report:"
INTERPRET 'reportTitle = "BBS Status Report"'
INTERPRET 'SAY "  Title: " || reportTitle'

fields = "username userLevel conference"
DO i = 1 TO WORDS(fields)
  field = WORD(fields, i)

  IF field = "username" THEN code = "val = BBSGETUSERNAME()"
  IF field = "userLevel" THEN code = "val = BBSGETUSERLEVEL()"
  IF field = "conference" THEN code = "val = BBSGETCONF()"

  INTERPRET code
  INTERPRET 'SAY "  ' || field || ': " || val'
END
SAY ""

/* Example 3: Advanced PARSE with positional extraction */
SAY "Advanced PARSE demonstration:"
data = "John Doe 35 Engineer New York"

PARSE VALUE data WITH firstName lastName age profession city
SAY "  Parsed data:"
SAY "    First Name: " || firstName
SAY "    Last Name: " || lastName
SAY "    Age: " || age
SAY "    Profession: " || profession
SAY "    City: " || city
SAY ""

SIGNAL Finished

/* ============================================================ */
/* Stress Test Demo - Recursion Limits */
/* ============================================================ */
StressTest:
SAY "\x1b[36m→ Stress Test Module (Recursion)\x1b[0m"
SAY ""

PROCEDURE Factorial(n)
  IF n <= 1 THEN RETURN 1
  prev = Factorial(n - 1)
  RETURN n * prev
END

PROCEDURE Fibonacci(n)
  IF n <= 1 THEN RETURN n
  RETURN Fibonacci(n - 1) + Fibonacci(n - 2)
END

SAY "Testing recursion limits..."
SAY ""

/* Test factorial */
SAY "Factorial tests:"
DO i = 1 TO 5
  result = Factorial(i)
  SAY "  • " || i || "! = " || result
END
SAY ""

/* Test Fibonacci */
SAY "Fibonacci tests:"
DO i = 0 TO 10
  result = Fibonacci(i)
  SAY "  • Fib(" || i || ") = " || result
END
SAY ""

SAY "Note: Recursion depth limit is 100 levels"
SAY "(Prevents stack overflow attacks)"
SAY ""

SIGNAL Finished

/* ============================================================ */
/* Helper Sections */
/* ============================================================ */
ShowHelp:
SAY "Usage: advanced_phase4.rexx <command> [parameters]"
SAY ""
SAY "Available commands:"
SAY "  FILEOPS    - Demonstrate file operations"
SAY "  SYSINFO    - Show system information"
SAY "  DOORS <name> - Door management and drop files"
SAY "  DYNAMIC    - Dynamic code execution"
SAY "  STRESS     - Test recursion limits"
SAY ""
SAY "Options:"
SAY "  DEBUG      - Enable trace mode (add as parameter)"
SAY ""
SAY "Examples:"
SAY "  advanced_phase4.rexx FILEOPS"
SAY "  advanced_phase4.rexx SYSINFO DEBUG"
SAY "  advanced_phase4.rexx DOORS TradeWars"
SIGNAL Finished

InvalidCommand:
SAY "\x1b[31m✗ Invalid command: " || command || "\x1b[0m"
SAY "Use 'advanced_phase4.rexx' with no arguments to see help"
SIGNAL Finished

Finished:
SAY ""
SAY "\x1b[32m╔══════════════════════════════════════════════╗\x1b[0m"
SAY "\x1b[32m║  Phase 4 Demo Complete                       ║\x1b[0m"
SAY "\x1b[32m╚══════════════════════════════════════════════╝\x1b[0m"
SAY ""
SAY "Phase 4 Features Demonstrated:"
SAY "  ✓ SIGNAL (goto/labels)"
SAY "  ✓ ARG (command-line args)"
SAY "  ✓ INTERPRET (dynamic execution)"
SAY "  ✓ OPTIONS & TRACE (debugging)"
SAY "  ✓ Advanced PARSE (positional)"
SAY "  ✓ Recursion depth limits"
SAY "  ✓ File management (delete/rename)"
SAY "  ✓ System info (disk/doors/menus)"
SAY "  ✓ Door drop files (DOOR.SYS/DORINFO1.DEF)"
