/* LOTTO v0.2  © 1995 by BomBeLL +48 72 153971 */

Parse Arg Node;Options Results;NodeId = "AERexxControl"node;Address Value NodeId;Signal On Error;Signal On Ioerr;Signal On Syntax;Sendfile=Showfile
DT_NAME          = 100;Getuser DT_NAME;NAME=RESULT;DT_TIMESCALLED   = 112;DT_TIMELASTON    = 113;DT_TIMEUSED      = 114;DT_TIMELIMIT     = 115;DT_TIMETOTAL     = 116;DT_DAILYBYTELIMIT= 119;DT_DAILYBYTEDLD  = 120;cr='';CLS = '[H[J'     
OFF = '[0m'
WHTBLU = '[37;44m'
YEL = '[33m'
WHT = '[37m'
RED = '[31m'
GRN = '[32m'
YEL = '[33m'
BLU = '[34m'
MAG = '[35m'
CYN = '[36m'
WHT = '[37m'
WHTRED = '[37;41m'
WHTblu = '[37;44m'
WHTWHT = '[37;37m'
VER$='0.2'

call start


ERROR:
 TRANSMIT
 TRANSMIT ''blu'LOTTO hat 'red'ERROR'blu' in Line 'grn'#'Sigl''blu' : sorry ...'
 TRANSMIT ERRORTEXT(Sigl)
CALL ENDERROR

SYNTAX:
 TRANSMIT
 TRANSMIT ''blu'LOTTO hat 'red'SYNTAX ERROR'blu' in Line 'grn'#'Sigl''blu' : sorry ...'
 TRANSMIT ERRORTEXT(Sigl)
CALL ENDERROR

IOERR:
 TRANSMIT
 TRANSMIT ''blu'LOTTO hat 'red'IO ERROR'blu' in Line 'grn'#'Sigl''blu' : sorry ...'
 TRANSMIT ERRORTEXT(Sigl)
CALL ENDERROR

ENDERROR:
tr "[BPlease inform BomBeLL at nO nAME BBS - +48-72-153971[B"
PUTUSTR "        LOTTO - fatal error"D2C(10); PUTUSER 150
shutdown
exit



START:
Getuser DT_TIMETOTAL;timel=result
Getuser DT_TIMEUSED;timeu=result
timet=timel-timeu;timet=timet/60
if timet < 10 then do
Transmit "[0 p"
transmit '';transmit ''cyn''blu''name' yA dOnT hAVE eNOUGH tiME tO pLAY !'
transmit '';shutdown;exit;end

IF ~exists('DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/LOTTO.CFG') then
do
TRANSMIT ''
query 'i cannot find LOTTO.CFG'
exit
end


INTRO:
transmit ''cls''
transmit ''cls''
showfile 'doors:BomBeLL_Arexx/LOTTO_ENG/DATA/LOTTOANIM.intro'
transmit ''
transmit ''
query '                 'mag'------->pLEEZE hIT eNTER wHEN rEADy ;)'

MENU:
TRANSMIT off cls
TRANSMIT '[0m'
TRANSMIT '[0m'
TRANSMIT '[0m                      [30m [43mo[31m---------------------------[40m[30;43mo'
TRANSMIT '[0m                      [30;43m[40m [43mo        L [1;34mO [0;30;43mT T [1;34mO         [0;30;43m o[40m'
TRANSMIT '[0m                      [30m [43mo[31m---------------------------[30mo'
TRANSMIT off
wskaznik=''mag'-->'
line.1='                                'red'['wht'S'red']'blu'tart'
line.2='                                'red'['wht'I'red']'blu'nfo about players'
line.3='                                'red'['wht'C'red']'blu'onfiguration'
line.4=''
line.5='                                'red'['wht'Q'red']'blu'uit'off''
line.6=''
line.7=''
LENLIN=7
pos.1='[1
A'
do n=1 to lenlin
TRANSMIT line.n
end
sendmessage '                         'grn'iTs yOUR cHOiCE ;) 'off''
KRS:
pos.1='[8;29H'
pos.2='[9;29H'
pos.3='[10;29H'
pos.4='[12;29H'
setcur='[15;45H'
ret=0
wyw=0
sta=0
inf=0
konf=0

pob:
do until ret=1
getchar
resp=result
if upper(resp) ~= 'S' & upper(resp) ~= 'Q' & upper(resp) ~= 'I' & upper(resp) ~= 'C' then;do;call pob;end
Select
when C2X(resp)=73 | C2X(resp)=53  then
do
TRANSMIT ''pos.1''wskaznik''
TRANSMIT ''pos.2'    '
TRANSMIT ''pos.3'    '
TRANSMIT ''pos.4'    '
SENDMESSAGE setcur
konf=0
wyw=0
inf=0
sta=sta+1
if sta=2 then call GRA
end
when C2X(resp)=69 | C2X(resp)=49 then
do
TRANSMIT ''pos.1'    '
TRANSMIT ''pos.2''wskaznik''
TRANSMIT ''pos.3'    '
TRANSMIT ''pos.4'    '
SENDMESSAGE setcur
konf=0
wyw=0
inf=inf+1
if inf=2 then call menu_2
end
when C2X(resp)=63 | C2X(resp)=53 then
do
TRANSMIT ''pos.1'    '
TRANSMIT ''pos.2'    '
TRANSMIT ''pos.3''wskaznik''
TRANSMIT ''pos.4'    '
SENDMESSAGE setcur
wyw=0
inf=0
konf=konf+1
if konf=2 then call konfiguracja
end
when C2X(resp)=71 | C2X(resp)=51 then
do
TRANSMIT ''pos.1'    '
TRANSMIT ''pos.2'    '
TRANSMIT ''pos.3'    '
TRANSMIT ''pos.4''wskaznik''
SENDMESSAGE setcur
konf=0
sta=0
inf=0
wyw=wyw+1
if wyw=2 then call koniec
end
End
end
GRA:
RODZAJ_GRY:
TRANSMIT off cls
TRANSMIT ''
SENDMESSAGE ''blu'What sORT oF gAME yA cHooSE : 'grn' pAYiNG wiTH 'cyn'['red'T'cyn']'grn'ime or wiTH 'cyn'['red'B'cyn']'grn'ytes ?'off''
max=1;intcolor='[44m[36m';call liczbainput;rg=input
if upper(rg) ~= 'T' & upper(rg) ~= 'B' then call RODZAJ_GRY
TRANSMIT off
IF ~exists('DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/LOTTO.CFG') then
do
TRANSMIT ''
query 'i cannot find LOTTO.CFG'
call menu
end

call open('ASL','doors:bombell_arexx/lotto_ENG/daTA/lotto.cfg','R')
do n=1 to 11
stak.n=readln('ASL')
end
call close('ASL')

if upper(rg)='T' then
do
TRANSMIT off cls
TRANSMIT '                         'whtred'INFORMATIONS ABOUT LOTTO'off''
TRANSMIT ''
TRANSMIT '              'blu'OnE tiCKET cOSTS 'red'5'blu' miNUTES oF tIME iN bbS, buT'
TRANSMIT '                yA cAN oF cOZ wIN sOMETHInG fOR thIZ tIME.'
TRANSMIT ''
TRANSMIT '            'mag'tHE biGEST pRiZe (6 hITED nUMBAS), iZ 'red'DSBL RATIO !!!.'off''
TRANSMIT ''


