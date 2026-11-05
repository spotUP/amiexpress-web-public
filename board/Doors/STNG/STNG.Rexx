/*     STAR TREK TNG TRIVIA    */
/*     By The Zilla Hackers    */
/*       The GODZILLA BBS      */
/*     /X Net Node @808001     */

parse arg node
options results;signal on syntax;signal on error;signal on ioerr

nodeid = "AERexxControl"node

ADDRESS value nodeid

/*== COMMAND DEFENITIONS =================================================*/
tr = transmit   ;  hk = getchar ;  pm = prompt  ;  sendstring = sendmessage
ss = sendstring ;  gu = getuser ;  pu = putuser

NUL = '0'X      ;  OFF = '[0m' ;  BLD = '[1m' ;  RED = '[31m'; GRN = '[32m'
YEL = '[33m'   ;  BLU = '[34m';  MAG = '[35m';  CYN = '[36m'; CLS = D2C(12)
CR  = D2C(10)   ;  TAB = D2C(9) ;  VER = '1.1฿'
RET = '[32mPress [35m[[36mRETURN[35m][32m to Continue..[0m'
gu 100;ID=RESULT  ; gu 11;BBS=RESULT
/*========================================================================*/
STNGDir = "Doors:STNG/" 	/* subdirectory for support files */
right = 25			/* points for correct answer */
wrong = -20			/* points for wrong answer (use a negative!) */
totalnum = 20			/* Total Number Of Questions Asked To User */

options results
signal on syntax

bufferflush
TR	CLS
TR	'[0m[2J'
TR	'[12C[1;36mบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบ'
TR	'[13C[33m      ____________________________________________'
TR	'[13C[33m     / ________________/______  _________________/'
TR	'[13C[33m    /  /        __           /  /      __         '
TR	'[13C[33m    \  \__   __/ /___  __   /  /__    / /         '
TR	'[13C[33m     \___ \ /__ __/_ \/_/_ /  //_/___/ /__        '
TR	'[13C[33m        \  \ / / __/ / __ \  // __ \ \// /        '
TR	'[13C[33m         \  \ / / / / /  \/ // / _\/_/__/         '
TR	'[13C[33m    _____/  / \/ -  \/  /  // / /_/ _ \    TNG    '
TR	'[13C[33m    \______/ \_\__/\_\ /__//_/\___// \_\          '
TR	'[13C[33m                                                '
TR	'[60C[35mV'VER
TR	'[12C[36mบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบ'
TR	'[13C[32m               Presented to you by:'
TR	'[18C[32m  ZILLA HACKERS of The GODZILLA BBS @808001'
TR	'[12C[36mบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบบ'
TR	'[25C[32mPlease Wait While Loading..[0m'
SS RET
GETCHAR
pragma('directory',STNGDir)

if exists('STNGdat') then do
open(STNG,'STNGdat','R')
xSTNG = 0
i = 1
do while ~eof(STNG)
questnum.i = 0
quest.i = readln(STNG)
do z = 1 to 4
 ans.z.i = readln(STNG)
end
i = i + 1
xSTNG = xSTNG + 1
end
end

if ~exists('hiscores') then do
  open(hi,'hiscores','W')
  writeln(hi,0)
  close(hi)
  end
if exists('hiscores') then do
  open(hi,'hiscores','R')
  lowestscore = 110
  highnum = readln(hi)
  do i = 1 to highnum
    hiuser.i = readln(hi)
    hipts.i = readln(hi)
    if hipts.i < lowestscore then lowestscore = hipts.i
  end
  close(hi)
  end

BEGIN:
TR CLS''NUL
TR	'[0m[2J[1;33m-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-'
TR	'[6C[35mSTNG V'VER' - Main Menu'
TR	'[33m-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-'
TR	' [35m[[32m1[35m]   [32mSTNG Instructions'
TR	' [35m[[32m2[35m]   [32mSTNG HiScores'
TR	' [35m[[32m3[35m]   [32mSTNG Questions'
TR	' [35m[[32m4[35m]   [32mQuit Back To 'BBS
TR	'[33m-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-[0m'
Sendstring CYN"               Option: "
getchar ; opt = result
transmit opt
select
  when opt = "1" then do

TR CLS
tr	'[0m[26C[1;35mSTNG V'VER' - Instructions'
tr	'[36m-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-'
tr	'  [32mThe game is very simple.  Once you commence, you will be asked 'totalnum' STNG'
tr	' questions, and given a choice of up to 4 answers.  You enter the number of'
tr	'  what you conser to be the correct answer.  For each correct answer you'
tr	' receive 'right' points.  If your score is high enough you will be listed on the'
tr	'[5Chigh score list.  Simple game, Remember 0 will quit the questions!'
tr	'[36m-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-[0m'
SS RET
GetChar
end
  when opt = "2" then do
TR	CLS
TR	'[0m[2J[1;36m-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-'
TR	'[10C[32m__ __  __  _____  __ __    ____  ____  _____  _____ ____  ____'
TR	' [35mSTNG    [32m|  |  ||  ||   _/_|  |  |  |  _/_|   _||[5C||   _/|  _/ |  _/_'
TR	'[9C|[5C||  ||  |  ||[5C|  |__  ||  |_ |  |  ||  |  |  _| |__  |'
TR	'[9C|__|__||__||_____||__|__|  |____||____||_____||__|  |____||____|'
TR	' '
TR	'[36m-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-[0m'
TR	GRN'.............................................................................'
	do i = 1 to highnum
