/*==========================*/
/*    © By )/ideo /\/asty   */
/*==========================*/

parse arg node ; options results ; nodeid="AERexxControl"node
address value nodeid
signal on error ; signal on syntax ;signal on ioerr

TopSecretDir="DOORS:TopSecret/MailDir/"
keyfile="bbs:user.keys" /* to find the users slot numbers */
Version="[37m[[34mNastyTopSecret [33mv1.1[37m\[32mWrite.01[37m]" /* Dont change this */

If length(word(getvar(131),1))=length(getvar(131)) then Do
 SendToUser=""
End
Else Do
 SendToUser=substr(getvar(131),length(word(getvar(131),1))+2,length(getvar(131))-length(word(getvar(131),1))-1)
End

START:
Transmit ""
Transmit "[36mNasty Top Secret Message Writer "Version
if Upper(SendToUser)="EALL" then do
 putvar("E "Upper(SendToUser),136)
 Signal Quit
End
Transmit ""

SendString "[37mWant to Write to a [34m[[33mPrivate Mailbox[34m] [37m(y[32m/[35mN[37m)"
getchar ; key=upper(result)
If key="Y" then do
 Loopback(4,"Yes[37m")
 transmit ""
end
Else do
 LoopBack(4,"No[37m) ")
 If length(word(getvar(131),1))=length(getvar(131)) then Do
  putvar("E",136)
 End
 Else Do
  SendToUser=substr(getvar(131),length(word(getvar(131),1))+2,length(getvar(131))-length(word(getvar(131),1))-1)
  putvar("E "SendToUser,136)
 End
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

loopback : procedure
parse arg string1,string2
loopvalue=0
do until loopvalue=string1
 sendmessage d2c(8)
 loopvalue=loopvalue+1
end
sendmessage "[32m"string2
return result

WriteMail:
Transmit ""
Transmit "                       [32m([33m------------------------------[32m)"
Receive 30
If Sendtouser="" then do
 query "     [36mTo[33m: [32m([33mEnter[32m)[0m=[33mSysop[32m? [0m" ; sendtouser=Upper(Result)
 if sendtouser="SYSOP" then sendtouser=Sysop
 if sendtouser="" then sendtouser=Sysop
End
Else do
 if upper(sendtouser)="SYSOP" then sendtouser=Sysop
 Transmit "     [36mTo[33m: [32m([33mEnter[32m)[0m=[33mSysop[32m? [0m"sendtouser
End

ReadUser:
Do
Searchuser=sendtouser
 Input = Upper(Strip(searchuser));InBuf=1
 if Input ~= '' then do
 Sendmessage "Scanning for User "
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
SendString d2c(13)"                              "
query d2c(13)"[36mSubject[33m: [32m([33mBlank[32m)[0m=[33mabort[32m? [0m" ; msgsubj=result
if msgsubj="" then signal Quit

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
