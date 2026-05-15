/* Hacker 5.2 (Complete rewrite... And much better!)
   By Dr. Ice, SysOp on Key Stroke BBS... 
   Fixed for AmiExpress System's by Dr. Ice.

   And even MORE improved by : Lizard of Spaceballs! :))

   Lots of bugs fixed! - And I'll code a ASM-version soon, MUCH BETTER OUTPUT!


ADDED/IMPROVED
--------------

Hacker v5.2c
- Improved the DSALV command (check it out)...
- Added a longer delay for text messages...

BUGS
----

Hacker v5.2b
- When game was completed, an error showed up, fixed..
- CLI-Commando "Clean" was used, this has been replaced with Avail Flush
- When maxturns was used up, you didn't get new turns the next day...Fixed!
- Wardialer was NOT working properly, and you never got to see the results...Fixed!

*/


signal on error;signal on syntax;signal on ioerr

tr=transmit
CLS  = D2C('12')
CR   = D2C('13')

version='v5.2c'
parse arg node
options results
nodeid = 'AERexxControl'node

address value nodeid

DT_BBSNAME       =  11
DT_SYSOP         =  12
DT_NAME          = 100
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

/*----------------------------------------------------*/	
/* Change the following variables to suit your system */
/*----------------------------------------------------*/
path='doors:hacker/hackerdata/'
upath='doors:hacker/hackerdata/users/'
HAAnumber='4598238413#4432'
maxturns=75
p='###PANIC'

getuser DT_SECSTATUS;ACCESS=result
getuser DT_BBSNAME;bbsname=result
getuser DT_SYSOP;sysop=result

/*----------------------------------------------------*/

sendstring CLS' '
tr ' '
tr '°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°'
tr center('Hacker 'version' - 1992 by Marijuana Man... Hemp For Victory!',78)
tr ' '
tr center('Running on 'bbsname', SysOp:'sysop'...',89)
tr ' '
tr center('HACKER 'version' - Converted for /X by Dr. Ice',78)
tr ' '
tr '°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°'

sendstring '[11;0H[37mLOADING  [0mVIRUS.data[30m'
call open(1,path||'virus.data','r')
do i=1 to 20
 vin.i=readln(1)
 vis.i=readln(1)
 vic.i=readln(1)
end
call close(1)

sendstring '[11;9H [0mTERMINALS.data     [30m'
call open(1,path||'Terminals.data','r')
do i=0 to 20
 tn.i=readln(1)
 ts.i=readln(1)
 tc.i=readln(1)
 tk.i=readln(1)
end
call close(1)

sendstring '[11;9H [0mBBSPROGS.data      [30m'
call open(1,path||'BBSprogs.data','r')
do i=0 to 20
 bn.i=readln(1)
 bs.i=readln(1)
 bc.i=readln(1)
end
call close(1)

sendstring '[11;9H [0mLOCAL.data         [30m'
call open(1,path||'local.data','r')
nlb=readln(1)
do i=1 to nlb
 lbn.i=readln(1)
 lbph.i=readln(1)
 lbm.i=readln(1)
 lbs.i=readln(1)
 lbx.i=readln(1)
 lby.i=readln(1)
end
call close(1)

sendstring '[11;9H [0mMAINFRAMES.data    [30m'
call open(1,path||'mainframes.data','r')
nmf=readln(1)
do i=1 to nmf
 mfn.i=readln(1)
 mfph.i=readln(1)
 mfm.i=readln(1)
 mfs.i=readln(1)
 mfx.i=readln(1)
 mfy.i=readln(1)
end
call close(1)

sendstring '[11;9H [0mGOVERNMENT.data    [30m'
call open(1,path||'government.data','r')
ngv=readln(1)
do i=1 to ngv
 gvn.i=readln(1)
 gvph.i=readln(1)
 gvm.i=readln(1)
 gvs.i=readln(1)
 gvx.i=readln(1)
 gvy.i=readln(1)
end
call close(1)

sendstring '[11;9H [0mSECRETNUMBERS.data [30m'
call open(1,path||'secretnumbers.data','r')
nsn=readln(1)
do i=1 to nsn
 snn.i=readln(1)
 snph.i=readln(1)
 snm.i=readln(1)
 sns.i=readln(1)
 snx.i=readln(1)
 sny.i=readln(1)
end
call close(1)

sendstring '[11;9H [0mHAA.data           [30m'
call open(1,path||'haa.data','r')
haaph=readln(1)
call close(1)
haam=4096
haas=500
haan='Hackers Association Of America'

sendstring '[11;9H [0mNETBOARDS.data     [30m'
call open(1,path||'netboards.data','r')
nnb=readln(1)
do i=1 to nnb
 nbn.i=readln(1)
 nbm.i=readln(1)
 nbs.i=readln(1)
 nbx.i=readln(1)
 nby.i=readln(1)
end
call close 1

sendstring '[11;9H [0mLEVELS.data        [30m'
call open(1,path||'levels.data','r')
do i=0 to 26
 lname.i=readln(1)
 ldrive.i=readln(1)
 lsal.i=readln(1)
 lexp.i=readln(1)
end
call close(1)

sendstring '[11;9H [0mCARDS.data         [30m'
call open(1,path||'cards.data','r')
do i=1 to 20
 crdn.i=readln(1)
 crdw.i=readln(1)
end
call close(1)

tr ''
tr '[36m--- COMPLETE ---'
tr ''

getuser DT_NAME;name=result
if exists(upath||name)=1 then signal userthere

tr 'A new hacker... setting up your computer system...';call GPAUSE

cash=5000
viruses.1=10
viruses.2=7
viruses.3=5
viruses.4=2
viruses.5=1
do i=6 to 20
 viruses.i=0
end
terminal=0
bbs=0
level=0
mwon=0
mlost=0
exp=0
turns=maxturns
netcharge=0
dmg=0
call savestats

tr 'You are all set to go! Do you want instructions? [No]'
query ">";yn=upper(result)
if yn=p then signal buttdode
if yn='Y' then showfile path'Hacker.inst'

fs='w'
if exists(path||'userlist')=1 then fs='a'
call open(1,path||'userlist',fs)
call writeln(1,name)
call close(1)

tr 'Done!'

userthere:
tr 'Loading your stats...'

call loadstats

tr 'Done!'

if exists(upath||name||'.1')=0 then signal skipmaint

turns=maxturns
cash=cash+lsal.level
if lsal.level=0 then signal nosal
tr 'You receive your salary of $'lsal.level' from the HAA.';call GPAUSE

nosal:
address command 'c:delete "'upath''name'.1"'
if exists(upath||name||'.w')=0 then signal skipmaint
showfile upath||name||'.w'
tr 'Press any Key';query ""
address command 'delete "'upath||name||'.w"'

skipmaint:
if exists(upath||name||'.m')=0 then signal skipmail
getuser DT_NAME;to=result
sendstring CLS " "
tr center("[37m°°° [36mMail waiting for you! [0m"NAME" [37m °°°",93)
call open(3,upath||name||'.m','r')
do until eof(3)=1
 fr=readln(3)
 if fr='' then leave
 z='---'
 tr '[37m°°°°°°°°°°°°°°°°°°°°°°°°° [0m'to' [37mFrom: [36m'fr'[37m °°°°°°°°°°°°°°°°°°°°°°°°°'
 do until z='!!!' | eof(3)=1
  z=readln(3)
  if z~='!!!' then tr '[0m'z
 end
 tr '[37m°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°'
 tr '[36mPress RETURN to go to next message or R to reply to it.'
 query ">"; rp=result
 if rp='###PANIC' then signal buttdode
 if upper(rp)='R' then do;rpm=1;pm=fr;call smail;rpm=0;end
end
call close(3)
tr 'Do you want to delete your mail? [Yes]'
query;yn=result
if yn='###PANIC' then signal buttdode
if upper(yn)='N' then signal skipmail
address command 'delete "'upath||name||'.m"'

skipmail:
showfile path||'hacker.intro'
tr ''
tr 'Newshell process 8'
tr 'Started 'bn.bbs' as a background task';call GPAUSE




/* HER MÅ DER EN DATE-sjekk for å se om Turns skal nullstilles... */


turns=maxturns
if exists(upath||name||'.w')=0 then signal main
tr ''
tr 'Lizard brings you the wardialer-news:'
tr '-------------------------------------'
showfile upath||name||'.w'
tr 'Press any Key';query ""
address command 'delete "'upath||name||'.w"'



