/* WiLDvote v0.9 09 */
/*------------------------------------------
   ____  ____ _ ____ _____
  /   /_/   /_ \  _/__ __ \
 /   / /   /  \      /  / /__ ___    _____
 \________/___/_____//___/  //  /uNr/  __/
   /___  ____/      /      //  /____\  \
    /    /  /______/______//______/_____\
   /____/

      (c) '94 WiLD THiNG
      release date: 11-Jan-94      
  ------------------------------------------ */
                
TRACE ALL 
PARSE ARG Node
OPTIONS RESULTS
ADDRESS VALUE 'AERexxControl'Node

SIGNAL ON Error
SIGNAL ON Syntax
SIGNAL ON IOErr
tr = TRANSMIT; gu=getuser; sh=showfile


/* MAIN PART */

/* ------ Define Headers ------------- */
heada = "[A[33;0;4m                                                                              [0m[B"
headb = "[A[31;47;4m  WiLDVoTe v0.10                   AmiExpress Door written '94 by WiLD THiNG  [0m[B"
headc = "[A[31;47;4m           CaLL NoW Dixie BBS ++48-71-575825 - THe HoMe oF WiLDTooLS          [0m[B"


Putustr 'WiLDVote v0.10' ; PutUser 177
CALL vote
CALL BYE
/* END PART */

ERROR:
 TRANSMIT
 TRANSMIT "Error in Line #"Sigl" : exiting ..."
 TRANSMIT ERRORTEXT(Sigl)
CALL BYEBYE

SYNTAX:
 TRANSMIT
 TRANSMIT "Error in Line #"Sigl" : exiting ..."
 TRANSMIT ERRORTEXT(Sigl)
CALL BYEBYE

IOERR:
 TRANSMIT
 TRANSMIT "IO Error in Line #"Sigl" : exiting ..."
 TRANSMIT ERRORTEXT(Sigl)
CALL BYEBYE

BYEBYE:
tr "[BPlease inform WiLD THiNG at DiXie BBS - ++48-71-575825[B"
PUTUSTR "        WiLDVote - fatal error"D2C(10); PUTUSER 150
shutdown
exit

BYE:
 tr "[5BThanx for using WiLDVote..[B"

 SHUTDOWN
 EXIT
END

PAUSE:
tr ""
sendmessage "[32mPress any key : "; GETCHAR
return

/* ----------------- D O W N L O A D ------------------*/
download:
tr "c"; tr heada; tr headb
getuser 127; locat=RESULT; filename = "ram:WVRES.TXT"
x = 1; resbar = "[47m "
DO UNTIL X = tems
 resbar = resbar" "
  x = x + 1
END
tr "[3B"; tr heada; tr headc; tr "[5A"
sendmessage "[ACreating resultfile : "resbar""D2C(13)"[22C"

IF OPEN(resu,filename,W) THEN 
DO
v = 1; 
DO UNTIL v = tems;
totvot = 0
x = 1
DO UNTIL x = opi.v.0 + 1
  totvot = totvot + vot.v.x;
  srt.x = vot.v.x;sop.x=opi.v.x
  x = x + 1; 
END
x = x - 1
lx = x
if lx > 1 THEN
DO
DO UNTIL x = 1
if x > 1 then xm = x - 1
  if srt.x > srt.xm then 
        DO; tmp = srt.x; srt.x = srt.xm;srt.xm = tmp;
            tms = sop.x; sop.x = sop.xm;sop.xm = tms; x = lx;
        END
ELSE x = x - 1
END
END
x= 1

WRITELN(resu,center("[32m"tem.v"[0m",75))
sendmessage "[42m [0m"
DO UNTIL x = lx + 1
per = srt.x/totvot*100
perc = right(substr(per,1,4),4)
bar = "[44;30;4m"
IF per > 0 then 
DO
  barst = per/5;barpt = pos(".",barst); 
  if barpt = 0 then barpt = 2
  barstr = substr(barst,1,barpt)
  barc = 0;
IF barstr ~= "" & barstr > 0 THEN
        DO UNTIL barc = barstr
         bar = bar" "
         barc = barc + 1
        END
END
bar = bar"[0m"
 WRITELN(resu,right(x,2)". "left(sop.x,43)"[33m"right(srt.x,3)"[36m"right(perc,6)"% "bar)
 x = x + 1
