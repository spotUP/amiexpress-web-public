/* BBSscan util series by Zwinx/RAGE »DaGcEnTRaL 9o²1o +46-31-775-939[0-1]« */
parse arg node;signal on error;signal on syntax;signal on ioerr;options results

nodeid = "AERexxControl"node

tr=transmit;hk=getchar;pm=prompt;sendstring=sendmessage;ss=sendstring;gu=getuser

address value nodeid

DT_NAME=100
RETURNCOMMAND=136
BB_MAINLINE=131
DT_SLOTNUMBER    = 104

gu DT_SLOTNUMBER ; SLOT=result
gu DT_NAME;USER=result
gu BB_MAINLINE;FILE=result

CHOUR=SubStr(Time('n'),1,2)
CMIN=SubStr(Time('n'),4,2)
CSEC=SubStr(Time('n'),7,2)

Mon='JanFebMarAprMayJunJulAugSepOctNovDec'
Dajt = Translate(Date(U),'-','/');Date=SubStr(dajt,4,2)'-'SubStr(Mon,SubStr(dajt,1,2)*3-2,3)'-'SubStr(dajt,7,2)
Spc='                                                                                                                      '
NOLL='000000000000000000000000000'
tr ''
tr '[0m[36mBBS[0mscan [32mVersion [0m1.1r [36m- [32mWritten By [0mZwinx/Rage[36m![0m'
tr ''
address command('c:LS DOORS:BBSscan/PlayPen >T:BBSadd.tmp')

i=0
if Exists('T:BBSadd.tmp')then do
 Open('Tlen','T:BBSadd.tmp','R');do until eof('Tlen');a=ReadLN('Tlen');i=i+1;end;Close('Tlen')
end

if i>1 then do
 address command('c:DELETE DOORS:BBSscan/PlayPen/#? ALL')
end
ss '[36mDo you wish to upload an add [32m([33my[32m/[33mN[32m)? [0m';GetChar;yn=Upper(RESULT)
if yn='Y' then do
 tr 'Yes'
 tr ''
 putustr 'DOORS:BBSscan/PlayPen/'
 putuser 138
 tr ''
 Open('Mstat','DOORS:BBSscan/Msghold/Holderfile','R')
 MsgPtr=ReadLN('Mstat')
 Close('Mstat')
 MsgPtr=MsgPtr+1
 address command('c:LS DOORS:BBSscan/PlayPen >T:BBSadd.tmp')
 Open('Nam','T:BBSadd.tmp','R')
 Name=ReadLN('Nam')
 Close('Nam')
 Open('IMsg','DOORS:BBSscan/PlayPen/'Name,'R')
 Open('OMsg','DOORS:BBSscan/Msghold/'MsgPtr,'W')
 WriteLN('OMsg',USER)
 WriteLN('OMsg',Dajt)
 jj=0
 do until eof('IMsg')| jj>50
  apa=ReadLN('IMsg')
  WriteLN('OMsg',apa)
  jj=jj+1
 end
 Close('IMsg')
 Close('OMsg')
 Open('Mstat','DOORS:BBSscan/Msghold/Holderfile','W')
 WriteLN('Mstat',MsgPtr)
 Close('Mstat')
 tr 'Message posted to (Co-)Sysop(s).'
 tr ''
 address command('c:DELETE DOORS:BBSscan/PlayPen/#? ALL')
end
else do
 tr 'No'
 tr ''
end

SHUTDOWN
EXIT
RETURN

ERROR:;SYNTAX:;IOERR:;tr '';tr '[0;1mAborting! [0mPlease upload textfiles [1monly[0m!';tr '';SHUTDOWN;exit;RETURN
