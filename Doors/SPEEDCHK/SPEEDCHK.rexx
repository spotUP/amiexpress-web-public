/* TRANSFER SPEED CHECK V0.1 (C)1993 BY AXL */
/* ---------------------------------------- */
parse arg node
options results;signal on syntax;signal on error;signal on ioerr

nodeid = "AERexxControl"node

tr=transmit; ss=sendmessage; hk=getchar; gu=getuser
CLS  = D2C('12')
CR   = D2C('13')
LF   = D2C('10')
CRLF = CR || LF
address value nodeid
gu 100;name=result
gu 505;baud=result

VER="[44;32m  [3;32mTRANSFER SPEED CHECK[0;44;32m v1.0 (C)1993 BY AXL  [0m"
PAS="[3;32mOK "name" YOU PASSED TRANSFER CHECK[0m"
NP ="[3;32mSORRY "name" TRANSFER NOT ALLOWED BELOW 1000 CPS[0m"

/*if baud = "38400" then call OK*/
if baud = "14400" then call OK
if baud = "9600" then call OK
call main

main:
tr " "
tr VER
tr " "
tr NP
tr " "
call bye

OK:
tr " "
tr VER
tr " "
tr PAS
tr " "
PUTUSER 150
PUTUSTR 'D';PUTUSER 136
call bye

bye:
SHUTDOWN
EXIT