END
WRITELN(resu, "[BTotal votes = "totvot"[B")
 v = v + 1
END; 
WRITELN(resu,"          List of Users who have voted:")
WRITELN(resu,"  ")
CLOSE(resu);END
tr ""
tr "[A[32mReady to download                           "
ADDRESS COMMAND "filenote "filename" Free"
ADDRESS COMMAND "dir >>ram:wvres.txt doors:wildtools/wildvote/answers"
Putustr "ram:wvres.txt"
Putuser 137
ADDRESS COMMAND "delete ram:wvres.txt"
tr "[2B"
call pause

return

/* ----------------- S O R T --------------------------*/
/* sorting routine is a simple bubble sort             */
DoSort:
totvot = 0
x = 1
DO UNTIL x = opi.v.0 + 1
  totvot = totvot + vot.v.x;
  srt.x = vot.v.x;sop.x=opi.v.x
  x = x + 1; 
END
x = x - 1
lx = x
if lx > 1 THEN
DO
sendmessage "[A[0mSorting..."
DO UNTIL x = 1
if x > 1 then xm = x - 1
  if srt.x > srt.xm then 
        DO; tmp = srt.x; srt.x = srt.xm;srt.xm = tmp;
            tms = sop.x; sop.x = sop.xm;sop.xm = tms; x = lx;
            sendmessage "." ;END
ELSE x = x - 1
END
tr "done."
END
x= 1
tr "c"; tr heada; tr headb
tr center("[32m"tem.v"[0m",75)
tr ""
DO UNTIL x = lx + 1
per = srt.x/totvot*100
perc = right(substr(per,1,4),4)
bar = "[44;30;4m"
IF per > 0 then 
DO
  barst = per/5;barpt = pos(".",barst); 
  if barpt = 0 then barpt = 2
  barstr = substr(barst,1,barpt)
  barc = 0;
IF barstr ~= "" & barstr > 0 THEN
        DO UNTIL barc = barstr
         bar = bar" "
         barc = barc + 1
        END
END
bar = bar"[0m"
 tr right(x,2)". "left(sop.x,43)"[33m"right(srt.x,3)"[36m"right(perc,6)"% "bar
 x = x + 1
END
tr "[BTotal votes = "totvot"[B"
tr heada; tr headc
call pause
return
/* ----------------- R E V I E W ----------------------*/
review:
DO UNTIL v = 0
call output
tr "[3B"; tr heada;tr headc; tr "[5A"
tr "[2A[37m0. RETURN TO TOPIC MENU[0m[2B"
DO UNTIL v > -1 & v < tems + 1
QUERY "[A[32mView 0 - "tems" : "; v = RESULT
END
IF v ~= 0 then call dosort
END
return
/* ----------------- O U T P U T --------------------------- */
output: 
tr "c"; tr heada; tr headb
sendmessage "[35m"
sh path"logo.txt"
sendmessage "[0m"
x = 1;
DO UNTIL x >= tems + 1
if votd.x > 0 then sendmessage "[33m"
sendmessage right(x,2)". "left(tem.x,33)"[0m"; xp = x + 1
if votd.xp > 0 then sendmessage "[33m"
if tem.xp ~="" & upper(substr(tem.xp,1,3)) ~= "TEM"THEN tr "   "right(xp,2)". "left(tem.xp,34)"[0m";
 x = x + 2
END
tr "[B"
return

/* ------------- V O T E  O U T P U T ----------------------*/
votout:
/**** OUTPUT *****/
  tr "c"; tr heada; tr headb
/*  tr center(tem.chos,40)*/
  showfile path"info/"chos
  tr ""
  DO UNTIL x = opi.chos.0 + 1
IF x = votd.chos then sendmessage "[33m"
    tr  x". "left(opi.chos.x,40)""vot.chos.x"[0m";
     x = x + 1
  END
  tr "[37m[B0. QUIT to topics menu[0m"
/*  tr "[34mI  Info about this topic[0m" */
if  acclevel >= adl.chos THEN tr "[34mA  Add new item[0m"
  tr "[4B"; tr heada; tr headc; tr "[5A"
return

/*------------------------ DO_VOTE ---------------------------- */
dovote: procedure expose chos opi. vot. tr query heada headb headc votd. tem. acclevel adl. path
chus = 99999
DO UNTIL chus = 0
    if chus = 0 then call fuckoff 
    else chose = chus
x = 1

