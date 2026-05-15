/* mAD ByTE EARNER v 0.01a by mAd mOOse / sUPREME */

parse arg node
options results
signal on error; signal on syntax; signal on ioerr

address value 'AERexxControl'node

tr=transmit;qu=query;sm=sendmessage;gc=getchar;gu=getuser
cls  = d2c('12'); lok=0
back = '08'x; d=0

gu 100; user=result

fel:
tr cls
tr '[0;4;33m                                                         '
tr '[44;4;33mWelcome to mAD ByTE EARNER v 0.01a by mAd mOOse / sUPREME'
tr '[31;0;31m'
tr 'Welcome 'user
tr ''
tr 'Select a door and either:'
tr '+ you win 10000 bytes dl credz'
tr '+ you lose 10000 bytes dl credz'
tr '+ nothing'
tr '+ you get kicked out and you time will be set to ZERO!'
tr ''
tr '[32m    _________  _________  _________  _________'
tr '    |       |  |       |  |       |  |       |'
tr '    |       |  |       |  |       |  |       |'
tr '    |   [33m1[32m   |  |  [33m 2[32m   |  |   [33m3[32m   |  |   [33m4[32m   |'
tr '    |       |  |       |  |       |  |       |'
tr '    |       |  |       |  |       |  |       |'
tr '    |_______|  |_______|  |_______|  |_______|'
tr ''
tr '[31m([33mq to exit[31m)'
sm '[36mSelect door: [31m'
gc
k=upper(result)
if k='Q' then do; tr 'Q'; signal slut; end
if k='1' then do; tr '1'; signal check; end
if k='2' then do; tr '2'; signal check; end
if k='3' then do; tr '3'; signal check; end
if k='4' then do; tr '4'; signal check; end
signal fel

check:
sm 'Opening door...'; d=0
char.d='/'; d=d+1
char.d='-'; d=d+1
char.d='\'; d=d+1
char.d='|'; d=d+1
char.d='/'; d=d+1
char.d='-'; d=d+1
char.d='\'; d=d+1
char.d='|'; d=d+1; m=d; d=0; ca=20
do b=1 to 50
	sm char.d; ca=ca+1
	d=d+1; if d=m then d=0
	do cp=1 to ca; end
	sm '[1D'
end
luck=random(1,4,time(seconds))
if luck=1 then do; tr 'You won!'; signal won; end
if luck=2 then do; tr 'You lost!'; signal lost; end
if luck=3 then do; tr 'Mega bonus!'; signal mega; end
if luck=4 then do; tr 'Bad luck!'; signal bad; end
signal slut

mega:
gu 117; str=result; str=str+25000
putustr str
putuser 117
tr ''
tr 'Addeed [37m25000 [31mbytes!'
signal slut
won:
gu 117; str=result; str=str+10000
putustr str
putuser 117
tr ''
tr 'Added [37m10000 [31mbytes!'
signal slut
lost:
gu 117; str=result; str=str-10000
putustr str
putuser 117
tr ''
tr 'Took [37m10000 [31mbytes!'
signal slut
bad:
gu 115; tt=result
putustr tt-20
putuser 116
putustr tt-20
putuser 114
tr ''
tr '[31mThanks for using mAD ByTE EARNER v 0.01a by mAd mOOse / sUPREME'
tr ''
PutUser 511
PutUstr 'G'; PutUser 508
shutdown
exit

slut:
tr ''
tr '[31mThanks for using mAD ByTE EARNER v 0.01a by mAd mOOse / sUPREME'
tr ''
shutdown
exit

syntax:
ioerr:
error:
tr ''
tr '[31mSome kind of problem have been found on line 'sigl'! Please tell SysOp!'
tr 'Error: 'errortext(sigl)
tr ''
signal slut
