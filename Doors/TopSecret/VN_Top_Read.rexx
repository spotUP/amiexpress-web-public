/*=============================================================*/
/*    © By )/ideo /\/asty of Løw-Life BBS (+44-61-499-3786).   */
/*=============================================================*/

TopSecretDir="DOORS:TopSecret/MailDir/"
keyfile="bbs:user.keys" /* to find the users slot numbers */

Version="NastyTopSecret v1.0" /* Dont change this */

START:

parse arg node ; options results ; nodeid="AERexxControl"node
address value nodeid
signal on error ; signal on syntax ;signal on ioerr

User=Getvar(100)
Access=Getvar(105)
sysop=getvar(12)"."
slot=getvar(104)
Sysopkeep="YES"

Transmit d2c(12)
Transmit "Nasty Top Secret Message Reader ("version")"
Transmit ""
Sendmessage "Scanning your Private MailBox "
Call ScanMail

QUIT:
address command "Delete "TopSecretDir||slot".msg#?"
address command "Delete "TopSecretDir||slot".hdr#?"
address command "Delete "TopSecretDir||slot".Num"
Transmit "ALL Mail has now SELF Destructed"
SHUTDOWN
EXIT

syntax:
ioerr:
error:
TransMit "No TopSecret Mail Today."
SHUTDOWN
EXIT

putvar: procedure
 parse arg string1,string2
 PUTUSTR string1
 PUTUSER string2
return 0

WriteLog: procedure
 parse arg string1
 PUTUSTR string1
 PUTUSER 150
return 0

getvar: procedure
 parse arg string1
 getuser string1
 return result

loopback : procedure
parse arg string1,string2
loopvalue=0
do until loopvalue=string1
 sendmessage d2c(8)
 loopvalue=loopvalue+1
end
sendmessage "[32m"string2
return result

ScanMail:
if ~exists(TopSecretDir||slot".num") then signal Quit

call readnumber
if result=10 then return
call readheader
Signal Quit

ReadNumber:
open(number,TopSecretDir||slot".num",'R')
nummail=Readln(number)
Transmit ""
Transmit "You have "nummail" Nasty TopSecret Force ReaD message(s) Waiting"
close(number)
Return

ReadHeader:
loop=1
do until loop=nummail+1
 if Loop<1 then loop=1
 transmit ""
 open(header,TopSecretDir||slot".hdr."loop,'R')
 msgdate=Readln(header)
 msgto  =Readln(header)
 msgFrom=Readln(header)
 msgsubj=Readln(header)
 msgnumb=Readln(header)
 Close(header)
 Transmit "[32mDate   [33m:[37m "left(msgdate,33)left("[32mNumber[33m:[37m "msgnumb,53)
 Transmit "[32mTo     [33m:[37m "left(msgto,33)left("[32mRecv'd[33m:[37m Reading",53)
 Transmit "[32mFrom   [33m:[37m "left(msgFrom,33)left("[32mStatus[33m:[37m NastyTopSecret Msg",53)
 Transmit "[32mSubject[33m:[37m "left(msgsubj,79)
 PutVar(TopSecretDir||slot".msg."loop,8)
 Sendmessage "[32mMsg. Options: [33mA[36m,[33mD[36m,[33mR[36m,[33mQ[36m,[33m?[36m,[33m+[36m,[33m-[36m,[32m<[33mCR[32m> ( [37m"loop"-"nummail"[32m )[37m>:"
 getchar ; KEY=Upper(Result)
 if Key=? then Call Help
 if KEY=A then call Again
 if Key=D then call Download
 if KEY=R then call REPLYMSG
 if key=Q then Call Quitmsg
 if KEY="-" then call backamsg
/* if Key="Q" then do ; Transmit "" ; Shutdown ; Exit ; end */
/* De-Comment the above line to Enable Quit Mode            */
 loop=loop+1
 Transmit ""
end
Return

ReplyMsg:
transmit ""
Call Readuser
Return

ReadUser:
Do
Searchuser=msgFrom
 Input = Upper(Strip(searchuser));InBuf=1
 if Input ~= '' then do
 Sendmessage "Scanning for user "
 Open(User,keyfile,'R')
  Do InBuf = 1 to 1000 Until SName = ''
   SName = Translate(ReadCH(User,56),'@','0'x)
   Parse Var SName SName'@'.
   if Input = Upper(SName) then SName = ''
  end
end
if searchuser="" then return
if eof(User) then
 do
  transmit "Sorry "upper(searchuser)" does not exist!!"
  InBuf = '?' ; return
 end
Close(User)
end
Sendmessage "[35m"input"[37m is Slot Nr."InBuf
Call Readwrtnumba
Return

