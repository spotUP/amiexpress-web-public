/* ----------------------------------------------------------------------- */
/*    Quest V1.12 written by Delusion Of Virtual In 1994. © DLS/VTL 94!    */
/*                                                                         */
/*  Version 1.00 Created 06-07-92  ««---»»  Version 1.12 Created 03-31-94  */
/*                                                                         */
/* »» Except No Cheap Imitations Virtual Is The Worlds No.1 Door Makers «« */
/* ----------------------------------------------------------------------- */
parse arg node;options results;signal on syntax;signal on error;signal on ioerr;address value "AERexxControl"node
tr=transmit;ss=sendmessage;CR='0D 0A'x;addlib('rexxsupport.library',0,-30);NUL='0'x;DIR='DOORS:Arexx/Account/';VER='1.12';DATE=Translate(Date(U),'-','/')

GetUser  12 ; SYSO=Result; GetUser 100 ; NAME=Result
GetUser 104 ; SLOT=Result; GetUser 105 ; SECS=Result

if Exists(DIR'QuestApp/'SLOT) then do
 Open('Answer',DIR'QuestApp/'SLOT,'R')
  Parse Value ReadLN('Answer') With OldName'  Slot'.
 Close('Answer')
 if Upper(Name) = Upper(OldName) then do
  tr CR'[32mQuest [34mV'VER' installed. [35m© Delusion of Virtual [34m1994.'CR
  SHUTDOWN;EXIT
 end
 Rename(DIR'QuestApp/'SLOT,DIR'QuestDel/'Space(OldName,1,'-'))
 Rename(DIR'QuestApp/'SLOT'.Dat',DIR'QuestDel/'Space(OldName,1,'-')'.Dat')
end

tr CR'cWelcome to [32mQuest [34m([35mAccount ED[34m)[0m V'VER' by [35mDelusion[0m of [36mVirtual[0m 1994. [35m+46(0)589-ELITE[0m'CR

Open('Data',Dir'AccEd.Presets','R')
 Parse Value ReadCH('Data',2349) With 89 DesC'|' 104 AccL'|' 109 RatT'|' 112 RatI'|' 115 AutR'|' 118 DaiB'|' 128 ConA'|' 139 TimS'|' 1706 EditOwn'|' 1966 KickOut'|' 2052 Questionary'|' 2185 BBSConf'|' 2224 AutoAccess'|' 2270 ToName'|' 2309 MustEnter'|'
 MustEnter = Strip(Upper(MustEnter)); Questionary = Strip(Questionary); ToName = Strip(ToName); KickOut = Strip(KickOut); BBSConf = Strip(BBSConf)'MsgBase/'
Close('Data')

if Open('Questions',DIR'QuestQst/Questions.'Questionary,'R') = 0 then do
 tr "No Questions Available, Error Can't Question You!"
 Call ExitPRG
end

Do until Sure ~= 'N'
 tr '[32mPlease Answer The Following Questions 100% Correctly or you will NOT gain access!'CR
 Do i = 1 to 1000 until eof('Questions')
  Parse Value ReadLN('Questions') With 1 ReadBuff 2 ReadType 3 ReadStat 4 QueryBuff
  if Length(QueryBuff) > 4 then if SubStr(QueryBuff,Length(QueryBuff),1) = ':' then QueryBuff = Insert('[34m',QueryBuff,Length(QueryBuff)-1)
  Col = '[35m'
  if Index('NACVD',ReadType) > 0 then Col = '[0m'
  if ReadStat = '!' then Col = '[34m'
  if SubStr(ReadBuff,1,1) = '~' then do
   Do until InBuff ~= ''
    Query Col||QueryBuff' [36m'
    InBuff = Result
    if InBuff = '' then do
     if MustEnter = 'NO' then do
      KickOut = KickOut - 1
      if KickOut < 1 then do
       tr CR'[35mYou did not answer as many questions as required, therefor you are KICKED OUT'
       tr 'from this board. Never call this board again [33mLAMER![0m'CR
       PutUser 511;SHUTDOWN;EXIT
      end
     end
     else tr CR'You [35mMUST[0m enter complete answers on [36mEVERY[0m question in this questionary. Reenter.'CR
    end
   end
   In.i = InBuff
  end
  else do
   tr Col||QueryBuff; i = i - 1
  end
 end
 ss CR'[0mIs the above Correct? ' 
 Do until Sure ~= ''
  GetChar; Sure = Upper(Result)
  if Upper(Result) = 'N' then do
   tr 'No..'
   Seek('Questions',0,'B')
   tr CR'cWelcome to [32mQuest [34m([35mAccount ED[34m)[0m V'VER' by [35mDelusion[0m of [36mVirtual[0m 1994. [35m+46(0)589-ELITE[0m'CR
  end
 end
end
tr 'Yes..'
Close('Questions')
Open('Answer',DIR'QuestApp/'SLOT,'W')
 GetUser 101
 WriteLN('Answer',NAME'  Slot: 'SLOT'  First Login: 'DATE' 'TIME()'  Login PW: 'Result)
 WriteLN('Answer','. 'Questionary)
 Do k = 1 to i
  WriteLN('Answer',In.k)
 end
Close('Answer')