TR	GRN"....."CYN"No:"GRN".."MAG"["GRN""right(i,2)""MAG"]"GRN".."CYN"Name:"GRN".."MAG"["GRN||left(hiuser.i,17)""MAG"]"GRN"............."CYN"Score:"GRN"..."MAG"["GRN""Right(hipts.i,6)""MAG"]"GRN"....."
	end
TR	GRN'.............................................................................'
SS	CYN'-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-> 'RET
    GetChar
    end
  when opt = "3" then do
    if ~exists('STNGdat') then do
	TR	""
	TR	RED"Question file is missing!"OFF
      
      signal BEGIN
      end
    if xSTNG = 0 then do
	TR	""
	TR	RED"There are no questions!"OFF
      signal BEGIN
      end
    signal CRSTNG
    end
  when opt = "4" then do
TR CLS
TR OFF'Click..'
TR OFF'NO CARRIER......hehe....'
TR OFF' '
    bufferflush
    shutdown
    exit
    end
  otherwise signal BEGIN
  end
signal BEGIN

CRSTNG:

points = 0
TR	CLS
TR	""
TR	RED"NOTE: "GRN"  Remember That You Have To Answer "totalnum" Questions."

STNGLOOP:
counter = 1
TR	" "
do while counter <= totalnum                    /*  <----- */
 TR GRN"Question"MAG" ["CYN"#"counter""MAG"]"GRN":"
 TR CYN"-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-"
 do until questnum.index = 0
  index = random(1,xSTNG,time('S'))
 end

/* now we have a question that hasn't been asked before, and we ensure
   that we don't ask it again by changing its index to 1
*/
 questnum.index = 1
TR GRN""quest.index
 do i = 1 to 4
  if substr(ans.i.index,1,1) ~= "-" then transmit MAG"["CYN""||i""MAG"]"CYN":>"GRN"  "substr(ans.i.index,2)
  end
 TR CYN"-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-"
 do forever
  query GRN"Answer "MAG"["CYN"0=Quit"MAG"]"GRN"?: "
  answer = result
  if answer = 0 then signal BEGIN
  if ~datatype(answer,'W') | answer < 1 | answer > 4 | substr(ans.answer.index,1,1)="-" then iterate
  else break
  end
if substr(ans.answer.index,1,1) = "!" then do
  randnum = random(1,6,time('s'))
  TR	" "
select
  when randnum = 1 then TR GRN"Good answer!"CYN
  when randnum = 2 then TR GRN"That is affirmative"CYN
  when randnum = 3 then TR GRN"Warp Drive enabled"CYN
  when randnum = 4 then TR GRN"Awesome!!!"CYN
  when randnum = 5 then TR GRN"Where no man has gone before.."CYN
  when randnum = 6 then TR GRN"Phasers locked...."CYN
  otherwise TR GRN"That's it!"CYN
end
  TR	" "
  points = points + right
SS RET
GETCHAR
TR CLS
  end
else do
  randnum = random(1,6,time('s'))
  TR	" "
select
  when randnum = 1 then TR GRN"That's "RED"NOT"GRN" it!"CYN
  when randnum = 2 then TR RED"NO! "RED"Red ALERT!"CYN
  when randnum = 3 then TR GRN"Where d you get "RED"THAT"GRN" answer?"CYN
  when randnum = 4 then TR RED"WHAT?? "GRN"Shields are "RED"DOWN!"CYN
  when randnum = 5 then TR GRN"Nope, "RED"NOT "GRN"that one."CYN
  when randnum = 6 then TR GRN"Warp drives "RED"OFFLINE!"CYN
  otherwise TR RED"INCORRECT!!"CYN
  end
  TR	" "
  points = points + wrong
SS RET
GETCHAR
TR CLS
  end
counter = counter + 1
end
call SCORING

do i = 1 to xSTNG
questnum.i = 0
end

signal BEGIN

SCORING:

if highnum < 10 then 
do
  TR	MAG"Congratulations!!"GRN"  You Have Placed On The HighScore List."
  TR	CYN"Adding Your Name..."
  highnum = highnum + 1
  hiuser.highnum = id
  hipts.highnum = points
  call SORT
  open(hi,'hiscores','W')
  writeln(hi,highnum)
  do i = 1 to highnum
    writeln(hi,hiuser.i)
    writeln(hi,hipts.i)
  end
  close('hi')
  transmit ""
  
  return
end

if points >= lowestscore then
do
 TR	MAG"Congratulations!!"GRN"  Your Score Has Bumped SomeBody Off The List."
  hiuser.highnum = id
  hipts.highnum = points
  call SORT
  open(hi,'hiscores','W')
  writeln(hi,highnum)
 do i = 1 to highnum
      writeln(hi,hiuser.i)
      writeln(hi,hipts.i)
 end
 close(hi)
 transmit " "
 
 return
end

if points < lowestscore then 
do
  TR	CYN"Sorry, But Yyou Did Not Make It to The HighScore List!"
  TR	CYN"Better Luck Next Time!"
  return
end

SORT:
 do forever
   changes = 0
   do i = 1 to highnum - 1
    ihatearexx = i+1
    if hipts.ihatearexx > hipts.i then
     do
      temp = hipts.i
      tempname = hiuser.i
      hipts.i = hipts.ihatearexx          /* Bubblehead sort */
      hiuser.i = hiuser.ihatearexx
      hipts.ihatearexx = temp
      hiuser.ihatearexx = tempname
      changes = 1
     end
   end
   if changes = 0 then leave
 end
return

/*========================================================================*/
ERROR:
SYNTAX:
IOERR:
transmit 'An error in Line.. #'sigl' Exiting..'
transmit errortext(sigl)
SHUTDOWN
exit
/*========================================================================*/