call votout
DO UNTIL chus ~=""
  QUERY "[A[32m0 - "opi.chos.0" : [0m"; chus = RESULT; 
END
  if acclevel >= adl.chos & UPPER(chus) = "A" then DO; call NeWiTeM; chus = -1; END
  if UPPER(chus) = "I" then 
    DO
      tr "c"; tr heada; tr headb
      showfile path"info/"chos
      tr heada; tr headc
      chus = -1
      call pause
    END
       
  if chus ~= -1 & chus ~= 0 then 
        DO; 
if votd.chos > 0 then 
 DO
  sendmessage "You have already voted on "votd.chos", do you want to change your vote ?"
  GETCHAR; ans = RESULT; if ans = "y" then 
     DO
        WoPWoP = votd.chos
        vot.chos.WoPWoP = vot.chos.WoPWoP - 1
            tr vot.chos.chus;
            vot.chos.chus = vot.chos.chus + 1
            votd.chos = chus
     END
  END
ELSE 
if chus > -1 & chus <= opi.chos.0 then
DO
            tr vot.chos.chus;
            vot.chos.chus = vot.chos.chus + 1
            votd.chos = chus
END


        END
  fuckoff:
END
RETURN

/*--------------------- NEW ITEM -------------------------------*/
NEWITEM: PROCEDURE EXPOSE tems tem. opi. tr heada headb vot. chos
newtem = opi.chos.0 + 1
QUERY "[33mEnter new item : 0m"; ans = RESULT
if ans ~="" THEN 
DO
x = 0;same = 0
DO UNTIL x = opi.chos.0;
IF pos(UPPER(ans), UPPER(opi.chos.x)) > 0 THEN 
  DO;
     sendmessage "[AIs this possibly the same as "opi.chos.x" ? "; GETCHAR; rep = RESULT; 
     tr rep; IF UPPER(rep) = "Y" then DO; same = 1; break; end 
        ELSE; same = 0
  END
x = x + 1
END
if same = 0 THEN 
   DO
     opi.chos.newtem = ans
     opi.chos.0 = newtem
     VOT.chos.newtem=0
   END
END
return

/* ------------------------ CREATE NEW CHOICE -------------------*/
CreateChoice: procedure expose tems tem. opi. tr heada headb vot. votd. adl. aslevel acclevel ailevel path logadd
DO UNTIL length(ans) < 34
tr "c";tr heada;tr headb
temsb = tems+1
   tr "You have only 33 chars     [--------|---------|---------|---]"
QUERY "[33mEnter new topic to vote on: [0m"; ans = result
END
IF ans ~="" THEN 
DO
        tem.temsb = ans
        tems = temsb
        QUERY "[33mEnter item to vote on: [0m"; opi.tems.1=RESULT
        IF acclevel >= aslevel then 
          DO; QUERY "[37mEnter item-add access-level : [0m";
              adl.tems = RESULT
          END
           ELSE
                adl.tems = ailevel
        opi.tems.0=1
        vot.tems.1=0
        votd.tems = 0
if logadd = "Y" THEN 
  DO
    getuser 100; username = RESULT
    PUTUSTR "        WiLDVote - "username" created topic no "tems" - "tem.tems""D2C(10); PUTUSER 150
  END
IF OPEN(crin,path"info/"tems,W) THEN 
  DO

    WRITELN(crin,center(tem.tems,76))
    WRITELN(crin,"  ")
    getuser 100; username = RESULT
    infostr = "Topic created on "date()" at "time()" by [---> "username" <---]"
    WRITELN(crin,center(infostr,76))
    WRITELN(crin,"  ")
    CLOSE(crin)
    sendmessage "[32mDo you want to write some more info ? "; GETCHAR; 
    woopi = RESULT
    tr "[0m"
    if UPPER(woopi) = "Y" THEN 
     DO
        PUTUSTR "ram:wvtemp"; PUTUSER 9;
        ADDRESS COMMAND "type >>"path"info/"tems" ram:wvtemp"
        ADDRESS COMMAND "delete ram:wvtemp"
     END
  END
        call pause
END
return
showvoters:
        ADDRESS COMMAND "dir >ram:lov doors:wildtools/wildvote/answers"
        tr "c"; tr heada; tr headb
        showfile "ram:lov"
        tr heada; tr headc
        ADDRESS COMMAND "delete ram:lov"
        call pause
