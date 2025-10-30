/* ----------------------------------------------------------------------- */
/*   PW Fail V1.01 written by Delusion Of Virtual In 1993. © DLS/VTL 93.   */
/*                                                                         */
/*  Version 1.00 Created 05-08-93  ««---»»  Version 1.01 Created 11-25-93  */
/*                                                                         */
/* »» Except No Cheap Imitations Virtual Is The Worlds No.1 Door Makers «« */
/* ----------------------------------------------------------------------- */
parse arg node;options results;signal on syntax;signal on error;signal on ioerr;address value "AERexxControl"node;k=1
tr=transmit;ss=sendmessage;CR='0D 0A'x;addlib('rexxsupport.library',0,-30);NUL='0'x;DIR='DOORS:Arexx/Account/';VER='1.01';DATE=Translate(Date(U),'-','/')

GetUser  12 ; SYSO=Result; GetUser 100 ; NAMI=Result
GetUser 104 ; SLOT=Result; GetUser 105 ; SECS=Result

tr CR'[44;33mPW Fail V'VER' by Delusion of Virtual for Insanity BBS +46(0)589-ELITE[0m'CR

Open('Data',DIR'AccEd.Presets','R')
 Parse Value ReadCH('Data',2349) With 2196 BBSConf'|' 2282 ToName'|'
 ToName = Strip(ToName); BBSConf = Strip(BBSConf)'MsgBase/'
Close('Data')
if Open('Log','BBS:Node'Node'/CallersLog','R') = 1 then do
 Seek('Log',-87,'E')
 Parse Value ReadCH('Log',87) With '('Fail1')'.'('Fail2')'.'('Fail3')'
 Close('Log')
end
if Open('PLog',Dir'PFail.Log','A') = 0 then Open('PLog',Dir'PFail.Log','W')
 WriteLN('PLog',Left(Nami,22)' 'Date' 'Time()' Pw: 'Left('('Fail1')',10)' 'Left('('Fail2')',10)' 'Left('('Fail3')',10))
Close('PLog')

/* --------------I-N-S-A-N-i-T-Y--+-4-6-(-0-)-5-8-9-E-L-I-T-E------------- */

tr '[36mYou now have the oppurtunity to leave a message to [32m'ToName'[35m!'CR
Query '[35mYour real name [34m...................[33m: [0m'; Name = Result; if Name = '' then do;PutUser 511;SHUTDOWN;EXIT;end
Query '[35mYour real address (1/3) [34m..........[33m: [0m'; Add1 = Result
Query '[35mYour real address (2/3) [34m..........[33m: [0m'; Add2 = Result
Query '[35mYour real address (3/3) [34m..........[33m: [0m'; Add3 = Result
Query '[35mYour security code [34m...............[33m: [0m'; Numb = Result
Query '[35mYour voice phone number [34m..........[33m: [0m'; Phon = Result
Query '[35mThe password you think you have [34m..[33m: [0m'; OPas = Result
Query '[35mThe new desired password [34m.........[33m: [0m'; NPas = Result

/* --------------I-N-S-A-N-i-T-Y--+-4-6-(-0-)-5-8-9-E-L-I-T-E------------- */

tr CR'[33mTell 'ToName' some short info about yourself so you can get validated.'CR
tr '                       [32m([33m------------------------------[32m)'
tr '     [36mTo[33m: [32m([33mEnter[32m)[0m=[32m*[33mALL[32m*? [0m'ToName
tr "[36mSubject[33m: [32m([33mBlank[32m)[0m=[33mabort[32m? [0mPassword Failure.."

