/*=============================================================*/
/*    © By )/ideo /\/asty of Løw-Life BBS (+44-61-499-3786).   */
/*=============================================================*/
START:
parse arg node
options results
nodeid = "AERexxControl"node
address value nodeid
signal on error;signal on syntax;signal on ioerr

TEXTACCESS=200
ZOOMDIR="RAM:"
BBSPLUG="BBS:Fcheck/Low-Life.flist"

Call SetupVariables
Call MyRoutine
TransMit ""

QUIT:
SHUTDOWN
EXIT

syntax:
ioerr:
error:
a=SIGL;transmit "Error in line "||a
Transmit "Please notify "||sysop
SHUTDOWN
EXIT

/* Procedures */

putvar: procedure
parse arg string1,string2
 PUTUSTR string1
 PUTUSER string2
return result

getvar: procedure
parse arg string1
 getuser string1
return result

SetUpVariables:
CLS=d2c(12)

USER=GETVAR(100)
CONFLOCAL=GETVAR(127)
ACCESS=GETVAR(105)

/* Now Count Dirs */
Startdir=1

do until dirfound=1
 if ~exists(CONFLOCAL"Dir"StartDir) then do ; EndDir=StartDir-1 ; dirfound=1 ; signal out ; end
 StartDir=StartDir+1 
end
out:
TransMit "Number of dirs in this Conference : "EndDir
Return

MyRoutine:

PutVar(CONFLOCAL'FileHelp.txt',8)

ASK:
Transmit""
Sendmessage "[36mDirectories: ([33m1[36m-[33m"EndDir"[36m), ([33mA[36mll), ([33mU[36mpload), ([33mH[36mold), ([33mE[36mxit)? [33m"
Getchar
KEY=Upper(result)
Sendmessage d2c(8)||d2c(8)||d2c(8)||d2c(8)||d2c(8)||d2c(8)||d2c(8)
If KEY=U then do ; dirnumber=EndDir ; Signal UpLoad ; end
If KEY=H then Signal HOLD
IF KEY=? then Signal Menu
If KEY=E then Signal Exit
If KEY=Q then Signal Exit
If Key=A then Signal ALL
If KEY=d2c(13) then Signal Exit
If Exists(CONFLOCAL"Dir"KEY) then do ; dirnumber=KEY ; Signal UpLoad ; end
Sendmessage "[33mOption "key" Not Available[36m)"
Signal ASK

MENU:
Sendmessage "[33mMenu[36m)"
Signal MyRoutine

EXIT:
Sendmessage "[33mExit[36m)"
Return

UpLoad:
if Dirnumber=EndDir then do ; Sendmessage "[33mUpload[36m)" ; end
Else do ; Sendmessage "[33mDir Nr."DirNumber"[36m)" ; end
FILE="DIR"DirNumber
Signal Downloadfile

HOLD:
Sendmessage "[33mHold[36m)"
If ACCESS<230 then Signal NoWay
If ACCESS>229 then Signal HOLDOK
Return

NOWAY:
transmit ""
TransMit "Not Cleared for Hold."
Signal ASK

HOLDOK:
FILE="HOLD/HELD"
Signal Downloadfile
Return

DOWNLOADFILE:
TransMit ""
Sendmessage "[37mFile May Be LARGE wanna DownLoad [31m([35mY[0m/n[31m)"
Getchar
KEY=Upper(result)
If KEY=N then Signal TEXTMODE
transmit d2c(8)||d2c(8)||d2c(8)||d2c(8)||"[32mYes[31m"d2c(10)
Sendmessage "[36mLAST CHANCE!   ([33mEnter[36m) to Start, ([33mA[36m)bort? "
Getchar
KEY=Upper(result)
if KEY=A then do ; Sendmessage d2c(8)||d2c(8)||d2c(8)||d2c(8)||d2c(8)||d2c(8)||d2c(8)||d2c(8)"[33mAborted[36m)" ; Signal ASK ; End
Transmit "[37m"
Transmit "¥ep Kewl Option. Prepare For Transfer."
Loopdir="0"
Call SendFile
Signal ASK

TEXTMODE:
If ACCESS<TEXTACCESS then Signal NoTEXTACCESS
transmit d2c(8)||d2c(8)||d2c(8)||d2c(8)||"[32mNo[31m) "d2c(10)
TransMit "Thats not the Option I Would Pick Try to D/l in future. its FREE"
Transmit ""
PutVar(CONFLOCAL||FILE,8)
Signal ASK

NOTEXTACCESS:
transmit d2c(8)||d2c(8)||d2c(8)||d2c(8)||"[32mText Disabled[31m) "d2c(10)
Transmit "[37mText Mode is Disabled Download and Read Offline instead."
Signal DOWNLOADFILE

ALL:
Sendmessage "[33mALL[36m) "
LoopDir=EndDir
LoopEnd=0
transmit ""
Transmit "[37mALL OPTION! doesnt support online reading Get Ready to Download"d2c(10)
Sendmessage "[36mLAST CHANCE!   ([33mEnter[36m) to Start, ([33mA[36m)bort? "
Getchar
KEY=Upper(result)
if KEY=A then do ; Sendmessage d2c(8)||d2c(8)||d2c(8)||d2c(8)||d2c(8)||d2c(8)||d2c(8)||d2c(8)"[33mAborted[36m)" ; Signal ASK ; End
do until loopend=1
 if ~exists(CONFLOCAL"Dir"LoopDir) then do ; loopend=1 ; signal ask ; end
 if exists(CONFLOCAL"Dir"LoopDir) then do
  SendString "Sending Dir"Loopdir" "
  File="Dir"Loopdir
  Call SendFile
  LoopDir=LoopDir-1
  Transmit ""
 end
End

SendFile:
/* code the date,time usernumber and dir listing numer into the filename */
date=SubStr(Date(U),4,2)||SubStr(Date(E),4,2)||SubStr(Date(U),7,2)||substr(time(),1,2)||substr(time(),4,2)||substr(Time(),7,2)
filename="NastyFList_"getvar(104)||date||loopdir

if ~Exists(BBSPLUG) then do
 Address command "Copy "CONFLOCAL||FILE" to "ZOOMDIR||Filename ; transmit "No PLUG File Added"
End
else do
 address command "Join "BBSPLUG" "CONFLOCAL||FILE" to "ZOOMDIR||Filename
end
address command "echo >>"Zoomdir||Filename" ----(End of List)----------"
address command "echo >>"Zoomdir||Filename" ----( NastyFlist By )/ideo /\/asty / LowLife II +44(0)61 499 3786 )--------"
address command "filenote "Zoomdir||Filename" FREEDOWNLOAD"
PutVar(Zoomdir||Filename,137)
address command "Delete "Zoomdir||Filename
Return