xa=40

TRANSMIT '                             'WHTblu'tHE sTAKE in lOTTO'off''
TRANSMIT ''
y=11
do n=2 to 6
xa=40
if stak.n<1000 then xa=41
if stak.n<100 then xa=42
if stak.n<10 then xa=43
TRANSMIT '                      'yel''n-1''grn' hITED fiGURE ='red'['y';'xa'H 'stak.n''grn' miNUTES'
y=y+1
end
TRANSMIT '                       'yel'6'grn' h¡TEÐ NUMBAS!='red' DSBL'grn' *RATiO*'off''

Getuser DT_TIMETOTAL;timel=result
timel=timel/60
if timeL < 6 then;do
transmit '';transmit ''cyn''blu''name' yA cANNOT pAY 4 tHiS gAME ( oNE tiCKET cOSTS 5 minuTES)'
TRANSMIT '                     yA hAVE oNLY 'red''timel''blu' mINUTES oN aCCoUNT'
query  '';call menu;end
TRANSMIT ''
TRANSMIT '               'cyn''name''blu' yA hAVE  'red''timel''blu' miNUTES oN yOUR aCCoUNT 'off''
SZCZ:
TRANSMIT off'[19;10H'
SENDMESSAGE '                   dO yA wANT tO tRY yOUR lUCK ?? [Y/N]'off''
max=1;intcolor='[44m[36m';call liczbainput;roz=input
if upper(roz) ~= 'Y' & upper(roz) ~= 'N' then call SZCZ
IF upper(roz) = 'Y' then call juz_gramy
call menu
end
if upper(rg)='B' then
do
TRANSMIT off cls
TRANSMIT '                          'whtred'INFORMATIONS ABOUT LOTTO'off''
TRANSMIT ''
TRANSMIT '             'blu'OnE tiCKET cOSTS 'red'10'blu' KB oF dL liMIT iN bBS , but'
TRANSMIT '                      yA cAN oF cOZ wIN sOMETHInG fOR thIZ kBS.'
TRANSMIT ''
TRANSMIT '             'mag'tHE biGEST pRiZe (6 hITED nUMBAS), iZ 'red'DSBL RATIO !!!.'off''
TRANSMIT ''
TRANSMIT '                             'WHTblu'tHE sTAKE in lOTTO'off''
TRANSMIT ''

	y=11
do n=7 to 11
	stak.n=stak.n/1000
	rb='KBytes'
	if stak.n>999 then
	do
		stak.n=stak.n/1000
		rb='MBytes'
	end
	xa=40
	if stak.n<1000 then xa=41
	if stak.n<100 then xa=42
	if stak.n<10 then xa=43
	TRANSMIT '                       'yel''n-6''grn' hITED fiGURE ='red'['y';'xa'H 'stak.n''grn' 'rb''
	y=y+1
end

TRANSMIT '                       'yel'6'grn' h¡TEÐ NUMBAS!='red' DSBL'grn' *RATiO*'off''