tr CR'[32m*** IMPORTANT ***[34m Your questionary will be viewable for all other users'
tr 'except the questions marked with blue colour. White questions may also be'
tr 'excluded from your quest. If you wish so, then you should choose Private Quest!'CR
ss '[35mDo you want your quest P[36mu[35mblic, [36mP[35mrivate or [36mS[35mecret? [0m'
GetChar; Com = Upper(Result)
if Com = 'P' then do; tr 'Private..'; Type = 0; end
if Com = 'S' then do; tr 'Secret..'; Type = 2; end
if Com ~= 'P' & Com ~= 'S' then do; tr 'Public..' ; Type = 1; end

Open('UserData','BBS:User.Data','R')
 Seek('UserData',(Slot-1)*232,'B')
 Data = ReadCH('UserData',232)
Close('UserData')
Open('UserKeys','BBS:User.Keys','R')
 Seek('UserKeys',(Slot-1)*56,'B')
 Data = Data||ReadCH('UserKeys',56)
Close('UserKeys')
Open('Back',DIR'QuestApp/'SLOT'.Dat','W')
 WriteCH('Back',Data||Left(D2C(Type),20,NUL))
Close('Back')
if Open('AnsLog',DIR'Quest.Log','A') = 0 then Open('AnsLog',DIR'Quest.Log','W')
 WriteLN('AnsLog',' 'DATE' ('TIME()')  ['SLOT']	'NAME)
 WriteLN('AnsLog',' ---------------------------------------------------------------------------')
Close('AnsLog')
ADDRESS COMMAND 'FileNote 'DIR'QuestApp/'SLOT' 'Space(Name,1,'-')

if SECS > 10 then do
 tr CR||SYSO' is grateful that you filled out the Questionary afterwards!'
 tr 'Sysop will review your application and look at your status.'
 ADDRESS COMMAND 'FileNote 'DIR'QuestApp/'SLOT' 'Space(Name,1,'-')
 Call ExitPRG
end
else do
 tr CR'[36mYou now have to write a letter to sysop with a presentation'
 tr 'and the reason why you called this board..'CR
 tr '                       [32m([33m------------------------------[32m)'
 tr '     [36mTo[33m: [32m([33mEnter[32m)[0m=[32m*[33mALL[32m*? [0m'ToName
 tr "[36mSubject[33m: [32m([33mBlank[32m)[0m=[33mabort[32m? [0mI'm a new user!"
 Open('MS',BBSCONF'MailStats','R')           /* Msg To MsgBase V1.03 Coded  */
  Num = C2D(SubStr(ReadLN('MS'),5,4))        /* By Delusion/VTL. © DLS 1993 */
  Do until Exists(BBSCONF||NUM)
   PutUstr BBSCONF||NUM
   PutUser 9
  end
  Seek('MS',4,'B')
  WriteCH('MS',Right(D2C(Num+1),4,NUL))
 Close('MS')
 Open('HF',BBSCONF'HeaderFile','A')
  WriteCH('HF','R'Right(D2C(Num),5,NUL)||Left(ToName,31,NUL)||Left(Name,31,NUL)||Left("I'm a new user!",32,NUL)||Left(D2C((252482400 + Time('S') + (86400 * Date('I')))),10,NUL))
 Close('HF')
 if Pos ~= 0 then do; tr ''; ShutDown; Exit; end
 GetUser 142; Toggle = Result
 ss CR||CR"[35mDo you wan't to try to operate "SYSO" ? [0m"; GetChar; Ans = Upper(Result)
 if Toggle = 'ON' & Ans = 'Y' then do
  ss 'Yes..'CR||CR'[32mOperating [35m'SYSO'[36m! [0m[0 p'
  Do i = 1 to 17
   ss '07'x||'«» '
   Do h = 1 to 50; end
  end
  tr CR'[ pOperator Paged.'
 end
 else do
  if Ans = 'Y' then tr 'Yes'CR||CR'Sorry sysop is not available right now!'
  else tr 'No..'
 end
 tr CR||ToName' will review your application and you will normaly have'
 tr 'your full access within 24 Hours!'CR
 if Strip(Upper(AutoAccess)) = 'YES' then do
  tr '[32mGiving you temporary access so you can upload the 2 Mb limit! :)'
  tr 'This fast access is only given becouse you have filled out the questionary!'CR
  tr '[33mSysop regards the given status as: [35m'Strip(DesC)
  PutUstr Strip(AccL); PutUser 105; PutUstr Strip(RatT); PutUser 106
  PutUstr Strip(RatI); PutUser 107; PutUstr Strip(DaiB); PutUser 119
  PutUstr Strip(ConA); PutUser 146; PutUstr Strip(TimS); PutUser 115
 end
 else do
  tr 'Dropping carrier call back after 24 Hrs..'
  tr CR'						            [34;1m+:+[0;35m VIRTUAL [34;1m+:+[0m 1994[ p'CR
  PutUser 511;SHUTDOWN;EXIT
 end
end
Call ExitPRG

/* ---------------------------- Virtual ------------------------------- */

Error: ; Syntax: ; IOerr:
tr CR'[0mAn Error Has Occured In The Main Program On Line #'sigl'! Exiting...'
tr 'Please Notify 'SYSO'. Or Delusion If It Is Possible.'CR
ExitPRG:
tr CR'						            [34;1m+:+[0;35m VIRTUAL [34;1m+:+[0m 1994[ p'CR
SHUTDOWN;EXIT
