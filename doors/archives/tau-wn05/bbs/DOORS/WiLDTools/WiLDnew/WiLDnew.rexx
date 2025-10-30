/* WiLDNeW v0.5 05 */
/*      written by WiLD THiNG/Mannassas in '94 */

PARSE ARG Node
OPTIONS RESULTS
ADDRESS VALUE 'AERexxControl'Node



SIGNAL ON Error
SIGNAL ON Syntax
SIGNAL ON IOErr


/* MAIN PART */
tr = TRANSMIT; gu=getuser
DT_NAME        = 100; getuser DT_NAME; UserName = COMPRESS(RESULT)
getuser 516; baud = RESULT
getuser 144; time = RESULT
getuser 131; arg = RESULT; arg = word(arg,1)
getuser 105; acclevel = RESULT

/* ------ Define Headers ------------- */
heada = "[A[34;4m                                                                              [0m[B"
headb = "[A[34;43;4m WiLDNew v0.5 Multilanguage         AmiExpress Door written '94 by WiLD THiNG [0m[B"
headc = "[A[34;43;4m                              Dixie BBS ++48-71-575825                        [0m[B"
headd = "[A[34;43;4m WiLDNew v0.5 Sysop MoDe            AmiExpress Door written '94 by WiLD THiNG [0m[B"

Putustr 'WiLDNeW v0.5' ; PutUser 177

CALL NeW
CALL BYE
/* END PART */

ERROR:
 TRANSMIT
 TRANSMIT "Error in Line #"Sigl" : exiting ..."
 TRANSMIT ERRORTEXT(Sigl)
CALL BYE

SYNTAX:
 TRANSMIT
 TRANSMIT "Error in Line #"Sigl" : exiting ..."
 TRANSMIT ERRORTEXT(Sigl)
CALL BYE

IOERR:
 TRANSMIT
 TRANSMIT "IO Error in Line #"Sigl" : exiting ..."
 TRANSMIT ERRORTEXT(Sigl)
CALL BYE

BYE:
 SHUTDOWN
 EXIT
END

NEW:
/* ------------------- INIT ------------------------------- */
re = ""
getuser 105; acclevel = RESULT
/* SYSOP MODE */
IF arg = "new" then 
 DO; tr arg
  IF ~exists("doors:wildtools/wildnew/newusers") THEN 
        DO; 
        tr "c"; tr heada;tr headd
        tr "There are no new Users"; tr ""; 
        tr heada;tr headc; CALL bye;END
  IF OPEN(log,"doors:wildtools/wildnew/newusers") THEN 
        DO; nlines = 0; 
        DO UNTIL EOF(log)
         nlines = nlines + 1
         nline.nlines = READLN(log)
        END; yeps=0
DO UNTIL yeps
        tr "c"; tr heada; tr headd
        count = 0; lline = nlines -1
        DO UNTIL count = (nlines - 1)
         count = count + 1
         tr count". "nline.count
        END
        tr "[32m[BN. View by Name"
        tr "[37m0. Quit[31m"
        tr "[2B"; tr heada; tr headc; tr "[4A"; fuckoff = 0
        DO UNTIL Fuckoff
         QUERY "[A"D2C(13)"[32mView which user [33m:[0m "; ans = RESULT
          IF ans >-1 THEN IF ans <nlines THEN fuckoff = 1
          IF ans = "n" THEN fuckoff = 1
        END
      IF ans = 0 THEN 
        DO; tr "c"; tr heada; tr headb; CLOSE(log)
        If acclevel > 200 then
               DO
                 sendmessage "[35mDelete new user log [36m([37my[36m/[32mN[36m)[33m:[0m "
                 GETCHAR; ans = RESULT;
                 if ans = "y" then 
                   ADDRESS COMMAND 'delete doors:wildtools/wildnew/newusers'
                END
                 tr "";tr "[BThanx for using WiLDNeW[B";
                tr heada; tr headc; CALL BYE; END
        IF ans = "n" THEN 
          DO; QUERY "[A"D2C(13)"[[32mEnter Username [33m:           [10D[0m"; name2v = COMPRESS(RESULT); END
          ELSE  name2v = nline.ans
        tr "c"
        IF name2v ~= "" THEN 
        DO
      PUTUSTR "v doors:wildtools/wildnew/answers/"name2v".ans"; PUTUSER 508
        sendmessage "[32mPress return to continue:"; GETCHAR
        END
        END        
END;call bye;END /* Sysop mode */
/*tr "c"; tr heada; tr headb */
IF ~exists("Doors:WiLDTools/WiLDNew/WiLDNeW.cfg") THEN
        DO; tr "c"; tr heada; tr headb;
            tr "Couldn't open config file."; CALL BYE;
        END
