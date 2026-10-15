/* Kick-Boxing V1.0 (By: Billy The Kid) 313-422-3113 || MAIN PROGRAM */

Parse Arg Node;Options Results;NodeId = "AERexxControl"node
Address Value NodeId;Signal On Error;Signal On Ioerr;Signal On Syntax
Sendfile=Showfile
DT_NAME          = 100;Getuser DT_NAME;NAME=RESULT
DT_PASSWORD      = 101
DT_LOCATION      = 102
DT_PHONENUMBER   = 103
DT_SLOTNUMBER    = 104
DT_SECSTATUS     = 105
DT_SECBOARD      = 106
DT_RATIO         = 107
ST_SECBULLETIN   = 108
DT_MESSAGESPOSTED= 109
DT_UPLOADS       = 110
DT_DOWNLOADS     = 111
DT_TIMESCALLED   = 112
DT_TIMELASTON    = 113
DT_TIMEUSED      = 114
DT_TIMELIMIT     = 115
DT_TIMETOTAL     = 116
DT_BYTESUPLOAD   = 117
DT_BYTEDOWNLOAD  = 118
DT_DAILYBYTELIMIT= 119
DT_DAILYBYTEDLD  = 120
DT_EXPERT        = 121
DT_LINELENGTH    = 122
ACTIVE_NODES     = 123
DT_DUMP          = 124
DT_TIMEOUT       = 125
BB_CONFNAME      = 126
BB_CONFLOCAL     = 127
BB_LOCAL         = 128
BB_STATUS        = 129
BB_COMMAND       = 130
BB_MAINLINE      = 131
BB_CHATFLAG      = 142
DT_STAMP_LASTON  = 143
DT_STAMP_CTIME   = 144
DT_CONFACCESS    = 146

RemoveReserved NAME;FNAME= RESULT
time=100;ver='1.0'
wins=0;loses=0;class='Fly weight';left=5;hit=0;thit=0;trwins=0;trloses=0
move=0;rou=0;str=50;mstr=0;xx=s1;s=0;l=0;pk=0;rank=0;quote='On';timet=0
lchamp='None'
CLS = '[H[J'     
OFF = '[0m'       
BLK = '[30m'      
RED = '[31m'      
GRN = '[32m'      
YEL = '[33m'      
BLU = '[34m'      
MAG = '[35m'      
CYN = '[36m'      
WHT = '[37m'      
YELRED = '[33;41m'
WHTRED = '[37;41m'
BLKGRN = '[30;42m'
REDGRN = '[31;42m'
YELGRN = '[33;42m'
WHTGRN = '[37;42m'
BLKYEL = '[30;43m'
REDYEL = '[31;43m'
BLUYEL = '[34;43m'
REDBLU = '[31;44m'
CYABLU = '[36;44m'
WHTBLU = '[37;44m'
timea=0;timeb=0
time=time;daychange=0;left=time('m');date = date()

Startup:
Getuser DT_TIMETOTAL;timel=result
Getuser DT_TIMEUSED;timeu=result
timet=timel-timeu;timet=timet/60
if timet < 15 then do
transmit '';transmit ''cyn' & 'blu'Sorry, you don''t have enough time to play.'
transmit '';shutdown;exit;end
Transmit ''CLS'';Showfile 'doors:Kickboxing/KB.Intro'
query ''whtblu'Version: 'ver'  Code & Idea: New-Jack/187 FAC  Ansi''s: ¡MAGE/WKD [Press Return]'off' '
q=upper(result);transmit ''cls''
call day
if (nowday > oldday) then do
daysleft = daysleft - (nowday - oldday);nowday = oldday;daychange = 1                         
if (daysleft <= 0) then signal newgame;end
call Checkchamp
If exists('doors:Kickboxing/Fighters/'fname) then do
transmit ''grn'@ Welcome back 'name'';call start;end
if ~exists('doors:KickBoxing/Fighters/'fname) then do
transmit '';transmit ''red'|| A new fighter, welcome!';transmit ''
transmit ''grn'Let me set you up with a stats record. 'name''
call open(file,'doors:Kickboxing/Fighters/'fname'',"W")
call writeln file, wins;call writeln file, loses;call writeln file, class
call writeln file, trwins;call writeln file, trloses;call writeln file, str
call writeln file, pk;call writeln file, rank
call writeln file, ldate;call writeln file, timea
call writeln file, quote;call close(file)
if ~exists('doors:Kickboxing/KB.Fighters') then do
call open(file,'doors:Kickboxing/KB.Fighters',"W")
call writeln file, name;call close(file);call start
end
call open(file,'doors:Kickboxing/KB.Fighters',"A")
call writeln file, name;call close(file);call start

