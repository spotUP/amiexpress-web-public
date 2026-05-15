/* mAD SysDown v 0.01b by mAd mOOse / sUPREME */

parse arg node
options results
signal on error; signal on syntax; signal on ioerr

address value 'AERexxControl'node

tr=transmit;qu=query;sm=sendmessage;gc=getchar;gu=getuser
cls  = d2c('12'); lok=0
back = '08'x; d=0

gu 100; user=result

tr cls
tr '[0;4;33m                                                     '
tr '[44;4;33mWelcome to mAD SysDown v 0.01b by mAd mOOse / sUPREME'
tr '[31;0;31m'

if ~exists('Doors:mAdmOOse/mADSysDown.cfg') then do; tr "Couldn't open configfile! Tell SysOp!"; signal slut;end
sm 'Reading config file..'
call open(cfg,'Doors:mAdmOOse/mADSysDown.cfg','R')
password=readln(cfg)
sm '.'
names=readln(cfg)
sm '.'
if names='NONAMES' then do; tr 'Ok!'; signal ok; end
tr 'Ok!'
tr ''
tr '[36mUser online: [35m'user
sm '[31mChecking name..'
do a=1 to names
	name.a=readln(cfg)
	sm '.'
	if name.a=user then do; tr '[31mName is [32mOK[31m!'; tr ''; signal ok; end
end
close(cfg)
tr ''
tr '[31mName is [32mNOT OK[31m!'
signal slut

ok:
close(cfg)
if password='NOPASSWORD' then signal ot 
board=''; pos=0
shit=''
sm 'Enter password: [36m'
do until shit='0d'x
	gc
	shit=result
	if shit=back & pos~=0 then do
		sendstring back' 'back
		pos=pos-1
		if length(board)>0 then board=left(board,length(board)-1)
	end
	if pos~= 69 & shit~=back & shit~='0d'x then do
	board=board''shit
	sendstring '#'
	pos=pos+1
end
end
pw=board
if pw=password then do; tr ''; tr '[31mPassword is [32mOK[31m!'; signal ot; end
tr ''
tr '[31mPassword is [32mNOT OK[31m!'
signal slut

ot:
sm 'Reading data file..'; nof=0; o=1
if ~exists('Doors:mAdmOOse/mADSysDown.dat') then do; tr 'Ok!'; signal okk; end
call open(dat,'Doors:mAdmOOse/mADSysDown.dat','R')
do until apa=1
	nf.o=readln(dat); o=o+1
	if eof(dat) then do; o=o-1; apa=1; end
end
tr 'Ok!'; nof=o
close(dat)
okk:
do until lok=1
	if diz=1 then do; tr '[0;4;33m                                                          ';  ;tr '[44;4;33mWelcome back to mAD SysDown v 0.01b by mAd mOOse / sUPREME'; tr '[31;0;31m'; end
	tr ''; diz=0
	tr '[31m([33menter .d. to enter dir mode[31m)'
	tr ''
	qu 'File ('d+1'): [32m'
	fil=result
	if fil='.d.' then signal dizdir
	if fil='' & d=0 then signal slut
	if ~exists(fil) then do; tr '[35mFile not found!'; lok=2; end
	if fil='' & d>0 then lok=1
	if lok=0 then do
		call getinfo
		if fil='' then tr "You can't download a directory!"
		if fil='*NOTFOUND*' then tr '[35mFile not found!'
		if fil~='' & fil~='*NOTFOUND*' & fil~='BADONE!' then do; files.d=fil; d=d+1; end
	end
	if lok=2 then lok=0
end
tr ''
tr '[31mFiles flaged:[36m'
do b=0 to d-1
	tr '              'upper(files.b)
end
tr ''
sm '[31m([32mC[31m)ontinue, ([32mG[31m) LogOff After Transfer or ([32mA[31m)bort ? [33m'
gc; k=upper(result)
if k='C' then tr 'Continue'
if k='G' then do; tr 'LogOff After Transfer'; logoff=1; end
if k='A' then do; tr 'Abort'; signal slut; end
if k='' then tr 'Continue'
tr ''
do b=0 to d-1
	tr ''
	tr '[31mDownloading [35m'upper(files.b)'[31m...'
	PutUstr files.b
	PutUser 137
end
if logoff=1 then signal slut
tr ''
tr ''
sm '[31mDownload more files (y/[36mN[31m) ? '
gc
k=upper(result)
if k='Y' then do; tr 'Yes'; diz=1; d=0; signal okk; end
tr 'No'
signal slut