Getuser DT_DAILYBYTELIMIT;dlimit=result
if dlimit>999999999 then DLIMIT=999999999
dlimit=dlimit/1000
if dlimit < 11 then;do
transmit '';transmit '        'cyn''blu''name' yA cANNOT pAY 4 tHiS gAME ( oNE tiCKET cOSTS 10 KBytes)'
TRANSMIT '                      yA hAVE oNLY 'red''dlimit''blu' Kbytes oN aCCoUNT'
query  '';call menu;end
TRANSMIT ''
TRANSMIT '        'cyn''name''blu' yA hAVE oN yOUR aCCOUNT 'red''dlimit''blu' Kbytes oF dL liMIT'off''
SZCZ_1:
TRANSMIT off'[19;10H'
SENDMESSAGE '                   dO yA wANT tO tRY yOUR lUCK ?? [Y/N]'off''
max=1;intcolor='[44m[36m';call liczbainput;roz=input
if upper(roz) ~= 'Y' & upper(roz) ~= 'N' then call SZCZ_1
IF upper(roz) = 'Y' then call juz_gramy
call menu
end
JUZ_GRAMY:
TRANSMIT off cls
tab.1=  '                            'grn'+--------------------------+'
tab.2=  '                            | 1| 2| 3| 4| 5| 6| 7| 8| 9|'
tab.3=  '                            +--------------------------+'
tab.4=  '                            |10|11|12|13|14|15|16|17|18|'
tab.5=  '                            +--------------------------+'
tab.6=  '                            |19|20|21|22|23|24|25|26|27|'
tab.7=  '                            +--------------------------+'
tab.8=  '                            |28|29|30|31|32|33|34|35|36|'
tab.9=  '                            +--------------------------+'
tab.10= '                            |37|38|39|40|41|42|43|44|45|'
tab.11= '                            +-----------+--------------+'
tab.12= '                            |46|47|48|49|[0;43m    [1;30mL[34mO[30mT[0;30;43mT[1;34mO     'off'|'
Tab.13= '                            'grn'+-----------+--------------+'off''
table=13
do n=1 to table;transmit tab.n;end
znak=''wht'XX'
posz.1='[3;30H'
posz.2='[5;30H'
y=3
sk=0
as=30
do n=1 to 6
transmit off'[17;20H'
SENDMESSAGE '                          pLiZ tYPE a nUMBA.'n':'
max=2
intcolor='[44m[36m'
call LICZBAinput
cyfr=input
if n=1 then ua1=input;if ua1<1 | ua1>49 then n=0;if ua1='' then call MENU
if n=2 then;do;ua2=input;if ua2<1 | ua2>49 then n=1;if ua2=ua1 then n=1;if ua2='' then call MENU;end
if n=3 then;do;ua3=input;if ua3<1 | ua3>49 then n=2;if ua3=ua1 | ua3=ua2 then n=2;if ua3='' then call MENU;end
if n=4 then;do;ua4=input;if ua4<1 | ua4>49 then n=3;if ua4=ua1 | ua4=ua2 | ua4=ua3 then n=3;if ua4='' then call MENU;end
if n=5 then;do;ua5=input;if ua5<1 | ua5>49 then n=4;if ua5=ua1 | ua5=ua2 | ua5=ua3 | ua5=ua4 then n=4;if ua5='' then call MENU;end
if n=6 then;do;ua6=input;if ua6<1 | ua6>49 then n=5;if ua6=ua1 | ua6=ua2 | ua6=ua3 | ua6=ua4 | ua6=ua5 then n=5;if ua6='' then call MENU;end
sky=0
ska=0
if cyfr<50 & cyfr>0 then;do lo=1 to cyfr
y=3+sky;as=30+ska
ska=ska+3
if as>54 then as=54
if lo=9 then;do;sky=sky+2;ska=0;end
if lo=18 then;do;sky=sky+2;ska=0;end
if lo=27 then;do;sky=sky+2;ska=0;end
if lo=36 then;do;sky=sky+2;ska=0;end
if lo=45 then;do;sky=sky+2;ska=0;end
End
IF cyfr<50 & cyfr>0 then;do
posz.2='['y';'as'H'
TRANSMIT ''posz.2''znak''
end
transmit ''off''
end
LOSOWANIE:
TRANSMIT cls
TRANSMIT ''
TRANSMIT '                           'whtred' lOTSinG 'grn'6'wht' nuMBAs fROM  'grn'49'wht''off''
TRANSMIT ''
TRANSMIT '                       'grn'[  ]  [  ]  [  ]  [  ]  [  ]  [  ]'
TRANSMIT '                       'blu'|  |  |  |  |  |  |  |  |  |  |  |'
TRANSMIT '                       |  |  |  |  |  |  |  |  |  |  |  |'
TRANSMIT '                       |  |  |  |  |  |  |  |  |  |  |  |'
TRANSMIT '                       |  |  |  |  |  |  |  |  |  |  |  |'red''
TRANSMIT '                      .+  +--+  +--+  +--+  +--+  +--+  +.'
TRANSMIT '                      |                                  |'
TRANSMIT '                      ~----------------------------------~'off''
TRANSMIT ''
y=12
as=25
licz=1
a1=Random(1,49,time(S))
a2:
a2=Random(1,49,time(S))
if a2=a1 then call a2
a3:
a3=Random(1,49,time(S))
if a3=a1 | a3=a2 then call a3
a4:
a4=Random(1,49,time(S))
if a4=a1 | a4=a2 | a4=a3 then call a4
a5:
a5=Random(1,49,time(S))
if a5=a1 | a5=a2 | a5=a3 | a5=a4 then call a5
a6:
a6=Random(1,49,time(S))
if a6=a1 | a6=a2 | a6=a3 | a6=a4 | a6=a5 then call a6
licz1:
do n=1 to 60
posz.1='[11;25H'
licz1=Random(1,49,time(S))
if n=60 then TRANSMIT ''posz.1'   '
TRANSMIT ''posz.1''licz1''
end
TRANSMIT ''posz.1'    '
y=10;y1=11
do n=1 to 5
posz.1='['y';25H'
posz.2='['y1';25H'
TRANSMIT ''posz.1''whtred'  '
TRANSMIT ''posz.2''off'  '
y=y-1
y1=y+1
end
posz.1='[5;25H'
posz.2='[6;25H'
IF a1<10 then TRANSMIT ''posz.1' 'a1''
IF a1>9 then TRANSMIT ''posz.1''a1''
TRANSMIT ''posz.2'  '
licz2:
do n=1 to 60
posz.1='[11;31H'
licz2=Random(1,49,time(S))
if n=60 then TRANSMIT ''posz.1'    '
TRANSMIT ''posz.1''licz2''
end
TRANSMIT ''posz.1'    '
y=10;y1=11
do n=1 to 5
posz.1='['y';31H'
posz.2='['y1';31H'
TRANSMIT ''posz.1''whtred'  '
TRANSMIT ''posz.2''off'  '
y=y-1
y1=y+1
end
posz.1='[5;31H'
posz.2='[6;31H'
IF a2<10 then TRANSMIT ''posz.1' 'a2''
IF a2>9 then TRANSMIT ''posz.1''a2''
TRANSMIT ''posz.2'  '
licz3:
do n=1 to 60
posz.1='[11;37H'
licz3=Random(1,49,time(S))
if n=60 then TRANSMIT ''posz.1'    '
TRANSMIT ''posz.1''licz3''
end
TRANSMIT ''posz.1'    '
y=10;y1=11
do n=1 to 5
posz.1='['y';37H'
posz.2='['y1';37H'
TRANSMIT ''posz.1''whtred'  '
TRANSMIT ''posz.2''off'  '
y=y-1
y1=y+1
end
posz.1='[5;37H'
posz.2='[6;37H'
IF a3<10 then TRANSMIT ''posz.1' 'a3''
IF a3>9 then TRANSMIT ''posz.1''a3''
TRANSMIT ''posz.2'  '
licz4:
do n=1 to 60
posz.1='[11;43H'
licz4=Random(1,49,time(S))
if n=60 then TRANSMIT ''posz.1'    '
TRANSMIT ''posz.1''licz4''
end
TRANSMIT ''posz.1'    '
y=10;y1=11
do n=1 to 5
posz.1='['y';43H'
posz.2='['y1';43H'
TRANSMIT ''posz.1''whtred'  '
TRANSMIT ''posz.2''off'  '
y=y-1
y1=y+1
end
posz.1='[5;43H'
posz.2='[6;43H'
IF a4<10 then TRANSMIT ''posz.1' 'a4''
IF a4>9 then TRANSMIT ''posz.1''a4''
TRANSMIT ''posz.2'  '
licz5:
do n=1 to 60
posz.1='[11;49H'
licz5=Random(1,49,time(S))
if n=60 then TRANSMIT ''posz.1'    '
TRANSMIT ''posz.1''licz5''
end
TRANSMIT ''posz.1'    '
y=10;y1=11
do n=1 to 5
posz.1='['y';49H'
posz.2='['y1';49H'
TRANSMIT ''posz.1''whtred'  '
TRANSMIT ''posz.2''off'  '
y=y-1
y1=y+1
end
posz.1='[5;49H'
posz.2='[6;49H'
IF a5<10 then TRANSMIT ''posz.1' 'a5''
IF a5>9 then TRANSMIT ''posz.1''a5''
TRANSMIT ''posz.2'  '
licz6:
do n=1 to 60
posz.1='[11;55H'
licz6=Random(1,49,time(S))
if n=60 then TRANSMIT ''posz.1'   '
TRANSMIT ''posz.1''licz6''
end
TRANSMIT ''posz.1'   '
y=10;y1=11
do n=1 to 5
posz.1='['y';55H'
posz.2='['y1';55H'
TRANSMIT ''posz.1''whtred'  '
TRANSMIT ''posz.2''off'  '
y=y-1
y1=y+1
end
posz.1='[5;55H'
posz.2='[6;55H'
IF a6<10 then TRANSMIT ''posz.1' 'a6''
IF a6>9 then TRANSMIT ''posz.1''a6''
TRANSMIT ''posz.2'  '
TRAMSMIT '[16;10H'
query  '[16;10H               'blu'eND oF lOTSing --->'red'pUSH eNTER'off''
IF ~exists('DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/PLAYERS') then rz='W'
IF exists('DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/PLAYERS') then rz='A'
call open('TS','DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/PLAYERS',rz)
call writeln('TS',name)
call writeln('TS',date())
call writeln('TS',time())
call close('TS')
IF upper(rg)='T' then
do
time=timel-5
timel=time*60
putusTR timel
putuser DT_TIMETOTAL
end
IF upper(rg)='B' then
do
dlimit=dlimit-10
dlimit=dlimit*1000
putusTR dlimit
putuser DT_DAILYBYTELIMIT
end
t1=0;t2=0;t3=0;t4=0;t5=0;t6=0;
	l=0

	if a1=ua1 | a2=ua1 | a3=ua1 | a4=ua1 | a5=ua1 | a6=ua1 then; do ;l=l+1;t1=ua1;end
	if a1=ua2 | a2=ua2 | a3=ua2 | a4=ua2 | a5=ua2 | a6=ua2 then; do ;l=l+1;t2=ua2;end
	if a1=ua3 | a2=ua3 | a3=ua3 | a4=ua3 | a5=ua3 | a6=ua3 then; do ;l=l+1;t3=ua3;end
	if a1=ua4 | a2=ua4 | a3=ua4 | a4=ua4 | a5=ua4 | a6=ua4 then; do ;l=l+1;t4=ua4;end
	if a1=ua5 | a2=ua5 | a3=ua5 | a4=ua5 | a5=ua5 | a6=ua5 then; do ;l=l+1;t5=ua5;end
	if a1=ua6 | a2=ua6 | a3=ua6 | a4=ua6 | a5=ua6 | a6=ua6 then; do ;l=l+1;t6=ua6;end

