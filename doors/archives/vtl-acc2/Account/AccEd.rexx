/* ----------------------------------------------------------------------- */
/*  Account Ed V2.00 written by Delusion Of Virtual In 1994. © DLS/VTL 94  */
/*                                                                         */
/*  Version 1.00 Created 08-28-92  ««---»»  Version 2.00 Created 04-08-94  */
/*                                                                         */
/* »» Except No Cheap Imitations Virtual Is The Worlds No.1 Door Makers «« */
/* ----------------------------------------------------------------------- */
parse arg node;options results;signal on syntax;signal on error;signal on ioerr

ss=sendmessage; CR='0D 0A'x; CF='0A'x; NUL='0'x; Name=0; Com=0; VER='2.00'; BS='8'x;ConfName='Conf Access [34m...';ConfShow='[34m([35m123456789[34m)';ConfType='X';ConfNr='1-9';SlotCred=0;SName=''
address value "AERexxControl"node; Call AddLib('rexxsupport.library',0,-30);GetUser 100; Nam = Result;GetUser 104;USlotNr = Result; GetUser 122; UNumLines = Result;GetUser 105; Sec = Result; GetUser 12; Syso = Result; GetUser 152; AmiX = Result; GetUser 145; DateStamp = Result;Date = Translate(Date(U),'-','/');Dir='DOORS:Arexx/Account/';TTime=SubStr(Time(),1,2)||SubStr(Time(),4,2)
if SEC < 200 then MsgLog(CR'Command requires higher access. Virtual Rulez, Account Ed Installed !'CR||CR,'Security level too low')

HEADER = 'c[0 p[34mVirtual [32mAccount Ed[34m V'VER' For [32m/X 'SubStr(AmiX,2,4)' [34mBy [35mDelusion / VTL. [34mINSANiTY [36m+46(0)589-Elite'CR||CR
ss HEADER'[3;33mThe High Security Performance Door.[0m'CR

/* ------------------------- Delusion 'n Virtual ------------------------- */

if Open('Data',DIR'AccEd.Presets','R') = 1 then do
 Parse Value ReadCH('Data',2349) With NrCom'-' 63 PVer'-' 85 (CF) InPut 868 STime'-' 930 ETime' 'Com.10'|' (CF) '|'Names'|'Com.11'|' 1142 UserData'|' 1181 Enable'|' 1187 Com.12'|' 1226 UserKeys'|' 1265 ChangeAcc'|' 1271 Com.13'|' 1310 BBSConf'|' 1349 MsgClean'|' 1355 Com.14'|' 1394 PassWord'|' 1433 SeePass'|' 1439 Com.15'|' 1478 DelPass'|' 1517 ShowPass'|' 1523 Com.16'|' 1562 RecieveApp'|' 1601 Printer'|' 1607 Com.17'|' 1646 Col'|' 1685 EditOwn'|' 1691 Com.18'|' 1730 NotAccC'|' 1769 NewSlot'|' 1775 Com.19'|' 1814 CreditAcc'|' 1853 Log'|' 1899 Reserved2'|' 1945 Ansi.0'|' 1984 Reserved3'|' 2030 Ansi.1'|' 2069 Reserved4'|' 2115 Ansi.2'|' 2201 Ansi.3'|' 2287 Ansi.4'|'
 Parse Value InPut With '|'DesC.1'|'AccL.1'| 'RatT.1' | 'RatI.1' | 'AutR.1' |'DaiB.1'| 'ConA.1' |'TimS.1'|'Com.1'|' (CF) '|'DesC.2'|'AccL.2'| 'RatT.2' | 'RatI.2' | 'AutR.2' |'DaiB.2'| 'ConA.2' |'TimS.2'|'Com.2'|' (CF) '|'DesC.3'|'AccL.3'| 'RatT.3' | 'RatI.3' | 'AutR.3' |'DaiB.3'| 'ConA.3' |'TimS.3'|'Com.3'|' (CF) '|'DesC.4'|'AccL.4'| 'RatT.4' | 'RatI.4' | 'AutR.4' |'DaiB.4'| 'ConA.4' |'TimS.4'|'Com.4'|' (CF) '|'DesC.5'|'AccL.5'| 'RatT.5' | 'RatI.5' | 'AutR.5' |'DaiB.5'| 'ConA.5' |'TimS.5'|'Com.5'|' (CF) '|'DesC.6'|'AccL.6'| 'RatT.6' | 'RatI.6' | 'AutR.6' |'DaiB.6'| 'ConA.6' |'TimS.6'|'Com.6'|' (CF) '|'DesC.7'|'AccL.7'| 'RatT.7' | 'RatI.7' | 'AutR.7' |'DaiB.7'| 'ConA.7' |'TimS.7'|'Com.7'|' (CF) '|'DesC.8'|'AccL.8'| 'RatT.8' | 'RatI.8' | 'AutR.8' |'DaiB.8'| 'ConA.8' |'TimS.8'|'Com.8'|' (CF) '|'DesC.9'|'AccL.9'| 'RatT.9' | 'RatI.9' | 'AutR.9' |'DaiB.9'| 'ConA.9' |'TimS.9'|'Com.9'|' (CF)
 Close('Data'); Col = Strip(Col)
 if PVer ~= '2.00' then MsgLog(CR'[0mInvalid version of your AccEd.Presets file! Consult documentation ..'CR||CR,'Wrong Preset File Version')
 if PassWord ~= '' then if Upper(Change('[35mPlease enter password: [32m',34,'5;1','','*','5;24')) ~= Upper(PassWord) then MsgLog(CR'[0mPassword verification failed ..'CR||CR,'Wrong Account ED Password')
 if Index(Names,Nam) = 0 then MsgLog(CR'[35mYou are not allowed to use the account editor. Access denied!'CR||CR,'Tried to use the Account Editor')
 if TTime > STime & TTime < ETime then MsgLog(CR'[5;7H[35mYou are not allowed to use the account editor between the timezones[7;34H[33m'STime' and 'ETime'[9;12H[35mGive it a try later or consult your sysop! Access denied!'CR||CR,'Account Editing not allowed at this time')
 if SubStr(AmiX,2,1) = 3 then do; ConfShow='[34m([35mConf Level[34m)'; ConfName = 'Area Name [34m.....'; ConfNr = 'Name'; end
 Drop InPut Names PVer STime ETime TTime PassWord Reserved2 Reserved3 Reserved4
end

Open('UserData',Strip(UserData),'R')
Open('UserKeys',Strip(UserKeys),'R')
NrUsers = Seek('UserData',0,'E') / 232

if Open('Log',Dir'AccEd.Log','A') = 0 then Open('Log',Dir'AccEd.Log','W')

/* ------------------------- Delusion 'n Virtual ------------------------- */

