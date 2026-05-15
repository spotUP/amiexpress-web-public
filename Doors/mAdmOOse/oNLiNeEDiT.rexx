/* oNLiNe EDiT v 0.01c by mAd mOOse / sUPREME */

parse arg node
options results
signal on syntax; signal on ioerr; signal on error

address value 'AERexxControl'node

tr=transmit;qu=query;sm=sendmessage;gc=getchar;gu=getuser

gu 100;user=result

top:
tr ''
sm 'Please wait reading config.'
a=open(cfg,'Doors:mAdmOOse/oNLiNeEDiT.cfg','R')
if a=0 then do; tr 'No config file found! Exiting... ';signal slut;end
password=readln(cfg)
sm '.'
close(cfg)
a=open(names,'Doors:mAdmOOse/oNLiNeEDiT.names','R')
if a=0 then do; tr 'No names file found! Exiting... ';signal slut;end
non=readln(names)
if non='NONAMES' then signal noname
if non=1 then do; name.non=readln(names);sm '.';signal noname;end
sm '.'
do n=1 to non
	name.n=readln(names)
	sm '.'
end
noname:
close(names)
tr 'Ok!'
tr ''
if password='NOPASSWORD' then signal nopass
qu 'Enter password: [30m'
pass=result
if pass=password then signal passwordok
tr '[31mPassword is [35mNOT OK[31m!'
signal slut

passwordok:
tr '[31mPassword is [32mOK[31m!'
nopass:
tr ''
if non='NONAMES' then signal main
tr '[31mUser online: [33m'user
sm '[31mChecking name..'
do d=1 to non
	sm '.'
	if name.d=user then signal nameok
end
tr '[31mName is [35mNOT OK[31m!'
signal slut

nameok:
tr 'Name is [32mOK[31m!'
tr ''
sm '([32mspace to resume[31m)'
gc
main:
tr ''
tr '[0;4;33m                                                          '
tr '[44;4;33mWelcome to oNLiNe FiLe EDiT v 0.01c by mAd mOOse / sUPREME'
tr ''
tr '[31;0;31m([35mto list files enter .L. as file[31m)'
tr '([35mto show available volumes enter .I. as file[31m)'
tr '([35mif you want to create a new file enter .N. as file[31m)'
tr ''
qu 'Enter path+file to edit: [32m'
file=result
if file='' then signal slut
if file='.L.' | file='.l.' then signal oldir
if file='.I.' | file='.i.' then signal olinfo
if file='.N.' | file='.n.' then signal new
b=open(fil,file,'R')
if b=0 then signal new
tr ''
sm 'Please wait reading file..'
do a=1 to 1000
	line.a=readln(fil)
	if eof(fil) then signal klar
	sm '.'
end
tr '[31mReady...'
tr 'This program can only handle files which contains up to 1000 lines!'
tr '...1000 lines readed'
sm '[31mReady... ([32mspace to resume[31m)'
gc
signal klara
klar:
sm '[31mReady... ([32mspace to resume[31m)'
gc
if a~=1 then a=a-1
klara:
if a=0 then signal ahanew
klarb:
tr ''
tr 'Number of lines: [35m'a' [31mFilename: [35m'file
tr ''
tr '[32mL[31m]ist, [32mA[31m]dd line, [32mD[31m]elete ine,  [32mS[31m]ave and quit, [32m?[31m'
sm '[32mE[31mdit line, Select another [32mF[31m]ile or [32mQ[31m]uit ? '
gc
what=upper(result)
if what='L' then signal list
if what='A' then signal addline
if what='D' then signal deleteline
if what='S' then signal save
if what='?' then signal about
if what='Q' then signal quit
if what='F' then do; close(fil); signal main; end
if what='E' then signal editline
signal klara

editline:
back = '08'x
tr ''
qu 'Line number to edit: [33m'
l=result; sm '[31m'
if l='' then signal klara
if l>a | l<1 then do; tr 'Line number to low or to high'; sm '([32mpause[31m)'; gc; signal klara; end
sm l': [36m'; board=line.l; pos=length(board)
sm board
do until shit='0d'x
	gc
	shit=result
	if shit=back & pos~=0 then do
		sendstring back' 'back
		pos=pos-1
		if length(board)>0 then board=left(board,length(board)-1)
	end
	if pos~= 90 & shit~=back & shit~='0d'x then do
		board=board''shit
		sendstring shit
		pos=pos+1
	end
end
line.l=board; tr ''
tr ''
tr '[31mProcessing..[36mOk![31m'
sm '([32mpause[31m)'
gc
signal klara

