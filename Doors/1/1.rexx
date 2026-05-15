/* Account Edit PW Protection 1.0 By: Skalman, Valhalla! +46-(0)54-566657 */

parse arg node
options results
nodeid = "AERexxControl"node

tr=transmit;hk=getchar;pm=prompt;sendstring=sendmessage;ss=sendstring;gu=getuser
address value nodeid

if ~Exists("Doors:1/1-Env")then
  Do
    tr ''
    tr '[1;36m1-Env [0;34mNOT FOUND!!![0m Please Notify Sysop!!!'
    tr ''
    Shutdown
    Exit
  End

DT_NAME       = 100
RETURNCOMMAND = 136
gu DT_NAME
USER = result

If exists("Doors:1/1-Env")then
  If open('env-file',"Doors:1/1-env","r") then do
     Do Until eof('env-file')
       Interpret ReadLN('env-file')
     End
  Close ('env-file')
  End
      
tr ''
   ss "Enter Account Edit Password: "
   PASS = ""
   POS = 1
   Do Until PASSWORD = ""
    HK; PASSWORD = result
    If PASSWORD = "" then
       Do
         If POS > 1 then
           Do
             ss ""
             ss " "
             ss ""
             POS = POS - 1
             PASS = Left(PASS,(POS-1))
           End
           Else PASS = ""
       End
       If PASSWORD ~= "" & PASSWORD ~= "" then
         Do
           ss "?"
           PASS = PASS""PASSWORD
           POS = POS + 1
         End
   End
 
tr ''

  If PASS ~= Account_Password then 
     Do 
       tr ''
       tr 'Password failed'
       tr ''
       if exists("BBS:Node"node"/CallersLog") then
         Do
           Open('appendfile',"BBS:Node"node"/CallersLog",'A')  
           WriteLN('appendfile',"	>"USER" tried -> "PASS" <- to enter Account Edit at "time('C'))
           Close('appendfile')
         End
       SHUTDOWN
       EXIT
     End
     Else Do
            Command = "1";call putit;end

putvar: procedure
parse arg string1,string2
 PUTUSTR string1
 PUTUSER string2
RETURN 0

putit:
putvar(Command,RETURNCOMMAND)
SHUTDOWN
EXIT
RETURN