getinfo:
sm '[31mChecking..'
if nof>0 then do
	do o=1 to nof
		if  index(upper(fil),upper(nf.o))~=0 then do; tr '[37mNot allowed to download that file!'; fil='BADONE!'; signal back; end
	end
end
if right(fil,1)=':' | right(fil,1)='/' then do; tr "You can't download a directory!"; fil='BADONE!'; signal back; end
address command 'List 'fil' >T:Data.dat NOHEAD'
if ~exists('T:Data.dat') then do; tr '[35mUnknown error!'; signal slut; end
sm '.'; call open(dat,'T:Data.dat','R')
f=readln(dat); sm '.'; cp=0
b=readln(dat); if b~='' then do; close(dat); tr "You can't download a directory!"; fil='BADONE!'; signal back; end
close(dat); size=''; address command 'C:Delete T:Data.dat'
if index(fil,':')=0 & index(fil,'/')=0 then do; size=word(f,2); sm'.'; end
if size='' then do; size=word(f,2); sm '.'; end
if size='Dir' then do; tr "You can't download a directory!"; fil='BADONE!'; signal back; end
tr '[32mOk!'
tr ''
tr '36m'upper(fil)'[31m  -  [36m'size' [31mbytes'
tr ''
back:
return

slut:
tr ''
tr '[31mThanks for using mAD SysDown v 0.01b by mAd mOOse / sUPREME'
tr ''
if logoff=1 then do; tr 'Loging off...'; PutUser 511; end
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

dizdir:
diz=1 ;tr '[0;4;33m                                                    '
tr '[44;4;33mWelcome to oNLiNE DiR v 0.01b by mAd mOOse / sUPREME'
tr '[31;0;31m'
qu 'Directory to list: [35m'
dir=result
if index(dir,">")~=0 then do; tr "[31mNot allowed to use [35m>[31m in directory name!";signal sluta;end
if index(dir,"<")~=0 then do; tr "[31mNot allowed to use [35m<[31m in directory name!";signal sluta;end
if index(dir,"df")~=0 then do; tr "[31mNot allowed to list [35mDFx:[31m!"; signal sluta; end
if right(dir,1)~="/" & right(dir,1)~=":" then dir=""dir"/"
if dir='' then signal sluta
if ~exists(dir) then signal ej
address command "C:Dir "dir" >T:Filelist"
flist:
tr ''
tr '[31mContents of [36m'upper(dir)
tr ''
showfile 'T:Filelist'
qu '[31mFile to Speediz or enter to quit: [36m'
file=result
if file="" then signal nslut
signal speediz
nslut:
tr ''
address command 'C:Delete T:Filelist'
signal sluta

sluta:
tr ''
tr ''
tr '[31mThanks for using oNLINE DiR v 0.01b by mAd mOOse / sUPREME'
tr ''
signal okk

ej:
tr '[31mNo existing directory!'
tr ''
signal sluta

speediz:
tr '[0;4;33m                                                    '
tr '[44;4;33mWelcome to oNLiNE DiZ v 0.01b by mAd mOOse / sUPREME'
tr ''
sm '[36;0;36mProccessing file...'
file=""upper(dir)""upper(file)
do ok=0 to 0;end
if file='' then signal quest
if index(upper(file),".LHA")~=0 then signal desc
if index(upper(file),".ZIP")~=0 then signal desc
if index(upper(file),".LZH")~=0 then signal desc
if index(upper(file),".TXT")~=0 then signal desc
if index(upper(file),".NFO")~=0 then signal desc
if index(upper(file),".DMS")~=0 then signal desc
if index(upper(file),".EXE")~=0 then signal desc
if index(file,">")~=0 then do; tr "[31mNot allowed to use [35m>[31m in file name!";signal quest;end
if index(file,"<")~=0 then do; tr "[31mNot allowed to use [35m<[31m in file name!";signal quest;end
if index(upper(file),"DF")~=0 then do; tr "[31mNot allowed to Speediz files on [35mDFx:[31m!"; signal quest; end
if ~exists(file) then do; tr ''; tr '[36mFile NOT found!'; signal quest; end
if ~exists("C:Speediz") then do; tr '[31mSpeediz not found in C:, tell the [35mSysOp[31m!';signal quest;end
tr '[36mUnknown filetype!'
quest:
tr ''
sm '[31mDisplay filelist again ([36mY[31m/n) ? '
gc
ke=upper(result)
if ke='Y' | ke='' then signal flist
if ke='N' then signal sluta
signal flist

desc:
sm 'Getting description...'
address command 'C:Speediz >T:Tempfile 'file
if ~exists("T:Tempfile") then signal error
tr ''
tr '[31mDescription of [33m'file
tr ''
showfile "T:Tempfile"
signal quest
