/*---------------------------------------------------*/

parse arg node;options results;nodeid = "AERexxControl"node;address value nodeid
signal on error;signal on syntax;signal on ioerr

GETUSER 100;USERNAME=RESULT;
GETUSER 142;CHATFLAG=RESULT
GETUSER 12;SYSOP=RESULT
GETUSER 102;LOCATION=RESULT
GETUSER 105;LEVEL=RESULT
TR=TRANSMIT
/* --------------------------------------------------*/

MAIN:
TR ""
TR "pLEASE wAIT, "||USERNAME||" ..."
TR ""
TR "sYSOP iS oN tHE wAY!!!"
TR ""
call putvar("cON: wHICH sYSOP ??? (1), (2) or (3) ",10)
getchar
RES=RESULT
tr ""                      
SELECT
 WHEN RES="2" THEN CALL SYSOP2
 WHEN RES="3" THEN CALL SYSOP3
 OTHERWISE CALL SYSOP1
 END
Tr "[35m"||SYSOP||"[32m iS nOW cHATTING wITH: [35m"||USERNAME||"[32m fROM [35m"||LOCATION||"[32m sECLEVEL: [35m"||LEVEL
tr " "
tr "[34m=========================================================[33mmUI-sYSOP[34m==[37mby[34m=[37mfOX[34m=[37m/[34m=[37mTT[34m=[0m"
Call Quit

SYSOP1:
IF OPEN("INFO","DOORS:MUICHAT/STARTCHAT1.TXT","R") = 0 THEN DO
 call putvar("DOORS:MUICHAT/STARTCHAT1.TXT DOESN`T EXIST!  ",10)
 RETURN
 END 
Close(INFO)
call putvar("DOORS:MUICHAT/STARTCHAT1.TXT",8)
Call LOG
return

SYSOP2:
IF OPEN("INFO","DOORS:MUICHAT/STARTCHAT2.TXT","R") = 0 THEN DO
 call putvar("DOORS:MUICHAT/STARTCHAT2.TXT DOESN`T EXIST!  ",10)
 RETURN                                                       
 END
Close(INFO)
call putvar("DOORS:MUICHAT/STARTCHAT2.TXT",8)
Call LOG
return

SYSOP3:
IF OPEN("INFO","DOORS:MUICHAT/STARTCHAT3.TXT","R") = 0 THEN DO
 call putvar("DOORS:MUICHAT/STARTCHAT3.TXT DOESN`T EXIST!  ",10)
 RETURN                                                       
 END
Close(INFO)
call putvar("DOORS:MUICHAT/STARTCHAT3.TXT",8)
Call LOG
return


LOG:
 IF OPEN("LOG","BBS:node"node"/callerslog","A") = 0 THEN OPEN("LOG","BBS:node"node"/callerslog","W") 
 WRITELN("LOG","cHAT aNSWERED tO  [35m"USERNAME" [0muSING mUICHAT bY fOX/TT") 
 CLOSE (LOG)
RETURN

/* --------------------------------------------------*/
putvar:         
 parse arg s1,s2
 PUTUSTR s1     
 PUTUSER s2     
return

QUIT:
SHUTDOWN;EXIT
ERROR:;TRANSMIT 'ERROR..';SHUTDOWN;EXIT;IOERR:;TRANSMIT 'IOERR..';SHUTDOWN;EXIT;SYNTAX:;TRANSMIT 'SYNTAX.';SHUTDOWN;EXIT
