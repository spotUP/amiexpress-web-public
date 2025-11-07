/* Hello World ARexx Door for AmiExpress-Web */

/* Clear screen and display header */
CALL output('\x1b[2J\x1b[H')
CALL output('\x1b[0;36m╔══════════════════════════════════════════════════════════════════════════════╗\x1b[0m'||'0d0a'x)
CALL output('\x1b[0;36m║                                                                              ║\x1b[0m'||'0d0a'x)
CALL output('\x1b[0;36m║\x1b[0;33m                        AREXX DOOR - HELLO WORLD                              \x1b[0;36m║\x1b[0m'||'0d0a'x)
CALL output('\x1b[0;36m║                                                                              ║\x1b[0m'||'0d0a'x)
CALL output('\x1b[0;36m╚══════════════════════════════════════════════════════════════════════════════╝\x1b[0m'||'0d0a'x)
CALL output('0d0a'x)

/* Get user information from BBS context */
username = 'Guest'
IF SYMBOL('USERNAME') = 'VAR' THEN username = username
node = 1
IF SYMBOL('NODEID') = 'VAR' THEN node = nodeId
security = 0
IF SYMBOL('SECURITYLEVEL') = 'VAR' THEN security = securityLevel
conf = 'Unknown'
IF SYMBOL('CONFERENCENAME') = 'VAR' THEN conf = conferenceName

/* Display greeting */
CALL output('\x1b[0;32m  * Hello, ' || username || '!\x1b[0m'||'0d0a'x)
CALL output('\x1b[0;32m  * You are on node ' || node || '\x1b[0m'||'0d0a'x)
CALL output('\x1b[0;32m  * Your security level is ' || security || '\x1b[0m'||'0d0a'x)
CALL output('\x1b[0;32m  * Current conference: ' || conf || '\x1b[0m'||'0d0a'x)
CALL output('0d0a'x)

/* Information about ARexx doors */
CALL output('\x1b[0;33m  This door demonstrates ARexx support in AmiExpress-Web.\x1b[0m'||'0d0a'x)
CALL output('\x1b[0;33m  ARexx doors have access to:\x1b[0m'||'0d0a'x)
CALL output('\x1b[0m    - BBS context with user/door information'||'0d0a'x)
CALL output('\x1b[0m    - output() callback for displaying text'||'0d0a'x)
CALL output('\x1b[0m    - input() callback for reading user input'||'0d0a'x)
CALL output('\x1b[0m    - Drop files (DOOR.SYS, DORINFOx.DEF)'||'0d0a'x)
CALL output('0d0a'x)

/* Interactive example */
CALL output('\x1b[0;36m  Enter your favorite Amiga application (or press Enter to skip): \x1b[0m')
response = input('')

IF response ~= '' THEN DO
    CALL output('0d0a'x)
    CALL output('\x1b[0;32m  * Excellent choice! ' || response || ' is legendary!\x1b[0m'||'0d0a'x)
END
ELSE DO
    CALL output('0d0a'x)
    CALL output('\x1b[0;33m  * AmiExpress is pretty great too!\x1b[0m'||'0d0a'x)
END

CALL output('0d0a'x)
CALL output('\x1b[0;36m  ARexx door completed successfully.\x1b[0m'||'0d0a'x)
CALL output('0d0a'x)

EXIT 0