ELSE IF OPEN(cfg,"doors:wildtools/wildnew/wildnew.cfg") THEN
        DO; ln = 0;
                DO UNTIL EOF(cfg)
                 ln = ln + 1;
                 rd = READLN(cfg); lang.ln = word(rd,1); 
                 cfgnm.ln = "doors:wildtools/wildnew/"word(rd,2)
                END; CLOSE(cfg)
tr "c"; tr heada; tr headb
cnt = 0
DO UNTIL cnt = (ln+2)
sendmessage "[B" 
cnt = cnt + 1
END

;tr heada; tr headc

cnt = 0
DO UNTIL cnt = (ln+4)
sendmessage "[A"
cnt = cnt + 1
END

cnt = 0
DO UNTIL cnt = (ln-1)
cnt = cnt + 1
tr cnt". "lang.cnt
END
rig = 0
tr ""; tr ""
DO UNTIL rig
QUERY D2C(13)"[AWhich language do you prefer: "; l = RESULT
if l < ln then if l > 0 then rig = 1
if l = "q" then call bye
END

confname = cfgnm.l; 
getuser 12; sysopname = RESULT
IF ~exists(confname) then DO; tr "Couldn't open "lang.ln" question file"; 
                                tr "Please inform "sysopname"."; call bye;
                          END

tr "c"; tr heada ; tr headb
lines = 0
IF OPEN(ans,"doors:wildtools/wildnew/answers/"username".ans",W) THEN DO
WRITELN(ans,"~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
WRITELN(ans,"WiLDNeW questionaire answered by "username)
WRITELN(ans,"                              on "time)
WRITELN(ans,"~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
IF OPEN(wf,confname) THEN 
  DO UNTIL EOF(wf)
    line=READLN(wf)
    rec = substr(line,1,1); line = substr(line,2,length(line))
    IF  rec = "-" then DO; tr line; Writeln(ans,line); END

    IF rec = "^" THEN DO; a=READLN(wf);
        IF UPPER(line) = UPPER(re) then DO;
       IF substr(a,1,1) = "§" then 
           DO; line = substr(a,2,length(a)); rec = "§"; END
ELSE
       IF substr(a,1,1) = "?" then 
           DO; line = substr(a,2,length(a)); rec = "?"; END
ELSE   
        IF substr(a,1,1) = "/" then DO; CLOSE(ans); CLOSE(WF); CALL NEW; END
ELSE
        IF substr(a,1,1) = "+" then 
           DO; line = substr(a,2,length(a)); rec = "+"; END

ELSE    DO;  tr a; WRITELN(ans,a);END;END;END

    IF  rec = "?" then DO; QUERY line; re=RESULT;
        WRITELN(ans,line""re); END

    IF rec = "%" then IF baud = word(line,1) then 
        DO; line = substr(line,pos(" ",line)+1,length(line)-length(word(line,1)))
        tr line; writeln(ans,line); END

    IF  rec = "§" then DO UNTIL re ~=""; 
        QUERY line; re=RESULT; WRITELN(ans,line""re)
        IF re ="" THEN 
          DO; tr "You must answer this question";
              WRITELN(ans,"You must answer this question"); END
        ; END

    IF rec = "=" then IF baud = word(line,1) then 
        DO; line = substr(line,pos(" ",line)+1,length(line)-length(word(line,1)))
        query line; re=RESULT; writeln(ans,line""re); END


    IF rec = "+" THEN DO        
        tr line; Writeln(ans,line)
        PUTUSTR "doors:wildtools/wildnew/answers/"username".com"
        PUTUSER 9
        tr "done."
        Close(ans)
        IF exists("doors:wildtools/wildnew/answers/"username".com") THEN DO
        ADDRESS COMMAND "type >>doors:wildtools/wildnew/answers/"username".ans doors:wildtools/wildnew/answers/"username".com"
        IF Open(ans,"doors:wildtools/wildnew/answers/"username".ans","A") THEN DO; END
        ADDRESS COMMAND "DELETE doors:wildtools/wildnew/answers/"username".com"; END
        END
                        
  END
CLOSE(ans);CLOSE(wf)
TRACE ALL
IF ~exists("doors:wildtools/wildnew/NeWUsers") THEN 
DO
IF open(logf,"doors:wildtools/wildnew/NeWUsers",W) THEN 
DO; Writeln(logf,username); CLOSE(logf); CALL BYE; END 
END
 IF open(logf,"doors:wildtools/wildnew/NeWUsers","A") THEN 
    DO; Writeln(logf,username); CLOSE(logf); END
CALL BYE
END
