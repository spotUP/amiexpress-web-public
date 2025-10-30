/* ----------------------------------------------------------------------- */
/*  Quest View V1.01 written by Delusion Of Virtual In 1994. © DLS/VTL 94  */
/*                                                                         */
/*  Version 1.00 Created 12-22-93  ««---»»  Version 1.01 Created 06-14-94  */
/*                                                                         */
/* »» Except No Cheap Imitations Virtual Is The Worlds No.1 Door Makers «« */
/* ----------------------------------------------------------------------- */
parse arg node;options results;address value "AERexxControl"node; Status.0 = 'Private'; Status.1 = 'Public'; Status.2 = 'Secret'
ss=sendmessage; CR='0D 0A'x; NUL='0'x; DIR='DOORS:Arexx/Account/'; VER='1.01';GetUser 104 ; SlotNr = Result; GetUser 122; UNumLines = Result; GetUser 131; Parse Value Result With .' 'MainLine

ss CR'[32mQuest View [34m([35mAccount ED[34m)[0m V'VER' [33m- [35m© Delusion[0m of [36mVirtual[0m 1994. [35m+46(0)589-ELITE.[0m'CR||CR

Open('Data',DIR'AccEd.Presets','R')
 Parse Value ReadCH('Data',2175) With 1152 UserFile'|' 1238 UserKeys'|'
Close('Data')


if Open('Back',DIR'QuestApp/'SlotNr'.Dat','R') = 0 then do
 ss "[33mYou must first fill out your own questionary, type QUEST at prompt to do that!"CR||CR
 ShutDown;Exit
end
Stat = ReadCH('Back',308)
Type = C2D(SubStr(Stat,289,1))
Close('Back')
if MainLine = '' then do
 ss '[0mYour questionary is: 'Status.Type||CR'[36mWanna change status[35m? [36m(y/N) [35m: [32m'
 GetChar
 if result = 'y' then do
  ss 'Yes..'CR||CR'[35m1[34m. [0mPublic  [36m(Almost all info will be shown)'CR'[35m2[34m. [0mPrivate [36m(Your real name, address and phone will not be shown)'CR
  ss '[35m3[34m. [0mSecret  [36m(No one can view your questionary)'CR||CR'[36mPlease choose type [35m? [36m(1-3) [35m: [32m'; GetChar; Type = Result
  if Type > 0 & Type < 4 then do
   ss Type||CR||CR
   if Type = 2 then Type = 0; if Type = 3 then Type = 2
   Open('Back',DIR'QuestApp/'SlotNr'.Dat','W')
    WriteCH('Back',Overlay(Left(D2C(Type),1,NUL),Stat,289))
   Close('Back')
   ss '[0mYour questionary is: 'Status.Type
  end
  else ss Type||CR||CR"[0mDidn't change Your questionary status!"
 end
 else ss 'No..'
 Query CR||CR'[33mYou may look at any users questionary. However due to security reasons'CR'the Sysop may have disabled you from viewing some information.'CR||CR'[36mView which user [35m?[32m '
 SName = Strip(Upper(Result))
end
else SName = Strip(Upper(MainLine))

