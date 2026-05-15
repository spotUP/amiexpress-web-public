/* BBSscan util series by Zwinx/RAGE »DaGcEnTRaL 9o²1o +46-31-775-939[0-1]« */
parse arg node;signal on error;signal on syntax;signal on ioerr;options results

nodeid = "AERexxControl"node

tr=transmit;hk=getchar;pm=prompt;sendstring=sendmessage;ss=sendstring;gu=getuser

address value nodeid

DT_NAME=100
RETURNCOMMAND=136
BB_MAINLINE=131
DT_SLOTNUMBER    = 104
DT_SECSTATUS     = 105

gu DT_SECSTATUS ; SECS=Result
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

FreeB=0
tr ''
tr '[0mBBS-add mailscanning... ©1994 ZwiNX/RAgE +46-31-775-9390 +46-31-775-9391'
tr ''
ss '[32mScanning conference[33m: [0m[%] !BBS aDDs! [%]  '
if ~exists('DOORS:BBSscan/MailStats/'SLOT)then do
 Open('Mstat','DOORS:BBSscan/MailStats/'SLOT,'W')
 WriteLN('Mstat','0')
 Close('Mstat')
end

Open('Mstat','DOORS:BBSscan/MailStats/'SLOT,'R')
RMsg=ReadLN('Mstat')
Close('Mstat')

if Word(File,2)~='' then do
 RMsg=Word(File,2)
end
br

Open('Mstat','DOORS:BBSscan/Msgbase/HeaderFile','R')
LMsg=ReadLN('Mstat')
Close('Mstat')

FoundMail=0;SMsg=RMsg+1
if SMsg<=LMsg then do
 do until SMsg>LMsg
  if exists('DOORS:BBSscan/Msgbase/'SMsg)then do
   if FoundMail=0 then do
    tr ''
    tr ''
    tr ''
    tr '[32mType     From                           Subject               Msg'
    tr '[33m-------  ------------------------------ --------------------  -------'
    FoundMail=1
   end
   Open('Mstat','DOORS:BBSscan/Msgbase/'SMsg,'R')
   Frm=ReadLN('Mstat')
   Close('Mstat')
   tr '[0mPrivate  'Frm''Right(Spc,31-Length(Frm))'Important Boardadd!   'Right(Noll,6-Length(SMsg))''SMsg
  end
  SMsg=SMsg+1
 end
end

if FoundMail=1 then do
 tr ''
 ss 'Would you like to read it now [32m([33mY[32m/[33mn[32m)? [0m';GetChar;yn=Upper(RESULT)
 if yn~='N' then do
  tr 'Yes'
  Quit=0
  RMsg=RMsg+1
  do until RMsg>LMsg | Quit=1
   if exists('DOORS:BBSscan/Msgbase/'RMsg)then do
    tr '[0m'
    Open('Msg','DOORS:BBSscan/Msgbase/'RMsg,'R')
    Frm=ReadLN('Msg')
    Dj=ReadLN('Msg')
    tr '[32mDate   [33m: [0m'Dj''Right(Spc,32-Length(Dj))'[32mNumber[33m: [0m'RMsg
    tr "[32mTo     [33m: [0m"USER""Right(Spc,32-Length(USER))"[32mRecv'd[33m: [0mNo"
    tr '[32mFrom   [33m: [0m'Frm''Right(Spc,32-Length(Frm))'[32mStatus[33m: [0mPrivate Message'
    tr '[32mSubject[33m: [0mImportant Boardadd!'
    tr ''
    do until eof('Msg')
     tr ReadLN('Msg')
    end
    Close('Msg')
    yn=''
    ss '[32mMsg. options: [33mA[36m'
    if SECS>199 then do
     ss ',[33mD[36m'
    end
    ss ',[33mQ[36m,[33m?[36m,[32m<[33mCR[32m> '
    do until yn='A' | yn='Q' | yn='D' | yn=''
     query '[32m( [0m'RMsg' [32m) [0m>: ';yn=Upper(RESULT)
     if yn='?' then do
      tr ''
      tr '[33mA[32m>[36mgain'
      if SECS>199 then do
       tr '[33mD[32m>[36melete'
      end
      tr '[33mQ[32m>[36muit'
      ss '[32m<[33mCR[32m>[0m=[33mNext[0m '
     end
     else if yn='A' then do
      RMsg=RMsg-1
     end
     else if yn='D' then do
      address command ('C:DELETE DOORS:BBSscan/Msgbase/'RMsg)
      tr ''
      tr 'Message 'RMsg' deleted...'
      tr ''
     end
     else if yn='Q' then do
      Quit=1
      tr ''
     end
     else if yn~='' then do
      tr ''
      tr 'No such command!!'
      ss '[32mMsg. options: [33mA[36m'
      if SECS>199 then do
       ss ',[33mD[36m'
      end
      ss ',[33mQ[36m,[33m?[36m,[32m<[33mCR[32m> '
     end
    end
   tr ''
   end
   RMsg=RMsg+1
  end
  Open('Mstat','DOORS:BBSscan/MailStats/'SLOT,'W')
  WriteLN('Mstat',RMsg-1)
  Close('Mstat')
 end
 else do
  tr 'No'
  tr ''
  tr ''
 end
end
else do
 tr 'No mail today!'
 tr ''
 tr ''
end

SHUTDOWN
EXIT
RETURN

ERROR:;transmit '';transmit 'An error has occured on line #'sigl'!';transmit 'Please notify the SYSOP!';transmit '';call quit;SYNTAX:;transmit '';transmit 'A syntax error has occured on line #'sigl'!';transmit 'Please notify the SYSOP!';transmit '';call quit;IOERR:;transmit '';transmit 'An io error has occured on line #'sigl'!';transmit 'Please notify the SYSOP!';transmit '';call quit;quit:;SHUTDOWN;exit;RETURN
