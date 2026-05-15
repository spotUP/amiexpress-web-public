/*  AVT-TIME&DATE  by 2fAST/aVT  */
/*  Releasedate v1.OO: 28-10-94  */

PARSE ARG Node
OPTIONS RESULTS
ADDRESS VALUE 'AERexxControl'Node

SIGNAL ON Error
SIGNAL ON Syntax
SIGNAL ON IOErr

CR=D2C(13)
CLS=D2C(12)
BEEP=D2C(7)


GU=GETUSER
TR=TRANSMIT
SS=SENDMESSAGE
ST=SENDSTRING

/* INCLUDES */
GU 11;bbsname=RESULT
GU 12;sysop=RESULT
GU 143;time=RESULT

TR CLS
TR "  [0;44m                                        _________                          [0m"
TR "  [0;44m     aVT's   _______  __ ._______     __\       /__ ________               [0m"
TR "  [0;44m   _______  /     / \/  \|   .  // a /         /   \\___    |______   __   [0m"
TR "  [0;44m  /___    |/    //      \\   __/_. n \    \   /    \\./    ||  .  // _\/_  [0m"
TR "  [0;44m    /    ||_____/___ \____\______j d  \______/_____.::._____|  __/_. \/\/  [0m"
TR "  [0;44m   /______| [37mV1.O[0;44m - [33mby 2fAST/aVT[0;44m -      [37mPLEASE REGISTER[0;44m· [35m÷2F÷[0;44ml_______j      [0m";TR
TR CENTER("...PRESENT TIME ^ DATE AT...",80);TR
TR CENTER("[32m"bbsname"[0m",80+9);TR
TR CENTER("wHICH iS mANAGED bY: [33m"sysop"[0m",80+9);TR
TR CENTER("[35m"time"[0m",80+9);TR

PUTUSTR "~SP_ "
PUTUSER 507

PUTUSTR ""
PUTUSER 136
CALL BYE

/* END PART */

ERROR:
 TR "[37m"
 TR "Error in Line #"Sigl" : exiting ..."
 TR ERRORTEXT(Sigl)
CALL BYE

SYNTAX:
 TR "[37m"
 TR "Syntax Error in Line #"Sigl" : exiting ..."
 TR ERRORTEXT(Sigl)
CALL BYE

IOERR:
 TR "[37m"
 TR "I/O Error in Line #"Sigl" : exiting ..."
 TR ERRORTEXT(Sigl)
CALL BYE

BYE:
 TR "[0m"
 SHUTDOWN
 EXIT
END