if SName ~= '' then do
 Open('UserKeys',Strip(UserKeys),'R')
  SlotNr = Trunc(Index(Upper(ReadCH('UserKeys',56*10000)),SName,56) / 56) + 1
  Seek('UserKeys',(SlotNr - 1) * 56,'B')
  BaudRate = C2D(SubStr(ReadCH('UserKeys',56),45,2))
 Close('UserKeys')
 if SlotNr ~= 1 then do
  if Open('Quest',DIR'QuestApp/'SlotNr,'R') = 1 then do
   if Open('Back',DIR'QuestApp/'SlotNr'.Dat','R') = 1 then Stat = C2D(SubStr(ReadCH('Back',308),289,1))
   Close('Back')
   if Stat ~= 0 & Stat ~= 1 & Stat ~= 2 then Stat = 0
   Parse Value ReadLN('Quest') With Name'  Slot: '.'  First Login: 'Date'  Login PW: 'FirstPass
   Parse Value ReadLN('Quest') With Type' 'Quest
   if Stat ~= 2 then do
    if Type = '.' then do
     if Quest = '' then Quest = '1'
     Open('Questions',DIR'QuestQst/Questions.'Quest,'R')
     ss CR||CR'[0 p                      [33;44m>> First Login 'Date' <<[0m'CR||CR||CR
     k = 1
     Do until eof('Questions')
      Parse Value ReadLN('Questions') With 1 ReadBuff 2 ReadType 3 ReadStat 4 Question
      if ReadStat ~= '!' & Index('NACV',ReadType) = 0 & Stat = 0 | ReadStat ~= '!' & Stat = 1 then do
       if ReadBuff = '~' then ss '[35m'Question'[36m 'ReadLN('Quest')||CR
       else ss '[35m'Question||CR
       if k = Trunc(k/(UNumLines-7))*(UNumLines-7 ) then do
        ss CR'[36m([34mPause..[36m)[35m..'CR||CR; GetChar
       end
       k = k + 1
      end
      else if ReadBuff = '~' then ReadLN('Quest')
     end
     Close('Questions')
    end
    else ss CR"[0mThis users questionary is from an too old version of Quest, can't display!"CR
   end
   else ss CR||CR'                            [33;44m>> Questionary Private <<[0m'CR||CR
   Close('Quest')
  end
  else ss CR'Sorry, the user you requested has not answered the questionary!'CR

  Open('UserData',Strip(UserFile),'R')
  Seek('UserData',(SlotNr - 1) * 232,'B')
  UserDate = ReadCH('UserData',232)

  Ratio = C2D(SubStr(UserDate,91,2))
  if Ratio = 0 then Ratio = 'Disabled'
  else Ratio = '1/'Ratio

  MPost     = C2D(SubStr(UserDate,95,2))
  ULs       = C2D(SubStr(UserDate,147,2))
  DLs       = C2D(SubStr(UserDate,149,2))
  Calls     = C2D(SubStr(UserDate,153,2))
  LastOn    = C2D(SubStr(UserDate,155,4))
  DBytes    = C2D(SubStr(UserDate,171,4))
  UBytes    = C2D(SubStr(UserDate,175,4))

  Rating    = Trunc(((UBytes+(50000*(MPost+Calls))-DBytes)/60000)+(ULs-DLs))
  LastOn    = (LastOn - 252482400) / 86400
  LastOn    = SubStr(Date('N',Trunc(LastOn)),1,6)' 'SubStr(Date('N',Trunc(LastOn)),10,2)' 'Right(Trunc((LastOn - Trunc(LastOn)) * 24),2,'0')':'Right(Trunc((LastOn * 24 - Trunc(LastOn * 24)) * 60),2,'0')':'Right(Trunc((LastOn * 1440 - Trunc(LastOn * 1440)) * 60),2,'0')

  ss CR'      [33m----------------------------------------------------------------------'CR||CR
  ss '       [35mUL:s [34m[[36m'Right(UBytes,10)'[34m]  [35mFiles: [34m[[36m'Right(ULs,5)'[34m]  [35mCalls: [34m[[36m'Right(Calls,5)'[34m]  [35m Baud: [34m[[36m'Right(BaudRate,8)'[34m]'CR
  ss '       [35mDL:s [34m[[36m'Right(DBytes,10)'[34m]  [35mFiles: [34m[[36m'Right(DLs,5)'[34m]  [35m Msgs: [34m[[36m'Right(MPost,5)'[34m]  [35mRatio: [34m[[36m'Right(Ratio,8)'[34m]'CR
  ss CR'      [33m---------------------------------------------------------------'Right(' 'Rating,7,'-')CR||CR
  ss '                      [32mLast Time Online:  'LastOn'[ p'CR
 end
 else ss CR'User NOT found! Sorry.. (You may not look at sysop!)'
end

ss CR||CR'						            [34;1m+:+[0;35m Virtual [34;1m+:+[0m 1994[ p'CR||CR
SHUTDOWN;EXIT