Start:
transmit ''
transmit ''mag'! There are 'CYN''daysleft' 'mag'days left in current game until reset.'
transmit ''
transmit ''blu'* 'cyn'The current champion is 'yel'! 'red''champname' 'yel'!'
transmit ''blu'$ 'cyn'Last game''s champion was 'yel'! 'red''lchamp' 'yel'!'
call setup

Checkchamp:
if ~exists('doors:kickboxing/KB.Champ') then do
champname='None';return;end
call open(file,'doors:Kickboxing/KB.Champ',"R")
champname=readln(file);call close(file);champ=champname
call open(file,'doors:Kickboxing/KB.LChamp',"R")
lchamp=readln(file);call close(file);return

Setup:
call open(file,'doors:Kickboxing/Fighters/'fname'',"R")
wins=readln(file);loses=readln(file);class=readln(file);trwins=readln(file);trloses=readln(file);str=readln(file)
pk=readln(file);rank=readln(file);ldate=readln(file)
timea=readln(file);quote=readln(file);call close(file)
if timea > 15 & ldate=date then do
transmit '';transmit ''blu'% 'cyn'Sorry your time is all used up for today!'
transmit '';shutdown;exit;end
if ldate ~= date() then timea=0
call stats;call main

Stats:
call logshorten
transmit ''
transmit ''red'|| 'yel''name'''s boxing records 'red'||'
transmit ''
transmit ''mag'Class : 'class'  --  Wins        : 'wins''
transmit 'PKicks: 'pk'           --  Loses       : 'loses''
transmit 'Rank  : 'rank'           --  Strength    : 'str''
transmit ''red'------------------------------------------'
transmit ''yel'  Training records: Wins : 'trwins' Loses : 'trloses'' 
transmit ''red'------------------------------------------'
return

main:
call ctime
call classchec
if timeb < 1 then do
transmit ''
transmit ''yel'% Sorry your time is up! Come back tommorow.'
call bye;end
if quote='On' then call gossip
transmit ''
query ''grn'['red''timeb' 'grn'minutes left] 'mag'<1-8> 'red'[Main] 'grn''
aa=result
if aa = '###PANIC' then signal bye
if aa = 'q' | aa = 'Q' then signal bye
if aa = '1' then call train
if aa = '2' then call match
if aa = '3' then call options
if aa = '5' then call stats
if aa = '6' then do
if ~exists('doors:Kickboxing/KB.News') then do
transmit ''
transmit ''red'@ The news is blank at the moment'
call main
end
sendfile "doors:Kickboxing/KB.News"
end
if aa = '7' then sendfile "doors:Kickboxing/KB.Instructions"
if aa = '8' then sendfile "doors:Kickboxing/KB.Notes"
if aa = '4' then call viewother
if aa = "?" then do
sendfile "doors:Kickboxing/KB.Main"
call main
end
call main

options:
transmit '';transmit ''cyn'Your current setting''s are:'
transmit '';transmit ''mag'1. Random quote''s on/off 'red'..... 'yel''quote''
transmit ''mag'2. Animation''s on/off 'red'   ..... 'yel'Not Complete'
transmit ''mag'3. Default settings'
transmit ''mag'4. Main Menu'
transmit '';query ''blu'<1-4> 'cyn'[Options] 'mag''
op=upper(result)
if op=1 then do
if quote='On' then do
quote='Off';call options;end
quote='On';call options;end
if op=2 then call options
if op=3 then do
quote='On';call options;end
if op=4 | op='Q' | op='' then signal main
signal options

bye:
transmit ''
transmit ''blu'@ The title''s waiting for you! Check by soon..';transmit ''
call open(file,'doors:Kickboxing/Fighters/'fname'',"W")
call writeln file, wins;call writeln file, loses;call writeln file, class;call writeln file, trwins;call writeln file, trloses
call writeln file, str;call writeln file, pk;call writeln file, rank
call writeln file, date;call writeln file, timea
call writeln file, quote;call close(file)
if name=champname then do
call open(file,'doors:Kickboxing/KB.Champ',"W")
call writeln file, name;call writeln file, wins;call writeln file, loses;call writeln file, str;call close(file)
end
shutdown
exit

gossip:
randgoss=Random(1,10,time('s'))
if randgoss=1 then do
transmit '';transmit ''cyn'@ Champion 'champname' wishes you luck on your fighting.';return;end
if randgoss=2 then do
transmit '';transmit ''red'@ A beat up fighter stumbles by.';return;end
if randgoss=3 then do
transmit '';transmit '% 'champname' awaits you at the top!';return;end
if randgoss=4 then do
transmit '';transmit ''blu'@ A new fighter walks by you to sign up.';return;end;transmit ''
if randgoss=5 then do
transmit ''yel'@ 'champname' gets another victory! Wins another match!';return;end
if randgoss=6 then do
transmit ''mag'- Chuck Norris wishes you luck in the future!';return;end 
if randgoss=7 then do
transmit ''red'! Fighting is an art, skill, and stragety.';return;end
if randgoss=8 then do
transmit ''blu'* New-Jack made this game, call NJC 313-422-3113 NOW!';return;end
if randgoss=9 then do
transmit ''wht'# Cool Ansi''s done by Da Ansi Master -- ¡MAGE !';return;end
if randgoss=10 then do
transmit ''yel'^ Don''t try to be rocky, or your ass will get beat.';return;end
return;end


Train:
transmit '';transmit ''blu'* 'cyn'Trainers you can train with 'blu'*'red''
filen='doors:Kickboxing/KB.Trainers';call listtr
transmit '';transmit ''
query ''yel'Who do you wish to train with? (L=list)> 'red''
x=result
if x = 'q' | x = 'Q' then call main
if x = '###PANIC' then singal bye
if x = '' then call main
if x = 'L' | x = 'l' then call train
if x<1 | x>numplayers then call train 
Filename='doors:Kickboxing/Trainers/'player.x
if ~exists(filename) then do
transmit ''
transmit ''red'* No such trainer under that name.'
call train
end
trainer=player.x
call loadtr

ListTr:
call open(player,filen,'R')
x=0
do until eof(player)=1
 x=x+1
 player.x=readln(player)
end
call close player
Numplayers=x-1
transmit ''red' '
 do p=1 to numplayers               
 a=right('      'p,6)||'. 'player.p 
sendstring left(a,40)
end
return

Loadtr:
move=0;rou=0
transmit '';transmit ''yel'|| 'red''trainer' vs. 'name' 'yel'||';transmit ''
transmit ''grn'There will be 7 rounds, The trainer will judge your skill'
transmit 'and reward you with strength and power kicks.'
transmit '';transmit ''whtred'TAKE YOUR STANCES AND FIGHT!'off''
call trmatch

trmatch:
if move=10 | move=20 | move=30 | move=40 | move=50 | move=60 | move=70 then do
rou=rou+1
if rou ~=7 then do
transmit ''cls''
transmit ''blu'*************************************'
transmit ''cyn'RRRR  OOOO  U  U  N  N  DDD'
transmit 'R  R  O  O  U  U  NN N  D  D'
transmit 'R R   O  O  U  U  N NN  D  D    'yel''rou''cyn''
transmit 'R  R  O  O  U  U  N  N  D  D'
transmit 'R  R  OOOO  UUUU  N  N  DDD' 
transmit ''blu'*************************************'
if thits < hits then do
transmit ''
transmit ''mag''trainer' is winning the fight!';end
if hits < thits then do
transmit ''
transmit ''cyn'You are winning the match!';end
move=move+1
end
if rou=7 then do 
transmit ''cls''
transmit ''yel'@ Judges are deciding on the winner.'
if thits < hits then do
transmit ''red'The winner is 'trainer'!'
trloses=trloses+1
end
if hits < thits then do
transmit ''
transmit ''red'The winner is YOU!'
trwins=trwins+1
str=str+5
end
transmit ''
transmit ''blu'Fighting totals:';transmit ''
transmit ''cyn'Computer hit you: 'thit' times'
transmit ''
transmit ''grn'You hit the computer: 'hit' times'
if pk=2 then do
transmit ''
transmit ''yel'@ You have your maximum power kick points.';call main;end
pk=pk+1
transmit ''
transmit ''yel'@ You are awarded 1 extra power kick point!';call main;end
end
transmit ''
call ctime
query ''mag'Enter Move (L=List of moves) > 'red''
bb=result
if bb = 'Q' | bb= 'q' then call main
if bb = '###PANIC' then signal bye
if bb = 'L' | bb = 'l' then do
sendfile "doors:Kickboxing/KB.Trainmenu"
call trmatch
end
if bb = "1" then do
transmit ''cls''
randkick=random(1,3,time('s'))
if randkick=1 then do
transmit ''red'@ You throw a blow to 'trainer'''s face and hit!'
hit=hit+1
end
if randkick=2 then do
transmit ''red'@ You throw a blow to 'trainer'''s face and he blocks!'
end
if randkick=3 then do
transmit ''red'@ You throw a blow to 'trainer'''s face and hit!'
hit=hit+1
end
move=move+1
call trfight
end
if bb = "2" then do
transmit ''cls''
randkick2=random(1,3,time('s'))
if randkick2=1 then do
transmit ''yel'@ You kick at 'trainer'''s side and miss!'
end
if randkick2=2 then do
transmit ''yel'@ You kick at 'trainer'''s side and hit!'
hit=hit+1
end
if randkick2=3 then do
transmit ''yel'@ You kick at 'trainer'''s side and hit!'
hit=hit+1
end
move=move+1
call trfight
end 
if bb = "3" then do
transmit ''cls''
randkick3=random(1,3,time('s'))
if randkick3=1 then do
transmit ''grn'@ You sweep at 'trainer'''s legs and hit!'
hit=hit+1
end
if randkick3=2 then do
transmit ''grn'@ You sweep at 'trainer'''s legs and miss!'
end
if randkick3=3 then do
transmit ''grn'@ You sweep at 'trainer'''s legs and hit!'
hit=hit+1
end
move=move+1
call trfight
end
if bb = "4" then do
transmit ''cls''
transmit ''mag'@ You attempt a face block to 'trainer''
block=1
move=move+1
call trfight
end
if bb = "5" then do
transmit ''cls''
transmit ''mag'@ You attempt a waist block.'
block=2
move=move+1
call trfight
end
call trmatch

