/* $VER: TAG v1.2ø bY EuReX / MEDELLiN */

options results
parse arg node
signal on syntax
signal on error
signal on ioerr

address value "AERexxControl"node

gu = getuser ; tr = transmit ; hk = getchar ; ss = sendstring

gu 100 ; user = result

File = "Doors:Tag/Tag.txt"
LOGF = "Doors:Tag/Log.txt"
Lines= "Doors:Tag/Tag.Lines"

open(Lin,Lines,'R')
Total = readln(Lin)
timefinal=random(1,total,time("S"))
do i=0 to timefinal
        MSG = center(readln(Lin),80)
        end                  
close(Lin)

TAG = '                     [33mT[32m.[33mA[32m.[33mG[32m. [36mv1.2ø [0mBy [35;1mEuReX[0m / [37;3mMedelliN[0m'

CLS = D2C(12) 
LFD = D2C(10)
  x = 0

If ~Open(Tag,File,'R') then call MakeFile
If ~Open(Log,LOGF,'A') then Call MakeLog

Do until EOF(Tag)
 x = x + 1
Line.x = readln(Tag)
End
Close(Tag)

call SHOW

ss 'Do You Wanna TAG to the Wall ? [y/N] '
getchar
if upper(result) ~= 'Y' then do
  ss "No...[25;0H[36mOky... It's Yøur Life![0m"
  call Quit
end
tr 'Yeah...'

tr '[0m[1;0H'
tr '[33;4m                                                                                '
tr '[44m          T.A.G. v1.2ø Cøded by EuReX øf MEDELLiN in the Year øf 1994           [0m'

ss '[24;0HDo You WaNNa SiGn Yar TaG ? [y/N] '
getchar
if upper(result) ~= 'Y' then do
 Length = 80  
 tr "No..."
 Call Tag
End
tr "Yeah..."
Length = 77-wordlength(user,1) 
Name = YES

TAG:
ss "[26;0H[44;33m                                                                                [26;0H"
if Length ~=80 then do
  USR = right(" : "USER,80)
  ss "[26;0H"USR"[26;0H"
end	
RECEIVE length
query 

 POS = result
 BAK = result
 STY = result
NEW = LEFT(POS,length)

IF result = "" then do
abort = left("[26;0H[0;36mAborted...",94)
tr ""abort
Call Quit
end

ss '[0mDo You Wanna Style Your Tag ? [Y/n] '
getchar
 if upper(result) = 'N' then do 
 ss "No..."
 call Save0
end
tr 'Yeah...'

POSITION:

tr '[0m'CLS'[3;0H[44m'CENTER('°~° St¥le ¥øu® TaG °~°',80)'[0m'LFD
tr '[33m[\]--- -- - -- ---- ----- --- ------ --------- ----- ---- --- -------- --- -- ->[0m'
IF NAME = YES then tr left(BAK,length)" : "USER
IF NAME ~= YES then tr BAK
tr '[33m<- -- --- -------- --- ---- ----- --------- ------ --- ----- ---- -- - -- ---[/][0m'
tr LFD'          [1] LEFT              [2] CENTE®              [3] RiGHT'LFD''LFD
tr LFD'          [[37mQ[0m][37m QUIT              [0m[[37mN[0m][37m NEXT SC®EEN        [0m [[37mS[0m][37m SAVE[0m'
tr '[0m' 
tr '[44m             cA££ »C¡V¡L WaR« MEÐE££íN eHq «» +41 27 227 472 «»                 [0m'   


POSITION2:
tr '[5;0H'
getchar
if upper(result) = "Q" then call Quit2
if upper(result) = "N" then call COLOR
if upper(result) = "S" then call SAVE1
if result = "1" then NEW = LEFT(POS,length)
if result = "2" then NEW = CENTER(POS,length)
if result = "3" then NEW = RIGHT(POS,length)
TEST = Y
ss NEW
if NAME = YES then tr '[6;'length+2'H[0m: 'USER
call POSITION2

COLOR:
If TEST ~= Y then NEW = left(pos,length)
TEST=0

COLOR1:
tr '[0m'CLS'[3;0H[44m'CENTER('°~° St¥le ¥øu® TaG °~°',80)'[0m'LFD
tr '[33m[\]--- -- - -- ---- ----- --- ------ --------- ----- ---- --- -------- --- -- ->[0m'
IF NAME = YES then tr left(NEW,length)"[0m : "USER
IF NAME ~= YES then tr NEW
tr '[33m<- -- --- -------- --- ---- ----- --------- ------ --- ----- ---- -- - -- ---[/][0m'
tr LFD'          [1] WHiTE					[2] G®EEN'
tr '          [3] YELLøW		[4] BLµE		[5] ViOLET'
tr '          [6] C¥AN 					[7] ®ED'
tr LFD'          [[37mQ[0m][37m QUIT              [0m[[37mN[0m][37m NEXT SC®EEN        [0m [[37mS[0m][37m SAVE[0m'
tr '[0m' 
tr '[44m             cA££ »C¡V¡L WaR« MEÐE££íN eHq «» +41 27 227 472 «»                 [0m'   
COL = NEW