Do While Com ~= ''
 ss CR'[0 p'
 if SubStr(AmiX,2,4) >= '3.37' then do; ss '[35mS[34m)[36mearch user  [35mN[34m)[36mew accounts  [35mC[34m)[36mhange credits  [35mA[34m)[36mccess change  [35mM[34m)[36msgbase cleaner'CR; ss '[35mU[34m)[36mser info  [35mI[34m)[36mnfo on Credits'CR; end
 else ss '[35mS[34m)[36mearch user  [35mN[34m)[36mew accounts  [35mA[34m)[36mccess change  [35mM[34m)[36msgbase cleaner  [35mU[34m)[36mser info'CR
 Com = Que(CR'[36mEdit which account ?[0m[ p ')
 if Com = 'A' then Call Change_ConfAcc
 if Com = 'U' then Call User_Info
 if Com = 'M' then Call Clean_MsgBase
 if Com = 'I' & SubStr(AmiX,2,4) >= '3.37' then Call Credit_Info
 if Com = '1' & USlotNr ~= 1 then ss CR'You may NOT look at the Sysops account.'CR
 if Com = USlotNr & Strip(Upper(EditOwn)) ~= 'ON' then ss CR'You may not edit your own account!'CR
 if Com ~= 'S' & Com ~= 'N' & Com ~= 'C' & Com ~= 'U' & Com ~= 'LOG' & Com > 1 & Com < 10001 & Com ~= USlotNr | Com = USlotNr & Upper(Strip(EditOwn)) = 'ON' then do
  SlotNr = Com
  Call Read_Account
  if Valid = 'Yes' then Call Account_Loop
 end
 if Com = 'S' then do
  SName = Que(CR'[35mS[34m)[36mearch by name ?[0m ')
  if SName ~= '' then do
   SlotNr = 1; New = 'N'
   Call Search
  end
  SName = ''
 end
 if Com = 'N' then do
  ss CR'[35mN[34m)[36mew account editing![0m 'CR
  New = 'Y'; Call Search
 end
 if Com = 'C' & SubStr(AmiX,2,4) >= '3.37' & SEC >= CreditAcc then do
  ss CR'[0mPlease wait scanning user data.'CR
  SlotNr = SlotCred + 1
  Seek('UserData',SlotCred * 232,'B')
  Do SlotNr = SlotNr to NrUsers Until C2D(SubStr(ReadCH('UserData',232),198,3)) ~= 0; end
  if SlotNr ~> NrUsers then do
   SlotCred = SlotNr
   Call Read_Account
   if Valid = 'Yes' then Call Credit_Account
  end
  else ss CR'Sorry no (more) credited users found.'CR
 end
end
PutUstr '	[35mAccount Editing...	Seclevel 'SEC' (AccEd)[0m'CF; PutUser 150
ss CR'						            [34m+:+[35m VIRTUAL [34m+:+[0m 1994'CR||CR
Close('UserData'); Close('UserKeys'); Close('Log'); RemLib('rexxsupport.library'); SHUTDOWN; EXIT

/* ------------------------- Delusion 'n Virtual ------------------------- */

Search:
if Com ~= '9'x then ss CR'[0mPlease wait scanning user data.'CR
else ss 'Scanning user data ..[20;1H'
if New = 'Y' then do
 SlotNr = NewSlot + 1
 Seek('UserData',NewSlot * 232,'B')
 Do SlotNr = SlotNr to NrUsers Until C2D(SubStr(ReadCH('UserData',232),232,1)) = 1; end
 if SlotNr ~> NrUsers then do
  NewSlot = SlotNr
  Call Read_Account
  if Valid = 'Yes' then Call Account_Loop
 end
 else do
  if Com ~= '9'x then ss CR'Sorry no new user found.'CR
  else ss CR'No more new users found.      [0m'CR
 end
end
else do
 Seek('UserKeys',0,'B')
 SlotNr = Trunc(Index(Upper(ReadCH('UserKeys',56*NrUsers)),SName,SlotNr*56) / 56) + 1
 if SlotNr ~= 1 | SlotNr ~= 1 & SlotNr = USlotNr & Strip(Upper(EditOwn)) = 'ON' then do
  Call Read_Account
  Call Account_Loop
 end
 else do
  if Com ~= '9'x then ss CR'Sorry user not found. (Sysop NOT Valid)'CR
  else ss CR'No more users found.      [0m'CR
 end
end
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

Credit_Account:
ss Header
ss '[36mAccount ED Credit Maintenance Utility'CR||CR'[32mUser  [34m[[36m'SlotNr'[34m]  [35m'Name' of 'Loca||CR||CR'[34mCREDIT STATUS'CR||CR
ss '[35m* [36mDays Remaining [34m...........................[33m: [0m'CR'[35m* [36mCredit start date [34m........................[33m: [0m'CR
ss '[35m* [36mCredit end date [34m..........................[33m: [0m'CR||CR'[35m1 [36mDays Credited [34m............................[33m: [0m'CR
ss '[35m2 [36mAmount Paid [34m..............................[33m: [0m'CR'[35m3 [36mAmount Paid [34m([35mUntil                   [34m) ...[33m: [0m'CR
ss '[35m4 [36mTrack Upload [34m.............................[33m: [0m'CR'[35m5 [36mTrack Downloads [34m..........................[33m: [0m'CR||CR
ss '[35mX[34m=[36mExit No Save  [35m~[34m=[36mSave  [35mU[34m=[36mUpdate Total Paid  [35mR[34m=[36mReset Date  [35mT[34m=[36mTerminate Credit'

Do until Com = 'X'
 if Com = '~' then do
  if Open('CRD','BBS:CreditLog','A') = 0 then Open('CRD','BBS:CreditLog','W')
   WriteLN('CRD','------------------------------------------------------------------------------'CF||Date' 'Time()' ['SlotNr'] 'Name||CF'	      Paid: 'Left(PaidCred,5)'  Start Date: 'Left(CalcDate(DateCred),9)'   Last Paid: 'Left(CalcDate(LastCred),9)||CF'	Total Paid: 'Left(TPayCred,5)'    End Date: 'Left(CalcDate(DateCred + DaysCred * 86400),9)'        Days: 'DaysCred)
  Close('CRD')
  Call Save_Account
 end
 if Com = 'T' then DaysCred = 0
 if Com = 'R' then DateCred = DateStamp
 if Com = 'U' then do; TPayCred = TPayCred + PaidCred; LastCred = DateStamp; end
 if Com = 1 then DaysCred = Change(DaysCred,5,'13;47','[0m')
 if Com = 2 then PaidCred = Change(PaidCred,5,'14;47','[0m')
 if Com = 3 then TPayCred = Change(TPayCred,5,'15;47','[0m')
 if Com = 4 & TracCred = 0 | Com = 5 & TracCred = 3 then TracCred = 1; else
 if Com = 4 & TracCred = 1 | Com = 5 & TracCred = 2 then TracCred = 0; else
 if Com = 4 & TracCred = 2 | Com = 5 & TracCred = 1 then TracCred = 3; else
 if Com = 4 & TracCred = 3 | Com = 5 & TracCred = 0 then TracCred = 2
 if TracCred = 0 then do; Trac4 = 'No '; Trac5 = 'No '; end; else
 if TracCred = 1 then do; Trac4 = 'Yes'; Trac5 = 'No '; end; else
 if TracCred = 2 then do; Trac4 = 'No '; Trac5 = 'Yes'; end; else
 if TracCred = 3 then do; Trac4 = 'Yes'; Trac5 = 'Yes'; end
 if DaysCred = 0 then CredStatus = 'INACTIVE'; else CredStatus = 'ACTIVE  '
 ss '[0;36m[7;15H'CredStatus'[0m[9;47H'Left(Trunc( (DateCred + DaysCred * 86400 - DateStamp) / 86000 ),5)'[10;47H'CalcDate(DateCred)'[11;47H'CalcDate(DateCred + DaysCred * 86400)'[13;47H'Left(DaysCred,5)'[14;47H'Left(PaidCred,5)'[15;22H'CalcDate(LastCred)'[15;47H'Left(TPayCred,5)'[16;47H'Trac4'[17;47H'Trac5
 ss '[21;1H[0 p[33;44mAvaiting command.                                                             [21;1H'; GetChar; Com = Result
end
ss '[0m[22;1H'; Com = '!'
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