trfight:
randcomp=random(1,5,time('s'))
if randcomp=1 then do
transmit ''
transmit ''mag'* 'trainer' throws a kick at you and strikes!'
thit=thit+1
call trmatch
end
if randcomp=2 then do
transmit ''
transmit ''red'* 'trainer' throws and punch misses!'
hit=hit+1
call trmatch
end
if randcomp=3 then do
transmit ''
transmit ''grn'* 'trainer' attempts a jump kick and fails!'
hit=hit+1
call trmatch
end
if randcomp=4 then do
transmit ''
transmit ''yel'* 'trainer' does a jump kick and strikes!'
thit=thit+1
call trmatch
end
if randcomp=5 then do
if block=1 then do
transmit ''
transmit ''red'* 'trainer' kick at your face but you block.';end
if block=0 then do
transmit ''
transmit ''grn'* 'trainer' kick you in the face.';end
block=0
call trmatch
end
if randcomp=6 then do
if block=2 then do
transmit ''
transmit ''mag'* 'trainer' kick at your waist but you block.';end
if block=0 then do
transmit ''
transmit ''grn'* 'trainer' kicks you in the waist.';end
block=0
call trmatch
end
transmit '';transmit ''grn'* 'trainer' does a round house and connects!'
call trmatch

Match:
if name=champ then do
transmit ''
transmit ''yel'@ You are the current champion, you can''t fight anyone else.'
call main;end
if wins > 19 & champname='None' then do
call quickchamp
call main;end
move=0;str!=str;rou=0
transmit ''
transmit ''grn'Lets find you a fighter to kick box with.'mag''
if wins=0 then do;scr='F1.SCR';mname='Glass Joe';sname='doors:Kickboxing/Match/Glass Joe';ra=1;call getmatch;end
if wins=1 then do;scr='F2.SCR';mname='Slick Kick';sname='doors:Kickboxing/Match/Slick Kick';ra=2;call getmatch;end
if wins=2 then do;scr='F3.SCR';mname='Fresh Kid';sname='doors:Kickboxing/Match/Fresh Kid';ra=3;call getmatch;end
if wins=3 then do;scr='F4.SCR';mname='Generis One';sname='doors:Kickboxing/Match/Generis One';ra=4;call getmatch;end
if wins=4 then do;scr='F5.SCR';mname='Kid Ice';sname='doors:Kickboxing/Match/Kid Ice';ra=5;call getmatch;end
if wins=5 then do;scr='F6.SCR';mname='Sub-Zero';sname='doors:Kickboxing/Match/Sub-Zero';ra=6;call getmatch;end
if wins=6 then do;scr='F7.SCR';mname='The Sandman';sname='doors:Kickboxing/Match/The Sandman';ra=7;call getmatch;end
if wins=7 then do;scr='F8.SCR';mname='Side Kick';sname='doors:Kickboxing/Match/Side Kick';ra=8;call getmatch;end
if wins=8 then do;scr='F9.SCR';mname='Big Bogie';sname='doors:Kickboxing/Match/Big Bogie';ra=9;call getmatch;end
if wins=9 then do;scr='F10.SCR';mname='Sweet Move';sname='doors:Kickboxing/Match/Sweet Move';ra=10;call getmatch;end
if wins=10 then do;scr='F11.SCR';mname='King Fist';sname='doors:kickboxing/Match/King Fist';ra=11;call getmatch;end
if wins=11 then do;scr='F12.SCR';mname='Cruel Kid';sname='doors:kickboxing/Match/Cruel Kid';ra=12;call getmatch;end
if wins=12 then do;scr='F13.SCR';mname='Little Mac';sname='doors:kickboxing/Match/Little Mac';ra=13;call getmatch;end
if wins=13 then do;scr='F14.SCR';mname='Direct Hit';sname='doors:Kickboxing/Match/Direct Hit';ra=14;call getmatch;end
if wins=14 then do;scr='F15.SCR';mname='Fast Reflex';sname='doors:Kickboxing/Match/Fast Reflex';ra=15;call getmatch;end
if wins=15 then do;scr='F16.SCR';mname='Killer Kick';sname='doors:Kickboxing/Match/Killer Kick';ra=16;call getmatch;end
if wins=16 then do;scr='F17.SCR';mname='Deadly Blow';sname='doors:Kickboxing/Match/Deadly Blow';ra=17;call getmatch;end
if wins=17 then do;scr='F18.SCR';mname='Marvelious Kick';sname='doors:Kickboxing/Match/Marvelious Kick';ra=18;call getmatch;end
if wmins=18 then do;scr='F19.SCR';mname='Hard Hit';sname='doors:Kickboxing/Match/Hard Hit';ra=19;call getmatch;end
if wins=19 then do;scr='F20.SCR';mname='Steel Swing';sname='doors:Kickboxing/Match/Steel Swing';ra=20;call getmatch;end
if wins=20 | wins > 20 then do;transmit '';transmit '* You must now fight the champion 'champ'';call getchamp;end