DOWNLOAD:
Call MakeHeader
If Upper(User)=upper(Sysop) then signal SysopDownload
TransMit ""
Sendmessage "[37mSure you wanna DownLoad [37m([35mY[37m/n[37m)"
Getchar
KEY=Upper(result)
If KEY=N then do ; Loop=Loop-1 ; Return ;End
loopback(4,"Yes[37m")
Transmit ""
Sendmessage "[36mLAST CHANCE!   ([33mEnter[36m) to Start, ([33mA[36m)bort? "
Getchar
KEY=Upper(result)
if KEY=A then do ; loopback(8,"Aborted[36m)") ; Loop=Loop-1 ; Return ; End
loopback(8,"Downloading[36m)")
Transmit "[37m"
Transmit "Prepare For Transfer."
open
PutVar("RAM:msg."loop,137)
Loop=Loop-1
Address Command "Delete "Temp"Temp."loop+1
Address Command "Delete "Temp"msg."loop+1
Return

MakeHeader:
Temp="RAM:"
Open(Makeheader,TEMP"Temp."loop,'W')
 WriteLn(Makeheader,"Date   : "left(msgdate,33)left("Number: "msgnumb,52))
 WriteLn(Makeheader,"To     : "left(msgto,33)left("Recv'd: Reading",52))
 WriteLn(Makeheader,"From   : "left(msgFrom,33)left("Status: NastyTopSecret Msg",52))
 WriteLn(Makeheader,"Subject: "left(msgsubj,79))
Close(Makeheader)
Address Command "Join "Temp"Temp."loop" "TopSecretDir||slot".msg."loop" to "TEMP"Msg."loop
address command "filenote "Temp"msg."loop" FREEDOWNLOAD"
address Command "Echo >>"Temp"msg."loop" ----( TopSecret Downloaded Message )----"
Return

SysopDownload:
if exists(TopSecretDir"S.num") then do
 open(sysnumber,TopSecretDir"S.num",'R')
 sysnummail=Readln(sysnumber)
 close(sysnumber)
end
Else do
 sysnummail=0
End
Transmit "Sysop Save"
Transmit "Saved as "TopSecretDir"S.msg."sysnummail+1
address command "copy "temp"msg."loop" to "TopSecretDir"S.msg."sysnummail+1
Address Command "Delete "Temp"Temp."loop
Address Command "Delete "Temp"msg."loop
open(sysnumber,TopSecretDir"S.num",'W')
writeln(sysnumber,sysnummail+1)
close(sysnumber)
Loop=Loop-1
Return

Deletemsg:
Transmit ""
Transmit 'All MAIL Will BE "DELETED" on "EXIT" anyway for Security Reasons'
Return

Quitmsg:
Transmit 'Option "DISABLED"'
Again:
Loop=Loop-1
Return

Help:
TransMit ""
Transmit version
Transmit ""
Transmit "[33mA[32m>[36mgain"
Transmit "[33mD[32m>[36mownload Message"
Transmit "[33mR[32m>[36meply"
Transmit "[33mQ[32m>[36muit"
Transmit "[32m<[33mCR[32m>[36mNext"
Transmit "[33m+[32m>[36mNext"
Transmit "[33m-[32m>[36mPrevious"
Sendmessage "[35mSelect ?"
getchar ; Key=Upper(Result)
Loop=Loop-1
Return

backamsg:
Loop=Loop-2
return

ReadWrtnumba:
wrtslot=inbuf
if Exists(TopSecretDir||wrtslot".num") then do
 open(WrtNumba,TopSecretDir||wrtslot".num",'R')
 Wrtwaiting=readln(WrtNumba)+1
 close(WrtNumba)
end
Else do
 WrtWaiting=1
End

Writethemsg:
Transmit ""
SendString "Quote in Reply (y/N)? "
getchar ; quote=Upper(Result)
if quote=Y then call QuoteOrg

PutVar(TopSecretDir||wrtslot".msg."wrtwaiting,9)
if Exists(TopSecretDir||wrtslot".msg."wrtwaiting) then do
Sendstring "Message Number "wrtwaiting
Transmit "...done!"

 NewWrtNumba:
 Open(WrtNumba,TopSecretDir||wrtslot".num",'W')
 writeln(WrtNumba,Wrtwaiting)
 close(WrtNumba)

 WriteHeader:
  open(Wrtheader,TopSecretDir||wrtslot".hdr."Wrtwaiting,'W')
  Writeln(Wrtheader,Date()" "Time())
  Writeln(Wrtheader,Upper(input))
  Writeln(Wrtheader,User)
  Writeln(Wrtheader,msgsubj)
  Writeln(Wrtheader,Wrtwaiting)
  Close(Wrtheader)
end
Else Do
 Transmit "Message Aborted."
End
Return

QuoteOrg:
Transmit "Yes"
Address Command "C:Copy "TopSecretDir||slot".msg."loop" to "TopSecretDir||wrtslot".msg."wrtwaiting
LastUser=SubStr("[37m ----( [35mNastyTopSecret[37m - [33m"Upper(input)"[37m )----------------------------------------",1,76) 
Address Command "Echo >>"TopSecretDir||wrtslot".msg."wrtwaiting" "LastUser
Return 
