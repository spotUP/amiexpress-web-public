/* AREXX Phase 4 Demo: ARG Command */
/* Demonstrates command-line argument parsing */

SAY "\x1b[36m=== ARG Command Demo ===\x1b[0m"
SAY ""

/* Example 1: Basic ARG usage */
SAY "\x1b[33mExample 1: Basic argument parsing\x1b[0m"
SAY "Command-line arguments available:"
SAY "  ARGCOUNT: " || ARGCOUNT
IF ARGCOUNT > 0 THEN DO
  SAY "  ARG1: " || ARG1
  IF ARGCOUNT > 1 THEN SAY "  ARG2: " || ARG2
  IF ARGCOUNT > 2 THEN SAY "  ARG3: " || ARG3
END
ELSE DO
  SAY "  (No arguments provided)"
END
SAY ""

/* Example 2: ARG variable assignment */
SAY "\x1b[33mExample 2: ARG variable assignment\x1b[0m"
ARG command, parameter, value

SAY "Parsed arguments:"
SAY "  command: " || command
SAY "  parameter: " || parameter
SAY "  value: " || value
SAY ""

/* Example 3: Conditional processing based on arguments */
SAY "\x1b[33mExample 3: Processing arguments\x1b[0m"

IF command = "" THEN DO
  SAY "No command specified"
  SAY "Usage: script.rexx <command> [parameter] [value]"
  SAY ""
  SAY "Available commands:"
  SAY "  list     - List items"
  SAY "  add      - Add an item"
  SAY "  delete   - Delete an item"
  SAY "  help     - Show help"
END
ELSE DO
  SAY "Processing command: " || UPPER(command)

  IF UPPER(command) = "LIST" THEN DO
    SAY "→ Listing all items..."
    SAY "  Item 1"
    SAY "  Item 2"
    SAY "  Item 3"
  END

  IF UPPER(command) = "ADD" THEN DO
    SAY "→ Adding item: " || parameter
    IF parameter = "" THEN SAY "  ERROR: No item name specified"
    ELSE SAY "  ✓ Item added successfully"
  END

  IF UPPER(command) = "DELETE" THEN DO
    SAY "→ Deleting item: " || parameter
    IF parameter = "" THEN SAY "  ERROR: No item name specified"
    ELSE SAY "  ✓ Item deleted successfully"
  END

  IF UPPER(command) = "HELP" THEN DO
    SAY "→ Showing help information..."
    SAY "  This script demonstrates ARG parsing"
  END
END
SAY ""

/* Example 4: Multiple argument parsing styles */
SAY "\x1b[33mExample 4: Different parsing methods\x1b[0m"

/* Method 1: Individual variables */
ARG first, second, third
SAY "Method 1 (individual): " || first || ", " || second || ", " || third

/* Method 2: Access via ARGn variables */
SAY "Method 2 (ARGn vars): " || ARG1 || ", " || ARG2 || ", " || ARG3

/* Method 3: Count check */
SAY "Method 3 (count): Total arguments = " || ARGCOUNT
SAY ""

/* Example 5: Practical use case - User management */
SAY "\x1b[33mExample 5: User management script\x1b[0m"
ARG action, username, level

IF action ~= "" THEN DO
  SAY "Action: " || UPPER(action)

  IF UPPER(action) = "CREATE" THEN DO
    SAY "→ Creating user: " || username
    IF level ~= "" THEN SAY "  Security level: " || level
    ELSE SAY "  Default security level: 10"
  END

  IF UPPER(action) = "MODIFY" THEN DO
    SAY "→ Modifying user: " || username
    IF level ~= "" THEN SAY "  New security level: " || level
  END

  IF UPPER(action) = "DELETE" THEN DO
    SAY "→ Deleting user: " || username
    SAY "  ⚠ Are you sure? (simulation)"
  END
END
SAY ""

SAY "\x1b[32m✓ ARG demo completed!\x1b[0m"
SAY ""
SAY "ARG features demonstrated:"
SAY "  • Direct variable assignment from arguments"
SAY "  • ARGn pre-populated variables"
SAY "  • ARGCOUNT for argument counting"
SAY "  • Conditional logic based on arguments"
SAY "  • Practical command-line tool patterns"
