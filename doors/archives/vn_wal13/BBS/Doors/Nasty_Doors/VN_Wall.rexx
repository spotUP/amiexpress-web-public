/*   NastyWall 1.3  By )/ideo /\/asty G.B.H. +44(0)61 945-8603 UK  */
/*            For updates Call G.B.H. *3Nodes RiNGDoWN*            */
/*                Running /1miXpress 3.37 A3000/30                 */

Start:
parse arg node
options results
nodeid = "AERexxControl"node
address value nodeid
signal on error;signal on syntax;signal on ioerr

/*  -[ Setup variables ]- */
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
call killwrite
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

WriteLog: procedure
 parse arg string1
 PUTUSTR string1
 PUTUSER 150
return 0

MyRoutine:
Call ShowWall
SENDSTRING "[32mWanna Write some /\/asty Text [33m([0my/[36mN[33m)[0m?[0m ";GETCHAR ; Answer=Upper(Result)
IF Answer ~= 'Y' THEN DO ; TRANSMIT D2C(13)"[0m["User"[0m][35m Failed to Foul the Wall             " ; Return ; END
RECEIVE 57
SendString "[23;1H"
Sendstring left(" ",79)
SendString "[23;1H"
call checkwrite
if foul=1 then do;signal myroutine;end
Call StopWrite
QUERY "[36m"left(getvar(100),20)"[35m >[32m" ; NastyLine=TRIM(Result)
if index(NastyLine,'0') ~= 0 then Signal NOBBS;if index(NastyLine,'1') ~= 0 then Signal NOBBS
if index(NastyLine,'2') ~= 0 then Signal NOBBS;if index(NastyLine,'3') ~= 0 then Signal NOBBS
if index(NastyLine,'4') ~= 0 then Signal NOBBS;if index(NastyLine,'5') ~= 0 then Signal NOBBS
if index(NastyLine,'6') ~= 0 then Signal NOBBS;if index(NastyLine,'7') ~= 0 then Signal NOBBS
if index(NastyLine,'8') ~= 0 then Signal NOBBS;if index(NastyLine,'9') ~= 0 then Signal NOBBS

OKFORWALL:
IF NastyLine='' THEN do ; Transmit d2c(11)||user" "left("Failed to write anything interesting",80)d2c(11)d2c(11) ; Return ;end
else do
 Call Cans
 call anonymous
 call killwrite
 WordP=pos(word(nastyline,1),Nastyline)-1
 if wordp=0 then do
 NastyLine="[35m|[36m"left(usr,20)" [35m|"colour||strip(NastyLine)
 end
 else do
 NastyLine="[35m|[36m"left(usr,20)" [35m|"colour"["wordp"C"strip(NastyLine)
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
Transmit "  [44m [33m/\/asty\x/all 1.3 [40m[0m  "
Transmit "  [44m        [33mby         [40m[0m  "
Transmit "  [44m  [33m)/ideo /\/asty   [40m[0m  "
Transmit "  [4m[33m[44m                   [24m[40m[0m  "
loopvalue=20
do until loopvalue=0
 sendmessage "["loopvalue";1H"
 loopvalue=loopvalue-1
end
call topbanner
PutVar(NastyPath"VN_Wall.txt",8)
call bottombanner
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

Cans:
putvar(200,122)
call topbanner
PutVar(NastyPath"VN_Wall.Cans",8)
putvar(1,526)
putvar(ScreenLen,122)
call bottombanner
SendString "[23;1H"
Sendstring left(" ",79)
SendString "[23;1H"
Sendstring "[36m"left(getvar(100),20)"[33m Chose your spray for grafiti [35m > [0m"
getchar;can=Result

if can=1 then do;sendstring "RED";colour="[3"can"m";Return;end
if can=2 then do;sendstring "Green";colour="[3"can"m";Return;end
if can=3 then do;sendstring "Yellow";colour="[3"can"m";Return;end
if can=4 then do;sendstring "Blue";colour="[3"can"m";Return;end
if can=5 then do;sendstring "Purple";colour="[3"can"m";Return;end
if can=6 then do;sendstring "Cyan";colour="[3"can"m";Return;end
if can=7 then do;sendstring "White";colour="[3"can"m";Return;end
colour="[32m";Sendstring "Green"
Return

anonymous:
SendString "[23;1H"
Sendstring left(" ",79)
SendString "[23;1H"
Sendstring "[36m"left(getvar(100),20)"[35m > Want to remain anonymous (y/N) [32m";getchar
usr=Getvar(100)
if Upper(Result)="Y" then do
 sendstring "anonymous"
 usr="* anonymous *"
 Call writelog "	anonymous >"NastyLine"<"d2c(10)
end
Return

topbanner:
sendstring "[1;1H"
Transmit "[4m[33m                                                                                "
Transmit "[33m[44m       User                       Scribbled This Mess on the Wall               [0m"
return

bottombanner:
SendString "[21;1H"
Transmit "[4m[33m                                                                                "
Transmit "[44m   NastyWall v1.3                 G.B.H. +44(0)61 945 8603 *3 Nodes RiNGDOWN*   [0m"
return

StopWrite:
Address command ("Echo >ENV:Nasty_Wall Writing")
Return

KillWrite:
if exists("ENV:Nasty_Wall") then do
 Address command ("Delete ENV:Nasty_Wall")
end
Return

CheckWrite:
foul=0
if exists("ENV:Nasty_Wall") then do
 foul=1
 sendstring "Somebody else is fouling the wall -(Press any key)-"
 getchar
end
Return

$VER: NastyWall 1.3 4th May 1994