main:
sendstring '['turns']> '
query "";cmd=upper(result)
if turns<5 then signal tbye
address command 'avail flush'
if access<254 then signal skipsyc
if cmd='NETGEN' then signal nodegen
if cmd='RESET' then signal nugame
skipsyc:
if cmd="###PANIC" then signal buttdode
if cmd='DIR' | cmd='?' then signal dir
if cmd='HAA' then signal HAA
if cmd='STATS' then signal stats
if cmd='LIST' then signal listhackers2
if cmd='PBOOK' then signal pbook
if cmd='TOP' then signal top
if left(cmd,1)='Q' then signal quit
if cmd='HACK' then signal hackuser
if cmd='MAIL' then signal smail
if cmd='DSALV' then signal hdfix
if cmd=upper(tn.terminal) | cmd='TERM' then signal terminal
if cmd='NODELIST' then signal NODELIST
if cmd='LAST' then signal LASTTEN
if cmd='HELP' then do;showfile path||'hacker.inst';signal main;end
if cmd~='' then do;tr 'Unkown Command 'cmd;end
signal main

LASTTEN:
sendstring CLS " "
tr '                        --- Last 10 Fights Log ---'
showfile path||'lastfights'
signal main

terminal:
if ldrive.level-dmg > 0 then signal tdriveok
tr 'Error reading 'tn.terminal' - Block unreadable.' 
signal main

tdriveok:
tr 'Newshell process 9...';call GPAUSE
tr 'Starting 'tn.terminal' as a background task';call GPAUSE

termready:
tr '°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°'
tr tn.terminal' options:'
tr '[1] Call a BBS'
tr '[2] Return to DOS'
tr '°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°'

query ">";topt=result;topt=space(topt,0)
if topt=p then signal buttdode
if topt='2' then signal main
if topt='1' then signal dialout
signal termready

dialout:
if turns>0 then signal dialoutturnsok
tr 'Sorry, you are out of turns for today.';call GPAUSE
signal termready

getnum:
if exists(upath||name||'.pb')>0 then signal getnum2
tr 'You do not have a personal phonebook at this time.'
tr 'Add some numbers to it first.'
call GPAUSE
fa=0
return

getnum2:
fa=1
call open(1,upath||name||'.pb','r')
tr num
do i=1 to num
 num2=readln(1)
 zz=readln(1)
 if eof(1)=1 then do;fa=0;leave;end
end
call close(1)
num=num2
return

dialoutturnsok:
sendstring CLS " "
tr 'Initializing modem.'
tr 'Enter one of the following:'
tr ' <Phone#> - Phone number of the system you wish to call.'
tr '    L     - Listing of the contents of your personal phonebook.'
tr '    Pn    - Dial system n from personal phonebook.'
tr '    Q     - Return to terminal option screen.'
query'ATDT *70,';num=result;num=space(num,0)
fl=0;fm=0;fg=0;fs=0;fcs=0;fnb=0;xnet=0;fa=1
if num='' | upper(num)='Q' then signal termready
if num=p then signal buttdode
if upper(num)='L' then do;lpf=1;call pblist;signal dialoutturnsok;end
if upper(num)='P' then signal dialoutturnsok
if upper(num)='PN' then do;tr 'Hey, you need to specify a NUMBER! That is what the N means!';signal dialoutturnsok;end
if left(upper(num),1)='P' then do;num=right(num,length(num)-1);call getnum;end
if fa=0 then signal dialoutturnsok

redial:
fb=0;fbx=0
do i=1 to nlb
 if upper(num)=lbph.i then do;fb=i;fbx=180;signal foundlocal;leave;end
end
do i=1 to nmf
 if upper(num)=mfph.i then do;fb=i;fbx=242;signal foundmain;leave;end
end
do i=1 to ngv
 if upper(num)=gvph.i then do;fb=i;fbx=531;signal foundgov;leave;end
end
do i=1 to nsn
 if upper(num)=snph.i then do;fb=i;fbx=737;signal foundsecret;leave;end
end
if upper(num)~=haaph then signal foundnothing
ebn=haan
ebs=haas
ebm=haam
ebx=0
eby=0
fb=1;fbx=65535
signal bbsdial

foundlocal:
ebn=lbn.i
ebs=lbs.i
ebm=lbm.i
obm=ebm
ebx=lbx.i
eby=lby.i
fl=1
if xnet=1 then signal connectok
signal bbsdial

foundmain:
ebn=mfn.i
ebs=mfs.i
ebm=mfm.i
obm=ebm
ebx=mfx.i
eby=mfy.i
fm=1
if xnet=1 & ebs>ts.terminal then do;xnet=0;tr 'Your terminal cannot crack this system''s security!';call GPAUSE;signal netmain;end
if xnet=1 then signal connectok
signal bbsdial

foundgov:
ebn=gvn.i
ebs=gvs.i
ebm=gvm.i
obm=ebm
ebx=gvx.i
eby=gvy.i
fg=1
if xnet=1 & ebs>ts.terminal then do;xnet=0;tr 'Your terminal cannot crack this system''s security!';call GPAUSE;signal netmain;end
if xnet=1 then signal connectok
signal bbsdial

foundsecret:
ebn=snn.i
ebs=sns.i
ebm=snm.i
obm=ebm
ebx=snx.i
eby=sny.i
fs=1
if xnet=1 & ebs>ts.terminal then do;xnet=0;tr 'Your terminal cannot crack this system''s security!';call GPAUSE;signal netmain;end
if xnet=1 then signal connectok
signal bbsdial

foundnet:
ebn=nbn.i
ebs=nbs.i
ebm=nbm.i
obm=ebm
ebx=nx
eby=ny
fnb=1
if ebs>ts.terminal then do;xnet=0;tr 'Your terminal cannot crack this system''s security!';call GPAUSE;signal netmain;end
signal connectok

foundnothing:
tr 'Dialing 'num'...';/*call GPAUSE*/
tr 'ATDT *47,'num'...';/*call GPAUSE*/
tr ''

foundnothing2:
r=random(1,4,time('s'))
if r=1 then tr 'NO CARRIER'
if r=2 then tr 'BUSY'
if r=4 then tr 'VOICE'
if r=3 then tr 'NO ANSWER'
tr 'Dial this number again Y/N'
query ">";yn=result
if yn=p then signal buttdode
if upper(yn)='Y' then signal redial
signal termready

bbsdial:
if fcs=1 | fnb=1 then signal connectok
tr 'Dialing 'num'...';/*call GPAUSE*/
tr 'ATDT *70,'num'';/*call GPAUSE*/
tr ''
if random(1,10,time('s'))>4 then signal connected
signal foundnothing2

connected:
if exists(upath||name'.bf')=0 then signal connectok
call open(1,upath||name||'.bf','r')
bf=readln(1)
call close(1)
if upper(ebn)~=upper(bf) then signal connectok
tr 'Defeat a different BBS first.'
signal termready

connectok:
if fcs=1 then do;tr 'JACK OK 16800/LAPM/V.42BIS';call GPAUSE;signal cbsbbs;end
if fnb=1 then do;tr 'JACK OK 16800/LAPM/V.42BIS';call GPAUSE;signal netbbs;end
if xnet=1 then do;xnet=0;tr 'JACK OK 16800/LAPM/V.42BIS';call GPAUSE;signal skipconnect;end
tr 'CONNECT 16800/LAPM/V.42BIS';call GPAUSE

skipconnect:
sendstring CLS' '
if fl=1 | fs=1 then signal localBBS
if fm=1 then signal mainframeBBS
if fg=1 then signal govtBBS
tr 'Connected to The Hackers Association of America';call GPAUSE
tr 'Maintenance port open.';call GPAUSE
tr 'PASSWORD:'
signal fightbbs

netbbs:
tr 'Net BBS Link @ 'ebx','eby'.'
tr 'Welcome to 'ebn'.'
tr 'LOGON:'
signal fightbbs

cbsbbs:
sendstring CLS' '
tr 'Cyberspace link #'random(100,1000,time('s'))||random(100,1000,time('s'))
tr 'KAA E8 T1 E5 CO 41 LO 11 F4 B6 E8 AA'
tr 'LOGON:'
signal fightBBS

localBBS:
tr ''center('Welcome to 'ebn'!',78);call GPAUSE
if exists(path||'Logos/'ebn)=1 then do;showfile path||'logos/'ebn;signal genericskip;end

genericskip:
bufferflush
tr ''center('Open 24 hours a day!',78)
tr ' '
tr 'Enter NEW if you have no account.'
tr 'Enter your Name ';query ":"
signal fightbbs

mainframeBBS:
tr 'DEC VAX 1103 Mainframe. Licensed to:'ebn
tr 'LOGON:';call GPAUSE
signal fightbbs

govtBBS:
tr 'This system is property of the Government.'
tr 'Access is authorized to employees of 'ebn' only.'
tr 'Unauthorized use of this system is a federal offense'
tr 'punishable under the full extent of the law.'
tr 'LOGON:';call GPAUSE

fightBBS:
if ts.terminal>=ebs | fcs=1 then signal fightBBSok
tr 'Your terminal cannot crack this system''s security!'
signal termready

