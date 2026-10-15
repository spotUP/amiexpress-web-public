/* SYSOP AVAILABLE CHECK V1.1 (C)1993 BY AXL */
/* ----------------------------------------- */
parse arg node
options results
nodeid = "AERexxControl"node
tr=transmit;send=sendmessage;ss=sendstring;gu=getuser
address value nodeid
DT_SECSTATUS     = 105
BB_CHATFLAG      = 142
DT_STAMP_CTIME   = 144
VER="[44;32m  [3;32mSYSOP AVAILABLE CHECK[0;44;32m v1.1 (C)1993 BY AXL  [0m"
gu 11
BBSNAME=RESULT
gu 12
SYSOP=RESULT
gu BB_CHATFLAG
Chat=result
gu DT_STAMP_CTIME
time=result
upper='[1;36m______________________________________________________________________________[0m'
mid='                     [1;32mLocal time:[0;32m '
lower='[1;36m______________________________________________________________________________[0m'
not='                      [1;44;33m'SYSOP'[0;44;31m is[1;44;37m NOT[0;44;31m available for chat. [0;31m'
is='                        [1;44;33m'SYSOP'[0;44;31m is [1;44mavailable[0;44m for chat. [0;31m'

signal on error;signal on syntax;signal on ioerr
if chat='OFF' then call OFF
if chat='ON' then call ON
call exit

OFF:
tr VER
tr upper
tr ''
ss mid
tr time
tr ''
tr not
tr lower
tr ' '
CALL EXIT

ON:
tr VER
tr upper
tr ''
ss mid
tr time
tr ''
tr is
tr lower
tr ' '

CALL EXIT
Exit:
SHUTDOWN
EXIT
