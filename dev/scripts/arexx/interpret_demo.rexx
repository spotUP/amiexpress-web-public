/* AREXX Phase 4 Demo: INTERPRET Command */
/* Demonstrates dynamic code execution */

SAY "\x1b[36m=== INTERPRET Demo ===\x1b[0m"
SAY ""

/* Example 1: Basic INTERPRET */
SAY "\x1b[33mExample 1: Basic dynamic execution\x1b[0m"
dynamicCode = 'SAY "Hello from interpreted code!"'
INTERPRET dynamicCode
SAY ""

/* Example 2: Building commands dynamically */
SAY "\x1b[33mExample 2: Dynamic command building\x1b[0m"
varName = "message"
varValue = '"Dynamic variable assignment"'
command = varName || " = " || varValue
INTERPRET command
SAY "message = " || message
SAY ""

/* Example 3: Mathematical expressions */
SAY "\x1b[33mExample 3: Dynamic calculations\x1b[0m"
a = 10
b = 20
operation = "+"

mathExpr = "result = a " || operation || " b"
INTERPRET mathExpr
SAY a || " " || operation || " " || b || " = " || result

operation = "*"
mathExpr = "result = a " || operation || " b"
INTERPRET mathExpr
SAY a || " " || operation || " " || b || " = " || result
SAY ""

/* Example 4: Conditional code generation */
SAY "\x1b[33mExample 4: Conditional code generation\x1b[0m"
userLevel = 100
requiredLevel = 50

checkCode = "IF userLevel >= requiredLevel THEN SAY 'Access granted'"
INTERPRET checkCode

userLevel = 25
checkCode = "IF userLevel >= requiredLevel THEN SAY 'Access granted'; ELSE SAY 'Access denied'"
INTERPRET checkCode
SAY ""

/* Example 5: Loop generation */
SAY "\x1b[33mExample 5: Dynamic loop creation\x1b[0m"
loopCount = 3
loopVar = "i"

/* Create a simple counted loop dynamically */
DO i = 1 TO loopCount
  dynamicSay = 'SAY "Iteration " || ' || i
  INTERPRET dynamicSay
END
SAY ""

/* Example 6: Function call generation */
SAY "\x1b[33mExample 6: Dynamic function calls\x1b[0m"
funcName = "BBSGETUSERNAME"
callStr = "username = " || funcName || "()"
INTERPRET callStr
SAY "Current user: " || username
SAY ""

/* Example 7: String manipulation commands */
SAY "\x1b[33mExample 7: Dynamic string operations\x1b[0m"
text = "hello world"
operation = "UPPER"

transformCode = "result = " || operation || '("' || text || '")'
INTERPRET transformCode
SAY operation || '("' || text || '") = ' || result

operation = "LENGTH"
transformCode = "result = " || operation || '("' || text || '")'
INTERPRET transformCode
SAY operation || '("' || text || '") = ' || result
SAY ""

/* Example 8: Macro-like behavior */
SAY "\x1b[33mExample 8: Macro expansion\x1b[0m"

/* Define a macro */
logMacro = 'SAY "[" || TIME() || "] " ||'

/* Use the macro */
INTERPRET logMacro || ' "System started"'
INTERPRET logMacro || ' "User logged in"'
INTERPRET logMacro || ' "Operation completed"'
SAY ""

/* Example 9: Code template system */
SAY "\x1b[33mExample 9: Template-based code generation\x1b[0m"
template = 'SAY "\x1b[32m✓ Task <<TASKNAME>> completed\x1b[0m"'

task1 = "Database backup"
code1 = template
/* Simple replace simulation */
INTERPRET 'SAY "\x1b[32m✓ Task ' || task1 || ' completed\x1b[0m"'

task2 = "Log rotation"
INTERPRET 'SAY "\x1b[32m✓ Task ' || task2 || ' completed\x1b[0m"'
SAY ""

/* Example 10: Advanced - scripting language interpreter */
SAY "\x1b[33mExample 10: Mini-language interpreter\x1b[0m"
SAY "Interpreting mini-language commands:"

/* Simulate simple commands */
commands = "print|set x 10|show x|done"

SAY "  > print"
INTERPRET 'SAY "    Output: Hello from mini-language!"'

SAY "  > set x 10"
INTERPRET 'x = 10'

SAY "  > show x"
INTERPRET 'SAY "    x = " || x'

SAY "  > done"
SAY ""

SAY "\x1b[32m✓ INTERPRET demo completed!\x1b[0m"
SAY ""
SAY "INTERPRET capabilities shown:"
SAY "  • Dynamic code execution"
SAY "  • Command building at runtime"
SAY "  • Mathematical expression evaluation"
SAY "  • Conditional code generation"
SAY "  • Loop creation"
SAY "  • Function call generation"
SAY "  • Macro expansion"
SAY "  • Template systems"
SAY "  • Custom language interpreters"
SAY ""
SAY "\x1b[31m⚠ Note: INTERPRET has security implications\x1b[0m"
SAY "Only use with trusted code sources!"
