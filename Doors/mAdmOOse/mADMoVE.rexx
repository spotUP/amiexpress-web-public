/* mAD MoVE v 0.01b by mAd mOOse / sUPREME */

parse arg node
options results
signal on error; signal on syntax; signal on ioerr

address value 'AERexxControl'node

tr=transmit;qu=query;sm=sendmessage;gc=getchar;gu=getuser
cls  = d2c('12')
back = '08'x
up=''
gu 122; lines=result
gu 131; args=result
gu 127; confloc=result
gu 100; user=result
gu 510; conf=result

tr cls
tr '[0;4;33m                                                  '
tr '[44;4;33mWelcome to mAD MoVE v 0.01b by mAd mOOse / sUPREME'
tr '[31;0;31m'

if ~exists('Doors:mAdmOOse/mADMoVE.cfg') then do; tr "Couldn't find config, using defaults!"; signal def;end
sm 'Reading config file..'
call open(cfg,'Doors:mAdmOOse/mADMoVE.cfg','R')
temp=readln(cfg)
sm '.'
max=readln(cfg)
sm '.'
pw=readln(cfg)
sm '.'
names=readln(cfg)
sm '.'
if names='NONAMES' then do; tr 'Ok!'; signal ok; end
tr 'Ok!'
tr ''
tr '[31mUser online: [36m'user
sm '[31mChecking name..'
do a=1 to names
	name.a=readln(cfg)
	sm '.'
	if name.a=user then do; tr '[31mName is [32mOK[31m!'; signal chkpw; end
end
close(cfg)
tr '[31mName is [32mNOT OK[31m!'
signal slut

chkpw:
if a<names then do b=a+1 to names; cp=readln(cfg) ; end
noc=readln(cfg); b=0
sm 'Reading the rest of the config..'
do a=1 to noc
	cname.a=readln(cfg)
	cloc.a=readln(cfg)
	if right(cloc.a,1)~='/' & right(cloc.a,1)~=':' then cloc.a=cloc.a'/'
	clloc.a=readln(cfg)
	if right(clloc.a,1)~='/' & right(clloc.a,1)~=':' then clloc.a=clloc.a'/'
	cnum.a=readln(cfg)
	b=b+1; if b=2 then do;sm '.'; b=0; end
end
tr 'Ok!'
close(cfg)
if pw='NOPASSWORD' then signal ok
board=''; pos=0
shit=''
sm '[31mEnter password: [36m'
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
password=board
if pw=password then do; tr '[31mPassword is [32mOK[31m!'; signal ok; end
tr '[31mPassword is [32mNOT OK[31m!'
signal slut

ok:
tr ''; top=0

do a=1 to max
	if exists(confloc'Dir'a) then top=a
end
tr ''
if top>1 then do
	qu '[34mMove from which Dir file ([36m1[34m-[36m'top'[34m, [36mCR[34m=[36m'top'[34m) ? [35m'
	to=result
	if to=0 then top=0
	if to<top & to>0 then top=to
end	
if top=0 then do; tr 'No files found!'; signal slut; end
call open(list,confloc'Dir'top,'R')
tr ''
sm '[36mA[34mll, [36mM[34manual or [36mQ[34muit ([36mM[34m/a/q)? [36m'
gc
k=upper(result)
if k='Q' then do; tr 'Quit'; signal slut; end
if k='A' then do; tr 'All'; signal all; end
tr 'Manual'
tr ''
sm 'Listing Dir'top'...'
if eof(list) then do; tr 'No files found'; signal slut; end
tr ''; tr ''; n=1; ll=1
do n=1 to 1; end; tag=1

tr cls
tr up
do forever
	do b=1 to lines-1
		l=readln(list)
		tr l
		if eof(list) then signal menu
		ll=ll+1
		putuser 526
		putustr 1
	end
	ok=0
	do until ok=1
		sm '[32mF[31m]lag file(s), [32mM[31m]ove file(s), [32mC[31m]lear, [32mQ[31m]uit or [32mCR[31m ? '
		gc
		k=upper(result)
		if k='Q' then do; tr ''; signal slut; end
		if k='N' then do; tr ''; signal slut; end
		if k='Y' then ok=1
		if k='C' then do; tr cls; ok=1; end
		if k='F' then call tag
		if k='M' then signal sd
		if k~='F' then ok=1
	end
	tr up'[27D'
	sm '                                              '
	tr up'[27D'
	mklar:
	do n=0 to 0; end
end

menu:
sm '[32mF[31m]lag file(s), [32mM[31m]ove file(s), [32mC[31m]lear, [32mQ[31m]uit or [32mCR[31m ? '
gc
k=upper(result)
if k='Q' then do; tr ''; signal slut; end
if k='N' then do; tr ''; signal slut; end
if k='Y' then ok=1
if k='C' then do; tr cls; ok=1; end
if k='F' then call tag
if k='M' then signal sd
tr '[27D'
sm '                                      '
tr '[27D'
if k~='F' then signal slut
signal menu

def:
max=10
axx=255
pw='NOPASSWORD'
names='NONAMES'
signal ok

slut:
tr ''
tr '[31mThanks for using mAD MoVE v 0.01b by mAd mOOse / sUPREME'
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

tag:
tr '['lines+1';1H                                                              ['lines';1H'
sm '[31mTags: [36m 'tag' [31mFilename: [36m'
board=''; pos=0
shit=''
do until shit='0d'x
	gc
	shit=result
	if shit=back & pos~=0 then do
		sendstring back' 'back
		pos=pos-1
		if length(board)>0 then board=left(board,length(board)-1)
	end
	if pos~= 16 & shit~=back & shit~='0d'x then do
	board=board''shit
	sendstring shit
	pos=pos+1