COLOR2:
tr '[5;0H'
POS = NEW
getchar
if upper(result) = "Q" then call Quit2
if upper(result) = "N" then call Style
if upper(result) = "S" then call Save2
if result = "1" then COL = '[31m'POS'[0m'
if result = "2" then COL = '[32m'POS'[0m'
if result = "3" then COL = '[33m'POS'[0m'
if result = "4" then COL = '[34m'POS'[0m'
if result = "5" then COL = '[35m'POS'[0m'
if result = "6" then COL = '[36m'POS'[0m'
if result = "7" then COL = '[37m'POS'[0m'
if result = "8" then COL = '[38m'POS'[0m'
TEST = Y
ss COL
if NAME = YES then tr '[6;'length+2'H[0m: 'USER
call COLOR2

STYLE:
If TEST ~= Y then COL = '[31m'POS'[0m'
TEST=0

STYLE1:
tr '[0m'CLS'[3;0H[44m'CENTER('°~° St¥le ¥øu® TaG °~°',80)'[0m'LFD
tr '[33m[\]--- -- - -- ---- ----- --- ------ --------- ----- ---- --- -------- --- -- ->[0m'
IF NAME = YES then tr left(COL,length+5)"[0m : "USER
IF NAME ~= YES then tr COL
tr '[33m<- -- --- -------- --- ---- ----- --------- ------ --- ----- ---- -- - -- ---[/][0m'
tr LFD'          [1] NORMAL            [2] BOLD                [3] ITALIC'
tr    '          [4] INVERSE                                   [5] BOLD-ITALIC'LFD  
tr LFD'          [[37mQ[0m][37m QUIT                                     [0m [[37mS[0m][37m SAVE[0m'
tr '[0m' 
tr '[44m             cA££ »C¡V¡L WaR« MEÐE££íN eHq «» +41 27 227 472 «»                 [0m'   
STY = COL

STYLE2:
tr '[5;0H'
POS = COL
getchar
if upper(result) = "Q" then call Quit2
if upper(result) = "S" then call Save3
if result = "1" then STY = '[0m'POS
if result = "2" then STY = '[1m'POS
if result = "3" then STY = '[3m'POS
if result = "4" then STY = '[7m'POS
if result = "5" then STY = '[1;3m'POS
ss STY
if NAME = YES then tr '[6;'length+2'H[0m: 'USER
call STYLE2

Quit2:
tr '[14;0H'
call quit
end

Save0:
if NAME = YES then ZIP = left(POS,length)' : 'USER
IF NAME ~= YES then ZIP = POS
call Save

Save1:
if NAME = YES then ZIP = NEW' : 'USER
IF NAME ~= YES then ZIP = NEW
call Save

Save2:
if NAME = YES then ZIP = COL' : 'USER
IF NAME ~= YES then ZIP = COL
call Save

Save3:
if NAME = YES THEN ZIP = STY' : 'USER
if NAME ~= YES THEN ZIP = STY

Save:
Line.1 = Line.2 
Line.2 = Line.3 
Line.3 = Line.4 
Line.4 = Line.5 
Line.5 = Line.6 
Line.6 = Line.7 
Line.7 = Line.8 
Line.8 = Line.9 
Line.9 = Line.10 
Line.10 = Line.11 
Line.11 = Line.12 
Line.12 = Line.13 
Line.13 = Line.14 
Line.14 = Line.15 
Line.15 = ZIP
call Show

ss '[0mDo You Wanna Save This? [y/N] '
getchar
if upper(result) ~= 'Y' then do
 ss "No...[25;0H[36mOky... I Høpe tø See YøU SøøN FøR A ReaL TaG ![0m"
 call Quit
end

tr 'Yeah...'
Open(Tag,File,'W')
Do x = 1 to 15
writeln(Tag,''Line.x'')
End
Close(Tag)

writeln(Log,'[32m'User' Says:[0m')
writeln(Log,BAK)

Call Quit

Syntax:
tr '*** Syntax Error in line : #'sigl
tr errortext(sigl) 
call Quit
Error:
tr '*** Unknow Error in line : #'sigl
tr errortext(sigl)
call Quit
IOERR:
tr '*** I/O Error in line : #'sigl
tr errortext(sigl)

Quit:
tr LFD
ShutDown
Exit

SHOW:
tr '[0m'CLS''LFD'[33;4m                                                                                '
tr '[44m|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-|-T.A.G. v1.2ø[0m'
tr ''

Do x = 1 to 15
 tr Line.x
End

tr '[33;4m                                                                                '
tr '[44m'MSG'[0m'
tr ''
Return

MakeFile:
tr CLS""LFD""TAG""LFD
tr "The »Tag.txt« file doesn't exists in DOORS:TAG/"
tr "I will create one for you, next time the door runs it will work !"
tr "                                                         W8...  "
Open('TagFile','DOORS:Tag/Tag.Txt',w)
Do x = 1 to 15
 writeln('TagFile',TAG)
End
Close('TagFile')
If Open('Log',LOGF,'A') then call Quit
C = 1

MakeLog:
Line2 ='Here Are Notified all Messy Taged by the Users....'
If C ~= 1 then tr CLS""LFD""TAG
tr LFD"The »Log.txt« file doesn't exists in DOORS:TAG/"
tr "I will create one for you, next time the door runs it will work !"
tr "                                                         W8...  "
Open('File','DOORS:Tag/Log.Txt',w)
writeln('File',TAG)
writeln('File',line2)
writeln('File','')
Close('File')
call Quit