Mstart:
transmit ''
showfile 'doors:kickboxing/screens/'scr''
transmit ''blu''mname'''s Recordes:';transmit ''
transmit ''cyn'Wins: 'mwins'  Loses : 'mloses''
transmit ''
Query ''red'Are you prepared for this fight? '
a=upper(result)
if a = "Y" then call MMatch
if a = "N" then do
transmit ''
transmit ''mag''mname' laughs and says, "Go home to your mommy wimp!"'
call main
end
call Mstart

Getmatch:
call open(file,sname,'R')
mwins=readln(file);mloses=readln(file);mstr=readln(file);saying=readln(file)
call close(file)
call Mstart

MMatch:
mstr!=mstr
transmit ''
transmit ''grn'Get ready for your fight! The only way to forfit is to hit "Q"'
transmit 'That will lead you to a loss. Fight the best you can, get ready'
transmit 'Take your stances, Fight.'

MMatch!:
if mstr! < 0 then do
transmit ''
transmit ''red'@ You have knocked 'mname' out cold! You are the winner!'
wins=wins+1
call news
call main
end
if str! < 0 then do
transmit ''
transmit ''red'@ You have been knocked out! You have lost the fight!'
loses=loses+1
call losesave
query ''blu'[Press "C" to continue]';a=upper(result)
call main
end
if rou=10 then do
transmit ''
transmit ''yel'@ End of match, judges are deciding the winner!'
if str! > mstr! then do
transmit ''
transmit ''cyn'@ You win the match! Congratulations!'
wins=wins+1
call news
call main
end
if mstr! > str! then do
transmit ''
transmit ''cyn'* You lose the match, train more!'
call losesave
call main
end
end
if move=10 | move=20 | move=30 | move=40 | move=50 | move=60 | move=70 | move=80 | move=90 | move = 100 then do
rou=rou+1
transmit ''cls''
if rou < 10 then do
transmit ''cyn'Round 'rou' over! Now for next round!';end
move=move+1
if rou > 0 then do
if mstr! > str! then do                            
transmit ''                                        
transmit ''blu''mname' is winning the fight!';end
if str! > mstr! then do                            
transmit ''                                        
transmit ''blu'You are winning the match!';end     
end;end
if rou=10 then call mmatch!
transmit ''
call ctime
query ''blu'(Command: (L=List of moves) > 'cyn''
b=result
if b = 'l' | b = 'L' then do
transmit ''red''
sendfile 'doors:Kickboxing/KB.Match'
end
if b = 'q' | b = 'Q' then do
transmit ''
transmit ''cyn'@ 'name' forfits the fight is over! 'mname' wins!'
loses=loses+1
quit=1
call losesave
call main
end
if b = "###PANIC" then call bye
if b = '1' then call Mpunch
if b = '2' then call Msidek
if b = '3' then call Mjkick
if b = '4' then call Mbfist
if b = '5' then call Mfkick
if b = '6' then do
if pk=0 then do;transmit '';transmit ''grn'@ You are out of power kicks.';call mmatch!;end
call Mpkick;end
call MMatch!

Mpunch:
transmit ''cls''
randmpun=random(1,6,time('s'))
if randmpun=1 then do
transmit ''mag'@ You swing at 'mname' and hit him hard!'
mstr!=mstr!-1
end
if randmpun=2 then do
transmit ''cyn'@ You swing at 'mname' and hit jack him good!'
mstr!=mstr!-2
end
if randmpun=3 then do
transmit ''red'@ You swing at 'mname' and miss him!'
end
if randmpun=4 then do
transmit ''blu'@ You swing at 'mname' and hit him, hit was no good!'
end
if randmpun=5 then do
transmit ''grn'@ You swing at 'mname' and miss him totally!'
end
if randmpun=6 then do
transmit ''mag'@ You swing at 'mname' and hit him direct!'
mstr!=mstr!-2
end
call Mmoves

Mmoves:
randmmove=random(1,7,time('s'))
if randmmove=1 then do
transmit ''
transmit ''red'* 'mname' does a jump kick and hit you hard!'
str!=str!-2
end
if randmmove=2 then do
transmit ''
transmit ''blu'* 'mname' throws a punch at you at misses!'
end
if randmmove=3 then do
transmit ''
transmit ''yel'* 'mname' kicks at your side and hits lightly!'
str!=str!-1
end
if randmmove=4 then do
transmit ''
transmit ''red'* 'mname' kick at your waist and hits hard!'
str!=str!-2
end
if randmmove=5 then do
transmit ''
transmit ''grn'* 'mname' kicks at your face and hits lightly!'
str!=str!-1
end
if randmmove=6 then do
transmit ''
transmit ''cyn'* 'mname' kicks at your face and misses!'
end
if randmmove=7 then do
transmit ''
transmit ''mag'* 'mname' hits you in the face pretty hard!'
str!=str!-2
end
move=move+1
call Mmatch!

MsideK:
transmit ''cls''
randside=random(1,3,time('s'))
if randside=1 then do
transmit ''cyn'@ You kick at 'mname'''s side and hit hard!'
mstr!=mstr!-2
end
if randside=2 then do
transmit ''blu'@ You kick at 'mname'''s side and hit lightly!'
mstr!=mstr!-1
end
if randside=3 then do
transmit ''grn'@ You miss 'mname'''s side completly!'
end
call MMoves

