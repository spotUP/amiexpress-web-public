/*   Nasty Wall 1.2  By )/ideo /\/asty +44(0)61 945-8603 UK */

Start:
parse arg node
options results
nodeid = "AERexxControl"node
address value nodeid
signal on error;signal on syntax;signal on ioerr

/*  -[ Setup Path to Wall Files ]- */
Nastypath="DOORS:Nasty_Doors/"

/*  -[ Setup External BBS Adder Lister ]- */
RXCommand="SYS:RexxC/Rx"
BBSACC=255
BBSPLUG="BBS Lister/Adder"
BBSREXX="DOORS:ADDBBS/Addbbs_Wall.Rexx"

/* Some system Variables */

cls=d2c(12)
ScreenLen=GetVar(122)
user="[36m"getvar(100)"[0m"
sysop="[36m"getvar(12)"[0m"
access=getvar(105)

call myroutine
Transmit ""

quit:
shutdown
exit

syntax:
ioerr:
error:
a=SIGL;transmit "Error in line "||a
transmit "Please notify "||sysop
putvar("C",136)
shutdown
exit

putvar: procedure
parse arg string1,string2
 PUTUSTR string1
 PUTUSER string2
return result

getvar: procedure
parse arg string1
 getuser string1
return result

MyRoutine:
Call ShowWall
SENDSTRING "[32mWanna Write some /\/asty Text [33m([0my/[36mN[33m)[0m?[0m ";GETCHAR ; Answer=Upper(Result)
IF Answer ~= 'Y' THEN DO ; TRANSMIT D2C(13)"[0m["User"[0m][35m Failed to Foul the Wall             " ; Return ; END
RECEIVE 57
TRANSMIT d2c(13)"[33mWrite some Abuse [32m([35mTry to make if Funny EH![32m)[0m"
QUERY "[36m"left(getvar(100),20)"[35m >[32m" ; NastyLine=TRIM(Result)
if index(NastyLine,'0') ~= 0 then Signal NOBBS;if index(NastyLine,'1') ~= 0 then Signal NOBBS
if index(NastyLine,'2') ~= 0 then Signal NOBBS;if index(NastyLine,'3') ~= 0 then Signal NOBBS
if index(NastyLine,'4') ~= 0 then Signal NOBBS;if index(NastyLine,'5') ~= 0 then Signal NOBBS
if index(NastyLine,'6') ~= 0 then Signal NOBBS;if index(NastyLine,'7') ~= 0 then Signal NOBBS
if index(NastyLine,'8') ~= 0 then Signal NOBBS;if index(NastyLine,'9') ~= 0 then Signal NOBBS

OKFORWALL:
IF NastyLine='' THEN do ; Transmit d2c(11)||user" "left("Failed to write anything interesting",80)d2c(11)d2c(11) ; Return ;end
else do
 WordP=pos(word(nastyline,1),Nastyline)-1
 if wordp=0 then do
 NastyLine="[35m|[36m"left(getvar(100),20)" [35m|[32m"strip(NastyLine)
 end
 else do
 NastyLine="[35m|[36m"left(getvar(100),20)" [35m|[32m["wordp"C"strip(NastyLine)
 end
end

Sendmessage "[22;1H[4m[44m[33mSaving."
End=1
IF Open(WF,NastyPath"VN_Wall.txt") ; THEN DO ; DO End=1 TO 18 UNTIL EOF(WF)
Sendmessage ".." ; NastyLine.End=READLN(WF) ; END ; CLOSE(WF) ; END ; NastyLine.End=NastyLine

IF ~ Open(WF,NastyPath"VN_Wall.txt",'W') THEN Return
IF End<=18 THEN Start=1 ; ELSE Start=2 ; DO Count=Start TO End
 WRITELN(WF,NastyLine.Count) ; Sendmessage ".." ; END
CLOSE(WF) ; Call ShowWall ; Return

ShowWall:
putvar(200,122)
sendstring "[0m"CLS
if exists(NastyPath"VN_Wall.hdr") then do
 PutVar(NastyPath"VN_Wall.hdr",8)
 loopvalue=20
 do until loopvalue=0
  sendmessage "["loopvalue";1H"
  loopvalue=loopvalue-1
 end
End
loopvalue=0
do until loopvalue=14
 Transmit "                       "
 loopvalue=loopvalue+1
end
Transmit "  [4m[33m                   [24m[0m  "
Transmit "  [44m                   [40m[0m  "
Transmit "  [44m [33m/\/asty\x/all 1.2 [40m[0m  "
Transmit "  [44m        [33mby         [40m[0m  "
Transmit "  [44m  [33m)/ideo /\/asty   [40m[0m  "
Transmit "  [4m[33m[44m                   [24m[40m[0m  "
loopvalue=20
do until loopvalue=0
 sendmessage "["loopvalue";1H"
 loopvalue=loopvalue-1
end
sendstring "[1;1H"
Transmit "[4m[33m                                                                                "
Transmit "[33m[44m       User                       Scribbled This Mess on the Wall               [0m"
PutVar(NastyPath"VN_Wall.txt",8)
SendString "[21;1H"
Transmit "[4m[33m                                                                                "
Transmit "[44m   )/ideo /\/asty   G.B.H. +44(0)61 945 8603    LøøNS     /\/asty \x/all v1.2   [0m"
Transmit ""
putvar(1,526)
putvar(ScreenLen,122)
RETURN

NOBBS:
SendMessage "Is this a BBS PLUG (Y/n)?"
getchar ; Key=Upper(Result)
if Key=Y then Signal BBSPLUG
Signal OKForWall

BBSPLUG:
Transmit ""
if access<BBSACC then do
 Transmit "[36mYou are NOT cleared for BBS Lister/Adder."
 Transmit "[35mBBSPLUGS are not allowed on this wall."
 Sendmessage "[32mSo Please do not enter one. Thanks- (Pause)"
 getchar
 Signal MyRoutine
end
If Exists(bbsrexx) then do
 TransMit "[0mNO BBS PLUGS on this Wall Diverting to "BBSPLUG" please wait"
 address command (RXCommand" "bbsrexx" "node)
end
Else Do
 Sendmessage "[0NO BBS PLUGS on This Wall Use "BBSPLUG" Instead -Thanks- (Pause)"
 getchar
end
Signal MyRoutine

$VER: NastyWall 1.2 Wednesday 30-Mar-94