fightBBSok:
sendstring CLS " "
tr ''tn.terminal' Hack Window'
tr '+----------------------------------------------------------------+'
tr '|                                                                |'
tr '| 1 - Attack this system.                                        |'
tr '| 2 - Abort attack and disconnect immediately.                   |'
tr '|                                                                |'
tr '+----------------------------------------------------------------+'
abop=''
query ">";hop=result;hop=space(hop,0);tr hop
if hop=p then signal buttdode
if hop='2' then signal discattempt
do i=1 to 20
 ovirs.i=0
end
if fl=1 then signal locviruses
if fm=1 then signal mfviruses
if fg=1 then signal gvviruses
if fs=1 then signal secretviruses
do i=1 to 20
 ovirs.i=random(10,25,time('s'))
end
signal attackBBS

locviruses:
do i=1 to 4
 ovirs.i=random(1,4,time('s'))
end
signal attackBBS

mfviruses:
do i=1 to 8
 ovirs.i=random(3,8,time('s'))
end
signal attackBBS

gvviruses:
do i=1 to 16
 ovirs.i=random(5,10,time('s'))
end
signal attackBBS

secretviruses:
mv=ebs
if mv>20 then mv=20
hv=ebs
do i=1 to mv
 ovirs.i=random(2,hv,time('s'))
end
signal attackbbs

discattempt:
tr 'You attempt to disconnect...';call GPAUSE
pstr=ts.terminal
if pstr>ebs then signal discsucc
if random(1,10,time('s'))>6 then signal discsucc
tr 'Somehow you still seem to be connected!';call GPAUSE
tr 'Guess you have to fight them!!!'
if abop='3' then signal theirturn
signal attackBBS

discsucc:
tr 'þðß°ð¤þ°¡®þ¤¡ø¡¤®©ßNO CARRIER';call GPAUSE
signal termready

attackBBS:
address command 'avail flush'
sendstring CLS' '
tr '---> FIGHT STATUS FOR:'name' VS 'ebn'...'
tr '--------------------------------------------------------------------'
tr 'Your Megs:' ldrive.level-dmg 
tr 'BBS  Megs:' ebm
tr '--------------------------------------------------------------------'
tr ''
tr 'Options:'
tr '1 - Upload a virus.'
tr '2 - Trash Files.'
tr '3 - Attempt to disconnect.'
if fl+fm+fg+fs=1 & ts.terminal>15 then tr '4 - Jack into the network. (@ 'ebx','eby')'
query ">";abop=result;abop=space(abop,0)
if abop=p then signal buttdode
if abop='3' then signal discattempt
if abop='2' then signal trashbbs
if abop='1' then signal virBBS
if abop='4' then signal jackin

trashBBS:
tr 'You attempt to trash their files...';/*call GPAUSE*/
plstr=ts.terminal+level
if plstr>ebs then signal tfok2
if random(1,10,time('s'))>4 then signal tfok2
tr 'You were unable to break in this time! Sorry!';call GPAUSE
signal theirturn

tfok2:
mgl=random(1,10+level,time('s'))

mgl2:
if mgl>ebm then mgl=ebm
tr 'You trashed 'mgl' meg(s)!';/*call GPAUSE*/
ebm=ebm-mgl
mwon=mwon+mgl
if ebm>0 then signal theirturn
signal BBSlost

virBBS:
tr 'Enter virus number to upload or ? for list, return for none.'
query ">";viu=result;viu=space(viu,0)
if viu=p then signal buttdode
if viu='' then signal attackBBS
if viu='?' then do;call showviruses;signal virbbs;end
if viu<1 | viu>20 then signal virbbs
if viruses.viu<1 then do;tr 'You don''t have any of that one!';call GPAUSE;signal virbbs;end
viruses.viu=viruses.viu-1
tr 'You attempt to upload them a 'vin.viu' virus!';/*call GPAUSE*/
plstr=vis.viu+ts.terminal+level
if plstr>ebs then signal vupok2
if random(1,10,time('s'))>5 then signal vupok2
tr 'Your uploaded virus was snagged by their virus checking program!';call GPAUSE
signal theirturn

vupok2:
tr 'You uploaded the virus successfully!';/*call GPAUSE*/
tr 'Their system has sustained some damage!';/*call GPAUSE*/
mgl=random(1,vis.viu,time('s'))
signal mgl2

theirturn:
tr ''ebn' is taking its turn...';/*call GPAUSE*/
vc=0
do i=1 to 20
 vc=vc+ovirs.i
end
if vc>0 then signal virtoyou

trashyou:
tr 'They are attempting to trash your files!';/*call GPAUSE*/
if ebs>ts.terminal+level then signal trashedyou
if random(1,10,time('s'))>6 then signal trashedyou
tr 'They were unable to break your security!';/*call GPAUSE*/
signal attackBBS

trashedyou:
mgl=random(1,10+ebs,time('s'))
tr 'They were successful!';/*call GPAUSE*/

ulosemegs:
if ldrive.level-dmg > 20 then ldrive.level-dmg = 20
if mgl>ldrive.level-dmg then mgl=ldrive.level-dmg
tr 'You lost 'mgl' meg(s)!';/*call GPAUSE*/
mlost=mlost+mgl
dmg=dmg+mgl
tr 'Press a key.';query ""
if dmg=ldrive.level then signal BBSwon
signal attackBBS

virtoyou:
if random(1,10,time('s'))>5 then signal trashyou

ti=0
fvir:
cv=random(1,20,time('s'))
if ovirs.cv=0 then ti=ti+1
if ovirs.cv=0 & ti<50 then signal fvir
if ti=50 then signal trashyou
tr 'They are uploading you a 'vin.cv' Virus!';/*call GPAUSE*/
ovirs.cv=ovirs.cv-1
if ts.terminal+level*2<ebs+vis.cv then signal virupyes
if random(1,10,time('s'))>6 then signal virupyes
tr 'Your virus protection system saved you this time!';/*call GPAUSE*/
signal attackBBS

virupyes:
tr 'Upload successful!';/*call GPAUSE*/
tr 'Damage has been done to your system!';/*call GPAUSE*/
mgl=random(1,vis.cv,time('s'))
signal ulosemegs

BBSwon:
bbbs=''||ebn
aa='LOST!'
call updatelast
if fl=1 then signal lloc
tr 'Too bad! You have LOST! Your system was no match'
tr 'against 'ebn'!!!'
tr 'Better luck next time!'
turns=turns-1
tr 'Press a key.';query ""
signal main

updatelast:
call open(1,path||'lastfights','r')
do i=1 to 20
last.i=readln(1)
end
call close(1)
last.11=''||name||' fought '||bbbs||' and '||aa
call open(1,path||'lastfights','w')
do i=2 to 21
call writeln(1,last.i)
end
call close(1)
return

lloc:
tr 'Now Entering Chat Mode With Sysop.';call GPAUSE
tr 'Too bad, sucker... I got you. Have fun reformatting your drive!';call GPAUSE
tr 'ð®þµþð¡¤£¤þµ¡¶ø¾¼¾½¼©®NO CARRIER';call GPAUSE
turns=turns-1
signal main

BBSlost:
bbbs=''||ebn
aa='WON!'
call updatelast
if ebn='Hackers Association Of America' then signal gamewon
tr 'Congratulations! You have defeated 'ebn'!'
turns=turns-1
exm=2*fl+5*fm+10*fs+15*fg+1+20*fnb+30*fcs
exg=exm*(obm*ebs)+random(100,1000,time('s'))+100*exm+(fb*fbx)
cga=exm*(obm*ebs)+random(100,1000,time('s'))+random(100,1000,time('s'))+500*exm
if exp+exg>99999999999 then exg=0
if fcs=1 then signal skipdfb
call open(1,upath||name'.bf','w')
call writeln(1,ebn)
call close(1)

skipdfb:
do i=1 to 20
 if ovirs.i>0 then call fvir2
end
tr 'You gain 'exg' experience points.'
if left(ebn,3)='HAA' then do;tr 'The number to the main HAA system is 'haan'.';call GPAUSE;cga=0;signal skippay;end
tr 'The HAA pays you $'cga' for your effort.'
cash=cash+cga

skippay:
exp=exp+exg

leveladv2:
if exp<lexp.level then signal main
level=level+1
tr 'You advance to level 'level'!'
signal leveladv2

gamewon:
tr 'Congratulations! You have won! You have successfully crashed the HAA!'
tr 'The SysOp has been notified of your performance and the game has been'
tr 'reset! Good luck in this next game!';call GPAUSE

call open(1,path||'HAA.data','w')
do i=1 to 7
call writech(1,random(0,9,time('s')))
end
call close(1)
call open(1,path||'Lastwinner','a')
call writeln(1,'                    'left(name||'                            ',20)' Exp:'exp)
call close(1)
signal nugame2