Credit_Info:
ss HEADER'[35mI[34m)[36mnfo on users Credits.'CR||CR'[0m'
Seek('UserData',0,'B'); Data = ReadCH('UserData',232*NrUsers); k = 0; p = 0; t = 0
ss '[0m        »» CreditList Tool V1.00 By ·D·e·l·u·s·i·o·n· of Virtual 1994 ««'CR'[4;33m                                                                                [0m'CR
ss '[4;33;44m No Name           Group          Sec Downloads Paid  Start     End       Total [0m'CR||CR
Do i = 0 to 232*(NrUsers-1) by 232
 if C2D(SubStr(Data,i+198,3)) > 0 then do
  Parse Value SubStr(Data,i+1,146) With Nami (NUL) 40 Loc (NUL); k = k + 1; t = t + C2D(SubStr(Data,i+211,2)); p = p + C2D(SubStr(Data,i+203,2))
  ss '[32m'Right(i/232+1,3)' [35m'Left(Nami,14)' [34m'Left(Loc,14)' [37m'Left(C2D(SubStr(Data,i+88,1)),3)' [36m'Left(C2D(SubStr(Data,i+171,4)),9)' [33m'Left(C2D(SubStr(Data,i+203,2)),5)' [35m'Left(CalcDate(C2D(SubStr(Data,i+205,4))),9)' [32m'Left(CalcDate(C2D(SubStr(Data,i+205,4)) + C2D(SubStr(Data,i+198,3)) * 86400),9)' [36m'Left(C2D(SubStr(Data,i+211,2)),5)||CR
  if k = Trunc(k/(UNumLines-7))*(UNumLines-7) then do; ss CR'[36m([34mPause..[36m)[35m..'; GetChar; ss Header; end
 end
end
ss CR'                            [34mTotal Paid (Last) [37m= [33m'Left(p,5)' [34mTotal Paid (Ever) [37m= [36m'Left(t,5)||CR
ss '[4;33m                                                                                [0m'CR'[4;33;44m Nr of Users: 'Left(k,3)' | Total Nr Users 'Left(NrUsers,3)' | Perc 'Right(Trunc((k/NrUsers)*100),2)'% | Account ED V'VER' © Delusion [0m'CR
Drop Data Nami Loc
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

Clean_Msgbase:
if SEC < MsgClean then do; ss CR'Command requires higher access.'CR;return;end
ss Header; Nr = 0
ss '[35mM[34m)[36msgbase Cleaner, Deletes all private recieved mail except EALL messages!'CR||CR
Conf = Que('       [36mPath to conference to process [35m? [32m: [0m')
if Open('MS',CONF'/MsgBase/MailStats','R') = 0 then do
 ss CR"Directory doesn't exist. Aborting!"CR
 return
end
Num = C2D(SubStr(ReadLN('MS'),5,4)) - 1
Close('MS')
if Open('POS',Conf'/MsgBase/DelLastNr','R') = 0 then Open('POS',Conf'/MsgBase/DelLastNr','W')
Lst = Strip(ReadLN('POS')); if Lst = '' then Lst = 1
ss '          [36mHighest msg in conference is [32m: [0m'Num||CR||CR
SNum = Que('[36mNumber to start deleting from [35m? [34m([36m'Right(Lst,4)'[34m) [32m: [0m')
ENum = Que('[36m   Number to stop deleting at [35m? [34m([36m'Right(Num,4)'[34m) [32m: [0m')
if SNum < 1 | SNum = '' then SNum = Lst
if ENum > Num | ENum = '' then ENum = Num
ss CR'Searching for mail..'CR
Open('HF',CONF'/MsgBase/HeaderFile','R')
 Seek('HF',(SNUM-1)*110,'B')
 Do i = SNum to ENum
  In = ReadCH('HF',110)
  if SubStr(In,1,1) = 'R' & SubStr(In,105,4) ~= NUL||NUL||NUL||NUL then do
   Seek('HF',-110,'C')
   Nr = Nr + 1
   WriteCH('HF','D'Overlay(D2C((252482400 + Time('S') + (86400 * Date('I')))),SubStr(In,2,109),96))
   Parse Var In . (NUL) 6 To (NUL) 36 Name (NUL) .
   Delete(Conf'/MsgBase/'i)
   ss '[35mMessage [34m#[32m'Right(i,4)' [34mdeleted.. Msg written by[35m: [0m'Left(Name,15)'  [34mTo[35m: [0m'Left(To,15)||CR
  end
  if SubStr(In,7,4) = 'EALL' & SubStr(In,1,1) = 'P' then do
   Parse Var In . (NUL) 37 Name (NUL) 67 Subject (NUL) .
   ss CR'[35mMessage [34m#[32m'Right(i,4)' [34mis a EALL Msg written by[35m: [0m'Name||CR
   Ans =  Que('                    [34mMessage subject is[35m: [0m'Subject||CR'[36mDo you wish to make this EALL Msg a ALL Msg or Delete it[34m? [36m([35mY/N/D[34m)[32m: [0m','C','Y','Yes..'CR,'N','No..'CR)
   if Ans = 'Y' then do
    Seek('HF',-110,'C')
    WriteCH('HF',Overlay(Left('ALL',31,NUL),In,7))
   end
   if Ans = 'D' then do
    ss 'Delete..'CR||CR; Seek('HF',-110,'C'); Delete(Conf'/MsgBase/'i); Nr = Nr + 1
    WriteCH('HF','D'Overlay(D2C((252482400 + Time('S') + (86400 * Date('I')))),SubStr(In,2,109),96))
   end
  end
 end
Close('HF')
ss CR'[36mTotal number of messages deleted[32m: [35m'Nr||CR
Seek('POS',0,'B'); WriteLN('POS',Left(ENum,5)); Close('POS')
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

Change_ConfAcc:
if SEC < ChangeAcc then do; ss CR'Command requires higher access.'CR;return;end
ss HEADER'[35mC[34m)[36mhange ALL users conference access.'CR; Conf = 1; Len = 12
ss 'Be very careful with this command. Just press return to abort!'CR||CR'[0m'
if SubStr(AmiX,2,1) = 3 then Type = Left(Que('Enter new Area Name ?   [34m([36mName[34m)[32m:[0m '),9,NUL)
else do
 Give = Que('Give or Take access ?    [34m([36mG/T[34m)[32m:[0m ','C','G','Give','T','Take')
 if Give = 'G' then Type = 'X'; else Type = '_'; if Give ~= 'G' & Give ~= 'T' then do; ss CR; return; end
 Conf = Que('Conference to process ?  [34m([36m1-9[34m)[32m:[0m '); Len = 13
end
MinA = Que(CR'Minimum access level ? [34m([36m1-255[34m)[32m:[0m ')
MaxA = Que('Maximum access level ? [34m([36m1-255[34m)[32m:[0m ')
if Conf > 0 & Conf < 10 & MinA > 0 & MinA < 256 & MaxA > 0 & MaxA < 256 then do
 ss CR'[0 p[35mPlease wait updating user data.'CR'[0mProcessing account: 'CR
 ConfPos = 47 + Conf
 Do i = 87 to 232*(NrUsers+1) by 232 Until Seek('UserData',i,'B') = 0
  ss '['Len';21H'||(i+145)/232; AccL = C2D(ReadCH('UserData'))
  if AccL >= MinA & AccL <= MaxA then do
   Seek('UserData',ConfPos,'C')
   WriteCH('UserData',Type)
  end
 end
 ss CR'Finished.'CR
end
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

