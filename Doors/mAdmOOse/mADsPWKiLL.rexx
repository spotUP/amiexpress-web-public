/* mAD sYSPW FAiL KiLL v 0.01a by mAd mOOse / sUPREME */

parse arg node
options results
signal on syntax; signal on ioerr; signal on error

address value 'AERexxControl'node

tr=transmit;qu=query;sm=sendmessage;gc=getchar;gu=getuser

tr '[0;4;33m                                                        '
tr '[44;4;33mWelcome to mAD sYSPW KiLL v 0.01a by mAd mOOse / sUPREME'
tr '[31;0;31m'
tr ''
sm 'Are you sure you want to delete BBS:Node'node'/SysPwFail.txt ([36mY[31m/n) ? '
gc
k=upper(result)
if k='N' then do; tr 'No'; signal slut; end
tr 'Yes'
Sm 'Killing file...'
if ~exists('Doors:Node'node'/SysPwFail.txt') then do; tr 'Couldn't find [36mDoors:Node'node'/SysPwFail.txt![31m'; signal slut; end
address command 'C:Delete Doors:Node'node'/SysPwFail.txt'
tr 'Ok!'

slut:
tr ''
tr '[31mThanks for using mAD sYSPW KiLL v 0.01a by mAd mOose / sUPREME'
tr ''
shutdown
exit

error:
syntax:
ioerr:
tr ''
tr '[31mSome kind of problem have been found on line 'sigl'! Please tell SysOp!'
tr 'Error: 'errortext(sigl)
tr ''
signal slut
shutdown
exit