INFO_O_LOSOWANIU:
	call open('ASL','doors:bombell_arexx/lotto_ENG/daTA/lotto.Cfg','R')
	do n=1 to 11
	stak.n=readln('ASL')
	end
	call close('ASL')
	IF l=6 then call DSBL_RATIO
	TRANSMIT cls

	TRANSMIT ''
	TRANSMIT '                        'whtred'iNFo aBOUT pREViOUS lOTSing'off''
	TRANSMIT ''
	TRANSMIT '                'blu'lOTSiNG hAS oCCuRED aT: 'red''time()''blu' oF 'red''date()''off''
	TRANSMIT ''
	TRANSMIT '                                 'cyn'lOTSED nUMBAS '
	TRANSMIT ''
	TRANSMIT '                         'grn'['wht''a1''grn'] ['wht''a2''grn'] ['wht''a3''grn'] ['wht''a4''grn'] ['wht''a5''grn'] ['wht''a6''grn'] 'off''
	TRANSMIT ''
	TRANSMIT '                               'cyn'yOUR nUMBAS aRE :'
	TRANSMIT ''
	TRANSMIT '                         'grn'['wht''ua1''grn'] ['wht''ua2''grn'] ['wht''ua3''grn'] ['wht''ua4''grn'] ['wht''ua5''grn'] ['wht''ua6''grn'] 'off''
	TRANSMIT ''
	TRANSMIT '                      hITED nUMBAs ---> 't1','t2','t3','t4','t5','t6' <---'
	TRANSMIT ''
	if l>0 THEN;
	do
		if l=1 then TRANSMIT '                         'red'yA hAVE hITED oNLY 'l' tiME'
		if l>1 then TRANSMIT '                         'red'yA hEVE hITED 'l' tiMES'
		if upper(rg)='T' then
		do
			if l=1 then czas_w=stak.2
			if l=2 then czas_w=stak.3
			if l=3 then czas_w=stak.4
			if l=4 then czas_w=stak.5
			if l=5 then czas_w=stak.6
			timel=timel+czas_w*60
			putustr timel
			putuser DT_TIMETOTAL
			TRANSMIT ''
			TRANSMIT '          'blu'YA hAVE *WON!* 'red''czas_w''blu' mINUTES oF aVAiLBLE tIME iN thiZ bbS!'off''
			nowy=0
			IF ~exists('DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/WINERS_1') then
			do
				nowy=1
				call open('TS','DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/WINERS_1','W')
				call writeln('TS',name)
				call writeln('TS',date())
				call writeln('TS',l)
				call writeln('TS',czas_w)
				call close('TS')
			end

			call open('TS','DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/WINERS_1','R')
			nr=0
			nrz=0
			do until eof('TS')
				nr=nr+1
				name.nr=readln('TS')
				date.nr=readln('TS')
				l.nr=readln('TS')
				czas.nr=readln('TS')
			end
			nr=nr-1
			call close('TS')

			ps=0
			nrz=nr+1
			oke=0
			IF czas_w>czas.1 then
			do
					do as=2 to nrz
						ps=as-1
						nameq.as=name.ps
						dateq.as=date.ps
						lq.as=l.ps
						czasq.as=czas.ps
					end
					nameq.1=name
					dateq.1=date()
					lq.1=l
					czasq.1=czas_w
					do as=1 to nrz
						name.as=nameq.as
						date.as=dateq.as
						l.as=lq.as
						czas.as=czasq.as
					end
					oke=1
			end
			rz='W'
			poz=0
			wynik=0

			do as=1 to nr
				poz=poz+1
				if czas_w=czas.as then wynik=poz
			end
			if nr>1 & oke=0 then
			do
				if wynik>0 then
				do
					do as=1 to wynik
						nameq.as=name.as
						dateq.as=date.as
						lq.as=l.as
						czasq.as=czas.as
					end
					do as=wynik+1 to nrz
						ps=as-1
						nameq.as=name.ps
						dateq.as=date.ps
						lq.as=l.ps
						czasq.as=czas.ps
					end
					lb=wynik+1
					nameq.lb=name
					dateq.lb=date()
					lq.lb=l
					czasq.lb=czas_w
					do as=1 to nrz
						name.as=nameq.as
						date.as=dateq.as
						l.as=lq.as
						czas.as=czasq.as
					end
				end
			end
			ab=0
			if nr>1 then
			do
				do bs=2 to nr
					ab=bs-1
					if czas_w>czas.bs & czas_w<czas.ab then
					do
						do as=1 to bs
							nameq.as=name.as
							dateq.as=date.as
							lq.as=l.as
							czasq.as=czas.as
						end
						do as=bs+1 to nrz
							ps=as-1
							nameq.as=name.ps
							dateq.as=date.ps
							lq.as=l.ps
							czasq.as=czas.ps
						end
						nameq.bs=name
						dateq.bs=date()
						lq.bs=l
						czasq.bs=czas_w
						do as=1 to nrz
							name.as=nameq.as
							date.as=dateq.as
							l.as=lq.as
							czas.as=czasq.as
						end
					end
				end
			end

			if czas_w<czas.nr then
			do
				nrz=1
				rz='A'
				name.1=name
				date.1=date()
				l.1=l
				czas.1=czas_w
			end
			if nowy=1 then rz='W'
			call open('TS','DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/WINERS_1',rz)
			do as=1 to nrz
				call writeln('TS',name.as)
				call writeln('TS',date.as)
				call writeln('TS',l.as)
				call writeln('TS',czas.as)
			end
				call close('TS')

		end

		if upper(rg)='B' then
		do
			if l=1 then dol_w=stak.7/1000
			if l=2 then dol_w=stak.8/1000
			if l=3 then dol_w=stak.9/1000
			if l=4 then dol_w=stak.10/1000
			if l=5 then dol_w=stak.11/1000
			Getuser DT_DAILYBYTELIMIT;dlimit=result
			if dlimit>999999999 then DLIMIT=999999999
			dlimit=dlimit+dol_w*1000
			putustR dlimit
			putuser DT_DAILYBYTELIMIT
			TRANSMIT ''
			TRANSMIT '               'blu'yA hAVE wON 'red''dol_w''blu' KBytes oF DL liMIT iN thIZ bbS!'off''
			nowy=0
			IF ~exists('DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/WINERS_2') then
			do
				nowy=1
				call open('TS','DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/WINERS_2','W')
				call writeln('TS',name)
				call writeln('TS',date())
				call writeln('TS',l)
				call writeln('TS',dol_w)
				call close('TS')
			end

			call open('TS','DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/WINERS_2','R')
			nr=0
			nrz=0
			do until eof('TS')
				nr=nr+1
				name.nr=readln('TS')
				date.nr=readln('TS')
				l.nr=readln('TS')
				dol.nr=readln('TS')
			end
			nr=nr-1
			call close('TS')
			do as=1 to nr
			if dol.as='DSBL' then dol.as=9999999999999
			end
			ps=0
			nrz=nr+1
			oke=0
			IF dol_w>dol.1 then
			do
					do as=2 to nrz
						ps=as-1
						nameq.as=name.ps
						dateq.as=date.ps
						lq.as=l.ps
						dolq.as=dol.ps
					end
					nameq.1=name
					dateq.1=date()
					lq.1=l
					dolq.1=dol_w
					do as=1 to nrz
					name.as=nameq.as
					date.as=dateq.as
					l.as=lq.as
					dol.as=dolq.as
					end
					oke=1
			end
			rz='W'
			poz=0
			wynik=0

			do as=1 to nr
				poz=poz+1
				if dol_w=dol.as then wynik=poz
			end

			if nr>1 & oke=0 then
			do
				if wynik>0 then
				do
					do as=1 to wynik
						nameq.as=name.as
						dateq.as=date.as
						lq.as=l.as
						dolq.as=dol.as
					end
					do as=wynik+1 to nrz
						ps=as-1
						nameq.as=name.ps
						dateq.as=date.ps
						lq.as=l.ps
						dolq.as=dol.ps
					end
					lb=wynik+1
					nameq.lb=name
					dateq.lb=date()
					lq.lb=l
					dolq.lb=dol_w
					do as=1 to nrz
						name.as=nameq.as
						date.as=dateq.as
						l.as=lq.as
						dol.as=dolq.as
					end
				end
			end

			ab=0
			if nr>1 then
			do
				do bs=2 to nr
				ab=bs-1
					if dol_w>dol.bs & dol_w<dol.bs then
					do
						do as=1 to bs
							nameq.as=name.as
							dateq.as=date.as
							lq.as=l.as
							dolq.as=dol.as
						end
						do as=bs+1 to nrz
							ps=as-1
							nameq.as=name.ps
							dateq.as=date.ps
							lq.as=l.ps
							dolq.as=dol.ps
						end
						nameq.bs=name
						dateq.bs=date()
						lq.bs=l
						dolq.2=dol_w
						do as=1 to nrz
							name.as=nameq.as
							date.as=dateq.as
							l.as=lq.as
							dol.as=dolq.as
						end
					end
				end
			end


			if dol_w<dol.nr then
			do
				nrz=1
				rz='A'
				name.1=name
				date.1=date()
				l.1=l
				dol.1=dol_w
			end
			if nowy=1 then rz='W'
			call open('TS','DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/WINERS_2',rz)		
			do as=1 to nrz
				call writeln('TS',name.as)
				call writeln('TS',date.as)
				call writeln('TS',l.as)
				call writeln('TS',dol.as)
			end
				call close('TS')

		end

	end
	if l=0 THEN 
	do
		TRANSMIT '               'red''name' sorry but yA dOnt hItED aNY nUMBA hE HE!'
		TRANSMIT '                   dont woRRy nEXT tIME wILL bE bEtTER.. :)'
		TRANSMIT ''off''
	end
	if upper(rg)='T' then
	do
		Getuser DT_TIMETOTAL;timel=result
		TRANSMIT ''
		TRANSMIT '              'cyn''name''blu' yA hAVE oN yOUR AccOUNT 'red''timel/60''blu' miNUTES'off''
		TRANSMIT ''

	end
	if upper(rg)='B' then
	do
		Getuser DT_DAILYBYTELIMIT;dlimit=result
		if dlimit>999999999 then DLIMIT=999999999
		TRANSMIT ''
		TRANSMIT '           'cyn''name''blu' yA hAVE oN yOUR aCCoUNT 'red''dlimiT/1000''blu' Kbytes oF dL liMIT 'off''
		TRANSMIT ''
	end
	TRANSMIT ''
	query '                         ---> pUSH eNTER !!! '
	call MENU