User_Info:
ss HEADER'[35mU[34m)[36mser Info. Just press return to abort!'CR||CR'[0m'
Parse Value Que('Min, Max access level ?   [34m([36m1-255[34m)[32m:[0m ') With MinA ',' MaxA
Parse Value Que('Min, Max ul/dl ratio ?    [34m([36m0-255[34m)[32m:[0m ') With MinR ',' MaxR
Parse Value Que('Min, Max bytes uploaded ?   [34m([36m1-X[34m)[32m:[0m ') With nbUL ',' xbUL
Parse Value Que('Min, Max bytes downloaded ? [34m([36m1-X[34m)[32m:[0m ') With nbDL ',' xbDL
Conf = Que('Conference to process ?    'Right('[34m([36m'ConfNr'[34m)[32m:[0m ',32))
File = Que(CR'Filename to save as ?  [34m([36mFileName[34m)[32m:[0m ')
if SubStr(AmiX,2,1) = 2 & Conf = '' & MinA = '' & MaxR = '' | SubStr(AmiX,2,1) = 3 & MinA = '' & MaxR = '' & Conf = '' then return
if MinA = '' then MinA = 1; if MaxA = '' then MaxA = 255; k = 0; Len = 1; ss HEADER
if MinR = '' then MinR = 0; if MaxR = '' then MaxR = 255
if nbUL = '' then nbUL = 0; if xbUL = '' then xbUL = 10000000000
if nbDL = '' then nbDL = 0; if xbDL = '' then xbDL = 10000000000; if Conf = '' then do; ConfType = ' '; Conf = 20; end; else if SubStr(AmiX,2,1) = 3 then do; ConfType = Left(Conf,9); Conf = 1; Len = 9; end
Seek('UserData',0,'B'); Data = ReadCH('UserData',232*NrUsers)
Bull = '[0m         »» UserList Tool V1.01 By ·D·e·l·u·s·i·o·n· of Virtual 1994 ««'CR'[4;33m                                                                                [0m'CR
Out  = '[4;33;44m No Name           Group             Conf Acc  Sec Rat   Uploads Downloads Call [0m'CR||CR; ss Bull; ss Out; Bull = Bull||Out
Do i = 0 to 232*(NrUsers-1) by 232
 Scs = C2D(SubStr(Data,i+88 ,1))
 DLs = C2D(SubStr(Data,i+171,4))
 ULs = C2D(SubStr(Data,i+175,4))
 Rat = C2D(SubStr(Data,i+91,2))
 Parse Value SubStr(Data,i+1,146) With Nami (NUL) 40 Loc (NUL) 135 Acc (NUL)
 if Rat >= MinR & Rat <= MaxR & Scs >= MinA & Scs <= MaxA & ULs >= nbUL & ULs <= xbUL & DLs >= nbDL & DLs <= xbDL & SubStr(Upper(Acc),Conf,Len) = ConfType then do
  if Rat = '0' then Rat = 'DIS'; else Rat = '1/'Rat
  Out = '[32m'Right(i/232+1,3)' [35m'Left(Nami,14)' [34m'Left(Loc,17)' [37m'Left(Acc,9)' [33m'Right(Scs,3)' [35m'Rat' [32m'Right(ULs,9)' [36m'Right(DLs,9)' [34m'Right(C2D(SubStr(Data,i+153,2)),4)||CR
  k = k + 1; Bull = Bull||Out; ss Out
  if k = Trunc(k/(UNumLines-7))*(UNumLines-7) then do; ss CR'[36m([34mPause..[36m)[35m..'; GetChar; ss Header; end
 end
end
Out = '[4;33m                                                                                [0m'CR'[4;33;44m Nr of Users: 'Left(k,3)' | Total Nr Users 'Left(NrUsers,3)' | Perc 'Right(Trunc((k/NrUsers)*100),2)'% | Account ED V'VER' © Delusion [0m'CR; ss Out
if Index(Upper(File),'USER.') = 0 then if Open('Out',File,'W') = 1 then do
 WriteCH('Out','c'Bull||Out); Close('Out')
end; Drop Data Scs DLs ULs Nami Loc Acc MinA MaxA nbUL xbUL nbDL xbDL Bull Out
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

Save_Account:
ss 'Please wait saving account.          'CR
if Status = 'Inactive' then Status = 0
else Status = SlotNr

UserDate = Overlay(Left(Strip(Name)		,31,NUL),UserDate,  1)
UserDate = Overlay(Left(Strip(Loca)		,30,NUL),UserDate, 41)
UserDate = Overlay(Right(D2C(Status)		, 2,NUL),UserDate, 85)
UserDate = Overlay(D2C(Secs)			,UserDate, 88)
UserDate = Overlay(Right(D2C(RatioType)		, 2,NUL),UserDate, 89)
UserDate = Overlay(Right(D2C(Ratio)		, 2,NUL),UserDate, 91)
UserDate = Overlay(Left(ConfAcc			, 9,NUL),UserDate,137)
UserDate = Overlay(Right(D2C(Auto)		, 2,NUL),UserDate,151)
UserDate = Overlay(Right(D2C(Limi*60)		, 4,NUL),UserDate,163)
UserDate = Overlay(Right(D2C(Limi*60)		, 4,NUL),UserDate,167) /* Time_Total */
UserDate = Overlay(Right(D2C(ByteLimit)		, 4,NUL),UserDate,179)
UserDate = Overlay(Right(D2C(ChatLimit*60)	, 4,NUL),UserDate,193)
UserDate = Overlay(D2C(0)			,UserDate,232)

if Sec > (Enable - 1) then do
 UserDate = Overlay(Left(Strip(Pass)		, 9,NUL),UserDate, 32)
 UserDate = Overlay(Left(Strip(Phon)		,14,NUL),UserDate, 71)
 UserDate = Overlay(Right(D2C(MsgPosted)	, 2,NUL),UserDate, 95)
 UserDate = Overlay(Right(D2C(UpLoads)		, 2,NUL),UserDate,147)
 UserDate = Overlay(Right(D2C(DownLoads)	, 2,NUL),UserDate,149)
 UserDate = Overlay(Right(D2C(Calls)		, 2,NUL),UserDate,153)
 UserDate = Overlay(Right(D2C(TimeUsed*60)	, 4,NUL),UserDate,159)
 UserDate = Overlay(Right(D2C(DBytes)		, 4,NUL),UserDate,171)
 UserDate = Overlay(Right(D2C(UBytes)		, 4,NUL),UserDate,175)
 UserDate = Overlay(Right(D2C(ChatUsed*60)	, 4,NUL),UserDate,189)
 UserDate = Overlay(Right(D2C(DaysCred)		, 3,NUL),UserDate,198)
 UserDate = Overlay(Right(D2C(PaidCred)		, 2,NUL),UserDate,203)
 UserDate = Overlay(Right(D2C(DateCred)		, 4,NUL),UserDate,205)
 UserDate = Overlay(Right(D2C(TPayCred)		, 2,NUL),UserDate,211)
 UserDate = Overlay(Right(D2C(LastCred)		, 4,NUL),UserDate,213)
 UserDate = Overlay(Right(D2C(TracCred)		, 1,NUL),UserDate,217)
end

Seek('UserData',(SlotNr - 1) * 232,'B')
WriteCH('UserData',UserDate)

UserKeys = Overlay(Left(Name		,34,NUL),UserKeys, 1)
UserKeys = Overlay(Right(D2C(Status)	, 2,NUL),UserKeys,35)
UserKeys = Overlay(Right(D2C(ULCPS)	, 2,NUL),UserKeys,39)
UserKeys = Overlay(Right(D2C(DLCPS)	, 2,NUL),UserKeys,41)
UserKeys = Overlay(Right(D2C(BaudRate)	, 2,NUL),UserKeys,45)

Seek('UserKeys',(SlotNr - 1) * 56,'B')
WriteCH('UserKeys',UserKeys)

if Open('Back',DIR'QuestApp/'SlotNr'.Dat','A') = 0 then Open('Back',DIR'QuestApp/'SlotNr'.Dat','W')
 Seek('Back',0,'B'); WriteCH('Back',UserDate||UserKeys)
Close('Back')

if Log = 2 | Log = 3 then WriteLN('Log',DATE' Wrote 'Left(NAM,20)' Account #'Left(SlotNr,3)', At ('TIME()')')
ss '[21;1HAccount saved.                    'CR
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