fvir2:
vh=0
mv=ovirs.i
vf=random(1,mv,time('s'))
vg=random(1,vf,time('s'))
vff=random(1,10,time('s'))
if vff<7 then signal nocal1
call fvir3

nocal1:
return

fvir3:
tr 'You found 'vg' 'vin.i' virus(es).'
viruses.i=viruses.i+vg
vh=vg
return

jackin:
if netcharge=0 then signal jackok
tr 'You owe a $'netcharge' network access fee. Pay it first.';call GPAUSE
signal attackbbs

jackok:
tr 'Jacking into the network... stand by please!';call GPAUSE
if ts.terminal>14 then signal jackok2
tr 'Your terminal cannot crack the network security!';call GPAUSE
signal attackbbs

jackok2:
tr 'You are in!'
nx=ebx
ny=eby

netmain:
sendstring CLS' '
cbs=0
if nx<1 | nx>100 | ny<1 |ny>100 then do;tr 'Cyberspace location: 'nx','ny'.';cbs=1;signal skipnetsho;end
tr 'Network location: 'nx','ny'.'
do i=1 to nlb
 if lbx.i=nx & lby.i=ny then tr 'System:'lbn.i' megs:'lbm.i' Strength:'lbs.i
end
do i=1 to nmf
 if mfx.i=nx & mfy.i=ny then tr 'System:'mfn.i' megs:'mfs.i' strength:'mfs.i
end
do i=1 to ngv
 if gvx.i=nx & gvy.i=ny then tr 'System:'gvn.i' megs:'gvm.i' strength:'gvs.i
end
do i=1 to nsn
 if snx.i=nx & sny.i=ny then tr 'System:'snn.i' megs:'snm.i' strength:'sns.i
end
do i=1 to nnb
 if nbx.i=nx & nby.i=ny then tr 'System:'nbn.i' megs:'nbm.i' strength:'nbs.i
end

skipnetsho:
tr 'Your current net access charge is: $'netcharge;call GPAUSE
if cbs=0 then signal skipcbssys
if random(1,10,time('s'))>2 then signal skipcbssys
tr 'An unknown system has found you!';call GPAUSE
tr 'They have jacked you out of the network!'
tr 'Prepare to fight them!';call GPAUSE
ebn='Cyberspace System (Type Unknown)'
ebs=150+random(10,100,time('s'))
ebm=250+random(50,500,time('s'))
obm=ebm
ebx=nx
eby=ny
fcs=1
signal bbsdial

skipcbssys:
tr 'OPTIONS: (X)    Exit Network (Must have a system present here)'
tr '         7 8 9'
tr '         4 + 6  Move in direction indicated on numeric pad.'
tr '         1 2 3'
tr ''
query
nwop=result;nwop=space(nwop,0)
if nwop='' | nwop='5' then signal skipcbssys
if nwop=p then signal buttdode
if nwop>0 & nwop<10 then signal netmove
if upper(nwop)='X' then signal netbye
signal skipcbssys

netbye:
do i=1 to nlb
 if lbx.i=nx & lby.i=ny then do;xnet=1;signal foundlocal;leave;end
end
do i=1 to nmf
 if mfx.i=nx & mfy.i=ny then do;xnet=1;signal foundmain;leave;end
end
do i=1 to ngv
 if gvx.i=nx & gvy.i=ny then do;xnet=1;signal foundgov;leave;end
end
do i=1 to nsn
 if snx.i=nx & sny.i=ny then do;xnet=1;signal foundsecret;leave;end
end
do i=1 to nnb
 if nbx.i=nx & nby.i=ny then do;xnet=1;signal foundnet;leave;end
end
tr 'There is no system to jack out to!'
signal skipcbssys

netmove:
netcharge=netcharge+level
xm=0;ym=0
if nwop=7 then do;xm=-1;ym=-1;end
if nwop=8 then ym=-1
if nwop=9 then do;xm=1;ym=-1;end
if nwop=4 then xm=-1
if nwop=6 then xm=1
if nwop=1 then do;xm=-1;ym=1;end
if nwop=2 then ym=1
if nwop=3 then do;ym=1;xm=1;end
nx=nx+xm
ny=ny+ym
signal netmain

hdfix:
if turns>4 then signal fixturnsok
tr 'It requires 5 turns to fix your drive. Try again tomorrow.'
signal main

fixturnsok:
if dmg>0 then signal fixdmg
tr 'Your drive is not damaged!'
signal main

fixdmg:
sendstring CLS' '
showfile path||'dsalv.screen'
turns=turns-5
call GPAUSE
tr ''
GETUSER 525
transmit 'Directory map rebuilt. Repairing files...'
transmit '[0%                                                             100%]'
message=copies(".",61)
   do i=1 to length(message)
      NewChar = substr(message,1,i)
      tr "[20;4H"NewChar
      do 25;/* waste some time */;end
      end
PUTUSER 525

transmit 'Repair has been completed Successfully!';call GPAUSE
dmg=0
signal main

smail:
tr 'Enter name of player to send mail to or ? for list, return=abort'
query ">";pm=result
if pm='' then signal main
if pm=p then signal buttdode
if pm='?' then do;rlist=1;call listhackers2;signal smail;end
if exists(upath||pm)=1 then signal smok
tr 'Not found.'
signal smail

smok:
tr 'Enter a one line message to send to 'pm'.'
query "Enter Mail>";mess=result
if mess='' then signal main
if exists(upath||pm||'.m')=0 then do;call open(1,upath||pm||'.m','w');signal skipmop;end
call open(1,upath||pm||'.m','a')

skipmop:
call writeln(1,''name' says:')
call writeln(1,''mess)
call close(1)
tr 'Message sent.'
signal main

Hackuser:
if ldrive.level-dmg>0 then signal driveok
tr 'Error reading file - Hacklink - Block unreadable.'
signal main

driveok:
if turns>0 then signal hackturnsok
tr 'You are out of turns for today. Try again tomorrow.';call GPAUSE
signal main

hackturnsok:
tr 'HackLink 8.3w loaded... Initializing...';call GPAUSE
tr 'Patching into 'tn.terminal'...';call GPAUSE
tr 'Patch Successful! HackLink READY!'

hackmenu:
tr '°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°'
tr '[1] Call a user and crash his bbs.'
tr '[2] Scan users for uncrashed megs.'
tr '[3] List all hackers.'
tr '[4] Terminate this run.'
tr '°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°'
query ">";hop=result;hop=space(hop,0)
if hop=p then signal buttdode
if hop='4' then signal hlx
if hop='3' then do;rlist=1;call listhackers2;signal hackmenu;end
if hop='2' then signal mscan
if hop='1' then signal crashuser
signal hackmenu

hlx:
tr 'Hacklink run terminated.'
signal main

mscan:
if cash>999 then signal mscashok
tr 'You need $1000 to run the scanner.';call GPAUSE
signal hackmenu

mscashok:
cash=cash-1000
tr 'Scanning all users...'
call open(2,path||'userlist','r')

rscal:
us=readln(2)
if eof(2)=1 then signal scandone
call loadostats
mgl=ldrive.olevel-odmg
if mgl>0 then tr ''us' has 'mgl' meg(s) left.'
signal rscal

scandone:
call close(2)
tr 'Press any key';query ""
signal hackmenu

crashuser:
tr 'Enter the name of the user you wish to crash. RETURN=Abort'
query ">";us=result
if us='' then signal hackmenu
if us=p then signal buttdode
if upper(us)=upper(name) then signal crashuser
if exists(upath||name'.uf')=0 then signal fightyes
call open(1,upath||name'.uf','r')
lf=readln(1)
call close(1)
if upper(lf)~=upper(us) then signal fightyes
tr 'Defeat a different user first.'
signal crashuser

fightyes:
if exists(upath||us)=0 then do;tr 'Not found.';signal crashuser;end
call loadostats
if ldrive.olevel-odmg=0 then do;tr 'This user is trashed. Fight someone else.';signal crashuser;end

fightyes2:
tr '°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°'
tr 'Your Enemy    :'us
tr 'His megs      :'ldrive.olevel-odmg
tr 'His Terminal  :'tn.oterminal
tr 'His BBS       :'bn.obbs''
tr 'Your megs     :'ldrive.level-dmg
tr 'Your Terminal :'tn.terminal
tr 'Your BBS      :'bn.bbs
tr '°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°'
tr ''
tr 'Are you sure you wish to fight this user?'
query ">";yn=result
if yn=p then signal buttdode
if upper(left(yn,1))='Y' then signal userfightv
signal crashuser

userfightv:
if turns>0 then do;turns=turns-1;signal userfightintro;end
tr 'You are out of turns for today. Try again tomorrow.';call GPAUSE
signal main

