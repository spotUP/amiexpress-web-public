/* WiLDNeW v0.3 03 */
/*      written by WiLD THiNG/Mannassas in '93 */
                
TRACE ALL 
PARSE ARG Node
OPTIONS RESULTS
ADDRESS VALUE 'AERexxControl'Node

SIGNAL ON Error
SIGNAL ON Syntax
SIGNAL ON IOErr
tr = TRANSMIT; gu=getuser
DT_NAME        = 100; getuser DT_NAME; UserName = RESULT
getuser 516; baud = RESULT
getuser 144; time = RESULT

/* MAIN PART */

/* ------ Define Headers ------------- */
heada = "[A[33;0;4m                                                                              [0m[B"
headb = "[A[33;44;4mWiLDNew v0.2 Multilanguage         AmiExpress Door written '93 by WiLD THiNG  [0m[B"
headc = "[A[33;44;4mDixie BBS ++48-71-575825                                                      [0m[B"



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
tr "c"; tr heada; tr headb
/* ------------------- INIT ------------------------------- */
re = ""

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
tr "c"; tr heada; tr headb;
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

    IF rec = "^" then DO; a=READLN(wf)                
        IF UPPER(line) = UPPER(re) then DO;
       IF substr(a,1,1) = "§" then 
           DO; line = substr(a,2,length(a)); rec = "§"; END
ELSE
       IF substr(a,1,1) = "?" then 
           DO; line = substr(a,2,length(a)); rec = "?"; END
ELSE   IF substr(a,1,1) = "/" then DO; CLOSE(ans); CLOSE(WF); CALL NEW; END
        ELSE DO;  tr a; WRITELN(ans,a);END
         END; END
ELSE
       IF substr(a,1,1) = "+" then 
           DO; line = substr(a,2,length(a)); rec = "+"; END


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


    IF rec = "+" then DO        
        PUTUSTR "doors:wildtools/wildnew/answers/"username".com"
        PUTUSER 9
        END
                        
  END
CLOSE(ans);CLOSE(wf)
CALL BYE
END