LICZBAinput:
	do er=1 to max;sendmessage intcolor' ';end;sendmessage '['max'D';input='';len=0;hh=0;do until hold=1;getchar;chr=result;if chr=cr then leave;if c2x(chr)='08' then;do;if length(input)>0 then;do;input=left(input,length(input)-1);sendmessage chr' 'chr;if hh=1 then;do;hh=0;end;else;do;hh=1;end;len=len-1;end;else;do;input='';len=0;end;end;else;do;if length(input)<max then;do;input=input''chr;len=len+1;if hh=1 then;do;sendmessage ''chr'';hh=0;end;else;do;sendmessage ''chr'';hh=1;end;end;end;end;len=len-1;tr '';return;

	setcur='[14;2H'

koniec:

        TRANSMIT off setcur
	TRANSMIT ''
	TRANSMIT ''
	SENDMESSAGE '              dO yA rEALLY waNNA tO sAY gOOD bYE ? [Y/N]'
	max=1;intcolor='[44m[36m';call liczbainput;w=input
	if upper(w)='N' then call MENU
	If upper(w) ~= 'N' & upper(w) ~= 'Y' then call koniec
	TRANSMIT off cls
	TRANSMIT '[8;49H'
	TRANSMIT '                               LOTTO 'ver$' by BomBeLL'
	TRANSMIT ''
	TRANSMIT '                                'red'gOOD bYE 'name' ;)'blu''
	TRANSMIT ''
        TRANSMIT '      iF yA hAVE sOME pROPOSiTIONS aBOUT tHIz dOOR pLIZ cONTACT wITH mE! '
	TRANSMIT ''
	TRANSMIT '       'cyn'nOnAME bbS 'red'+48 aSK sPOONMAN'yel' sYSOP: Bombell'blu' - 'grn'wRite tO sYSOP! 'off''
	TRANSMIT ''
	TRANSMIT '       'cyn'rUSSiA bBS 'red'+48 71 576946   'yel' SYSOP:sPOONMAN'blu' - 'grn'wriTE tO BomBeLL'

exit






MENU_2:

	TRANSMIT off cls
	TRANSMIT '[0m'
	TRANSMIT '[0m'
	TRANSMIT '[0m                      [30m [43mo[31m---------------------------[40m[30;43mo'
	TRANSMIT '[0m                      [30;43m[40m [43mo        L [1;34mO [0;30;43mT T [1;34mO         [0;30;43m o[40m'
	TRANSMIT '[0m                      [30m [43mo[31m---------------------------[30mo'
	TRANSMIT off
	wskaznik=''mag'-->'
	line.1='                         'red'['wht'1'red']'blu' tEN tOP plAYERS 4 tIME  '
	line.2='                         'red'['wht'2'red']'blu' tEN tOP pLAYERS 4 cREDiTS '
	line.3='                'red'['wht'3'red']'blu' lIST oF pEOPLE wHO hAVE pLAYED lOTTO!..'
	line.4=''
	line.5='                         'red'['wht'B'red']'blu' bACK tO mAIN mENU!'off''
	line.6=''
	line.7=''
	LENLIN=7
	do n=1 to lenlin
		TRANSMIT line.n
	end
	sendmessage '                          'grn' iTs yOUR chOiCE 'off''

	pos.1='[8;22H'
	pos.2='[9;22H'
	pos.3='[10;13H'
	pos.4='[12;22H'
	setcur='[15;44H'

sret=0
wyw=0
sta=0
inf=0
inf2=0

