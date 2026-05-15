/****************************************************************************/
/* $VER: WatchDog v1.0 (30.10.93) ©1993 VesuVius/N.A.S.A. Team              */
/****************************************************************************/
/*                                                                          */
/*********** NO GENERAL USER MODIFIABLE PARTS BELOW THIS COMMENT.************/
options results
parse value sourceline(2) with . . ProN ProV ProD Cr ProA gr .
parse arg node
nodeid = "AERexxControl"node
address value nodeid
getuser 12;sysop=result
tr=transmit
signal on Syntax; signal on Error; signal on IoErr
date=translate(date(e),"-","/")
if ~exists("env:nu") then call makedir("env:nu")
  if ~exists("envarc:nu") then call makedir("envarc:nu")
if ~show('L','rexxsupport.library') then call addlib('rexxsupport.library',0,-30,0)

tr ""
tr "[33m _ _                                                      _ _"
tr " _[44m|_  "ProN ProV"         "Cr ProA gr"  _|[0;33m_"
tr "[0m"
tr ""

if exists("ENV:PWFail.msg") then do
        tr ""
        tr "[32mLast password fail user writes [33m:[0m"
        tr ""
     showfile "ENV:PWFail.msg"
    call DeleteMsg("PWFail.msg")
end
else tr "No password failed....." '0a'x
tr ""

if exists("ENV:NoNewUser.msg") then do
        tr ""
        tr "[32mLast new user writes ........ [33m:[0m"
        tr ""
        showfile "ENV:NoNewUser.msg"
     call DeleteMsg("NoNewUser.msg")
 end

do forever
 if showdir("env:nnu") ="" then do
     tr "No new User....." '0a'x
     leave
   end
     tr ""
     tr "[32mNew user log on  [33m:[0m"
     call GetDirList("nnu")
     query "[ p[32mWrite msg to NewUser ...[0m [ABORT] [32m# [0m"
     nm=result                               
     if verify(nm,xrange(1,i-1)) ~=0 | nm="" then call DelUser
     putustr "env:nu/"name.nm
     putuser 9
     if ~exists("env:nu/"name.nm) then iterate
     call open(tpm,"env:nnu/"name.nm,r)
     slot=readln(tpm)
     call close (tpm) 
     logfile="BBS:Node"slot"/CallersWatchDog"
     address command 'copy env:nu/#? envarc:nu'
    address command 'echo' copies("*",75) '>>'logfile
   address command 'echo "Write message to new user :"'name.nm "at" date "("time()")" '>>'logfile
  address command 'type env:nu/'name.nm '>>'logfile 
  call delete("env:nnu/"name.nm)
  call delete("envarc:nnu/"name.nm)
end
tr ""
shutdown
exit
end

DelUser:
do forever
 if showdir("env:nnu") ="" then leave
  call GetDirList("nnu")
     query "[32mDelete NewUser .........[0m [ABORT] [32m# [0m"
     num=result
   if verify(num,xrange(1,i-1)) ~=0 | num="" then leave
  call delete("env:nnu/"name.num)
 call delete("envarc:nnu/"name.num)
end
call bye

DeleteMsg:
arg text
tr ""
sendstring "[32mDelete message  [33mY[0m)[32mes[0m/[33mN[0m)[32mo[0m  [Y] [32m?[0m "
getchar
yn=upper(result)
if yn="N" then do
 tr "NO"
 return
end
else do
   tr "YES"
   address command 'delete >NIL: ENV:'text
   end
return

GetDirList:
arg path
 address command 'list >env:dog.tmp env:'path 'QUICK NOHEAD'
     call open(tmp,"env:dog.tmp",r)
     i=0
       do until eof(tmp)
          i=i+1
          name.i=strip(readln(tmp))
       end
     call close(tmp)
     tr ""
       do s=1 to i-1
          tr "[32mUser name[34m....... [32m# [0m"s "[33m"name.s
       end
     tr ""
return 

Syntax:
Error:
IoErr:
 tr ""
 tr "Error in line "sigl" !" errortext(rc)
bye:
 tr ""
 shutdown
exit
Ve$:
end
