/* rEALOG V0.91 [gONZALEZ/M!] 11-06-94 */
parse arg node
options results
nodeid = "AERexxControl"node
address value nodeid
signal on error;signal on ioerr;signal on syntax
TR=TRANSMITT ; GC=GETCHAR ; SS=SENDMESSAGE; GU=GETUSER
getuser 122; screen=result
getuser 131; argument=result

buffer=500
lines=12
line=1
startline=4
side=1
page=1
mpage=0
epage=0
go=1
h=1
endh=0
zwait=1
path="bbs:node"
proz=9
wait.1="|"
wait.2="/"
wait.3="-"
wait.4="\"
tr

/* Farben */
standard="[0m"
weiss="[31m"
gruen="[32m"
gelb="[33m"
blau="[34m"
rosa="[35m"
cyan="[36m"
rot="[37m"

if exists("bbs:doors/realog/realog.config") then do
 open("config","bbs:doors/realog/realog.config","R")
 do while ~eof("config")
  config=readln("config")
  if upper(word(config,1))="LINES" then lines=value(word(config,2))
  if upper(word(config,1))="PATH" then do
   proz=index(word(config,2),"%")
   if proz~=0 then path=delstr(word(config,2),proz,1)
  end
 end
end

pathsearch="dir "insert("#?",path,proz-1)" dirs >t:nodes"
address command pathsearch
if ~exists("t:nodes") then fuckup()
open("nodes","t:nodes","R")
log=0
do while ~eof("nodes")
 log=log+1
 readln("nodes")
end
close("nodes")
address command "delete t:nodes"
log=log-2

tr gruen"["gelb"rEALOG V0.91"gruen"]"
if lines+7>screen then do; tr gruen"["gelb"nOT eNOUGH lINES oN SCREEN"gruen"]"; fuckup(); end
if words(argument)>2 then do; tr gruen"["gelb"bAD aRGUMENTS"gruen"]"; fuckup(); end

if words(argument)=1 then do
 query rosa" pORT "gruen"["gelb"(0-"log")"gruen","gelb"(c)URRENT"gruen"] "weiss": "
 antwort=result
end
else antwort=word(argument,2)
type=datatype(antwort)

if type="CHAR" then do
 if hash(antwort)=0 then fuckup()
 if upper(antwort)="C" then do; getuser 149; no=result; end
end
if type="NUM" then do
 if antwort<=log & antwort>=0 then do; no=antwort; end
 else fuckup()
end

pathlog=insert(no,path,proz-1)"/CALLERSLOG"

if ~exists(pathlog) then do
 tr gruen"["gelb"sORRY, cALLERSLOG oN nODE "no" nOT fOUND"gruen"]"
 fuckup()
end

open("log",pathlog,"R")
end_pos=seek("log",0,"E")

if end_pos<buffer then start_pos=seek("log",0,"B")
else start_pos=seek("log",0-buffer,"E")

ss "c"; putustr "0"; putuser 526
tr rosa"(-"gruen"["gelb"rEAlOG V0.91"gruen"]"rosa"-----------------------------------------"gruen"["gelb"gONZALEZ/M!"gruen"]"rosa"-)"
tr rosa"(-"gruen"["gelb"uSE : "gruen"["gelb"L"gruen"] "gelb"gO dOWN "rosa"% "gruen"["gelb"O"gruen"] "gelb"gO uP "rosa"% "gruen"["gelb"Q"gruen"] "gelb"qUIT "rosa"% "gruen"["gelb"eNTER"gruen"] "gelb"sHOW cALL!"gruen"]"rosa"------)"

do while line=1 | line=lines+2
if page<=mpage then go=0
else do; go=1; mpage=page; end

