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

Transmit ""
Transmit "Nasty Top Secret Message Writer ("Version")"
Transmit ""
SendString "Want to Write to a Secure Totaly Private mailbox (y/N) ? "
getchar ; key=upper(result)
If key="Y" then do
 Transmit "Yes"
end
Else do
 TransMit "No"
 putvar(getvar(131),136)
 Signal Quit
end

User=Getvar(100)
Access=Getvar(105)
sysop=getvar(12)
slot=getvar(104)
Sysopkeep="YES"

Call WriteMail

QUIT:
Transmit ""
SHUTDOWN
EXIT

syntax:
ioerr:
error:
a=SIGL ; transmit "Error in line "||a ; Transmit "Please notify "||sysop
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

WriteMail:
Transmit ""
Transmit "                       [32m([33m------------------------------[32m)"
Receive 30
query "     [36mTo[33m: [32m([33mEnter[32m)[0m=[33mSysop[32m? [0m" ; sendtouser=Upper(Result)
if sendtouser="SYSOP" then sendtouser=Sysop
if sendtouser="" then sendtouser=Sysop
query "[36mSubject[33m: [32m([33mBlank[32m)[0m=[33mabort[32m? [0m" ; msgsubj=result
if msgsubj="" then signal Quit

ReadUser:
Do
Searchuser=sendtouser
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
Sendmessage "[35m"input"[31m is Slot Nr."InBuf

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