return

/* -------------------- SaVe ----------------------------------*/
DoSaVe: PROCEDURE EXPOSE tr query opi. tems tem. vot. path username votd. adl.
x = 1; cnt = 0
wee = 1
IF OPEN(temsfile,path"tems.WV",W) THEN 
DO; WRITELN(temsfile,tems)
DO UNTIL x = tems + 1
  sendmessage "[42;32;1m "
  WRITELN(temsfile,tem.x); WRITELN(temsfile,adl.x)
  wop = x; ipath = path"tems/"wop
  IF OPEN(itemf,ipath,W) THEN 
    DO; cnt = 1
      DO UNTIL cnt = opi.x.0 + 1
        WRITELN(itemf,opi.x.cnt)
        WRITELN(itemf,vot.x.cnt)
        cnt = cnt + 1
      END
    END; CLOSE(itemf)
    x = x + 1
END; CLOSE(temsfile)
END
votdn = path"answers/"username
IF OPEN(votdf,votdn,W) THEN 
 DO; x = 1
  DO UNTIL x = tems + 1
        WRITELN(votdf,votd.x)
        x = x + 1
  END; CLOSE(votdf)
 END
commline = "echo >"path"tems/"tems+1
ADDRESS COMMAND commline
RETURN

/* --------- D E L E T E  S U B J E C T --------------- */
delsubject:
QUERY "Delete which topic : "; dels = RESULT
IF dels > 0 & dels <= tems then 
DO
  sendmessage D2C(13)"[A[37mReally delete topic "dels" ? [0m"; GETCHAR; ans = RESULT;  tr ans
  if UPPER(ans) = "Y" THEN
DO
  if dels = tems then DO;tem.tems = ""; tems = tems - 1;
if logadd = "Y" THEN 
  DO
    getuser 100; username = RESULT
    PUTUSTR "        WiLDVote - "username" deleted topic no "dels" - "tem.dels""D2C(10); PUTUSER 150
  END
 return; END

dels = dels + 1
if logadd = "Y" THEN 
  DO
    getuser 100; username = RESULT
    PUTUSTR "        WiLDVote - "username" deleted topic no "dels" - "tem.dels""D2C(10); PUTUSER 150
  END
tr dels"  "tems
DO UNTIL dels = tems + 1
  xm = dels - 1; cnt = 0
  tem.xm = tem.dels
  votd.xm = votd.dels
    DO UNTIL cnt = opi.dels.0 + 1
      opi.xm.cnt = opi.dels.cnt
      vot.xm.cnt = vot.dels.cnt
      cnt = cnt + 1
    END
  if dels = tems then break
  dels = dels + 1;  
END
tems = tems - 1
END
END
return

/* -------------------- I N F O -----------------------*/
info:
dudi = -1
DO UNTIL dudi = 0
IF dudi = 0 then break
  call output
  tr "[3B"; tr heada; tr headc; tr "[7A"
  tr "[37m0. RETURN TO TOPIC MENU[0m[2B"
  DO UNTIL dudi > -1 & dudi < tems + 1
   query "[A[32m0 - "tems" : [0m"; dudi = RESULT
  END
IF dudi = 0 then break
  tr "c"; tr heada; tr headb
  showfile path"info/"dudi
  tr heada; tr headc
  call pause
END
return

/* ----------------------- V O T E ------------------- */
vote:
/* INiT */

/* ------------- load tems --------------------------- */
path="doors:wildtools/wildvote/"
If ~exists(path"tems.wv") then DO; tr "Couldn't find config"; Call BYE; END
IF OPEN(temsfile,path"tems.wv") THEN
DO; x = READLN(temsfile) + 1;
tems = 0
DO UNTIL tems = x
  tems=tems + 1;
  tem.tems = READLN(temsfile)
  adl.tems = READLN(temsfile)
IF ~exists(path"tems/"tems) then DO; tr "Item file "tems" missing."; CALL BYE; END
  ELSE
   IF OPEN(itemf,path"tems/"tems) THEN 
    DO; opi.tems.0 = 0
        DO UNTIL eof(itemf)
          opi.tems.0 = opi.tems.0 + 1
          cnt = opi.tems.0
          opi.tems.cnt = READLN(itemf)
          vot.tems.cnt = READLN(itemf)
        END
        opi.tems.0 = opi.tems.0 - 1        
    END; CLOSE(itemf);