if go=1 then tr "[1;19H"gruen"["gelb"sEARCHING fOR cALLERS  "gruen"]"rosa
do while h<=lines*page & go=1
 k=0
 do while k=0
  i=0
  do while seek("log",0,"C")<end_pos
   i=i+1
   akt_pos=seek("log",0,"C")
   zeile.i.2=akt_pos
   zeile.i.1=readln("log")
   if hash(left(zeile.i.1,1))=42 then start_pos=akt_pos
  end
  i=i-1
 
  do j=1+1 to i
   if hash(left(zeile.j.1,1))=42 then k=j
  end
  if k~=0 then end_pos=start_pos
  else do; if start_pos=0 then end_pos=start_pos; end
  if start_pos<buffer then start_pos=seek("log",0,"B")
  else start_pos=seek("log",start_pos-buffer,"B")
  if start_pos=end_pos then do; call.h.3="0";epage=page; leave; end
 end

 ss "[1;41H"wait.zwait
 zwait=zwait+1; if zwait=5 then zwait=1

 if start_pos=end_pos then leave
 
 k=k+1
 do j=k+1 to i
  if datatype(left(zeile.j.1,1))="NUM" then leave
 end
 
 if upper(datatype(left(zeile.j.1,1)))~="NUM" then logoff="(bAD_dATA)"
 else logoff=word(zeile.j.1,2)
 
 do l=1 to 20
  if lastpos("CONNECT",upper(word(zeile.k.1,l)))~=0 | lastpos("LOCAL",upper(word(zeile.k.1,l)))~=0 then leave
 end
 
 nameword=4
 if upper(word(zeile.k.1,3))="NEW" then do; nameword=nameword+1; name="*"word(zeile.k.1,nameword); end 
 else name=" "word(zeile.k.1,nameword)
 do m=nameword+1 to l-1
  name=insert(name," ")
  name=insert(name,word(zeile.k.1,m))
 end
 
 n=j
 m=j+1
 do while j<=i & hash(left(zeile.j.1,1))~=32
  do j=j+1 to i
   if hash(left(zeile.j.1,1))=9 then nop
   else leave
  end
  if hash(left(zeile.j.1,1))~=32 then nop
  call.h.1=zeile.m.2;call.h.2=j-m
  call.h.3=right(left(gruen"[ ] "rosa"(-{"gelb"bAD lOGIN!"rosa"}",91,"-"),90+side)")"
  h=h+1
  m=j+1
 end
 call.h.1=zeile.k.2;call.h.2=n-k
 login=gruen""left(word(zeile.k.1,2),1)gelb""right(left(word(zeile.k.1,2),9),8)gruen""right(word(zeile.k.1,2),1) 
 logoff=gruen""left(logoff,1)gelb""right(left(logoff,9),8)gruen""right(logoff,1)
 call.h.3=right(left(gruen"[ ] "rosa"(-{"gelb""word(zeile.k.1,1)" "login""rosa"-"gelb""logoff""gelb""name""rosa"}",136,"-"),135+side)")"
 h=h+1
end
tr rosa"[1;19H-------------------------"
endh=h

ewig=1
do while ewig=1
 ss "["startline";1H"
 tr right(left(gruen"[ ] "rosa"[-"gruen"["gelb"pAGE uP"gruen"]"rosa"-"gruen"["gelb"cURRENT pAGE: "page""gruen"]"rosa"-"gruen"["gelb"nODE: "no""gruen"]"rosa,141,"-"),140+side)"]" 
 do z=((page-1)*lines)+1 to lines*page while call.z.3~="0"
  tr call.z.3
 end
 do y=z to lines*page
  tr right(left(gruen"[ ] "rosa"(-{"gelb"eMPTY"rosa"}-",91,"-"),90+side)")"
 end

 tr right(left(gruen"[ ] "rosa"[-"gruen"["gelb"pAGE dOWN"gruen"]"rosa,101,"-"),100+side)"]"

 ss "["line+startline-1";"side"H "gruen"["gelb"%"gruen"]"
 getchar
 if result="q" then leave
 ewig=1
 do while ewig=1
  if result="q" then leave
  oldline=line
  if upper(result)="L" then line=line+1
  if upper(result)="O" then line=line-1
  if line=0 then line=1
  if line=lines+3 then line=lines+2
  if hash(result)=13 & line=lines+2 then leave
  if hash(result)=13 & line+((page-1)*lines)-1<z then leave
  ss "["oldline+startline-1";"side"H "gruen"[ ]"
  ss "["line+startline-1";"side"H "gruen"["gelb"%"gruen"]"
  getchar
 end
 if result="q" then leave
 if line=1 then leave
 if line=lines+2 then leave; else line=line-1
 
 ss "c"standard
 pline=line+((page-1)*lines)
 seek("log",call.pline.1,"B")
 more="y"
 do z=1 to call.pline.2+1
  ein=readln("log")
  if hash(left(ein,1))=9 then ein=" "right(ein,length(ein)-1)
  getuser 526;curline=result
  if curline+2<=screen then tr ein
  else do
   ss rosa"(-"gruen"["gelb"mORE (Y/n)"gruen"]"rosa"-) "standard
   gc; more=result; if upper(more)~="N" then do; ss "["curline+1";0H"; tr ein; end
  end
  if upper(more)="N" then leave
 end
 line=line+1

 if upper(more)~="N" then do
  ss rosa"(-"gruen"["gelb"eNTER"gruen"]"rosa"-)"standard
  getchar
 end

 ss "c"
 tr rosa"(-"gruen"["gelb"rEAlOG V0.91"gruen"]"rosa"-----------------------------------------"gruen"["gelb"gONZALEZ/M!"gruen"]"rosa"-)"
 tr rosa"(-"gruen"["gelb"uSE : "gruen"["gelb"L"gruen"] "gelb"gO dOWN "rosa"% "gruen"["gelb"O"gruen"] "gelb"gO uP "rosa"% "gruen"["gelb"Q"gruen"] "gelb"qUIT "rosa"% "gruen"["gelb"eNTER"gruen"] "gelb"sHOW cALL!"gruen"]"rosa"------)"
end
if result="q" then leave
if line=lines+2 & page~=epage then page=page+1
if line=1 then page=page-1
if page<1 then page=1
end
ss "c"
tr ""
fuckup()

error:
ioerr:
syntax:
tr gruen"["gelb"eRROR"gruen"]"
fuckup:
tr gruen"["gelb"eXITING rEALOG"gruen"]"standard; tr
shutdown
exit
