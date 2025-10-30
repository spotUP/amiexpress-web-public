/*=============================================================*/
/*    © By )/ideo /\/asty of Løw-Life BBS (+44-61-499-3786).   */
/*=============================================================*/
KeepBackup="YES"
SHOWUSER="YES"
BLAME=230
START:
parse arg node
options results
nodeid="AERexxControl"node
address value nodeid
signal on error
signal on syntax
signal on ioerr
Intercept=SubStr("[0m ----( [35mNastyEdit v1.1[0m - [33mIntercepted Msg[0m )----------------------------------------",1,76) 
User=Getvar(100)
Conf=Getvar(126)
ConfDir=Getvar(127)
Access=Getvar(105)
sysop=getvar(12)
Call ASK
TransMit "Quit"
QUIT:
SHUTDOWN
EXIT
syntax:
ioerr:
error:
a=SIGL
transmit "Error in line "||a
Transmit "Please notify "||sysop
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
ASK:
if getvar(100)=sysop then do 
sendmessage "[33mM[32m)[36message File,  [33mA[32m)[36mny File,  [33mH[32m)[36melp,  [33mQ[32m)[36muit [33m: " 
end
Else do 
sendmessage "[33mM[32m)[36message File,  [33mH[32m)[36melp,  [33mQ[32m)[36muit [33m: " 
end
Getchar 
IN=Upper(Result)
If IN="M" then CALL MESSAGE
If IN="A" then CALL ANYFILE
If IN="H" then CALL HELP
If IN="Q" then Return
If IN="*" then CALL PASSBLAME
transmit ""
Signal ASK
HELP:
SendMessage "Help[0m"
IF EXISTS('DOORS:OnLineDocs/EDITFile.doc') THEN PutVar('DOORS:OnLineDocs/EDITFile.doc',8)
If ~EXISTS('DOORS:OnLineDocs/EDITFile.doc') THEN transmit "[0mNo help file found!"
RETURN
MESSAGE:
SendMessage "Edit Message"
transmit ""
Query "[32mWhats the msg number to EDIT! [33m: "
Number=Result
If Number="" then Signal DUMBINPUT
If ~EXISTS(CONFDIR"MsgBase/"NUMBER) THEN do
SendMessage "[0mMessage Not Found"
RETURN
end
Else Do
Address command "C:Copy "CONFDIR"MsgBase/"number" to "CONFDIR"MsgBase/"number".bak"
Transmit "[0mEditing Message Hangon!"
Address Command "Echo >>"CONFDIR"MsgBase/"number".bak "Intercept
PutVar(CONFDIR"MsgBase/"number".bak",9)
If ~EXISTS(CONFDIR"MsgBase/"number".bak") then Signal ASK
TransMit "Moving Edited Message nr."number" to MsgBase."
if Upper(ShowUser)="YES" then do 
Version=SubStr("[0m ----( [35mNastyEdit v1.1[0m - [33m"User"[0m )----------------------------------------",1,76) 
End 
Else do 
Version=SubStr("[0m ----( [35mNastyEdit v1.1[0m )----------------------------------------",1,76) 
End
Address Command "Echo >>"CONFDIR"MsgBase/"number".bak "VERSION
If Upper(KeepBackup)="YES" then do
if ~Exists(CONFDIR"MsgBase/"number".org") then do
Address Command "Copy "CONFDIR"MsgBase/"number" to "CONFDIR"MsgBase/"number".ORG"
end
end
Address Command "Copy "CONFDIR"MsgBase/"number".bak to "CONFDIR"MsgBase/"number
Address command "delete "CONFDIR"MsgBase/"number".bak"
WriteLog(" EDITFILE : Edit of Message "Conf" Nr."Number)
end
Return
ANYFILE:
If getvar(100)=sysop then do
SendMessage "Edit File"
transmit ""
Query "[32mWhats the File to EDIT! [33m: "
Number=Result
If Number="" then Signal DUMBINPUT
If ~EXISTS(NUMBER) THEN do
SendMessage "[0mFILE Not Found"
RETURN
end
Else Do
Address command "C:Copy "Number" to "Number".bak"
Transmit "[0mEditing "NUMBER" Hangon!"
PutVar(Number".bak",9)
If ~EXISTS(Number) then Signal ASK
TransMit "Finished editing"
Address Command "C:copy "Number".bak to "Number
WriteLog(" EDITFILE : Edit of File "Number)
end
end
Return
PASSBLAME:
If ACCESS>BLAME-1 then do
Transmit ""
Query "[0mName the User to blame for EDITING! " 
User=Result
if User="" then do 
Showuser="NO" 
end 
else do 
Showuser="YES" 
end
Return
end
else do
Return
End
DUMBINPUT:
TransMit "NO MSG / or File Specified"
Signal ASK
