/* AutoFLUSH util series by Zwinx/RAGE »DaGcEnTRaL 9o²1o +46-31-795-5479« */
parse arg node;signal on error;signal on syntax;signal on ioerr;options results

nodeid = "AERexxControl"node

tr=transmit;hk=getchar;pm=prompt;sendstring=sendmessage;ss=sendstring;gu=getuser

address value nodeid

DT_NAME=100
RETURNCOMMAND=136
BB_MAINLINE=131

gu DT_NAME;USER=result
gu BB_MAINLINE;FILE=result

CHOUR=SubStr(Time('n'),1,2)
CMIN=SubStr(Time('n'),4,2)
CSEC=SubStr(Time('n'),7,2)

FreeB=0
tr ''
tr '[0m[36mAuto[0mFLUSH [32mVersion [0m1.12ß [36m- [32mWritten By [0mZwinx/Rage[36m![0m'
tr ''
ss '[32mChecking Upload space...'
Open('cfg','DOORS:Space/Space.cfg','R')
DelDir=ReadLN('cfg')
WriDir=ReadLN('cfg')
MinB=ReadLN('cfg')
DelToB=ReadLN('cfg')
do until EOF('cfg')
 Dev=ReadLN('cfg')
 if Dev~='' then do
  address command('c:space >T:Space.tmp 'Dev)
  Open('tmp','T:Space.tmp','R')
  FreeB=FreeB+Word(ReadLN('tmp'),1)
  Close('tmp')
 end
Close('cfg')

if FreeB<MinB then do
 ss '[36mhold on while deleteing...[32m'
 address command('c:rename 'DelDir' 'DelDir'.spc')
 Open('Rdir',Deldir'.spc','R')
 Open('Wdir',WriDir,'A')
 Open('Log','DOORS:Space/Space.log','A')
 do until FreeB>DelToB
  FreeB=0
  Open('cfg','DOORS:Space/Space.cfg','R')
  DelDir=ReadLN('cfg')
  WriDir=ReadLN('cfg')
  MinB=ReadLN('cfg')
  DelToB=ReadLN('cfg')
  do until EOF('cfg')
   Dev=ReadLN('cfg')
   if Dev~='' then do
    address command('c:space >T:Space.tmp 'Dev)
    Open('tmp','T:Space.tmp','R')
    FreeB=FreeB+Word(ReadLN('tmp'),1)
    Close('tmp')
   end
  end
  Close('cfg')
  Fdel=0
  do until Fdel=1
   DD=ReadLN('Rdir')
   if SubStr(DD,1,1)~=' ' & Word(DD,2)='P' then Fdel=1
   if SubStr(DD,1,1)~=' ' & Word(DD,2)='N' then Fdel=1
   if SubStr(DD,1,1)~=' ' & Word(DD,2)='F' then Fdel=1
   if Fdel=0 then WriteLN('Wdir',DD)
  end
  if Fdel=1 then do
   Open('Udirs','DOORS:Space/Space.dirs','R')
   Offl=0
   do until EOF('Udirs')
   DelFrom=ReadLN('Udirs')
    if DelFrom~='' then do
     if exists(DelFrom''Word(DD,1)) then do
      address command('c:delete 'Delfrom''Word(DD,1))
      q=LENGTH(DD)
      r=q-33;WriteLN('Wdir',left(word(DD,1),12)' 'word(DD,2)' OFFLINE 'word(DD,4)'  'right(left(DD,q),r))
      WriteLN('Log',left(word(DD,1),12)' 'word(DD,3)' 'word(DD,4)' deleted.')
      Offl=1
     end
    end
   end
   If Offl=0 then WriteLN('Wdir',DD)
   Close('Udirs')
  end
 end
 Fdel=0
 do until Fdel=1
  DD=ReadLN('Rdir')
  if SubStr(DD,1,1)~=' ' & Word(DD,2)='P' then Fdel=1
  if SubStr(DD,1,1)~=' ' & Word(DD,2)='N' then Fdel=1
  if SubStr(DD,1,1)~=' ' & Word(DD,2)='F' then Fdel=1
  if Fdel=0 then WriteLN('Wdir',DD)
 end
 Open('Ndir',Deldir'.des','W')
 WriteLN('Ndir',DD)
 do until EOF('Rdir')
  Dum=ReadLN('Rdir');if Dum~='' then WriteLN('Ndir',Dum)
 end
 Close('Ndir')
 Close('Rdir')
 Close('Wdir')
 Close('Log')
 address command('c:rename 'DelDir'.des 'DelDir)
 address command('c:delete 'DelDir'.spc')
end

tr 'done!'
tr ''

SHUTDOWN
EXIT
RETURN

ERROR:;transmit '';transmit 'An error has occured on line #'sigl'!';transmit 'Please notify the SYSOP!';transmit '';call quit;SYNTAX:;transmit '';transmit 'A syntax error has occured on line #'sigl'!';transmit 'Please notify the SYSOP!';transmit '';call quit;IOERR:;transmit '';transmit 'An io error has occured on line #'sigl'!';transmit 'Please notify the SYSOP!';transmit '';call quit;quit:;SHUTDOWN;exit;RETURN