about:
tr ''
tr '[0;4;33m                                               '
tr '[44;4;33moNLiNe FiLE EDiT v 0.01c by mAd mOOse / sUPREME'
tr ''
tr '[31;0;31mAll coding by [36mmAd mOOse[31m / sUPREME'
tr 'Spreading by [36maRYAN[31m / sUPREME'
tr ''
tr 'If you have any ideas how to make this program even'
tr "better then don't hesitate to call Thunderdome at 0455-59060"
tr 'and leave a message to mAd mOOse  with an extra space after the name.'
tr ''
sm '[31m([32mpaused...space to resume[31m)'
gc
signal klarb

ahanew:
tr ''
do c=1 to 5;end
sm "[31mCan't find file! Should I create a new one with this name ([36mY[31m/n) ? "
gc
a=result
if a='' then do; close(fil); signal newis; end
if a='y' | a='Y' then do; close(fil); signal newis; end
if a='n' | a='N' then do; close(fil); signal main; end
close(fil)
signal main

new:
tr ''
qu '[31mEnter filename+path of new file: [36m'
file=result
if file='' then signal main
newis:
if open(fil,file,'R')=1 then do; close(fil); tr 'File already exists!';signal new;end
a=open(fil,file,'W')
if a=0 then signal ccf
a=close(fil)
a=open(fil,file,'R')
line.a=''
signal klara

list:
tr 'L'
tr ''
tr '[31mContents of [32m'file'[31m'
tr ''
call open(tfil,'T:tempfile','W')
do b=1 to a
	call writeln(tfil,b'> 'line.b)
end
close(tfil)
showfile 'T:tempfile'
tr ''
sm '[31m([32mpaused...space to resume[31m)'
gc
signal klara

addline:
tr 'A'
qu 'Text: '
linje=result
if linje='' then signal klara
a=a+1
line.a=linje
sm '[31mLine added ([32mpaused... space to resume[31m)'
gc
signal klara

deleteline:
if a=1 then do; tr 'D'; line.a=''; sm '[31mLine deleted ([32mpaused... space to resume[31m)'; gc; signal klara; end
tr 'D'; tr ''
qu '[31mEnter line to delete: '
l=result
if l>a | l<1 then do; tr 'Line number to low or to high!'; signal klara; end
sm 'Please wait proccessing..'
if l=a then a=a-1
d=0; d=l
do c=l to a
	d=d+1; line.c=line.d; sm '.'
end
a=a-1
tr '[32mOk![31m'
sm 'Line deleted ([32mpaused... space to resume[31m)'
gc
signal klara

save:
tr 'S'
sm 'Saving...'
close(fil)
open(fil,file,'W')
do b=1 to a
	call writeln(fil,line.b)
end
tr 'Ok!'
signal quit

quit:
tr ''
close(fil)
signal slut

oldir:
tr ''
tr '[0;4;33m                                                    '
tr '[44;4;33mWelcome to oNLiNE DiR v 0.01c by mAd mOOse / sUPREME'
tr '[31;0;31m'
tr ''
qu 'Directory to list: '
dir=result
if dir='' then signal slutd
if index(dir,">")~=0 then do; tr "[31mNot allowed to use [35m>[31m in directory name!";signal slut;end
if index(dir,"<")~=0 then do; tr "[31mNot allowed to use [35m<[31m in directory name!";signal slut;end
if index(dir,"df")~=0 then do; tr "[31mNot allowed to list [35mDFx:[31m!"; signal slut; end
if ~exists(dir) then signal ej
address command 'C:List 'dir' >T:Filelist NOHEAD'
tr ''
tr '[31mContents of [36m'upper(dir)'[32m'
tr ''
showfile 'T:Filelist'
address command 'C:Delete T:Filelist'
signal slutd

slutd:
tr ''
tr '[31mThanks for using oNLINE DiR v 0.01c by mAd mOOse / sUPREME'
tr ''
sm '([32mspace to resume[31m)'
gc
signal main

ej:
tr 'No existing directory!'
tr ''
signal slutd



olinfo:
tr ''
tr '[31mWelcome to oNLiNEiNFO v 0.01c by mAd mOOse / sUPREME'
tr ''
sm '[32mGetting info...[31m'
address command 'C:Info >T:Info'
tr 'Showing info...'
showfile 'T:Info'
address command 'C:Delete T:Info'
tr ''
tr '[31mThanks for using oNLINEiNFO v 0.01c by mAd mOOse / sUPREME'
tr ''
sm '([32mspace to resume[31m)'
gc
signal main

noex:
tr ''
tr '[31mNone existing file, exiting...'
signal slut

slut:
tr ''
tr '[31mThanks for using oNLiNeEDiT v 0.01c by mAd mOOse / sUPREME'
tr ''
shutdown
exit

ccf:
tr "[31mCouldn't create new file!"
signal slut

syntax:
ioerr:
error:
tr ''
tr '[31mSome kind of error have been occupied on line [36m'sigl'[31m! Please tell SysOp!!'
tr 'Errortext: [36m'errortext(sigl)
signal slut
