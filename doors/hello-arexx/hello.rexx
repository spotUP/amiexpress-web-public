/* Hello World ARexx Door for AmiExpress-Web */
/* Demonstrates ARexx door capabilities with full BBS API */

/* Clear screen using BBS API */
CALL clearScreen

/* Display header using BBS API */
CALL write '\x1b[0;36m╔══════════════════════════════════════════════════════════════════════════════╗\x1b[0m'||'0d0a'x
CALL write '\x1b[0;36m║\x1b[0;33m                        AREXX DOOR - HELLO WORLD                              \x1b[0;36m║\x1b[0m'||'0d0a'x
CALL write '\x1b[0;36m║\x1b[0;32m                Demonstrates Full BBS API Capabilities                        \x1b[0;36m║\x1b[0m'||'0d0a'x
CALL write '\x1b[0;36m╚══════════════════════════════════════════════════════════════════════════════╝\x1b[0m'||'0d0a0d0a'x

/* Get user information from BBS API */
user = getUser()
CALL write '\x1b[0;36m[ User Information ]\x1b[0m'||'0d0a'x
CALL writeLine '  Username:      ' || username
CALL writeLine '  Real Name:     ' || realname
CALL writeLine '  Location:      ' || location
CALL writeLine '  Security:      ' || securityLevel
CALL writeLine ''

/* Get node and system information */
nodeNum = getNodeNumber()
sysInfo = getSystemInfo()
conf = getCurrentConferenceName()

CALL write '\x1b[0;36m[ System Information ]\x1b[0m'||'0d0a'x
CALL writeLine '  BBS Name:      AmiExpress-Web'
CALL writeLine '  Sysop:         Sysop'
CALL writeLine '  Node:          ' || nodeNum
CALL writeLine '  Conference:    ' || conf
timeOnline = getTimeOnline()
timeLeft = getTimeRemaining()
CALL writeLine '  Time Online:   ' || timeOnline || ' minutes'
CALL writeLine '  Time Left:     ' || timeLeft || ' minutes'
CALL writeLine ''

/* Interactive examples demonstrating input functions */
CALL write '\x1b[0;36m[ Interactive Demo ]\x1b[0m'||'0d0a'x

/* Example 1: getLine() - Get text input */
app = getLine('\x1b[0;33mEnter your favorite Amiga application: \x1b[0m', 255)
IF app ~= '' THEN DO
    CALL writeLine '\x1b[0;32m✓ Excellent choice! ' || app || ' is legendary!\x1b[0m'
END
ELSE DO
    CALL writeLine '\x1b[0;32m✓ AmiExpress is pretty great too!\x1b[0m'
END
CALL writeLine ''

/* Example 2: getKey() - Get single keypress */
CALL write '\x1b[0;33mTest file operations? (Y/N): \x1b[0m'
choice = getKey('')
choiceUpper = TRANSLATE(choice, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')
CALL writeLine choiceUpper

IF choiceUpper = 'Y' THEN DO
    CALL writeLine ''
    CALL write '\x1b[0;36m[ File I/O Demo ]\x1b[0m'||'0d0a'x

    /* Test file operations */
    testFile = 'test-arexx-door.txt'
    testContent = 'Hello from ARexx door!' || '0a'x || 'ARexx lives on in AmiExpress-Web!' || '0a'x

    success = writeFile(testFile, testContent)
    IF success THEN DO
        CALL writeLine '\x1b[0;32m✓ File written successfully\x1b[0m'

        readContent = readFile(testFile)
        IF readContent ~= '' THEN DO
            CALL writeLine '\x1b[0;32m✓ File read successfully:\x1b[0m'
            CALL write '\x1b[0;33m'
            CALL write readContent
            CALL writeLine '\x1b[0m'
        END
    END
    ELSE DO
        CALL writeLine '\x1b[0;31m✗ File write failed\x1b[0m'
    END
END

/* Display available API functions */
CALL writeLine ''
CALL write '\x1b[0;36m[ BBS API Functions Available ]\x1b[0m'||'0d0a'x
CALL writeLine '  ✓ write/writeLine - Output text'
CALL writeLine '  ✓ clearScreen - Clear display'
CALL writeLine '  ✓ moveCursor - Position cursor'
CALL writeLine '  ✓ getLine - Get text input'
CALL writeLine '  ✓ getKey - Get single key'
CALL writeLine '  ✓ getUser - Get user information'
CALL writeLine '  ✓ getTimeRemaining - Check time'
CALL writeLine '  ✓ readFile/writeFile - File I/O'
CALL writeLine '  ✓ listFiles - Directory listing'
CALL writeLine '  ✓ logActivity - Log actions'
CALL writeLine '  ✓ displayMCI - Process MCI codes'
CALL writeLine '  ✓ And many more!'
CALL writeLine ''

/* Log activity */
CALL logActivity 'Tested ARexx door', 'All API functions working'

/* Pause before exit */
CALL pause '0d0a'x || '\x1b[0;32mPress any key to exit...\x1b[0m'

EXIT 0