Read_Account:
if SlotNr < 2 & USlotNr ~= 1 | SlotNr = USlotNr & Strip(Upper(EditOwn)) ~= 'ON' | SlotNr > NrUsers then SlotNr = NrUsers
if Seek('UserData',(SlotNr - 1) * 232,'B') = 0 & SlotNr ~= 1 then do
 ss CR'That account does not exist.         'CR;  Valid = 'No'
 return
end
ss CR'Please wait loading account.           'CR; Valid = 'Yes'
Seek('UserKeys',(SlotNr - 1) * 56,'B')
UserKeys = ReadCH('UserKeys',56)	/* All data & positions found out */
UserDate = ReadCH('UserData',232)	/* By Delusion 1992 for AccountED */
Read_ByPass:
Parse Value SubStr(UserDate,1,147) With Name (NUL) 31 Pass (NUL) 39 Loca (NUL) 68 Phon (NUL) 133 ConfAcc (NUL)

Status    = C2D(SubStr(UserDate,85,2))		/* Remeber: It's real lame*/
Secs      = C2D(SubStr(UserDate,88,1))		/* to ripp someone elses  */
RatioType = C2D(SubStr(UserDate,89,2))		/* hard work, if you ripp */
Ratio     = C2D(SubStr(UserDate,91,2))		/* my source, It will be  */
ComType   = C2D(SubStr(UserDate,93,2)) + 1	/* Your biggest mistake!  */
MsgPosted = C2D(SubStr(UserDate,95,2))		/* Count on that LAMER!   */
Protocol  = C2D(SubStr(UserDate,121,2))
AnsiType  = C2D(SubStr(UserDate,133,2))
Uploads   = C2D(SubStr(UserDate,147,2))
DownLoads = C2D(SubStr(UserDate,149,2))
Auto      = C2D(SubStr(UserDate,151,2))
Calls     = C2D(SubStr(UserDate,153,2))
LastOn    = C2D(SubStr(UserDate,155,4))
TimeUsed  = Trunc(C2D(SubStr(UserDate,159,4))/60)
Limi      = Trunc(C2D(SubStr(UserDate,163,4))/60)
DBytes    = C2D(SubStr(UserDate,171,4))
UBytes    = C2D(SubStr(UserDate,175,4))
ByteLimit = C2D(SubStr(UserDate,179,4))
ChatUsed  = Trunc(C2D(SubStr(UserDate,189,4))/60)
ChatLimit = Trunc(C2D(SubStr(UserDate,193,4))/60)
DaysCred  = C2D(SubStr(UserDate,198,3))
PaidCred  = C2D(SubStr(UserDate,203,2))
DateCred  = C2D(SubStr(UserDate,205,4))
TPayCred  = C2D(SubStr(UserDate,211,2))
LastCred  = C2D(SubStr(UserDate,213,4))
TracCred  = C2D(SubStr(UserDate,217,1))
NumLines  = C2D(SubStr(UserDate,231,1))
NewUser   = C2D(SubStr(UserDate,232,1))

ULCPS     = C2D(SubStr(UserKeys,39,2))
DLCPS     = C2D(SubStr(UserKeys,41,2))
BaudRate  = C2D(SubStr(UserKeys,45,2))

if ULCPS > 3000 then ULCPS = 0
if DLCPS > 3000 then DLCPS = 0
if BaudRate > 16800 then BaudRate = 14400
if DaysCred = 0 then do; DateCred = DateStamp; LastCred = DateStamp; end

if Log = 1 | Log = 3 | Log = 4 & Nam ~= Syso then WriteLN('Log',DATE' Read  'Left(NAM,20)' Account #'Left(SlotNr,3)', At ('TIME()')')
Rating = Trunc(((UBytes+(50000*(MsgPosted+Calls))-DBytes)/60000)+(Uploads-Downloads))

if Upper(ShowPass) = 'OFF' | SubStr(AmiX,2,1) = 3 then PassH = 'Not Displayed'; else PassH = Pass
if Status = SlotNr then Status = 'Active'; else Status = 'Inactive'
if NewUser = 0 then NewUser = 'No '; else NewUser = 'Yes'
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

