/* {{displayName}} */
/* Version {{version}} */
/* {{description}} */
/* Author: {{author}} */

/* Load AmiExpress SDK */
CALL LoadSDK('../../core/arexx-bridge.rexx')

/* Door configuration */
doorName = '{{displayName}}'
doorVersion = '{{version}}'
doorAuthor = '{{author}}'

/* Initialize door */
doorId = CreateDoor(doorName, doorVersion, doorAuthor)

IF doorId = 0 THEN DO
  SAY 'Error: Failed to initialize door'
  EXIT
END

/* Main program */
CALL ShowWelcome()
CALL MainMenu()
CALL Cleanup()

EXIT

/* Show welcome screen */
ShowWelcome: PROCEDURE
  CALL ClearScreen()
  CALL SendAnsi('\x1b[36m')
  SAY '╔════════════════════════╗'
  SAY '║  {{displayName}}'
  SAY '║  Version {{version}}'
  SAY '╚════════════════════════╝'
  CALL SendAnsi('\x1b[0m')
  SAY ''
  RETURN

/* Main menu */
MainMenu: PROCEDURE
  DO WHILE 1
    CALL ClearScreen()
    SAY '╔════════════════════════╗'
    SAY '║    MAIN MENU          ║'
    SAY '╚════════════════════════╝'
    SAY ''
    SAY '  S) Start Game'
    SAY '  I) Instructions'
    SAY '  Q) Quit'
    SAY ''
    SAY 'Choice: '

    choice = WaitForInput()

    SELECT
      WHEN UPPER(choice) = 'S' THEN CALL StartGame()
      WHEN UPPER(choice) = 'I' THEN CALL ShowInstructions()
      WHEN UPPER(choice) = 'Q' THEN LEAVE
      OTHERWISE
        SAY 'Invalid choice!'
        CALL Wait(1000)
    END
  END
  RETURN

/* Start game */
StartGame: PROCEDURE
  CALL ClearScreen()
  SAY '{{displayName}} - Game Mode'
  SAY ''
  SAY 'Game functionality coming soon!'
  SAY ''
  SAY 'Press any key...'
  CALL WaitForInput()
  RETURN

/* Show instructions */
ShowInstructions: PROCEDURE
  CALL ClearScreen()
  SAY 'INSTRUCTIONS'
  SAY '════════════'
  SAY ''
  SAY 'TODO: Add your game instructions here'
  SAY ''
  SAY 'Press any key...'
  CALL WaitForInput()
  RETURN

/* Cleanup */
Cleanup: PROCEDURE
  CALL DisposeDoor()
  SAY 'Thanks for playing!'
  RETURN