end
end
a=upper(board)
if a~='' then do; file.tag=a; tag=tag+1; end
sm '['lines+1';1H                                                               ['lines+1';1H'
return

sd:
if tag=1 then do; tr 'No files flaged!'; signal slut; end
tr ''
tr ''
res:
if res=1 then do; res=0; tr cls; end
tr 'Files flagged:'
tr ''; cconf=conf+1
do a=1 to tag-1
	tr '               'file.a
end
tr ''
tr '[31mConferances available:'
tr ''
do cpa=1 to noc
	tr '                           [35m'cpa'[34m.[36m'cname.cpa
end
tr ''
sc:
qu '[34mMove to which conferance [34m([36mEnter [32m= [36mQuit[34m)[31m: [32m'
conf=result
if conf='' then signal slut
if conf>noc then do; tr '[31mConferance number to high!'; signal sc; end
if ~exists(clloc.conf) then do; tr '[35mConferance location not found!'; signal sc; end
tconfloc=clloc.conf
sdl:
qu '[36mDir listing [34m([36mEnter[32m = [36m'cnum.conf', Q [32m=[36m Quit[34m)[31m: [32m'
t=result
if upper(t)='Q' then signal slut
if t>cnum.conf then do; tr '[31mDir number to high!'; signal sdl; end
if t='' then t=cnum.conf
ttop=t
if clloc.conf'Dir'ttop=confloc'Dir'top then do; tr "[31mYou can't move to the same Dir file!!"; res=1; signal res; end
sm '[31mReading Dir'top'..'; cu=0
if ~exists(confloc'Dir'top) then do; tr '[31mDir'top' not found!'; signal slut; end
close(list)
fh=open(list,confloc'Dir'top,'R'); li=0; d=0
if ~exists(clloc.conf'Dir'ttop) then do; call open(test,clloc.conf'Dir'ttop,'W'); close(test); end
fh=open(fto,clloc.conf'Dir'ttop,'A')
do until cu=1
	listan.li=readln(list); li=li+1
	if eof(list) then cu=1
	d=d+1; if d=50 then do; sm '.'; d=0; end
end
tr 'Ok!'
sm 'Moving file(s) from Dir'top' to [36m'cname.conf'[31m, [36mDir[34m'ttop'[31m..'
fh=open(ot,temp'Dir'top,'W')
a=0; fo=0; lok=0; skip=0; c=0; max=li; li=0; mt=tag
do until lok=1
	l=listan.li; li=li+1
	c=c+1; if c=50 then do; sm '.'; c=0; end
	if word(l,2)='P' | word(l,2)='N' | word(l,2)='F' & word(l,1)~='' then do
		skip=0
		if skip=0 then do
			fil=upper(word(l,1))
			do b=1 to mt
				if fil=file.b then skip=1
			end
		end
	end
	if li=max then do; lok=1; skip=1; end
	if skip=0 then writeln(ot,l)
	if skip=1 & lok=0 then writeln(fto,l)
end
sm '.'
close(ot); close(list); close(to)
address command "C:Delete "||confloc||"Dir"||top
address command "C:Copy "||temp||"Dir"||top||" "||confloc||"Dir"||top
address command "C:Delete "||temp||"Dir"top
tr 'Ok!'
tr '[36mMoving file(s) from [33m'cloc.cconf' [36mto[33m 'cloc.conf'[34m..'
tr ''
do b=1 to mt-1
	sm '                           [36m'file.b'[34m..'
	if ~exists(cloc.cconf''file.b) then tr '[36mNot found!'
	if exists(cloc.cconf''file.b) then do
		address command 'C:Copy 'cloc.cconf''file.b' 'cloc.conf''file.b
		tr '[33mOk!'
	end
end
signal slut

all:
tr ''; close(list)
tr '[31mConferances available:'
tr ''; cconf=conf+1
do cpa=1 to noc
	tr '                           [35m'cpa'[34m.[36m'cname.cpa
end
tr ''
sc:
qu 'Move to which conferance [34m([36mEnter [32m= [36mQuit[34m)[31m: [32m'
conf=result
if conf='' then signal slut
if conf>noc then do; tr '[31mConferance number to high!'; signal sc; end
if ~exists(clloc.conf) then do; tr '[31mConferance location not found!'; signal sc; end
tconfloc=clloc.conf
sdl:
qu '[36mDir listing [34m([36mEnter[32m = [36m'cnum.conf', Q [32m=[36m Quit[34m)[31m: [32m'
t=result
if upper(t)='Q' then signal slut
if t>cnum.conf then do; tr '[31mDir number to high!'; signal sdl; end
if t='' then t=cnum.conf
ttop=t
if ~exists(clloc.conf'Dir'ttop) then do; call open(test,clloc.conf'Dir'ttop,'W'); close(test); end
sm '[36mMoving file(s)[34m..'
address command 'C:Join 'confloc'Dir'top' 'clloc.conf'Dir'ttop' TO 'temp'Dir'ttop; sm '.'
if confloc'Dir'top=clloc.conf'Dir'ttop then do; tr "[31mYou can't move to the same Dir file!!"; signal slut; end
if ~exists(temp'Dir'ttop) then do; tr '[36mUnknown error!?'; signal slut; end
sm '.'; address command 'C:Copy 'temp'Dir'ttop' 'clloc.conf
sm '.'; address command 'C:Delete 'temp'Dir'ttop
open(ta,confloc'Dir'top,'W'); close(ta)
if cloc.cconf~=cloc.conf then do; sm '.'; address command 'C:Copy 'cloc.cconf'#? 'cloc.conf; sm '.'; end
sm '.'; address command 'C:Delete 'cloc.cconf'#?'
tr '[35mAll done!'
signal slut