userfightintro:

tr 'Dialing... xxx-xxxx';call GPAUSE
tr 'CONNECT 16800/LAPM/V.42BIS';call GPAUSE
sendstring CLS' ';tr ''center('Welcome to...',78)
tr ''center(bn.obbs||'!',78)
tr ''

userfight:
sendstring CLS' '
tr 'Fight Status:'
tr 'His megs :'ldrive.olevel-odmg
tr 'Your megs:'ldrive.level-dmg''
tr 'Options: 1=Upload Virus 2=Trash Files 3=Disconnect'
query ">";opt=result;opt=space(opt,0)
if opt=p then signal buttdode
if opt='1' then signal uvir
if opt='2' then signal Tfil
if opt='3' then signal disc
signal userfight

uvir:
tr 'Enter virus number to upload or ? for list, return for none.'
query ">";viu=result;viu=space(viu,0)
if viu=p then signal buttdode
if viu='' then signal userfight
if viu='?' then do;call showviruses;signal uvir;end
if viu<1 | viu>20 then signal uvir
if viruses.viu<1 then do;tr 'You don''t have any of that one!';signal uvir;end
viruses.viu=viruses.viu-1
tr 'You attempt to upload him a 'vin.viu' virus!'
plstr=vis.viu+ts.terminal+level
enstr=bs.obbs+olevel
if plstr+level>enstr+olevel then signal vupok
if random(1,10,time('s'))>6 then signal vupok
tr 'Your uploaded virus was snagged by his virus checking program!'
signal histurn

vupok:
tr 'You uploaded the virus successfully!'
tr 'The idiot ran it, too!'
mgl=random(1,vis.viu,time('s'))

elm:
hmt=ldrive.olevel-odmg
if mgl>hmt then mgl=hmt
mwon=mwon+mgl
omlost=omlost+mgl
tr 'You trashed 'mgl' meg(s)!'
odmg=odmg+mgl
if odmg=ldrive.olevel then signal youwon
signal histurn

tfil:
tr 'You attempt to trash his files...';/*call GPAUSE*/
plstr=ts.terminal+level
enstr=bs.obbs+olevel
if plstr>enstr then signal tfok
if random(1,10,time('s'))>5 then signal tfok
tr 'You were unable to break in this time! Sorry!';call GPAUSE
signal histurn

tfok:
mgl=random(1,10+level+tk.terminal,time('s'))
signal elm

disc:
tr 'You attempt to disconnect...';call GPAUSE
plstr=ts.terminal+level
enstr=bs.obbs+olevel
if plstr>enstr then signal discok
if random(1,10,time('s'))>6 then signal discok
tr 'You find yourself still connected to his BBS!'
signal histurn

discok:
tr '¡¤þµ¤ðµø¤®µ¤IY¤µµ¡NO CARRIER'
signal crashuser

histurn:
tr '----------------------------------------------------It is 'us'''s turn...'
mgl=ldrive.olevel-odmg
do i=20 to 1 by -1
 if oviruses.i>0 then do;leave;vf=i;signal foundavir;end
end

Hacktrash:
tr 'He attempts a file trash!';/*call GPAUSE*/
plstr=bs.bbs+level
enstr=ts.oterminal+olevel
if enstr>plstr then signal otrok
if random(1,10,time('s'))>4 then signal otrok
tr 'He couldn''t break through your security!'
signal userfight

otrok:
ml=random(1,10+olevel+tk.oterminal,time('s'))

oml:
ym=ldrive.level-dmg
if ml>ym then ml=ym
mlost=mlost+ml
omwon=omwon+ml
tr 'You lost 'ml' meg(s)!';/*call GPAUSE*/
dmg=dmg+ml
if dmg<ldrive.level then signal userfight
signal LOSE

foundavir:
if random(1,10,time('s'))>4 then signal hacktrash
tr 'He is uploading a 'vin.i' virus to your terminal!';/*call GPAUSE*/
oviruses.i=oviruses.i-1
plstr=bs.bbs+level
enstr=ts.oterminal+olevel+vis.i
if enstr>plstr then signal ovirupok
if random(1,10,time('s'))>4 then signal ovirupok
tr 'Your virus checking software caught it!';call GPAUSE
signal userfight

ovirupok:
tr 'His upload was successful!';/*call GPAUSE*/
tr 'The virus ran and did some damage!!!'
mgl=random(1,vis.i,time('s'))
signal oml

youwon:
bbbs=''||us
aa='WON!'
call updatelast
tr 'Congratulations! 'us'''s BBS is history!'
tp=oexp/10;ttt=index(tp,'.');tpp=tp;if ttt>0 then tpp=left(tp,ttt-1)
exg=((olevel+1)*363)+tpp
oexp=oexp-tpp
cma=exg*2+random(100,1000,time('s'))+(olevel+1)*476
if exp+exg>9999999999999 then exg=0
transmit 'You got 'exg' experience points!'
transmit 'The HAA pays you $'cma' for your effort!'
exp=exp+exg
cash=cash+cma
if ocash=0 then signal skiphiscash
tr 'You get $'ocash' from his pockets...'
cash=cash+ocash;ocash=0

skiphiscash:
do i=1 to 20
 if oviruses.i>0 then do;ovirs.i=oviruses.i;call fvir2;oviruses.i=oviruses.i-vh;end
end

nobonus:
if exists(upath||us'.m')=0 then do;call open(1,upath||us'.m','w');signal skipnop;end
call open(1,upath||us'.m','a')

skipnop:
call writeln(1,""name" trashed your BBS!")
call close(1)
call open(1,upath||name||'.uf','w')
call writeln(1,us)
call close(1)

leveladv:
if exp<lexp.level then signal skipleveladv
level=level+1
tr 'You advance to level 'level'!'
signal leveladv

skipleveladv:
call savestats
call saveostats
signal hackmenu

LOSE:
bbbs=''||us
aa='LOST!'
call updatelast
if exists(upath||us'.m')=0 then do;call open(1,upath||us'.m','w');signal skipnop2;end
call open(1,upath||us'.m','a')

skipnop2:
call writeln(1,""name" Attempted to crash your BBS!")
call close(1)
tr 'Too bad! You lost! Seems that 'us' is better than you, eh?';call GPAUSE
signal hackmenu

top:
sendstring CLS' '
tr 'Sorting... wait please...'
call open(1,path||'userlist','r')
i=0
do forever
 i=i+1
 uname.i=readln(1)
 if uname.i='' then leave
 call open(2,upath||uname.i,'r')
 do j=1 to 26
  k=readln(2)
  end
 exp.i=readln(2)
 call close(2)
end
i=i-1
call close(1)

sort2:
cs=0
do j=2 to i
 k=j-1
 if exp.k<exp.j then call swap
end
if cs>0 then signal sort2
sendstring CLS' '
tr '                       --- The Ten Best Hackers ---'
if i>10 then i=10
do j=1 to i
aa=left(''||uname.j||'                         ',25)
aa=aa||' exp:'exp.j
tr '                    'aa
end
signal main

swap:
tx=exp.k
ty=uname.k
exp.k=exp.j
uname.k=uname.j
uname.j=ty
exp.j=tx
cs=cs+1
return

listhackers2:
sendstring CLS' '
transmit center('List of all current Hackers',78)
call open(1,path||'userlist','r')
sendstring '°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°'
do until eof(1)=1
 zz=readln(1)
 if zz~='' then do;z=left(zz||'                    ',19);sendstring ''z'';tr ' ';end
end
call close(1)
sendstring '°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°'
if rlist=1 then do;rlist=0;return;end
signal main:

pbook:
sendstring CLS " "
showfile path||'phonebook.screen'
query ">";pb=upper(result)
if pb=p then signal buttdode
if pb='1' then signal listlocal
if pb='2' then signal listmain
if pb='3' then signal listgovt
if pb='4' then signal pbookmaint
if pb='5' then signal main
signal pbook

pbookmaint:
sendstring CLS' '
tr '                      Personal Phonebook Maintenance'
tr ''
tr '                  1. List numbers in personal phonebook.'
tr '                  2. Add a number to personal phonebook.'
tr '                  3. Return to main phonebook menu.'
query ">";pb=result
if pb='###PANIC' then signal buttdode
if pb='1' then signal pblist
if pb='2' then signal pbadd
if pb='3' then signal pbook
signal pbookmaint

pblist:
sendstring CLS " "
if exists(upath||name||'.pb')>0 then signal pblistok
tr 'You do not have a personal phonebook at this time.'
tr 'Add some numbers to it first.'
tr 'Press RETURN';query ">"
if lpf=1 then do;lpf=0;return;end
signal pbookmaint