poba:
do until sret=1
	getchar
	resp=result
	if upper(resp) ~= 'B' & c2x(resp) ~=31 & c2x(resp) ~=32 & c2x(resp) ~=33 then;do;call poba;end
	Select
		when C2X(resp)=31 then
		do
		TRANSMIT ''pos.1''wskaznik''
		TRANSMIT ''pos.2'    '
		TRANSMIT ''pos.3'    '
		TRANSMIT ''pos.4'    '
		SENDMESSAGE setcur
		wyw=0
		inf=0
		inf2=0
		sta=sta+1
		if sta=2 then call INFO_1
		end
		when C2X(resp)=32 then
		do 
		TRANSMIT ''pos.1'    '
		TRANSMIT ''pos.2''wskaznik''
		TRANSMIT ''pos.3'    '
		TRANSMIT ''pos.4'    '
		SENDMESSAGE setcur
		sta=0
		wyw=0
		inf2=0
		inf=inf+1
		if inf=2 then call info_2
		end
		when C2X(resp)=33 then
		do 
		TRANSMIT ''pos.1'    '
		TRANSMIT ''pos.2'    '
		TRANSMIT ''pos.3''wskaznik''
		TRANSMIT ''pos.4'    '
		SENDMESSAGE setcur
		sta=0
		wyw=0
		inf=0
		inf2=inf2+1
		if inf2=2 then call info_3
		end
		when C2X(resp)=62 | C2X(resp)=42 then
		do 
		TRANSMIT ''pos.1'    '
		TRANSMIT ''pos.2'    '
		TRANSMIT ''pos.3'    '
		TRANSMIT ''pos.4''wskaznik''
		SENDMESSAGE setcur
		sta=0
		inf2=0
		inf=0
		wyw=wyw+1
		if wyw=2 then call menu
		end
	end
end


info_1:

n=0
TRANSMIT cls

if ~exists('doors:bombell_aREXX/LOTTO_ENG/DATA/WINERS_1') then
do
TRANSMIT ''
query ''blu'nObODY hAD eVER pLAy thIZ SHIT! MAYBE YA tRY ?'off''
call menu_2
end



TRANSMIT '                             'whtred'10 TOP PLAYERS 4 tIME'off''

if exists('doors:bombell_aREXX/LOTTO_ENG/DATA/WINERS_1') then
do
call open('WINERS_1','doors:bombell_aREXX/LOTTO_ENG/DATA/WINERS_1')
do until eof('WINERS_1')
n=n+1
NAZWISKO.n=readln('WINERS_1')
DATA.n=readln('WINERS_1')
TRAF.n=readln('WINERS_1')
WYGRAL.n=readln('WINERS_1')
end
call close('WINERS_1')

n=n-1
if n>10 then  n=10
ys=6
	TRANSMIT ''
	TRANSMIT '     'blu'LOCATION  PLAYER             DATE         HITED  AMOUNT OF MINUTES'off''
	TRANSMIT '     'grn'--------  ---------------------------------------------------------'off''
do as=1 to n
	TRANSMIT '   'as'.   ['ys';15H 'NAZWISKO.as'   ['ys';34H 'data.as'  ['ys';50H 'traf.as'  ['ys';60H 'wygral.as''
	ys=ys+1
end
	TRANSMIT ''
	TRANSMIT ''
	query '                        'mag'------->pUSH eNTER!!!'
	call menu_2

info_2:

n=0
TRANSMIT cls

if ~exists('doors:bombell_aREXX/LOTTO_ENG/DATA/WINERS_2') then
do
TRANSMIT ''
query ''blu'nObODY hAD eVER pLAy thIZ SHIT! MAYBE YA tRY ?'off''
call menu_2
end



TRANSMIT '                            'whtred' 10 TOP 4 CREDiTS 'off''

if exists('doors:bombell_aREXX/LOTTO_ENG/DATA/WINERS_2') then
do
call open('WINERS_2','doors:bombell_aREXX/LOTTO_ENG/DATA/WINERS_2')
do until eof('WINERS_2')
n=n+1
NAZWISKO.n=readln('WINERS_2')
DATA.n=readln('WINERS_2')
TRAF.n=readln('WINERS_2')
WYGRAL.n=readln('WINERS_2')
end
call close('WINERS_2')

n=n-1
if n>10 then  n=10
ys=6
	TRANSMIT ''
	TRANSMIT '     'blu'LOCATION  PLAYER             DATE         HITED  AMOUNT OF KBYTES'off''
	TRANSMIT '     'grn'--------  --------------------------------------------------------'off''
do as=1 to n
	TRANSMIT '         'as'.   ['ys';15H 'NAZWISKO.as'   ['ys';34H 'data.as'  ['ys';50H 'traf.as'  ['ys';60H 'wygral.as''
	ys=ys+1
end
	TRANSMIT ''
	TRANSMIT ''
	query '                        'mag'------->pUSH eNTER!!!'
	call menu_2

info_3:

n=0
TRANSMIT cls

if ~exists('doors:bombell_aREXX/LOTTO_ENG/DATA/PLAYERS') then
do
TRANSMIT ''
query ''blu'Jeszcze nikt niestety nie gral w LOTTO ;('off''
call menu_2
end

if exists('doors:bombell_aREXX/LOTTO_ENG/DATA/PLAYERS') then
do
call open('PLAYERS','doors:bombell_aREXX/LOTTO_ENG/DATA/PLAYERS')
do until eof('PLAYERS') 
n=n+1
NAZWISKO.n=readln('PLAYERS')
DATA.n=readln('PLAYERS')
CZAS.n=readln('PLAYERS')

end
call close('PLAYERS')

n=n-1
ys=4
st=10

TRANSMIT '                         'whtred'PEOPLE WHO HAVE PLAYED LOTTO'off''
TRANSMIT ''
do as=1 to n
TRANSMIT '   ['ys';10H'as'.   ['ys';15H 'NAZWISKO.as'   ['ys';35H 'data.as'    'czas.as''
if as=st then
do
	st=st+10
	TRANSMIT ''
	query '                        'mag'------->pUSH eNTER!!!'off''
	TRANSMIT cls

	TRANSMIT '                         'whtred'PEOPLE WHO HAVE PLAYED LOTTO'off''
	ys=3
end

ys=ys+1
end
	TRANSMIT ''
	TRANSMIT ''
	query '                        'mag'------->pUSH ENTER!!!'
	call menu_2

KONFIGURACJA:

DT_USERTYP=105;Getuser DT_USERTYP;usertyp=result

TRANSMIT cls
if usertyp=255 then call asl
TRANSMIT 'sorry.. but oNLY sYSOP cAN dO thIZ!!!!'
query


ASL:

IF ~exists('DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/LOTTO.CFG') then
do
TRANSMIT ''
query 'i cannot find LOTTO.CFG'
call menu
end

call open('ASL','doors:bombell_aREXX/LOTTO_ENG/DATA/LOTTO.CFG','R')
asl=readln('ASL')
call close('ASL')

zle=0
WPISZ_ASL:
TRANSMIT off cls
SENDMESSAGE '[8;10HpLiZ eNTER tHE pASSWORD :'
max=10;intcolor='[44m[36m';call aslinput;aslm=input
IF upper(aslm)=upper(asl) then
do
	TRANSMIT off''
	query '         'red'CORRECT !!!'off''
	call KONF
