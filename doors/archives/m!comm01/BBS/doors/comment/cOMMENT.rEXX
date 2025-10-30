/* % nEW uSERS aNSWER sEARCH % */

parse arg node
options results
nodeid = "AERexxControl"node
address value nodeid
signal on error;signal on ioerr;signal on syntax
TR=TRANSMIT ; GC=GETCHAR ; SS=SENDMESSAGE; GU=GETUSER
Getuser 100 ; Username=result
getuser 105 ; Userlevel=result
getuser 122 ; lines=result
getuser 131 ; argument=result
del=insert(d2c(8)," ")

if words(argument)>2 then do; tr;tr "[32mtOO mUCH aRGUMENTS";call out;end;
if words(argument)=2 then do; antwort=word(argument,2);type=datatype(antwort);end


if ~EXISTS("BBS:DOORS/comment/comment.CFG") then do 
				tr
				tR "[32msORRY tHE cONFIG fILE iS mISSING"
				call oUT
				end;
ss "c"
tr;  
OPEN(mainconfig,'BBS:DOORS/comment/comment.CFG','R');
a=0
do until EOF(mainconfig)=1
Sysop=READLN(mainconfig);
dataline=READLN(mainconfig);
a=a+1
end;
close(mainconfig)
max=a-1
if words(argument)=2 then do;
 if type="NUM" then do
  if antwort>=1 & antwort<=max then do
   OPEN(mainconfig,'BBS:DOORS/comment/comment.CFG','R');
   a=0
   do until a=antwort
    Sysop=READLN(mainconfig);
    dataline=READLN(mainconfig);
    a=a+1
   end;
   TR "                    cOMMENT 0.1 ©1994  bY jOE cOOL/mOTION"
   putustr insert("E ",sysop)
   putuser 136
  end
  else
  do
   call weiter
  end
  close(mainconfig);
  call out;
 end;
end

weiter:   

TR "                    cOMMENT 0.1 ©1994  bY jOE cOOL/mOTION"
tr
ss "[36m"
TR "     .---.-------------------------.--------------------------------------."
a=1
do until a=max+1
tr "     |   |                         |                                      |"
a=a+1
end;
tr "     `---°-------------------------°--------------------------------------'"
ss "[0m"
tr
OPEN(mainconfig,'BBS:DOORS/comment/comment.CFG','R');
a=1
tr;tr
do until a=max+1
Sysop=READLN(mainconfig);
dataline=READLN(mainconfig);
ss "["a+4";7H[32m"

ss right(a,2," ")
ss "["a+4";11H[33m"
ss left(Sysop,25," ")
ss "["a+4";38H[0m"
ss left(dataline,37," ")
tr
tr
a=a+1    
end;
close(mainconfig)
ss "[36m"
tr "     .-----------------------------."
tr "     |[32m cHOICE: [36m                    |"
tr "     `-----------------------------'"
ss "["max+7";38H[0msERVING: [35m";ss left(username,25," ") 
ss "["max+7";16H[0m"
if a-2<10 then do;xx=1;end;else do;xx=2;end;
ch="";ch2=""
a=0
do until ch=d2c(13)
 gc;ch=result;
 if ch=d2c(8) & a>0 then do;a=a-1;ss del;ss ch;ch2=insert(ch2,"",0,a);end
 if ch=d2c(8) & a<=1 then do;end
 if ch=d2c(27) then do;call ende;end
 if ch~=d2c(8) & ch~=d2c(13) & a<xx then do;a=a+1;ss ch;ch2=insert(ch2,ch);End
 weiter:
end
if ch2<max+1 & ch2>0 then do;
 OPEN(mainconfig,'BBS:DOORS/comment/comment.CFG','R');
 a=0
 do until a=ch2 
  Sysop=READLN(mainconfig);
  dataline=READLN(mainconfig);
  a=a+1
 end;
 putustr insert("E ",sysop)
 putuser 136
 close(mainconfig);
end

ende:
tr
call out

Error:
IOERR:
Syntax:
TR "[31m  -- eRROR --"
shutdown
exit

oUT:
tR ""
sHUTDOWN
eXIT