pblistok:
sendstring CLS " "
tr '                 - Listing of personal phonebook numbers -'
tr ''
call open(1,upath||name||'.pb','r')
ns=0
do until eof(1)=1
 num=readln(1)
 sname=readln(1)
 ns=ns+1
 tr left(ns||'   ',3)||left(sname||'                             ',40)||left(num'                        ',30)
end
call close(1)
tr 'Press any key...';query ""
if lpf=1 then do;lpf=0;return;end
signal pbookmaint

pbadd:
sendstring CLS " "
tr 'Enter name of system or RETURN to abort.'
query ">";sname=result
if sname='' then signal pbookmaint
if sname='###PANIC' then signal buttdode
tr 'System phone number?'
query ">";num=result
if num='' then signal pbookmaint
if num='###PANIC' then signal buttdode
if exists(upath||name||'.pb')=1 then do;call open(1,upath||name||'.pb','a');signal skipop;end
call open(1,upath||name||'.pb','w')

skipop:
call writeln(1,num)
call writeln(1,sname)
call close(1)
signal pbookmaint

listlocal:
sendstring CLS' '
tr '                                     Local BBS List'
tr '          Name                          Number         Strength Megs'
tr '          ----------------------------------------------------------'
do i=1 to nlb
 aa=left(''lbn.i'                     ',33)||''lbph.i'               '
 aa=left(aa,52)||''lbs.i'         '
 aa=left(aa,65)||''lbm.i
 tr '          'aa
end
tr 'Press a key...';query ""
signal pbook

listmain:
sendstring CLS' '
tr '                                     Mainframe List'
tr '          Name                          Number         Strength Megs'
tr '          ----------------------------------------------------------'
do i=1 to nmf
 aa=left(''mfn.i'                     ',33)||''mfph.i'               '
 aa=left(aa,52)||''mfs.i'         '
 aa=left(aa,65)||''mfm.i
 tr '          'aa
end
tr 'Press a key...';query ""
signal pbook

listgovt:
sendstring CLS' '
tr '                                     Government List'
tr '          Name                          Number         Strength Megs'
tr '          ----------------------------------------------------------'
do i=1 to ngv
 aa=left(''gvn.i'                     ',33)||''gvph.i'               '
 aa=left(aa,52)||''gvs.i'         '
 aa=left(aa,65)||''gvm.i
 tr '          'aa
end
tr 'Press a key...';query ""
signal pbook

signal main

stats:
sendstring CLS' '
tr 'Stats for 'name''
tr 'Level       :'level' 'lname.level
tr 'Experience  :'exp
tr 'Cash        $'cash
tr 'Terminal    :'tn.terminal
tr 'BBS Prog    :'bn.bbs
tr 'Megs Crashed:'mwon
tr 'Megs Lost   :'mlost
tr 'Drive Status:'||ldrive.level-dmg||' megs out of '||ldrive.level||' total.'
tr 'Net Charge  $'netcharge
tr ''
tr 'Press a key...';query ""
call showviruses
signal main

dir:
sendstring CLS' '
tr 'Directory of drive DH0:'
tr 'HAA             123653 RWED--P- Calls in to local HAA node.'
tr 'STATS             3652 RWED---- Shows current statistics.'
tr 'HACK             77264 RWED--P- Allows use of 'tn.terminal' to hack a user.'
tr 'TOP               6546 RWED---- Lists Top 10 Hackers.'
tr 'TERM            241755 RWED--P- Call and crash other boards with 'tn.terminal
tr 'PBOOK            12599 RWED---- List numbers to call.'
tr 'DSALV            20088 RWED---- Repair hard drive damage.'
tr 'QUIT                84 RWED---- Quit to BBS.'
tr 'LIST              4873 RWED---- List of all hackers.'
tr 'MAIL              1281 RWED---- Send a oneliner to another hacker'
tr 'NODELIST         23166 RWED---- View & Search Nodelist.'
tr 'LAST               988 RWED---- Log of Last 10 Fights.'
tr 'HELP             61356 RWED---- You didn''t read the docs?'
if access<254 then signal main
tr 'NETGEN          646291 RWED---- Regenerate the Hacker Nodelist.'
tr 'RESET              697 RWED---- Reset Hacker.'
signal main

haa:

tr 'HAA Link 1.0 loading...'
tr 'Dialing... xxx-xxxx';/*call GPAUSE*/
tr 'CONNECT 16800/LAPM/V.42BIS';/*call GPAUSE*/

haamain:
showfile path||'haa.screen'

haacmd:
query ">";cmd=result;cmd=space(cmd,0)
if cmd=p then signal buttdode
cmd=upper(cmd)
if cmd='?' then signal haamain
if cmd='Q' then signal haaexit
if cmd='1' then signal buyviruses
if cmd='2' then signal buybbs
if cmd='3' then signal buyterm
if cmd='4' then signal wardial
if cmd='5' then signal spy
if cmd='6' then signal cards
if cmd='7' then signal gamble
if cmd='8' then signal paynet
if cmd='9' then signal bank
signal haacmd

bank:
if exists(upath||name'.b')=1 then signal bank2
sendstring CLS' '
tr 'Opening your account...';call GPAUSE
call open(1,upath||name'.b','w')
call writeln(1,0)
call close(1)

bank2:
call open(1,upath||name'.b','r')
balance=readln(1)
call close(1)

bank3:
sendstring CLS' '
tr 'Welcome to the bank of the HAA!'
tr 'Your balance on account: $'balance
tr 'Your cash on hand      : $'cash''
tr 'Deposit, Withdraw, or Quit to main?'
query ">";bo=upper(result)
if bo=p then signal buttdode
if bo='D' then signal deposit
if bo='W' then signal withdraw
if bo='Q' then signal bankexit
signal bank3

deposit:
tr 'How much do you wish to deposit?'
query ">";dep=result;dep=space(dep,0)
if dep=p then signal buttdode
if dep<1 | dep>cash then signal bank3
cash=cash-dep
balance=balance+dep
tr 'Transaction Processed.';call GPAUSE
signal bank3

Withdraw:
tr 'How much do you wish to withdraw?'
query ">";wth=result;wth=space(wth,0)
if wth=p then signal buttdode
if wth<1 | wth>balance then signal bank3
cash=cash+wth
balance=balance-wth
tr 'Transaction Processed.';call GPAUSE
signal bank3

bankexit:
call open(1,upath||name'.b','w')
call writeln(1,balance)
call close(1)
signal haamain

paynet:
if netcharge>0 then signal nchgpend
sendstring CLS' '
tr 'You don''t owe a net access charge...';call GPAUSE
signal haamain

nchgpend:
if cash>=netcharge then signal paynet2
sendstring CLS' '
tr 'You don''t have enough cash to pay it!';call GPAUSE
signal haamain

paynet2:
sendstring CLS' '
tr 'You owe $'netcharge'.'
tr 'Do you wish to pay it? [No]'
query ">";yn=upper(result)
if yn=p then signal buttdode
if yn='Y' then signal paynet3
tr 'Remember... you have to pay it before your next net access!';call GPAUSE
signal haamain

paynet3:
cash=cash-netcharge;netcharge=0
tr 'Transaction processed.';call GPAUSE
signal haamain

gamble:
if cash>0 then signal gamble1
tr 'Kinda helps if you have cash to gamble with...';call GPAUSE
signal haamain

gamble1:
if turns>0 then signal gamble2
tr 'Sorry, you''re out of turns for today. Try again tomorrow.';call GPAUSE
signal haamain

gamble2:
sendstring CLS' '
tr 'You have $'cash
tr 'How much do you want to bet? [0=quit]'
query ">";bt=result;bt=space(bt,0)
if bt=p then signal buttdode
if bt<1 | bt>cash then signal haamain
tr 'Double or nothing...';call GPAUSE
ch=random(1,10,time('s'))
if ch>4 then signal gwin
tr 'Too bad sucker... you lost this time.';call GPAUSE
cash=cash-bt
signal gamble1

gwin:
tr 'You won $'bt'!';call GPAUSE
cash=cash+bt
turns=turns-1
signal gamble1

cards:
if turns>0 then signal chturnsok
tr 'You are out of turns for today... Try again tomorrow.';call GPAUSE
signal haamain

chturnsok:
if level>1 then signal clevelok
sendstring CLS' '
tr 'You must be at least level 2 to hack credit cards.';call GPAUSE
signal haamain

clevelok:
cne=100
if level>2 then cne=cne+(400*level)*level
if cash>cne then signal ccashok
if cash=cne then signal ccashok
sendstring CLS' '
tr 'You must have at least $100 to hack credit cards.';call GPAUSE
signal haamain

ccashok:
showfile path||'Cards.screen'
query ">";ch=upper(result)
if ch=p then signal buttdode
if ch='Q' then signal haamain
if ch<1 | ch>20 then signal ccashok
turns=turns-1
sendstring CLS' '
tr 'Hacking 'crdn.ch'...'
sendstring 'Generating Code: '
do i=1 to 16
 sendstring random(0,9,time('s'))