end
	TRANSMIT off''
	query '         'red'hACKin oR wAHT ?'off''
	zle=zle+1
	if zle=3 then
	do
		TRANSMIT ''
		query '         sORRY dUDE YA dOnt hAVE aCC tO thIz .;) !!!'
		call menu
	end
	call wpisz_asl




aslinput:
do er=1 to max
sendmessage intcolor' '
end
sendmessage '['max'D'
input=''
len=0
hh=0
do until hold=1
getchar
chr=result
if chr=cr then leave
if c2x(chr)='08' then
do
if length(input)>0 then
do
input=left(input,length(input)-1)
sendmessage chr' 'chr
if hh=1 then
do
hh=0
end
else
do
hh=1
end
len=len-1
end
else
do
input=''
len=0
end
end
else
do
if length(input)<max then
do
input=input''chr
len=len+1
if hh=1 then
do
sendmessage '*'
hh=0
end
else
do
sendmessage '*'
hh=1
end
end
end
end
len=len-1
tr ''
return

KONF:
TRANSMIT off cls
TRANSMIT ''
TRANSMIT '                          'whtred' cONFIGURATIOn oF lOTTO!'off''
TRANSMIT ''
wskaznik=''mag'-->'
line.1='                          'red'['wht'1'red']'blu' StaKe iN gAMe 4 tIME'
line.2='                          'red'['wht'2'red']'blu' StaKe iN gAMe 4 bYTES'
line.3=''
line.4='                          'red'['wht'B'red']'blu' BaCK tO mAIN mENU!'
line.5=''
line.6=''
LENLIN=6
	do n=1 to lenlin
		TRANSMIT line.n
	end
	sendmessage '                          'grn' iTs yOUR chOiCE 'off''

	pos.1='[5;22H'
	pos.2='[6;22H'
	pos.3='[8;22H'
	setcur='[11;44H'

sret=0
wyw=0
sta=0
inf=0
inf2=0

pobb:
do until sret=1
	getchar
	resp=result
	if upper(resp) ~= 'B' & c2x(resp) ~=31 & c2x(resp) ~=32 then;do;call pobB;end
	Select
		when C2X(resp)=31 then
		do
		TRANSMIT ''pos.1''wskaznik''
		TRANSMIT ''pos.2'    '
		TRANSMIT ''pos.3'    '
		SENDMESSAGE setcur
		wyw=0
		inf=0
		inf2=0
		sta=sta+1
		if sta=2 then call KONF_1
		end
		when C2X(resp)=32 then
		do 
		TRANSMIT ''pos.1'    '
		TRANSMIT ''pos.2''wskaznik''
		TRANSMIT ''pos.3'    '
		SENDMESSAGE setcur
		sta=0
		wyw=0
		inf2=0
		inf=inf+1
		if inf=2 then call KONF_2
		end
		when C2X(resp)=62 | C2X(resp)=42 then
		do 
		TRANSMIT ''pos.1'    '
		TRANSMIT ''pos.2'    '
		TRANSMIT ''pos.3''wskaznik''
		SENDMESSAGE setcur
		sta=0
		inf2=0
		inf=0
		wyw=wyw+1
		if wyw=2 then call menu
		end
	end
end

KONF_1:

TRANSMIT cls
TRANSMIT ''
TRANSMIT '                    'whtred' cONFIGURATIOn sTAKE oF lOTTO 4 tIME!'off''
TRANSMIT ''
call open('ASL','doors:bombell_aREXX/LOTTO_ENG/DATA/LOTTO.CFG','R')
do n=1 to 11
stak.n=readln('ASL')
end

xa=40
y=7

call close('ASL')
TRANSMIT '                             'WHTblu'tHE sTAKE in lOTTO'off''
TRANSMIT ''
do n=2 to 6
xa=40
if stak.n<1000 then xa=41
if stak.n<100 then xa=42
if stak.n<10 then xa=43
TRANSMIT '                      'yel''n-1''grn' hITED fiGURE ='red'['y';'xa'H 'stak.n''grn' miNUTES'
y=y+1
end
TRANSMIT '                       'yel'6'grn' h¡TEÐ NUMBAS!='red' DSBL'grn' *RATiO*'off''
TRANSMIT ''
WYBA:
TRANSMIT off
TRANSMIT  '[14;10H'
SENDMESSAGE ''blu'                   dO yA wANT tO cHANGE tHIS ?? [Y/N]'off''
max=1;intcolor='[44m[36m';call liczbainput;roz=input
if upper(roz) ~= 'Y' & upper(roz) ~= 'N' then call WYBA
IF upper(roz) = 'Y' then call ZMIANA_KONF_1
call KONF

ZMIANA_KONF_1:

do n=2 to 6
	TRANSMIT off cls
	TRANSMIT ''
	xa=40
	if stak.n<1000 then xa=41
	if stak.n<100 then xa=42
	if stak.n<10 then xa=43
	TRANSMIT '    [4;20H'yel''n-1''grn' hITED fiGURE ='red'[4;'xa'H 'stak.n''grn' miNUTES'
	TRANSMIT  '[6;10H'
	SENDMESSAGE 'cHANGE fOR (mINUTES) :'
	max=4;intcolor='[44m[36m';call liczbainput;stakchng.n=input
	odn=0
	if n>2 then
	do
		na=n-1
		if stakchng.n ~='' & stakchng.n<stakchng.na then
		do 
			TRANSMIT off
			query ' 'red'Nie mozesz dac mniejszej stawki niz poprzednia'off''
			n=n-1
		end
	end
	if stakchng.n=''  then n=n-1
end

stakchng.1=asl

do as=7 to 11
stakchng.as=stak.as
end



call open('ASL','doors:bombell_aREXX/LOTTO_ENG/DATA/LOTTO.CFG','W')
do n=1 to 11
	call writeln('ASL',stakchng.n)
end
call close('ASL')
call KONF

KONF_2:

TRANSMIT cls
TRANSMIT ''
TRANSMIT '                    'whtred' cONFIGURATIOn sTAKE oF lOTTO 4 bYTES!'off''
TRANSMIT ''
call open('ASL','doors:bombell_aREXX/LOTTO_ENG/DATA/LOTTO.CFG','R')
do n=1 to 11
	stak.n=readln('ASL')
end
call close('ASL')

TRANSMIT '                             'WHTblu'tHE sTAKE in lOTTO'off''
TRANSMIT ''

xa=40
y=7

do n=7 to 11
	xa=40
	stak.n= stak.n/1000
	rb='KBytes'
	if stak.n>999 then
	do
		stak.n=stak.n/1000
		rb='MBytes'
	end
	if stak.n<1000 then xa=41
	if stak.n<100 then xa=42
	if stak.n<10 then xa=43
	TRANSMIT '                       'yel''n-6''grn' hITED fiGURE ='red'['y';'xa'H 'stak.n''grn' 'rb''
	y=y+1
end

TRANSMIT '                       'yel'6'grn' h¡TEÐ NUMBAS!='red' DSBL'grn' *RATiO*'off''
TRANSMIT ''
WYBB:
TRANSMIT  off
TRANSMIT  '[14;10H'
SENDMESSAGE ''blu'                   dO yA wANT tO cHANGE tHIS ?? [Y/N]'off''
max=1;intcolor='[44m[36m';call liczbainput;roz=input
if upper(roz) ~= 'Y' & upper(roz) ~= 'N' then call WYBB
IF upper(roz) = 'Y' then call ZMIANA_KONF_2
call KONF