Account_Loop:
Call ShowAccount
Do until Com = 'X'
 ss '[0 p[21;1H[33;44m'; if Com ~= 'Not' then ss 'Avaiting command.                           [21;1H'; GetChar; Com = Result
 if Com = '' then Call UpdateAccount
 if Com = '~' | Com = '*' then Call Save_Account
 if Com = '09'x & SName ~= '' | Com = '09'x & New = 'Y' then do; Call Search; return; end
 if Com = '0' then do;Status = 'Active';ss '[3;66H[0m'Left(Status,8)'[21;1H[33;44mAccount reactivated.                'CR; Com = 'Not';end
 if Com = '7F'x then do;Status = 'Inactive';ss '[3;66H[0m'Left(Status,8)'[21;1H[33;44mAccount deleted.                    'CR; Com = 'Not';end
 if Com = '-' then do;SlotNr=SlotNr-1 ;Call UpdateAccount;end
 if Com = '+' then do;SlotNr=SlotNr+1 ;Call UpdateAccount;end
 if Com = '[' then do;SlotNr=SlotNr-10;Call UpdateAccount;end
 if Com = ']' then do;SlotNr=SlotNr+10;Call UpdateAccount;end
 if Com > '`' & Com < 'z' then ss 'Editing account ..                '
 if Com = 'a' then Name = Change(Name,31,'5;21',Col)
 if Com = 'b' then Loca = Change(Loca,31,'6;21',Col)
 if Com = 'n' then Auto = Change(Auto,3,'9;61',Col)
 if SubStr(AmiX,2,4) >= '3.20' then do
  if Com = '!' & SEC >= CreditAcc then do; Call Credit_Account; Call ShowAccount; end
  if Com = 'v' then Limi = Change(Limi,8,'17;21',Col)
  if Com = 'u' then TimeUsed = Change(TimeUsed,8,'16;21',Col)
  if Com = 'y' then ChatUsed = ChatLimit - Change(ChatLimit-ChatUsed,7,'16;61',Col)
  if Com = 'z' then ChatLimit = Change(ChatLimit,7,'17;61',Col)
 end
 else do
  if Com = 'u' then Limi = Change(Limi,8,'17;17',Col)
  if Com = 'v' then TimeUsed = Change(TimeUsed,8,'17;48',Col)
 end
 if Com = '?' then do
  ShowFile (Dir'AccEd.HelpS'); GetChar
  ShowFile (Dir'AccEd.HelpC')
 end
 if Com = 'D' then do
  ss "Delete users questionary ? (y/N) : "; GetChar
  if Upper(Result) = 'Y' then do
   if Upper(Change('Yes..  Enter password: ',24,'21;36','','*','21;59')) = Upper(DelPass) then do
    if Open('Answer',DIR'QuestApp/'SlotNr,'R') = 1 then do
     Parse Value ReadLN('Answer') With OldName'  Slot:'.
     Close('Answer')
     Rename(DIR'QuestApp/'SlotNr,DIR'QuestDel/'Space(OldName,1,'-'))
     Rename(DIR'QuestApp/'SlotNr'.DAT',DIR'QuestDel/'Space(OldName,1,'-')'.DAT')
    end
    ss '[0 p[21;1H[33;44mQuestionary deleted..                                              'CR
   end
   else ss '[0 p[21;1H[33;44mWrong password.. Access denied!                                    'CR
  end
  else ss 'No..'; Com = 'Not'
 end
 if Com = 'W' then do
  ss 'Writing *Warning* message to user.  '
  Open('MS',Strip(BBSCONF)'MsgBase/MailStats','R')	/* Msg To MsgBase V1.03 Coded  */
   Num = C2D(SubStr(ReadLN('MS'),5,4))          	/* By Delusion/VTL. © DLS 1993 */
   Seek('MS',4,'B')
   WriteCH('MS',Right(D2C(Num+1),4,NUL))
  Close('MS')
  Open('HF',Strip(BBSCONF)'MsgBase/HeaderFile','A')
   WriteCH('HF','R'Right(D2C(Num),5,NUL)||Left(Name,31,NUL)||Left(Nam,31,NUL)||Left('«» Last Warning «»',32,NUL)||Left(D2C((252482400 + Time('S') + (86400 * Date('I')))),10,NUL))
  Close('HF')
  Open('NR',Strip(BBSCONF)'MsgBase/'NUM,'W')
   WriteCH('NR',"I've recognized that you do not do as well as you could with the Uploads"CF"and Downloads on this board. I wan't some more activity of yours or you"CF"will very soon get Deleted and all your credits will be lost forever!"CF' 'CF"[36mYour Uploads[34m....[35m: [32m"Left(UBytes,10)" [36mFiles[34m..[35m: [32m"Left(Uploads,4)" [36mCalls[34m..[35m: [32m"Calls'[0m'CF"[36mYour Downloads[34m..[35m: [32m"Left(DBytes,10)" [36mFiles[34m..[35m: [32m"Left(Downloads,4)"  [36mMsgs[34m..[35m: [32m"MsgPosted'[0m'CF" "CF"[3mThis is your first and only warning.. Signed: "Nam'[0m'CF' 'CF"[34mNote! I think it's very sad if I have to delete you for this, but this[0m"CF"[34m      is the only way to get some order on this board and to keep it Elite![0m"CF' 'CF"[35m** [32mAccount Ed V"Ver" by Delusion / Virtual[0m "CF)
  Close('NR')
 end
 if Com = '/' then do
  if Open('Quest',DIR'QuestApp/'SlotNr,'R') = 1 then do
   ss 'c'HEADER'[36m'; Out=''
   if Open('Back',DIR'QuestApp/'SlotNr'.Dat','R') = 1 then Stat = C2D(SubStr(ReadCH('Back',308),289,1))
   else Stat = 0; Close('Back'); if Stat ~= 0 & Stat ~= 1 & Stat ~= 2 then Stat = 0; Status.0 = 'Private'; Status.1 = 'Public'; Status.2 = 'Secret'
   Parse Value ReadLN('Quest') With Row1' Slot: 'Sl'  First Login: 'Da'Login PW: 'FirstPass; Row1 = Row1'['Sl']  Status: 'Status.Stat'  Login: 'Da
   Parse Value ReadLN('Quest') With Type' 'Quest
   if Pass = PassH then Row1 = Row1'Login PW: 'FirstPass
   else Row1 = Row1'Login PW: Not Displayed'
   if Type = '.' then do
    if Quest = '' then Quest = '1'
    Open('Questions',Dir'QuestQst/Questions.'Quest,'R')
    ss '[32m'Row1||CR||CR; Out = '[32m'Row1||CR||CR
    Do k = 1 to 1000 until eof('Questions')
     Parse Value ReadLN('Questions') With 1 ReadBuff 2 ReadType 3 ReadStat 4 Question
     if ReadBuff  = '~' then Show = '[35m'Question'[36m 'ReadLN('Quest')||CR
     if ReadBuff ~= '~' then Show = '[35m'Question||CR
     ss Show; Out = Out||Show; if k = Trunc(k/(UNumLines-5))*(UNumLines-5) then do; ss CR'[36m([34mPause..[36m)[35m..'; GetChar; if ~eof('Questions') then ss Header; end
    end
    Close('Questions')
   end
   else ShowFile (DIR'QuestApp/'SlotNr)
   Close('Quest')
   if Que("[36mDo you wan't to print questionary [35m?.. [34m([32mY/N[34m)[35m [0m: ","C","Y","Yes..","N","No..") = 'Y' & Upper(Printer) ~= 'OFF' then do
    if Out ~= '' then do
     Open('pf','prt:','W')
      WriteLN('pf',Out)
     Close('pf')
    end
    else Address Command 'Type 'DIR'QuestApp/'SlotNr' >PRT:'
   end
   Call ShowAccount
  end
  else do; ss "Users questionary doesn't exist!  "CR; Com = 'Not'; end
 end
 if Com = 'V' then do
  Nm  = Reverse(Name)
  Out = Left('',79)||Reverse("!knooolbaaaK  )hguonE si hguonE( ..gon arav ted råf un häN !!!!   ----   noissimbuS / eripmE - emmaD naV - seldøøD / eriZ-D - ISRT / recneliS ehT )0h0h siht EILLORCS LAER a s'ti seY( ot seog sniteerG  ..ti tuoba em llet dna draob ym llac dluohs uoy kniht I ,ti tuoba kniht uoy revetahw ,srood tseb ym fo eno s'ti kniht yllanosrep I ..neht rood looc siht tuoba kniht uoy od tahw yawyna lleW !! ): niaga tnuocca s'"Nm" htiw dnuora gniloof uoy erA ..eheH ??desirpruS !rood siht ni trap-llorcs neddih eht dnuof ylanif ev'uoy haeeY")
  Do i = 1 to Length(Out) + 1
   ss '[21;1H'SubStr(Out,i,78)
   Do k = 1 to 25; end
  end
 end
 if Com > 0 & Com < 10 then do
  if NrCom < Com then ss 'Preset 'Com' not configured sorry.   'CR
  else do
   if SubStr(AmiX,2,4) >= '3.20' then i = 21; else i = 17
   Secs      = Strip(AccL.Com) ; Ratio = Strip(RatI.Com) ; ConfAcc   = Strip(ConA.Com)
   RatioType = Strip(RatT.Com) ; Limi  = Strip(TimS.Com) ; ByteLimit = Strip(DaiB.Com); AutoRejoin = Strip(AutR.Com)
   ss 'Preset 'Com' ('Strip(Left(DesC.Com,15))') 'Left('loaded. ',Length(DesC.Com))||CR||Col'[9;21H'Left(Ratio,5,' ')'[10;21H'Left(RatioType,5,' ')
   ss '[15;21H'Left(ByteLimit,10,' ')'[17;'i'H'Left(Limi,8,' ')'[7;61H'ConfAcc' [8;61H'Secs'  [9;61H'AutoRejoin'  '
   if NewUser = 'Yes' then ss '[12;61H'NewUser
  end; Com = 'Not'
 end
 if Sec > (Enable - 1) then do
  if Com = 'c' & PassH = Pass then Pass = Change(Pass,8,'7;21',Col)
  if Com = 'c' & SubStr(AmiX,2,1) = 3 & Sec >= SeePass then do; ss '[44m[7;21H        [0m     [44;33m'; Pass = Change('',8,'7;21',Col); end
  if Com = 'C' & SubStr(AmiX,2,1) = 2 & Sec >= SeePass then do;if Pass = PassH then PassH = 'Not Displayed'; else PassH = Pass; ss '[7;21H'Col||Left(PassH,13); end
  if Com = 'd' then Phon = Change(Phon,12,'8;21',Col)
  if Com = 'e' then Ratio = Change(Ratio,2,'9;21',Col)
  if Com = 'f' then RatioType = Change(RatioType,1,'10;21',Col)
  if Com = 'g' then Uploads = Change(Uploads,4,'11;21',Col)
  if Com = 'G' then Uploads = Calcer(Uploads,4,'Uploaded Files','11;21')
  if Com = 'h' then DownLoads = Change(DownLoads,4,'12;21',Col)
  if Com = 'H' then DownLoads = Calcer(DownLoads,4,'Downloaded Files','12;21')
  if Com = 'i' then UBytes = Change(UBytes,10,'13;21',Col)
  if Com = 'I' then UBytes = Calcer(UBytes,10,'Uploaded Bytes','13;21')
  if Com = 'j' then DBytes = Change(DBytes,10,'14;21',Col)
  if Com = 'J' then DBytes = Calcer(DBytes,10,'Downloaded Bytes','14;21')
  if Com = 'k' then ByteLimit = Change(ByteLimit,10,'15;21',Col)
  if Com = 'K' then ByteLimit = Calcer(ByteLimit,10,'Byte Limit','15;21')
  if Com = 'o' then MsgPosted = Change(MsgPosted,5,'10;61',Col)
  if Com = 'p' then Calls = Change(Calls,5,'11;61',Col)
  if Com = 'l' then do
   Data = Change(ConfAcc,9,'7;61',Col)
   if SubStr(AmiX,2,1) = 2 then do; if NotAccC > 0 then if SubStr(Data,NotAccC,1) = ConfType & SubStr(ConfAcc,NotAccC,1) ~= ConfType then ss '[0 p[21;1H[33;44mConference 'Strip(NotAccC)' is protected.        [7;61H'Col||Left(ConfAcc,18); else ConfAcc = Data; end
   else do; if Upper(Data) = Upper(NotAccC) then ss '[0 p[21;1H[33;44mConference 'Strip(NotAccC)' is protected.        [7;61H'Col||Left(ConfAcc,18); else ConfAcc = Data; end
  end
  if Com = 'm' then do; Data = Change(Secs,3,'8;61',Col); if Sec < Data then ss '[0 p[8;61H'Col||Secs' '; else Secs = Data; end
  if Com = 'B' then do
   ss "Load backup of account ? (y/N) : "; GetChar
   if Upper(Result) = 'Y' then do
    ss 'Yes..'
    if Open('Back',DIR'QuestApp/'SlotNr'.Dat','R') = 1 then do
      UserDate = ReadCH('Back',232)
      UserKeys = ReadCH('Back',56)
      UserFlag = ReadCH('Back',20)
     Close('Back')
     Call Read_ByPass
     Call ShowAccount
    end
    else do; ss "[21;1HCouldn't find backup! Error!!         "CR; Com = 'Not'; end
   end
  end
  if Com  = '.' & Upper(Printer) ~= 'OFF' then do
   ss 'Please wait printing account.     'CR
   Out = HEADER'User Slot Number ['SlotNr'] 'Status' Speed ['BaudRate'] UL CPS ['ULCPS'] DL CPS ['DLCPS']   'CR||CR'A) Name ..........: 'Name||CR'B) Location ......: 'Left(Loca,39)||ConfShow||CR'C) Pass ..........: 'Left(PassH,20)'L) 'ConfName': 'ConfAcc||CR'D) Phone Number ..: 'Left(Phon,20)'M) Sec Level .....: 'Secs||CR'E) Ratio .........: 'Left(Ratio,20)'N) AutoReJoin ....: 'Auto||CR'F) Ratio Type ....: 'Left(RatioType,20)'*) Messages Posted: 'MsgPosted||CR'G) Uploads .......: 'Left(Uploads,20)'*) Total Calls ...: 'Calls||CR'H) Downloads .....: 'Left(DownLoads,20)'*) New User ......: 'NewUser||CR'I) Bytes Uled ....: 'Left(UBytes,20)'*) Last On .......: 'CalcDate(LastOn)||CR'J) Bytes Dled ....: 'Left(DBytes   ,20)'*) Computer Type .: 'Strip(Left(Strip(Com.ComType),18))||CR'K) Byte Limit ....: 'Left(ByteLimit,20)'*) Lines / Ansi ..: 'NumLines' / 'Strip(Ansi.AnsiType)||CR
   Ou2 = CR||CR'[1mVirtual - Quality Above Your Imagination - We Are The Worlds No.1 Door Makers[0m'CR||CR'Printed: 'DATE()' 'Time()'  By: 'NAM||CR||CR
   Open('pf','prt:','W')
    if SubStr(AmiX,2,4) >= '3.20' then WriteLN('pf',Out'U) Time Used......: 'Left(TimeUsed,20)'Y) Chat Used......: 'ChatLimit-ChatUsed||CR'V) Time Limit.....: 'Left(Limi,20)'Z) Chat Limit.....: 'ChatLimit||CR||CR'Overall User Rating: 'Rating||Ou2)
    else WriteLN('pf',Out||CR'U) Time_Limit: ['Left(Limi,8)'] secs  V) Time_Used: ['Left(TimeUsed,8)'] secs  *) Rate: 'Rating||Ou2)
   Close('pf')
   ss '[21;1HPhew! Account 'SlotNr' printed.     'CR; Drop Out Ou2
  end
 end