end
tr 'Uplinking Code to Network Mainframe...';call GPAUSE
tr 'Network is validating code...';call GPAUSE
cp=random(1,20,time('s'))+level
if cp>=ch then signal chacksuccess
transmit 'Hack failed!';call GPAUSE
cp=random(1,20,time('s'))+ch/4
if cp>17 then signal back21
if cp>14 then signal bigfine
if cp>5 then signal smallfine

tr 'Whew! You didn''t get caught!';call GPAUSE
signal cards

smallfine:
f=random(1,15,time('s'))*2500

fine2:
tr 'You have been fined $'f'!';call GPAUSE
cash=cash-f
if cash<0 then cash=0
if cash=0 then signal haamain
signal cards

bigfine:
f=random(5,25,time('s'))*5000
signal fine2

back21:
tr 'The HAA is very upset. They had to pay lots of cash to get you off'
tr 'the hook. As a compensation for their efforts, you have been demoted'
tr 'by one level!';call GPAUSE
level=level-1
li=level-1
dmg=0
exp=lexp.li
call savestats
signal haamain

chacksuccess:
tr 'You got away with $'crdw.ch'!';call GPAUSE
cash=cash+crdw.ch
signal cards

spy:
sendstring CLS' '
tr 'HAA Espionage Service...'
tr 'Enter name of hacker to spy on, L to list, or Q to return to main.'
query ">";us=upper(result)
if us=p then signal buttdode
if us='' then signal spy
if exists(upath||us)=1 then signal spyok1
if us='L' then signal listhackers
if us='Q' then signal haamain
tr ''us' is not listed! Type L to list!';call GPAUSE
signal spy

spyok1:
call loadostats

cost=(olevel+1)*1000
if cost<=cash then signal spyok2
tr 'You don''t have enough to spy on 'us'.'
tr 'Try again when you have enough cash!';call GPAUSE
signal spy

Spyok2:
if turns>0 then signal spyok3
tr 'You are out of turns for today. Try again tomorrow.';call GPAUSE
signal spy

spyok3:
sendstring CLS' '
tr 'It will cost you $'cost' to spy on 'us'.'
tr 'Do you wish to? [No]'
query ">";yn=upper(result)
if yn=p then signal buttdode
if yn='Y' then signal showother
signal spy

showother:
cash=cash-cost
turns=turns-1
sendstring CLS' '
tr 'Stats for 'us''
tr 'Level       :'olevel' 'lname.olevel
tr 'Experience  :'oexp
tr 'Cash        $'ocash
tr 'Terminal    :'tn.oterminal
tr 'BBS Prog    :'bn.obbs
tr 'Megs Crashed:'omwon
tr 'Megs Lost   :'omlost
tr 'Drive Status:'ldrive.olevel-odmg' megs out of 'ldrive.olevel' total.'
tr 'Net Charge  $'onetcharge
tr ''
tr 'Press a key...';query ""
call showoviruses
signal spy

listhackers:
do;rlist=1;call listhackers2;tr 'Press RETURN';query ""
signal spy

wardial:
if exists(upath||name||'.w')=0 then signal wardialok
sendstring CLS' '
tr 'You already have a wardial session in progress.'
tr 'You will find out the results tomorrow.';call GPAUSE
signal haamain

wardialok:
if cash>9999 then signal wardialok2
sendstring CLS' '
tr 'You need $10000 to run the War Dialer.'
tr 'Come back when you have the cash!';call GPAUSE
signal haamain

wardialok2:
tr 'It will cost you $10000 to run the War Dialer.'
tr 'There is no guarantee as to what numbers you will'
tr 'find. You will obtain the results of the run on'
tr 'the following day.'
tr 'Do you wish to run the War Dialer? [No]'
query ">";yn=upper(result)
if yn=p then signal buttdode
if yn='Y' then signal wardialrun
tr 'Well, guess we''ll run it later, eh?';call GPAUSE
signal haamain

wardialrun:
cash=cash-10000
a=random(1,10,time('s'))
if a>6 then signal wdfailed
call open(1,upath||name||'.w','w')
call writeln(1,'Your Wardialer run revealed the following systems:')
call writeln(1,'Be sure to write them down... You will only see this once!')
call writeln(1,'Make sure also to update your personal phonebook!')
call writeln(1,'')
do i=1 to nsn
 a=random(1,10,time('s'))
 if a<4 then call writeln(1,left('NAME: 'snn.i'         ',50)||' NUMBER: 'snph.i)
end
call close(1)
signal haamain

wdfailed:
call open(1,upath||name||'.w','w')
call writeln(1,'Your run of the War Dialer revealed NOTHING.')
call writeln(1,'Better luck next time.')
call close(1)
signal haamain

buyterm:
showfile path||'Termmenu.screen'
query ">";cmd=result;cmd=space(cmd,0)
if cmd=p then signal buttdode
if cmd='1' then signal buyterm2
if cmd='2' then signal listterms
if cmd='3' then signal sellterm
if cmd='4' then signal haamain
signal buyterm

sellterm:
if terminal>0 then signal termsellok
sendstring CLS' '
tr 'What? You''re going to try to sell us Mindlink?'
tr 'What a piece of junk! Come back when you''re ready to sell'
tr 'some REAL software!';call GPAUSE
signal buyterm

termsellok:
sellpr=tc.terminal/2
sendstring CLS' '
tr 'We will buy your copy of 'tn.terminal' for $'sellpr'.'
tr 'Do you wish to sell it? [No]'
query ">";sell=upper(result)
if sell=p then signal buttdode
if sell='Y' then signal termsold
tr 'Ok... guess we''ll take it from ya later then...';call GPAUSE
signal buyterm

termsold:
cash=cash+sellpr
terminal=0
tr 'Transaction processed.'
signal buyterm

listterms:
call showterms
signal buyterm

buyterm2:
sendstring CLS' '
tr 'You have $'cash'.'
tr 'Enter Term# to purchase, L to list, or Q to end transaction.'
query ">";bbsp=upper(result)
if bbsp=p then signal buttdode
if bbsp='L' then signal lt2
if bbsp='Q' then signal buyterm
if bbsp<1 | bbsp>20 then signal buyterm2
tr 'A copy of 'tn.bbsp' costs $'tc.bbsp
tr 'Do you wish to purchase one? [No]'
query ">";yn=upper(result)
if yn=p then signal buttdode
if yn='Y' then signal termbought
tr 'Ok... maybe later then...';call GPAUSE
signal buyterm

termbought:
if tc.bbsp<=cash then signal termpok
tr 'You can''t afford it! Come back when you have some CASH!';call GPAUSE
signal buyterm

termpok:
terminal=bbsp
cash=cash-tc.bbsp
tr 'Transaction processed.';call GPAUSE
signal buyterm

lt2:
call showterms
signal buyterm2

buybbs:
showfile path||'BBSmenu.screen'
query ">";cmd=result;cmd=space(cmd,0)
if cmd=p then signal buttdode
if cmd='4' then signal haamain
if cmd='3' then signal sellbbs
if cmd='2' then signal listbbs
if cmd='1' then signal buybbs2
signal buybbs

sellbbs:
if bbs>0 then signal sellok
sendstring CLS' '
tr 'What? You''re going to try to sell us Home-Brew?'
tr 'What a piece of junk! Come back when you''re ready to sell'
tr 'some REAL software!';call GPAUSE
signal buybbs

sellok:
sellpr=bc.bbs/2
sendstring CLS' '
tr 'We will buy your copy of 'bn.bbs' for $'sellpr'.'
tr 'Do you wish to sell it? [No]'
query ">";sell=upper(result)
if sell=p then signal buttdode
if sell='Y' then signal bbssold
tr 'Ok... guess we''ll take it from ya later then...';call GPAUSE
signal buybbs

bbssold:
cash=cash+sellpr
bbs=0
tr 'Transaction Processed.';call GPAUSE
signal buybbs

listbbs:
call showbbses
signal buybbs

buybbs2:
sendstring CLS' '
tr 'You have $'cash'.'
tr 'Enter BBS# to purchase, L to list, or Q to end transaction.'
query ">";bbsp=upper(result)
if bbsp=p then signal buttdode
if bbsp='L' then signal lb2
if bbsp='Q' then signal buybbs
if bbsp<1 | bbsp>20 then signal buybbs2
tr 'A copy of 'bn.bbsp' costs $'bc.bbsp
tr 'Do you wish to purchase one? [No]'
query ">";yn=upper(result)
if yn=p then signal buttdode
if yn='Y' then signal BBSbought
tr 'Ok... maybe later then...'
signal buybbs

