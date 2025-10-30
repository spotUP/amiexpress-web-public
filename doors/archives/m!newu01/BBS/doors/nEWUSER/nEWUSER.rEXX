/* Optimized with RexxOpt 1.5 */
parse arg node;
options results;
nodeid="AERexxControl"node;
address value nodeid;
signal on error;
signal on ioerr;
signal on syntax;
TR=TRANSMIT ;
GC=GETCHAR ;
SS=SENDMESSAGE;
GU=GETUSER;
Getuser 100 ;Username=result;
getuser 105 ;Userlevel=result;
if ~EXISTS("BBS:DOORS/nEWUSER/nEWUSER.cFG")then do;
tR;tR "[31m  -- BBS:DOORS/nEWUSER/nEWUSER.cFG iS mISSING --";call out;end;
OPEN(mainconfig,'BBS:DOORS/nEWUSER/nEWUSER.cFG','R');
axxmin=READLN(mainconfig);
axxmin=left(axxmin,3);
aNSPATH=READLN(mainconfig);
CLOSE(mainconfig);
if axxmin>userlevel then call weg;
x=index(aNSPATH,"@")-1;
aNSPATH=left(anspath,x);
ss d2c("12");tR;tR;TR "[40m[36m  % nEW uSERS aNSWER sEARCH %";
tR;tR"   sERVING :[31m "username"[36m";
tR;tR;a=0;da=0;do until a>2;if EXISTS((anspath)a"/answers")then do;
tr "[32m     "a"   [36mpORT --"a"--";da=1;end;a=a+1;end;
IF da=~1 then call back;tr "[32m     "Q"   [36mqUIT";tr;
ss"      cHOOSE:";do until da=2;
GC;ch=result;IF upper(ch)="Q" then call OUT;
if EXISTS((anspath)ch"/answers")then do;tR
;tR "[33m";PUTUSTR (anspath)ch"/answers";
PUTUSER 008;TR ;tR;tR;SS "[36m  Kill these Answers (N/y)";
GC;cx=result;TR;if upper(cx)~="Y" then call out;
path=(anspath)ch"/answers";tR;tR "[36m  Killing "path;
address command "C:Delete "path;call out;end;
end;shutdown;exit;Error:;IOERR:;Syntax:;
TR "[31m  -- eRROR --";shutdown;exit;back:
;TR;TR "[37m  -- sORRY nO nEW uSERS aNSWER rECORDED --";TR
;shutdown;exit;oUT:;tR;tR "[36m  -- eXITING % nEW uSERS aNSWER sEARCH % --";tR
;sHUTDOWN;eXIT;WEG:;tR;tR "[36m  -- yOU aRE nOT aLLOWED tO uSE tHIS tOOL --";tR;
sHUTDOWN;eXIT