end
ss 'Exit no save.                     'CR'[0m'
Drop SlotNr Name Loca Pass PassH Phon Ratio ConfAcc RatioType Secs Uploads Auto DownLoads MsgPosted ULCPS DLCPS UBytes NewUser Calls DBytes NumLines ByteLimit Limi TimeUsed Com Status UserDate BaudRate
Return

/* ------------------------- Delusion 'n Virtual ------------------------- */

Change: Procedure		   /* Query Routine: Originally coded for  */
i = 1; Data = Arg(1)	 	   /* Quest(tm) & Connect(tm) by DLS of VTL*/
Parse Value Arg(3) With YY';'XX    /* Sntx: Change(Var,Lenght,X;Y,Col,Type)*/

sendmessage '['Arg(3)'H'Left(Data,Arg(2))'['Arg(3)'H'
if Arg(5) = '*' then Data = ''; L = length(Data)

Do until Input = 'D'x
 GetChar; Input = Result
 if Input > '1F'x & Input < '7F'x & L < Arg(2) then do; Data = Insert(Input,Data,i-1); i = i + 1; L = L + 1; end
 if Input = '08'x & i > 1                      then do; Data = SubStr(Data,1,i-2)||SubStr(Data,i,L-i+1)' '; i = i - 1; L = L - 1; end
 if Input = '7F'x & i <= L & Arg(5) ~= '*'     then do; Data = SubStr(Data,1,i-1)||SubStr(Data,i+1,L-i+1); L = L - 1; end
 if Arg(5) = '*' then sendmessage '['Arg(6)'H'Left('',L,'*')
 else sendmessage '['Arg(3)'H'Left(Data,Arg(2))'[21;64HPos: 'Right(i,2)' Len: 'Right(L,2)
end
if Arg(5) = '*' then sendmessage '0D 0A'x
else sendstring '[0m'Arg(4)'['Arg(3)'H'Left(Data,Arg(2))'[21;64H[44m               '
return Data

Calcer: Procedure Expose SS CR Col	/* Calcer(Variabel,Lenght,Text,X;Y) */
Type = Que('[21;1H                                  [21;1H'Arg(3)' = 'Arg(1)' ','C')
if Type ~= '-' & Type ~= '*' & Type ~= '/' then Type = '+'; ss Type
Data = Change('',Arg(2),'[21;'Length(Arg(1))+7+Length(Arg(3)),'[33;44m')
Calc = Arg(1)
if DataType(Data,'N') = 1 then do
 if Type = '+' then Data = Arg(1) + Data
 if Type = '-' then Data = Arg(1) - Data
 if Type = '*' then Data = Arg(1) * Data
 if Type = '/' then Data = Arg(1) / Data
 if Data > -1 & Data < 10000000000 then Calc = Trunc(Data)
 else Calc = Arg(1)
 ss '[0 p'Col'['Arg(4)'H'Left(Calc,10)
end
return Calc

Que: Procedure
if Arg(2) ~= 'C' then do; Query Arg(1); Buffer = Strip(Upper(Result)); end
if Arg(2)  = 'C' then do
 sendmessage Arg(1); GetChar; Buffer = Upper(Result)
 if Buffer = Arg(3) then transmit Arg(4)
 if Buffer = Arg(5) then transmit Arg(6)