MjKick:
transmit ''cls''
randjump=random(1,3,time('s'))
if randjump=1 then do
transmit ''red'@ You do a jump kick and catch 'mname' in the mouth!'
mstr!=mstr!-2
end
if randjump=2 then do
transmit ''blu'@ You do a jump kick and miss 'mname' completly!'
end
if randjump=3 then do
transmit ''cyn'@ You do a jump kick and catch 'mname' lightly!'
mstr!=mstr!-1
end
Call MMoves

MBfist:
transmit ''cls''
randfist=random(1,3,time('s'))
if randfist=1 then do
transmit ''mag'@ You whip a back fist at 'mname' and hit him lightly!'
mstr!=mstr!-1
end
if randfist=2 then do
transmit ''red'@ You whip a back fist at 'mname' and hit him hard!'
mstr!=mstr!-1
end
if randfist=3 then do
transmit ''blu'@ You whip a back fist at 'mname' and miss him!'
end
if randfist=4 then do
transmit ''grn'@ You whip a back fist at 'manme' and miss!'
end
call MMoves 

MFkick:
transmit ''cls''
randface=random(1,3,time('s'))
if randface=1 then do
transmit ''grn'@ You kick at 'mname'''s face and miss!'
end
if randface=2 then do
transmit ''cyn'@ You kick at 'mname'''s face and hit lightly!'
mstr!=mstr!-1
end
if randface=3 then do
transmit ''blu'@ You kick at 'mname'''s face and hit hard!'
mstr!=mstr!-2
end
call mmoves
MPkick:
transmit ''cls''
transmit ''yel'You smash 'MNAME' with you power kick HARD!'
mstr!=mstr!-4
pk=pk-1
call mmoves

News:
if champ=1 then do
transmit ''
showfile 'Doors:Kickboxing/KB.Trophy'
query ''cyn'['blu'Press Return'cyn']';a=upper(result)
RemoveReserved CHAMPNAME;CH=RESULT
if exists('doors:kickboxing/fighters/'ch'') then do
call open(file,'doors:kickboxing/fighters/'ch'',"R")
awins=readln(file);aloses=readln(file);aclass=readln(file);atrwins=readln(file)
atrloses=readln(file);astr=readln(file)
apk=readln(file);arank=readln(file);aldate=readln(file)                       
atimea=readln(file);aquote=readln(file);call close(file)
arank=arank-1
call open(file,'doors:kickboxing/fighters/'ch'',"W")
call writeln file, awins;call writeln file, aloses;call writeln file, aclass
call writeln file, atrwins;call writeln file, atrloses;call writeln file, astr
call writeln file, apk;call writeln file, arank;call writeln file, aldate
call writeln file, atimea;call writeln file, aquote;call close(file);end
if ~exists('doors:Kickboxing/KB.News') then do
call open(file,'doors:kickboxing/KB.News',"W")
call writeln file, ''blu' # 'cyn''name' took the title from 'champname' on 'date'';call close(file);end
if exists('doors:kickboxing/KB.News') then do
call open(file,'doors:Kickboxing/KB.News',"W")
call writeln file, ''
call writeln file, ''blu' # 'cyn''name' took the title from 'champname' on 'date''
call close(file);end
call open(file,'doors:kickboxing/KB.Champ',"W")
call writeln file, name;call writeln file, wins;call writeln file, loses
call writeln file, str;call close(file);champname=name
end
if champ~=1 then do;call open(file,sgame,"W")
call writeln file, mwins;call writeln file, mloses;call writeln file, mstr;call writeln file, saying
call close(file)
end

Top:
transmit ''
query ''blu'[Press "C" to continue] ';a=upper(result)
if a ~='C' then call top

transmit ''
transmit ''grn'The news casters are here waiting for your comment, please'
transmit 'leave a message on how this fightr was! How was this fight?'
transmit '';query ''yel'> 'red'';c=result
if c = '' then c=''mag'No comment'
if ~exists('doors:Kickboxing/KB.News') then do
call open(file,'doors:Kickboxing/KB.News',"W")
call writeln file, ''
call writeln file, ''blu' ^ 'cyn''name' fought: 'mname' on 'date' and WON!' 
call writeln file, ''blu' ^ 'cyn'Heres his comment about the fight:'
call writeln file, ''blu' ^ 'cyn''c'';call close(file)
call main;end
call open(file,'doors:Kickboxing/KB.News',"A")
call writeln file, ''
call writeln file, ''blu' ^ 'cyn''name' fought: 'mname' on 'date' and WON!' 
call writeln file, ''blu' ^ 'cyn'Heres his comment about the fight:'
call writeln file, ''blu' ^ 'cyn''c'';call close(file)
call main
end

Losesave:
call open(file,sname,"W")
call writeln file, mwins;call writeln file, mloses;call writeln file, mstr;call writeln file, saying
call close file
if quit=1 then do
if ~exists('doors:Kickboxing/KB.News') then do
call open(file,'doors:Kickboxing/KB.News',"W")
call writeln file, ''
call writeln file, ''blu' + 'cyn''name' forfited againist 'mname' in round 'rou'';call close(file)
return
end
call open(file,'doors:Kickboxing/KB.News',"A")
call writeln file, ''
call writeln file, ''blu' + 'cyn''name' forfited againist 'mname' in round 'rou'';call close(file)
return
end
if ~exists('doors:Kickboxing/KB.News') then do
call open(file,'doors:Kickboxing/KB.News',"W")
call writeln file, ''
call writeln file, ''blu' - 'cyn''name' was knock out by 'mname' in round 'rou'';call close(file)
return
end
call open(file,'doors:Kickboxing/KB.News',"A")
call writeln file, ''
call writeln file, ''blu' - 'cyn''name' was knocked out by 'mname' in round 'rou'';call close(file)
return
end

Classchec:
if str >49 then class='Fly Weight';if str >69 then class='Mid Weight';if str >89 then class='Hev Weight'
return

CTime:
Getuser DT_TIMETOTAL;timel=result;Getuser DT_TIMEUSED;timeu=result
timet=timel-timeu;timet=timet/60
if time('m') > left then do;timea=timea+1;left=time('m');end
timeb=16-timea;return

GetChamp:
champ=1
call open(file,'doors:Kickboxing/KB.Champ',"R")
mname=readln(file);mwins=readln(file);mloses=readln(file);mstr=readln(file)
call close(file)
transmit ''
transmit ''cyn''champname'''s current records:'
transmit ''
transmit 'Wins  : 'mwins'  Loses : 'mloses''
transmit ''
query ''yel'Do you want to fight him? 'wht'';cc=upper(result)
if cc = 'Y' then call mmatch
if cc = '' then call Getchamp
if cc = 'N' then call main
call getchamp
end

