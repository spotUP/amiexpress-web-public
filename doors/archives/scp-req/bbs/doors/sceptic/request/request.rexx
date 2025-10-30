/* AREXX-DOOR BY RUBYX! */

/* inits */

parse arg node
options results
nodeid = "AERexxControl"node
tr=transmit
GU=GetUser
ss=sendstring
hk=getchar
qu=query
ZMODEMSEND=137
address value nodeid
LF=D2C('10');CLS=D2C('12');CR=D2C('13');CRLF=CR||LF
gu 100;user=result
signal on syntax; signal on error;

FALSE= 0
TRUE = 1

main:
tr CLS

tr " "
tr "
[34m   ReQuEsT DoOR V1.1 By 
[35mZACKE/SCEPTIC 
[34m-
[36m CaLL Bacardi House :
[35m +49-4638-8306"
tr " 
[33m----------------------------------------------------------------------
[37m"
tr " "
qu " "user" 
[32mWhAt iS YoR ReQuEst ? 
[36m";line.1=result
if line.1="" then signal quit2
line.2="|"
if ~exists('BBS:AMIEX/BULL10.TXT') then call err
   do
   open('appendfile','BBS:AMIEX/BULL10.TXT','A')
   writeLN('appendfile','
[36m'right(line.2,1)'
[33m'right(USER,21)'
[36m |
[37m 'left(line.1,54)'
[36m|')
   writeLN('appendfile',"
[36m`----------------------'-------------------------------------------------------'
[33m")

   close('appendfile')
signal quit
/----------------------------------------------------------
Quit:
tr " "
tr "
[36m ReQuEsT DoOR V1.1 By 
[33mZACKE/SCEPTIC 
[37m- CaLL Bacardi House :
[36m +49-4638-8306"
if exists("BBS:Node"node"/Callerslog") then
   Do
     Open('appendfile',"BBS:Node"node"/Callerslog",'A')
     WriteLN('appendfile'," ")
     WriteLN('appendfile',"                   `----------------------------------------' ")
     WriteLN('appendfile',"                   :    ReQueSt DoOr V1.1 By ZACKE/SCEPTIC  : ")
     WriteLN('appendfile',"                   +----------------------------------------+ ")
     WriteLn('appendfile',"                   :     CaLL Bacardi House+49-4638-8306    : ")
     WriteLN('appendfile',"                   .----------------------------------------. ")
     WriteLN('appendfile'," ")
     Close('appendfile')

tr " "
shutdown
exit
end
Quit2:
tr " "
tr "
[36m ReQuEsT DoOR V1.1 By 
[33mZACKE/SCEPTIC 
[37m- CaLL Bacardi House :
[36m ++49-4638-8306"
tr " "
shutdown
exit
end


ERR:
TR ""
TR CENTER("MISSING A CONFIG FILE... WARN YOUR SYSOP PLEASE! ",80)
tr ''
tr ''
shutdown
exit
end

ERROR:
SYNTAX:
 tr "Error in Line.. #"sigl" Exiting.."
 tr errortext(sigl)
shutdown
exit
end

/* PROCEDURES */

putvar: procedure
parse arg string1,string2
 PUTUSTR string1
 PUTUSER string2
return 0

getvar: procedure
parse arg string1
 getuser string1
return result

prompt: procedure
parse arg message,length
 RECEIVE length
 QUERY message
return result

EXIT1: 
SHUTDOWN
EXIT
END