end
return Buffer

CalcDate: Procedure
if Arg(1) > 252482400 then do
 LastOn = (Arg(1) - 252482400) / 86400	      /* TimeStampCalc © DLS/VTL 93 */
 LastOn = SubStr(Date('N',Trunc(LastOn)),1,6)' 'SubStr(Date('N',Trunc(LastOn)),10,2)' 'Right(Trunc((LastOn - Trunc(LastOn)) * 24),2,'0')':'Right(Trunc((LastOn * 24 - Trunc(LastOn * 24)) * 60),2,'0')':'Right(Trunc((LastOn * 1440 - Trunc(LastOn * 1440)) * 60),2,'0')
end
else LastOn = 'Error in Date'
return LastOn

MsgLog: Procedure Expose Nam Date Dir
sendmessage Arg(1)
if Open('Log',Dir'AccEd.Log','A') = 0 then Open('Log',Dir'AccEd.Log','W')
 GetUser 100; WriteLN('Log',Translate(Date(U),'-','/')' Error 'Left(Result,20)' 'Arg(2)' ('TIME()')')
Close('Log')
Shutdown; Exit
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

UpdateAccount:
ss '[20;1H';Call Read_Account
ss '[3;19H[0;36m'Right(SlotNr,3)'[3;31H'Right(BaudRate,5)'[3;46H'Right(ULCPS,4)'[3;60H'
ss Right(DLCPS,4)'[3;66H[0m'Left(Status,8)||CR||CR||Col'[5;21H'Left(Name,34)'[6;21H'Left(Loca,34)'[7;21H'PassH'      [8;21H'Left(Phon,13)'[9;21H'
ss Ratio' [10;21H'RatioType' [11;21H'Left(Uploads,5)'[12;21H'Left(DownLoads,5)'[13;21H'Left(UBytes,10)'[14;21H'Left(DBytes,10)'[15;21H'Left(ByteLimit,10)
if SubStr(AmiX,2,4) >= '3.20' then ss '[16;21H'Left(TimeUsed,8)'[17;21H'Left(Limi,8)'[16;61H'Left(ChatLimit-ChatUsed,8)'[17;61H'Left(ChatLimit,8)'[19;70H'Rating'      '
else ss '[17;17H'Left(Limi,8)'[17;48H'Left(TimeUsed,8)'[17;73H'Rating'      '
ss '[7;61H'Left(ConfAcc,18)'[8;61H'Secs'  [9;61H'Auto
ss '[10;61H'MsgPosted'   [11;61H'Calls'   [12;61H'NewUser'[13;61H'CalcDate(LastOn)'[14;61H'Left(Strip(Com.ComType),18)'[15;61H'NumLines' / 'Left(Strip(Ansi.AnsiType),13)
return

ShowAccount:
ss HEADER'[35mUser Slot Number[34m [[36m'Right(SlotNr,3)'[34m]'
ss ' [35mSpeed [34m[[36m'Right(BaudRate,5)'[34m] [35mUL-CPS [34m[[36m'Right(ULCPS,4)'[34m] [35mDL-CPS [34m[[36m'Right(DLCPS,4)'[34m] [0m'Status||CR||CR
ss '[35mA[34m)[36m Name [34m..........[35m: 'Col||Name||CR
ss '[35mB[34m)[36m Location [34m......[35m: 'Col||Left(Loca     ,39)||ConfShow||CR
ss '[35mC[34m)[36m Pass [34m..........[35m: 'Col||Left(PassH    ,20)'[35mL[34m)[36m 'ConfName'[35m: 'Col||ConfAcc||CR
ss '[35mD[34m)[36m Phone Number [34m..[35m: 'Col||Left(Phon     ,20)'[35mM[34m)[36m Sec Level [34m.....[35m: 'Col||Secs||CR
ss '[35mE[34m)[36m Ratio [34m.........[35m: 'Col||Left(Ratio    ,20)'[35mN[34m)[36m AutoReJoin [34m....[35m: 'Col||Auto||CR
ss '[35mF[34m)[36m Ratio Type [34m....[35m: 'Col||Left(RatioType,20)'[35mO[34m)[36m Messages Posted[35m: 'Col||MsgPosted||CR
ss '[35mG[34m)[36m Uploads [34m.......[35m: 'Col||Left(Uploads  ,20)'[35mP[34m)[36m Total Calls [34m...[35m: 'Col||Calls||CR
ss '[35mH[34m)[36m Downloads [34m.....[35m: 'Col||Left(DownLoads,20)'[35m*[34m)[36m New User [34m......[35m: 'Col||NewUser||CR
ss '[35mI[34m)[36m Bytes Uled [34m....[35m: 'Col||Left(UBytes   ,20)'[35m*[34m)[36m Last On [34m.......[35m: 'Col||CalcDate(LastOn)||CR
ss '[35mJ[34m)[36m Bytes Dled [34m....[35m: 'Col||Left(DBytes   ,20)'[35m*[34m)[36m Computer Type [34m.[35m: 'Col||Strip(Left(Strip(Com.ComType),18))||CR
ss '[35mK[34m)[36m Byte Limit [34m....[35m: 'Col||Left(ByteLimit,20)'[35m*[34m)[36m Lines / Ansi [34m..[35m: 'Col||NumLines' / 'Strip(Ansi.AnsiType)||CR
if SubStr(AmiX,2,4) >= '3.20' then do
 ss '[35mU[34m)[36m Time Used[34m......[35m: 'Col||Left(TimeUsed ,20)'[35mY[34m)[36m Chat Used[34m......[35m: 'Col||ChatLimit-ChatUsed||CR
 ss '[35mV[34m)[36m Time Limit[34m.....[35m: 'Col||Left(Limi     ,20)'[35mZ[34m)[36m Chat Limit[34m.....[35m: 'Col||ChatLimit||CR
 ss CR'[35mX[34m=[36mExit No Save  [35m~[34m=[36mSave  [35m![34m=[36mCredit  [35m1-9[34m=[36mPresets  [35m?[34m=[36mHelp  [34m([35m/[34m)[0m  [35m*[34m)[36m Rate[35m: 'Col||Rating||CR||CR
end
else do
 ss CR'[35mU[34m)[36m Time Limit[35m: [34m['Col||Left(Limi,8)'[34m][36m secs  [35mV[34m)[36m Time Used[35m: [34m['Col||Left(TimeUsed,8)'[34m][36m secs  [35m*[34m)[36m Rate[35m: 'Col||Rating||CR
 ss CR'[35mX[34m=[36mExit No Save  [35m~[34m=[36mSave  [35m1-9[34m=[36mPresets  [35m0[34m=[36mReactivate  [35mDEL[34m=[36mDelete  [34m([35m+/-[34m)  ([35m?[34m)  ([35m/[34m)[0m'CR||CR
end
ss '[21;1H[33;44m                                                                              '
return

/* ------------------------- Delusion 'n Virtual ------------------------- */

Error: ; Syntax:
MsgLog(CR||CR'[0mAn Error/Syntax Error Has Occured In The Main Program On Line #'sigl'! Exiting...'CR'Please Notify SYSOP. Or Delusion if Possible.'CR||CR,'Syntax Error on line #'Sigl)
Close('Log'); SHUTDOWN; EXIT

IOerr:
MsgLog(CR||CR'[0mA File Error Has Occured In The Main Program On Line #'sigl'! Exiting...'CR'Please Notify SYSOP. Or Delusion if Possible.'CR||CR,'File Error on line #'Sigl)
Close('Log'); SHUTDOWN; EXIT

/* Nice source, ehh ? I hope you're impressed anyway! Cu l8er DUDE and do  */
/* Not steal all of my nice & clean code OK ? Signed: Delusion of Virtual  */