ZMIANA_KONF_2:

call open('ASL','doors:bombell_aREXX/LOTTO_ENG/DATA/LOTTO.CFG','R')
do n=1 to 11
stak.n=readln('ASL')
end
call close('ASL')

do n=7 to 11
TRANSMIT off cls
TRANSMIT ''
xa=40
	stak.n=stak.n/1000
	rb='KBytes'
	if stak.n>999 then
	do
		stak.n=stak.n/1000
		rb='MBytes'
	end
if stak.n<1000 then xa=41
if stak.n<100 then xa=42
if stak.n<10 then xa=43
TRANSMIT '     [4;20H'yel''n-6''grn' hITED fiGURE ='red'[4;'xa'H 'stak.n''grn' 'rb''
TRANSMIT  '[6;10H'
SENDMESSAGE 'cHANGE fOR (Bytes):'
max=10;intcolor='[44m[36m';call liczbainput;stakchng.n=input
	if n>7 then
	do
		na=n-1
		if stakchng.n ~='' & stakchng.n<stakchng.na then
		do 
			TRANSMIT off
			query ' 'red'Nie mozesz dac mniejszej stawki niz poprzednia'off''
			n=n-1
		end
	end



if stakchng.n='' then n=n-1
end

do n=1 to 6
stakchng.n=stak.n
end

call open('ASL','doors:bombell_aREXX/LOTTO_ENG/DATA/LOTTO.CFG','W')
do n=1 to 11
call writeln('ASL',stakchng.n)
end
call close('ASL')
call KONF

DSBL_RATIO:

TRANSMIT off cls
showfile 'doors:BomBeLL_Arexx/LOTTO_ENG/DATA/WIN.ANSI'
TRANSMIT '                         'whtred'yA hEVE hITED 'l' tiMES'off''
TRANSMIT ''
DT_BBS          = 11;Getuser DT_BBS;BBS=RESULT
TRANSMIT '     'red''name''blu', YA hAVE 'grn'*WON!* 'red'D'yel'S'wht'B'cyn'L 'mag'RATIO !!! 'blu'iN 'bbS'!'off''
timel=1000*60
putustr timel
putuser DT_TIMETOTAL
DT_RATIO = 106;Getuser DT_RATIO;ratio=result
ratio=0
putustr RATIO
putuser DT_RATIO
	
TRANSMIT ''
TRANSMIT '              'cyn'aND'blu' yA hAVE oN yOUR AccOUNT 'red''timel/60''blu' miNUTES'off''
query
czas_w=1000
			nowy=0
			IF ~exists('DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/WINERS_1') then
			do
				nowy=1
				call open('TS','DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/WINERS_1','W')
				call writeln('TS',name)
				call writeln('TS',date())
				call writeln('TS',l)
				call writeln('TS',czas_w)
				call close('TS')
			end

			call open('TS','DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/WINERS_1','R')
			nr=0
			nrz=0
			do until eof('TS')
				nr=nr+1
				name.nr=readln('TS')
				date.nr=readln('TS')
				l.nr=readln('TS')
				czas.nr=readln('TS')
			end
			nr=nr-1

			call close('TS')
			ps=0
			nrz=nr+1
			oke=0
			IF czas_w>czas.1 then
			do
					do as=2 to nrz
						ps=as-1
						nameq.as=name.ps
						dateq.as=date.ps
						lq.as=l.ps
						czasq.as=czas.ps
					end
					nameq.1=name
					dateq.1=date()
					lq.1=l
					czasq.1=czas_w
					do as=1 to nrz
					name.as=nameq.as
					date.as=dateq.as
					l.as=lq.as
					czas.as=czasq.as
					end
					oke=1
			end
			rz='W'
			poz=0

			do as=1 to nr
				poz=poz+1
				if czas_w=czas.as then wynik=poz
			end

			if nr>1 & oke=0 then
			do
				if wynik>0 then
				do
					do as=1 to wynik
						nameq.as=name.as
						dateq.as=date.as
						lq.as=l.as
						czasq.as=czas.as
					end
					do as=wynik+2 to nrz
						ps=as-1
						nameq.as=name.ps
						dateq.as=date.ps
						lq.as=l.ps
						czasq.as=czas.ps
					end
					lb=wynik+1
					nameq.lb=name
					dateq.lb=date()
					lq.lb=l
					czasq.lb=czas_w
					do as=1 to nrz
						name.as=nameq.as
						date.as=dateq.as
						l.as=lq.as
						czas.as=czasq.as
					end
				end
			end

			if nowy=1 then rz='W'
			call open('TS','DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/WINERS_1',rz)
			do as=1 to nrz
				call writeln('TS',name.as)
				call writeln('TS',date.as)
				call writeln('TS',l.as)
				call writeln('TS',czas.as)
			end
				call close('TS')

czas_w='DSBL'
			nowy=0
			IF ~exists('DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/WINERS_2') then
			do
				nowy=1
				call open('TS','DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/WINERS_2','W')
				call writeln('TS',name)
				call writeln('TS',date())
				call writeln('TS',l)
				call writeln('TS',czas_w)
				call close('TS')
			end

			call open('TS','DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/WINERS_2','R')
			nr=0
			nrz=0
			do until eof('TS')
				nr=nr+1
				name.nr=readln('TS')
				date.nr=readln('TS')
				l.nr=readln('TS')
				czas.nr=readln('TS')
			end
			nr=nr-1

			call close('TS')
			ps=0
			nrz=nr+1
			oke=0
			rz='W'
			poz=0

			do as=1 to nr
				poz=poz+1
				if czas_w=czas.as then wynik=poz
			end

			if nr>1 & oke=0 & nowy=0 then
			do
				if wynik>0 then
				do
					do as=1 to wynik
						nameq.as=name.as
						dateq.as=date.as
						lq.as=l.as
						czasq.as=czas.as
					end
					do as=wynik+2 to nrz
						ps=as-1
						nameq.as=name.ps
						dateq.as=date.ps
						lq.as=l.ps
						czasq.as=czas.ps
					end
					lb=wynik+1
					nameq.lb=name
					dateq.lb=date()
					lq.lb=l
					czasq.lb=czas_w
					do as=1 to nrz
						name.as=nameq.as
						date.as=dateq.as
						l.as=lq.as
						czas.as=czasq.as
					end
				oke=1
				end
			end

			IF oke=0 & nowy=0 then
			do
					do as=2 to nrz
						ps=as-1
						nameq.as=name.ps
						dateq.as=date.ps
						lq.as=l.ps
						czasq.as=czas.ps
					end
					nameq.1=name
					dateq.1=date()
					lq.1=l
					czasq.1=czas_w
					do as=1 to nrz
					name.as=nameq.as
					date.as=dateq.as
					l.as=lq.as
					czas.as=czasq.as
					end
			end
		
			if nowy=1 then 
			do
			nrz=1
			rz='W'
			end
			call open('TS','DOORS:BomBeLL_AREXX/LOTTO_ENG/DATA/WINERS_2',rz)
			do as=1 to nrz
				call writeln('TS',name.as)
				call writeln('TS',date.as)
				call writeln('TS',l.as)
				call writeln('TS',czas.as)
			end
				call close('TS')



call menu
exit
