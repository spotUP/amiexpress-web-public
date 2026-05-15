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
Open('Mstat','DOORS:BBSscan/Msghold/Holderfile','R')
HsgPtr=ReadLN('Mstat')
Close('Mstat')
Open('Mstat','DOORS:BBSscan/Msgbase/Headerfile','R')
MsgPtr=ReadLN('Mstat')
Close('Mstat')
if HsgPtr>0 then do
 tr 'There are 'HsgPtr' new message(s).'
 tr ''
 ss '[36mDo you wish to validate now [32m([33my[32m/[33mN[32m)? [0m';GetChar;yn=Upper(RESULT)
 if yn='Y' then do
  tr 'Yes'
  tr ''
  Hcnt=1
  do until Hcnt>HsgPtr
   tr ''
   Open('IMsg','DOORS:BBSscan/Msghold/'Hcnt,'R')
   Frm=ReadLN('IMsg')
   Dj=ReadLN('IMsg')
   tr '[32mDate   [33m: [0m'Dj''Right(Spc,32-Length(Dj))'[32mNumber[33m: [0m'HCnt
   tr "[32mTo     [33m: [0m"USER""Right(Spc,32-Length(USER))"[32mRecv'd[33m: [0mNo"
   tr '[32mFrom   [33m: [0m'Frm''Right(Spc,32-Length(Frm))'[32mStatus[33m: [0mPrivate Message'
   tr '[32mSubject[33m: [0mIs this add good enough?'
   tr ''
   do until eof('IMsg')
    tr ReadLN('IMsg')
   end
   Close('IMsg')
   tr '[0m'
   ss '[36mAccept this message [32m([33my[32m/[33mN[32m)? [0m';GetChar;yn=Upper(RESULT)
   if yn='Y' then do
    tr 'Yes'
    tr ''
    Open('IMsg','DOORS:BBSscan/Msghold/'Hcnt,'R')
    MsgPtr=MsgPtr+1
    Open('OMsg','DOORS:BBSscan/Msgbase/'MsgPtr,'W')
    do until eof('IMsg')
     apa=ReadLN('IMsg')
     WriteLN('OMsg',apa)
    end
    Close('IMsg')
    Close('OMsg')
    Open('Mstat','DOORS:BBSscan/Msgbase/Headerfile','W')
    WriteLN('Mstat',MsgPtr)
    Close('Mstat')
    tr 'Message posted to the public.'
    tr ''
   end
   else do
    tr 'No, message terminated.'
    tr ''
   end
   Hcnt=Hcnt+1
  end
  Open('Mstat','DOORS:BBSscan/Msghold/Holderfile','W')
  WriteLN('Mstat','0')
  Close('Mstat')
 end
 else do
  tr 'No'
  tr ''
 end
end
else do
 tr 'There are no new messages.'
 tr ''
end

SHUTDOWN
EXIT
RETURN

ERROR:;transmit '';transmit 'An error has occured on line #'sigl'!';transmit 'Please notify the SYSOP!';transmit '';call quit;SYNTAX:;transmit '';transmit 'A syntax error has occured on line #'sigl'!';transmit 'Please notify the SYSOP!';transmit '';call quit;IOERR:;transmit '';transmit 'An io error has occured on line #'sigl'!';transmit 'Please notify the SYSOP!';transmit '';call quit;quit:;SHUTDOWN;exit;RETURN