END; CLOSE(temsfile)
END

check = 0
/* ----------------- U S E R  V O T E S -------------*/     
x=1; chk = 0; chkd.0 = "[2D  "
DO UNTIL x = tems + 1
 votd.x = 0; chkd.x = tem.x
 chk = chk + 1
 x = x + 1
END; x=1
GETUSER 100; username=compress(RESULT)
votefn = path"answers/"username;
   tr "[B[32mWiLDVote v0.10 [34mby WiLD THiNG/Taurus[0m"
   sendmessage "[32mScanning for new topics... [0m"
IF exists(votefn) THEN 
DO; OPEN(votef,votefn); chk = 0
   DO UNTIL x = tems
        sendmessage "[D\"
        votd.x=READLN(votef);
        if votd.x = "" then votd.x = 0
        sendmessage "[D-";
        if votd.x = 0 then 
          DO;
             check = 1;chkd.chk=tem.x; chk = chk+1
          END
        x = x + 1
        sendmessage "[D/"
   END;CLOSE(votef); IF check = 1 then tr "[Dfound."
         ELSE tr "[Dnone.[B" 
END
ELSE DO; check = 1; tr "[Dfound."; END

/* --------------- C H E C K ----------------------- */
getuser 131; arg = RESULT; arg = UPPER(word(arg,1));
if arg = "WVC" THEN
IF check = 1 then 
 DO
   tr "[B[33mThere are some topics you haven't yet voted on:"
ck = 0
   DO UNTIL ck = chk
        tr "[0m- "chkd.ck
        ck = ck + 1
   END
   tr ""
   sendmessage "[35mDo you want to vote now ? (Y/n) "; GETCHAR; wannavote = RESULT;
   tr wannavote"2B"
   if wannavote = "n" then DO; SHUTDOWN; EXIT; END
 END
ELSE DO; SHUTDOWN; EXIT; END
/* ---------------- L O A D   C O N F I G -------- */
IF ~exists(path"WiLDVote.cfg") THEN 
  DO; tr "Config file missing"; call byebye; END

IF OPEN(cfg,path"WiLDVote.cfg") THEN 
  DO
    dlevel = READLN(cfg)
    dilevel = READLN(cfg)
    aslevel = READLN(cfg)
    ailevel = READLN(cfg)
    logadd = UPPER(READLN(cfg))
    CLOSE(cfg)
  END

/* ------------------ M A I N -------------------- */
getuser 105; acclevel = RESULT

chos = 9999;
tems = tems - 1
DO UNTIL chos = 0
x = 1
if chos = 0 then call bye
        call output
tr "[37m0. QUIT & SAVE"
tr "[B[36m[V][34m  Review results          [36m[?][34m  Show help          [36m[I][34m  Info about topic[0m"
   sendmessage "[36m[R][34m  Output results to file  "
if acclevel >= aslevel THEN sendmessage "[36m[A][34m  Add new topic      "
if acclevel >= dlevel THEN tr "[36m[D][34m  Delete topic" 
ELSE tr ""
tr "[36m[S][34m  Show List Of Voters"
tr "[3B"; tr heada;tr headc; tr "[6A"
tr ""
DO UNTIL chos ~=""
        query "[A[32mVote on 0 - "tems" : [0m"; chos = RESULT
END
    IF acclevel >= dlevel & chos = "d" THEN CALL delsubject
    IF UPPER(chos) = "I" THEN call info
    IF UPPER(chos) = "R" THEN DO; tr "wopwop" ; call download; END
    IF UPPER(chos) = "V" THEN call review
    IF UPPER(chos) = "S" THEN call showvoters


    IF UPPER(chos) = "Q" & acclevel > 250 THEN
      DO; tr "[5B"; tr "Emergency stop...[2B"; call byebye; END        
    IF chos = "?" THEN 
      DO
        tr "c"; tr heada; tr headb
        showfile path"WVhelp.txt"
        tr heada; tr headc
        call pause
      END
    IF acclevel >= aslevel & UPPER(chos) = "A" THEN call createchoice
     else IF chos < (tems+1) & chos > 0 then call dovote

END
x = 0; savebar = "[47m"
DO UNTIL X = tems
 savebar = savebar" "
  x = x + 1
END
sendmessage "[ASaving : "savebar""D2C(13)"[9C"
call DoSaVe
tr "[0m"
call BYE