Viewother:
transmit ''
transmit ''cyn'@ View other players stats'mag''
filen='doors:Kickboxing/KB.Fighters';call listtr
transmit '';transmit ''
query ''yel'(Command/L=List Users/Q=Quit to main> 'red''
x=result
if x='L' | x='l' then call listtr
if x='Q' | x='q' then do
call main;end
if x='' then call main
if x='###PANIC' then call bye
if x<1 | x>numplayers then call viewother
RemoveReserved player.x;player= RESULT
filename='doors:Kickboxing/Fighters/'player''
if ~exists(filename) then do
transmit ''
transmit ''grn'@ No such user on the name.';return;end
fighter=player
call open(file,'doors:kickboxing/fighters/'fighter'',"R")
cwins=readln(file);closes=readln(file);cclass=readln(file);ctrwins=readln(file)
ctrloses=readln(file);cstr=readln(file);call close(file)
transmit ''
transmit ''grn''player.x'''s Record file:'
transmit ''
transmit ''mag'Wins : 'cwins'            Loses   : 'closes''
transmit 'Class: 'cclass'   Strength: 'cstr''
transmit ''blu'---------'cyn'Training Records'blu'-----------'
transmit '      'red'Wins : 'ctrwins'  Loses : 'ctrloses''
transmit ''
query ''grn'[Press return]';a=upper(result);signal main
call viewother;end

LogShorten:
if ~exists('doors:Kickboxing/KB.News') then return
call open(File,'doors:Kickboxing/KB.News','R')
Lines=0
do until eof(File)=1
Lines=Lines+1
HLine.Lines=readln(File)
end
call close File
if Lines>50 then do
call open(File,'doors:Kickboxing/KB.News','W')
MaxLine=Lines
MinLine=MaxLine-10
do i=MinLine to MaxLine;if HLine.i~="" then call writeln(File,HLine.i);end
call close File
end
return

GetAns:                                
sendstring '';getchar;ans=upper(result)
if ans='###PANIC' then signal Bye    
return

Day:                                                         
        nowday = date("C")                                 
        if EXISTS('Doors:Kickboxing/KB.Info') then do                                
                call open file, ('Doors:Kickboxing/KB.Info'),'R'                       
                        oldday          = readln(file)            
                        daysleft        = readln(file)            
                call close file                                   
        return;end                                                    
        else do                                                   
                call open file, ('Doors:Kickboxing/KB.Info'),'W'                       
                        call writeln file, nowday; oldday = nowday
                        call writeln file, 30; daysleft = 30  
                call close file
return

newgame:
Call open file, ('Doors:Kickboxing/KB.LChamp'),'W'
call writeln file, champ;call close file
Call open file, ('Doors:Kickboxing/KB.Champ'),'W'
call writeln file, 'None';call close file
address command 'C:Delete Doors:KickBoxing/KB.Info'
address command 'C:Delete Doors:Kickboxing/Fighters/#?'
address command 'C:Delete Doors:Kickboxing/KB.News'
address command 'C:Delete Doors:Kickboxing/KB.Fighters'
address command 'C:Delete Doors:Kickboxing/KB.Champ'
transmit '';transmit ''cyn'Please now re-run the game!'
shutdown;exit
return

quickchamp:
transmit '';transmit ''yel'^ There is no champ so you become the champ!'
showfile 'Doors:Kickboxing/KB.Trophy'
query ''cyn'['blu'Press Return'cyn']';a=upper(result)
if ~exists('doors:Kickboxing/KB.News') then do
call open(file,'doors:kickboxing/KB.News',"W")
call writeln file, ''blu' # 'cyn''name' became champion on 'date'';call close(file);end
if exists('doors:kickboxing/KB.News') then do
call open(file,'doors:Kickboxing/KB.News',"W")
call writeln file, ''
call writeln file, ''blu' # 'cyn''name' became champion on 'date''
call close(file);end
call open(file,'doors:kickboxing/KB.Champ',"W")
call writeln file, name;call writeln file, wins;call writeln file, loses
call writeln file, str;call close(file);champ=name
return;end

error:                                                       
a = SIGL;transmit 'Error!!!  Line # 'a;shutdown;exit         
syntax:                                                      
a = SIGL;transmit 'Syntax Error!!!  Line # 'a;shutdown;exit  
ioerr:                                                       
transmit 'I/O Error!!!';shutdown;exit                        
SHUTDOWN                                                     
EXIT