bbsbought:
if bc.bbsp<=cash then signal BBSpok
tr 'You can''t afford it! Come back when you have some CASH!';call GPAUSE
signal buybbs

bbspok:
bbs=bbsp
cash=cash-bc.bbsp
tr 'Transaction processed.'
signal buybbs

lb2:
call showbbses
signal buybbs2

buyviruses:
showfile path||'VIRUSMENU.screen'
query ">";cmd=result;cmd=space(cmd,0)
if cmd=p then signal buttdode
if cmd='3' then signal haamain
if cmd='2' then signal listviruses
if cmd='1' then signal buyviruses2
signal buyviruses

listviruses:
call showviruses
signal buyviruses

buyviruses2:
sendstring CLS' '
tr 'You have $'cash
tr 'Enter virus# to buy, L to list, or Q to end this purchase.'
query ">";cmd=result;cmd=space(cmd,0)
if cmd=p then signal buttdode
cmd=upper(cmd)
if cmd='L' then signal lv2
if cmd='L' then signal buyviruses2
if cmd='Q' then signal buyviruses
if cmd<1 | cmd>20 then signal buyviruses2

tr 'The 'vin.cmd' Virus costs $'vic.cmd' Each.'
tr 'How many do you wish to purchase?'
query ">";numpur=result;numpur=space(numpur,0)
if numpur<0 | numpur>99999 then signal buyviruses2
if numpur=p then signal buttdode
if numpur=0 | numpur='' then signal buyviruses2
cost=numpur*vic.cmd
if cash>=cost then signal Vpurchaseok
tr "You can't buy that many!";call GPAUSE
signal buyviruses2

vpurchaseok:
viruses.cmd=viruses.cmd+numpur
cash=cash-cost
tr 'Transaction processed.';call GPAUSE
signal buyviruses2

lv2:
call showviruses
signal buyviruses2

haaexit:
tr '¡¤¡GIHIH¡¡H¡H¡¶¡¸¡[ð©¢¼¾½ºªçðð¢³½¢°¢¾NO CARRIER'
tr 'HAA Link 1.0 Run Terminated.'
signal main

quit:
tr 'Shutting down & saving stats...'
call savestats
tr 'SHUTDOWN COMPLETE...'
shutdown;exit

badquit:
sendstring 'doors:hacker.data not found - exit'
shutdown;exit

showterms:
sendstring CLS' '
tr 'HAA Terminal Software... Can''t do without a good terminal!'
do i=1 to 20
 aa=''i'  '
 aa=left(aa,6)||''tn.i'                '
 aa=left(aa,35)||' Str:'ts.i'     '
 aa=left(aa,48)||' Cost:'tc.i
 tr aa
end
tr 'Press a key.';query ""
return

showbbses:
sendstring CLS' '
tr 'HAA Bulletin Board Software - A good BBS is a GOOD defense!'
do i=1 to 20
 aa=''i'  '
 aa=left(aa,6)||''bn.i'                '
 aa=left(aa,35)||' Str:'bs.i'     '
 aa=left(aa,48)||' Cost:'bc.i
 tr aa
end
tr 'Press a key.';query ""
return

showoviruses:
sendstring CLS' '
tr '          Hackers Association Of America Tools of the Trade...'
tr ''
do i=1 to 20
 aa=''i'    '
 aa=left(aa,7)||' Name:'vin.i'                          '
 aa=left(aa,38)||' Strength:'vis.i'     '
 aa=left(aa,54)||' Cost:'vic.i'           '
 aa=left(aa,72)||'U Own:'oviruses.i
 tr aa
end
tr 'Press any key';query ""
return

showviruses:
sendstring CLS' '
tr '          Hackers Association Of America Tools of the Trade...'
tr ''
do i=1 to 20
 aa=''i'    '
 aa=left(aa,7)||' Name:'vin.i'                          '
 aa=left(aa,38)||' Strength:'vis.i'     '
 aa=left(aa,54)||' Cost:'vic.i'           '
 aa=left(aa,72)||'U Own:'viruses.i
 tr aa
end
tr 'Press any key';query ""
return

loadostats:
call open(1,upath||us)
ocash=readln(1)
do i=1 to 20
 oviruses.i=readln(1)
end
oterminal=readln(1)
obbs=readln(1)
olevel=readln(1)
if olevel >20 then olevel = 20
omwon=readln(1)
omlost=readln(1)
oexp=readln(1)
oturns=readln(1)
onetcharge=readln(1)
odmg=readln(1)
call close(1)
return

saveostats:
call open(1,upath||us,'w')
call writeln(1,ocash)
do i=1 to 20
 call writeln(1,oviruses.i)
end
call writeln(1,oterminal)
call writeln(1,obbs)
if olevel >20 then olevel = 20
call writeln(1,olevel)
call writeln(1,omwon)
call writeln(1,omlost)
call writeln(1,oexp)
call writeln(1,oturns)
call writeln(1,onetcharge)
call writeln(1,odmg)
call close(1)
return

loadstats:
call open(1,upath||name)
cash=readln(1)
do i=1 to 20
 viruses.i=readln(1)
end
terminal=readln(1)
bbs=readln(1)
level=readln(1)
if level >20 then level = 20
mwon=readln(1)
mlost=readln(1)
exp=readln(1)
turns=readln(1)
netcharge=readln(1)
dmg=readln(1)
call close(1)
return

savestats:
call open(1,upath||name,'w')
call writeln(1,cash)
do i=1 to 20
 call writeln(1,viruses.i)
end
call writeln(1,terminal)
call writeln(1,bbs)
if level >20 then level = 20
call writeln(1,level)
call writeln(1,mwon)
call writeln(1,mlost)
call writeln(1,exp)
call writeln(1,turns)
call writeln(1,netcharge)
call writeln(1,dmg)
call close(1)
return

Nodegen:
call open(1,path||'Nodelist','w')
tr 'Generating the Nodelist...'
call writeln(1,'---- Hacker 'version' Nodelist ----')
call writeln(1,'')
do i=1 to nlb
 a=left(lbn.i||'                                ',35)||' @('lbx.i||','||lby.i||')'
 call writeln(1,a)
end
do i=1 to nmf
 a=left(mfn.i||'                                ',35)||' @('mfx.i||','||mfy.i||')'
 call writeln(1,a)
end
do i=1 to ngv
 a=left(gvn.i||'                                ',35)||' @('gvx.i||','||gvy.i||')'
 call writeln(1,a)
end
do i=1 to nsn
 a=left(snn.i||'                                ',35)||' @('snx.i||','||sny.i||')'
 call writeln(1,a)
end
do i=1 to nnb
 a=left(nbn.i||'                                ',35)||' @('nbx.i||','||nby.i||')'
 call writeln(1,a)
end
call writeln(1,'')
call writeln(1,'---- End Of Node List ---- '||nlb+nmf+ngv+nsn+nnb||' systems listed.')
call close(1)
signal main

nodelist:
if level>9 then signal viewnodeok
tr 'You must be level 10 or higher to access the nodelist.';call GPAUSE
signal main

viewnodeok:
tr '--- NetBROWSE 1.0 Options ---'
tr '. View entire nodelist.'
tr '. Search Nodelist.'
tr '. Return to DOS.'
query 'Your option:'
opt=result
if opt=p then signal buttdode
if opt='1' then do;showfile path||'nodelist';signal viewnodeok;end
if opt='2' then signal serchlist
signal main

serchlist:
query 'Enter the keyword to be searched for. RETURN=Abort                                        '
kw=upper(result)
if kw=p then signal buttdode
if kw='' then signal viewnodeok
call open(1,path||'nodelist','r')
zz=readln(1);zz=readln(1)
do while eof(1)=0
 zz=readln(1)
 zz=upper(zz)
 if index(zz,kw)>0 then do;tr 'FOUND: 'zz;end
end
call close(1)
signal viewnodeok

nugame:
tr 'Are you sure you want to start a new game?'
query ">";yn=result
if yn=p then signal buttdode
if upper(yn)='Y' then signal nugame2
signal main

nugame2:
address command 'delete 'upath'#?'
address command 'delete 'path||'userlist'
call open(1,path||'userlist','w')
call close(1)
call open(1,path||'lastfights','w')
do i=1 to 20
 call writeln(1,'Game restarted. No fight is listed in this slot.')
end
tr 'Done!'
SHUTDOWN;exit

GPAUSE:
do 3000;/* Waste some time*/;end
return


error:;syntax:;ioerr
tr 'Error at line 'sigl' in Hacker 'version''
tr 'Error at line 'sigl' in Hacker 'version''
call savestats
shutdown;exit

tbye:
tr 'You have less than 6 minutes left on the BBS...'
tr 'Saving your stats & exiting.'

buttdode:
call savestats
SHUTDOWN;EXIT