Open('MS',BBSCONF'MailStats','R')	       /* Msg To MsgBase V1.03 Coded  */
 Num = C2D(SubStr(ReadLN('MS'),5,4))           /* By Delusion/VTL. © DLS 1993 */
 Do until Exists(BBSCONF||NUM)
  PutUstr BBSCONF||NUM
  PutUser 9
 end
 Open('Msg',BBSCONF||NUM,'A')
  WriteLN('Msg','0A'x||'[33m+-------------------------------------------------------------------+[0m')
  WriteLN('Msg','[33m|'Center('[36mUser Slot Nr[35m: [0m'Slot'  [36mDate[35m: [0m'Date' [34m([0m'Time()'[34m)  [36mSecurity Level[35m: [0m'Secs,122)' [33m|[0m')
  WriteLN('Msg','[33m+---------------------------------+---------------------------------+[0m')
  WriteLN('Msg','[33m|  [36mName[34m......[35m: [0m'Left(Name,18)' [33m|  [36mSecurity Code[34m..[35m: [0m'Left(Numb,13)' [33m|[0m')
  WriteLN('Msg','[33m|  [36mAddress 1[34m.[35m: [0m'Left(Add1,18)' [33m|  [36mVoice Phone Nr[34m.[35m: [0m'Left(Phon,13)' [33m|[0m')
  WriteLN('Msg','[33m|  [36mAddress 2[34m.[35m: [0m'Left(Add2,18)' [33m|  [36mOld Password[34m...[35m: [0m'Left(OPas,13)' [33m|[0m')
  WriteLN('Msg','[33m|  [36mAddress 3[34m.[35m: [0m'Left(Add3,18)' [33m|  [36mNew Password[34m...[35m: [0m'Left(NPas,13)' [33m|[0m')
  WriteLN('Msg','[33m+---------------------------------+---------------------------------+[0m')
  WriteLN('Msg','[33m| [35mFailed Passwords[36m: [32m'Left(Strip(Fail1)', 'Strip(Fail2)', 'Strip(Fail3),47)' [33m|[0m')
  WriteLN('Msg','[33m+-------------------------------------------------------------------+[0m')
  WriteLN('Msg','[37mPassword Fail V'VER' by Delusion of Virtual - Insanity +46(0)589-ELITE[0m')
 Close('Msg')
 Seek('MS',4,'B')
 WriteCH('MS',Right(D2C(Num+1),4,NUL))
Close('MS')
Open('HF',BBSCONF'HeaderFile','A')
 WriteCH('HF','R'Right(D2C(Num),5,NUL)||Left(ToName,31,NUL)||Left(Nami,31,NUL)||Left("Password Failure..",32,NUL)||Left(D2C((252482400 + Time('S') + (86400 * Date('I')))),10,NUL))
Close('HF')
GetUser 142; Toggle = Result
ss CR||CR"[36mDo you wan't to try to operate "SYSO" ? [0m"; GetChar; Ans = Upper(Result)
if Toggle = 'ON' & Ans = 'Y' then do
 ss 'Yes..'CR||CR'[32mOperating [35m'SYSO'[36m! [0m[0 p'
 Do i = 1 to 17
  ss '07'x||'«» '
  Do h = 1 to 50; end
 end
 tr CR'[ pOperator Paged.'
end
else do
 if Ans  = 'Y' then tr 'Yes'CR||CR'Sorry sysop is not available right now!'
 else tr 'No..'
end
tr CR'[35m'ToName' will review your information and you will normaly have full access to'
tr 'the system again within 24 Hours! Next time you call use the 'NPas
tr 'password instead of your old!'CR
tr '[33mDropping carrier call back after 24 Hrs..'
tr CR'						            [34;1m/\/[0;35m Virtual [34;1m/\/[0m 1993[ p'CR
PutUser 511;SHUTDOWN;EXIT

/* --------------I-N-S-A-N-i-T-Y--+-4-6-(-0-)-5-8-9-E-L-I-T-E------------- */

Error: ; Syntax: ; IOerr:
tr CR'[0mAn Error Has Occured In The Main Program On Line #'sigl'! Exiting...'
tr 'Please Notify 'SYSO'. Or Delusion If It Is Possible.'CR
PutUser 511;SHUTDOWN;EXIT
