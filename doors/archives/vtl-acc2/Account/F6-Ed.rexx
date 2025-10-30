/* ----------------------------------------------------------------------- */
/*  F6! Acc ED V1.01 written by Delusion Of Virtual In 1994. © DLS/VTL 94  */
/*                                                                         */
/*  Version 1.00 Created 06-01-93  ««---»»  Version 1.01 Created 04-07-94  */
/*                                                                         */
/* »» Except No Cheap Imitations Virtual Is The Worlds No.1 Door Makers «« */
/* ----------------------------------------------------------------------- */
parse arg node; if ~exists('BBS:Node'NODE'.User') then do; Address Command 'RX DOORS:Arexx/Account/AccED.rexx 'Node; ShutDown; Exit; end

options results;signal on syntax;signal on error;signal on ioerr;ss=sendmessage; address value "AERexxControl"node; ss 'c[0 p[35mAccount ED is Loading ..'
GetUser 104; SlotNr = Result; Sec = 255; GetUser 152; AmiX = Result;Dir='DOORS:Arexx/Account/'; CR='0D 0A'x; CF='0A'x; NUL='0'x; Com=0; VER='1.01'; BS='8'x; ConfName='Conf Access [34m...';ConfShow='[34m([35m123456789[34m)'
HEADER = 'c[0 p[34mVirtual [32mF6 Editor[34m V'VER' For [32m/X 'SubStr(AmiX,2,4)' [34mBy [35mDelusion / VTL. [34mINSANiTY [36m+46(0)589-ELITE'CR||CR

/* ------------------------- Delusion 'n Virtual ------------------------- */

if Open('Data',DIR'AccEd.Presets','R') = 1 then do
 Parse Value ReadCH('Data',2349) With NrCom'-' 63 PVer'-' 85 (CF) InPut 936 Com.10'|' (CF) '|'.'|'Com.11'|' 1144 UserData'|' 1190 Com.12'|' 1229 UserKeys'|' 1275 Com.13'|' 1361 Com.14'|' 1447 Com.15'|' 1526 ShowPass'|' 1532 Com.16'|' 1618 Com.17'|' 1657 Col'|' 1703 Com.18'|' 1789 Com.19'|'
 Parse Value InPut With '|'DesC.1'|'AccL.1'| 'RatT.1' | 'RatI.1' | 'AutR.1' |'DaiB.1'| 'ConA.1' |'TimS.1'|'Com.1'|' (CF) '|'DesC.2'|'AccL.2'| 'RatT.2' | 'RatI.2' | 'AutR.2' |'DaiB.2'| 'ConA.2' |'TimS.2'|'Com.2'|' (CF) '|'DesC.3'|'AccL.3'| 'RatT.3' | 'RatI.3' | 'AutR.3' |'DaiB.3'| 'ConA.3' |'TimS.3'|'Com.3'|' (CF) '|'DesC.4'|'AccL.4'| 'RatT.4' | 'RatI.4' | 'AutR.4' |'DaiB.4'| 'ConA.4' |'TimS.4'|'Com.4'|' (CF) '|'DesC.5'|'AccL.5'| 'RatT.5' | 'RatI.5' | 'AutR.5' |'DaiB.5'| 'ConA.5' |'TimS.5'|'Com.5'|' (CF) '|'DesC.6'|'AccL.6'| 'RatT.6' | 'RatI.6' | 'AutR.6' |'DaiB.6'| 'ConA.6' |'TimS.6'|'Com.6'|' (CF) '|'DesC.7'|'AccL.7'| 'RatT.7' | 'RatI.7' | 'AutR.7' |'DaiB.7'| 'ConA.7' |'TimS.7'|'Com.7'|' (CF) '|'DesC.8'|'AccL.8'| 'RatT.8' | 'RatI.8' | 'AutR.8' |'DaiB.8'| 'ConA.8' |'TimS.8'|'Com.8'|' (CF) '|'DesC.9'|'AccL.9'| 'RatT.9' | 'RatI.9' | 'AutR.9' |'DaiB.9'| 'ConA.9' |'TimS.9'|'Com.9'|' (CF)
 Close('Data'); Col = Strip(Col)
 if SubStr(AmiX,2,1) = 3 then do; ConfShow='[34m([35mConf Level[34m)'; ConfName = 'Area Name [34m.....'; end
end

Name	  = LoadDat(100)	; Pass      = LoadDat(101)
Loca	  = LoadDat(102)	; Phon      = LoadDat(103)
ConfAcc	  = LoadDat(146)	; Secs      = LoadDat(105)
RatioType = LoadDat(106)	; Ratio     = LoadDat(107)
ComType	  = LoadDat(108) + 1	; MsgPosted = LoadDat(109)
Uploads	  = LoadDat(110)	; DownLoads = LoadDat(111)
Auto	  = LoadDat(510) + 1	; Calls     = LoadDat(112)
LastOn	  = LoadDat(143)	; TimeUsed  = LoadDat(114)
Limi	  = LoadDat(115)	; DBytes    = LoadDat(118)
UBytes	  = LoadDat(117)	; ByteLimit = LoadDat(119)
NumLines  = LoadDat(122)	; BaudRate  = LoadDat(516)
NewUser	  = 'No'		; Status    = 'Active'

if Upper(ShowPass) = 'ON' then PassH = Pass; if Upper(ShowPass) ~= 'ON' then PassH = 'Not Displayed'

/* ------------------------- Delusion 'n Virtual ------------------------- */

ss HEADER'[35mUser Slot Number[34m [[36m'Right(SlotNr,3)'[34m]'
ss ' [35mSpeed [34m[[36m'Right(BaudRate,5)'[34m] [0m'Status||CR||CR
ss '[35mA[34m)[36m Name [34m..........[35m: 'Col||Name||CR
ss '[35mB[34m)[36m Location [34m......[35m: 'Col||Left(Loca     ,39)||ConfShow||CR
ss '[35mC[34m)[36m Pass [34m..........[35m: 'Col||Left(PassH    ,20)'[35mL[34m)[36m 'ConfName'[35m: 'Col||ConfAcc||CR
ss '[35mD[34m)[36m Phone Number [34m..[35m: 'Col||Left(Phon     ,20)'[35mM[34m)[36m Sec Level [34m.....[35m: 'Col||Secs||CR
ss '[35mE[34m)[36m Ratio [34m.........[35m: 'Col||Left(Ratio    ,20)'[35mN[34m)[36m AutoReJoin [34m....[35m: 'Col||Auto||CR
ss '[35mF[34m)[36m Ratio Type [34m....[35m: 'Col||Left(RatioType,20)'[35mO[34m)[36m Messages Posted[35m: 'Col||MsgPosted||CR
ss '[35mG[34m)[36m Uploads [34m.......[35m: 'Col||Left(Uploads  ,20)'[35mP[34m)[36m Total Calls [34m...[35m: 'Col||Calls||CR
ss '[35mH[34m)[36m Downloads [34m.....[35m: 'Col||Left(DownLoads,20)'[35m*[34m)[36m New User [34m......[35m: 'Col||NewUser||CR
ss '[35mI[34m)[36m Bytes Uled [34m....[35m: 'Col||Left(UBytes   ,20)'[35m*[34m)[36m Last On [34m.......[35m: 'Col||SubStr(LastOn,9,2)' 'SubStr(LastOn,5,3)' 'SubStr(LastOn,23,2)' 'SubStr(LastOn,12,8)||CR
ss '[35mJ[34m)[36m Bytes Dled [34m....[35m: 'Col||Left(DBytes   ,20)'[35m*[34m)[36m Computer Type [34m.[35m: 'Col||Strip(Left(Strip(Com.ComType),18))||CR
ss '[35mK[34m)[36m Byte Limit [34m....[35m: 'Col||Left(ByteLimit,20)'[35m*[34m)[36m Num Lines [34m.....[35m: 'Col||NumLines||CR||CR
ss '[35mU[34m)[36m Time Limit[35m: [34m['Col||Left(Limi,8)'[34m][36m secs  [35mV[34m)[36m Time Used[35m: [34m['Col||Left(TimeUsed,8)'[34m][36m secs  [35m*[34m)[36m Rate[35m: 'Col||Trunc(((UBytes+(50000*(MsgPosted+Calls))-DBytes)/60000)+(Uploads-Downloads))||CR
ss CR'[35mX[34m=[36mExit No Save  [35m~[34m=[36mSave  [35m1-9[34m=[36mPresets  [35m0[34m=[36mReactivate  [35mDEL[34m=[36mDelete[0m'CR||CR
ss '[21;1H[33;44m                                                                              '

/* ------------------------- Delusion 'n Virtual ------------------------- */

Do until Com = 'X'
 ss '[0 p[21;1H[33;44m'; if Com ~= 'Not' then ss 'Avaiting command.                           [21;1H'; GetChar; Com = Result
 if Com = '~' | Com = '*' then do
  ss 'Please wait saving account.          'CR
  SaveDat(Name,100)	; SaveDat(Pass,101)	; SaveDat(Loca,102)
  SaveDat(Phon,103)	; SaveDat(ConfAcc,146)	; SaveDat(Secs,105)
  SaveDat(RatioType,106); SaveDat(Ratio,107)	; SaveDat(MsgPosted,109)
  SaveDat(Uploads,110)	; SaveDat(DownLoads,111); SaveDat(Auto-1,510)
  SaveDat(Calls,112)	; SaveDat(TimeUsed,114)	; SaveDat(Limi,115)
  SaveDat(DBytes,118)	; SaveDat(UBytes,117)	; SaveDat(ByteLimit,119)
  ss '[21;1HAccount saved.                    'CR
 end
 if Com = '0' then do;Status = 'Active';ss '[3;38H[0m'Left(Status,8)'[21;1H[33;44mAccount reactivated.                'CR; Com = 'Not';end
 if Com = '7F'x then do;Status = 'Inactive';ss '[3;38H[0m'Left(Status,8)'[21;1H[33;44mAccount deleted.                    'CR; Com = 'Not';end
 if Com > '`' & Com < 'w' then ss 'Editing account ..                '
 if Com = 'a' then Name = Change(Name,31,'5;21',Col)
 if Com = 'b' then Loca = Change(Loca,31,'6;21',Col)
 if Com = 'n' then Auto = Change(Auto,3,'9;61',Col)
 if Com = 'u' then Limi = Change(Limi,8,'17;17',Col)
 if Com = 'v' then TimeUsed = Change(TimeUsed,8,'17;48',Col)
 if Com = 'c' & PassH = Pass then Pass = Change(Pass,8,'7;21',Col)
 if Com = 'c' & SubStr(AmiX,2,1) = 3 then do; ss '[44m[7;21H        [0m     [44;33m'; Pass = Change('',8,'7;21',Col); end
 if Com = 'C' & SubStr(AmiX,2,1) = 2 then do;if Pass = PassH then PassH = 'Not Displayed'; else PassH = Pass; ss '[7;21H'Col||Left(PassH,13); end
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
 if Com = 'm' then Secs = Change(Secs,3,'8;61',Col)
 if Com = 'l' then ConfAcc = Change(ConfAcc,9,'7;61',Col)
 if Com > 0 & Com < 10 then do
  if NrCom < Com then ss 'Preset 'Com' not configured sorry.   'CR
  else do
   Secs      = Strip(AccL.Com) ; Ratio = Strip(RatI.Com) ; ConfAcc   = Strip(ConA.Com)
   RatioType = Strip(RatT.Com) ; Limi  = Strip(TimS.Com) ; ByteLimit = Strip(DaiB.Com); AutoRejoin = Strip(AutR.Com)
   ss 'Preset 'Com' ('Strip(Left(DesC.Com,15))') 'Left('loaded. ',Length(DesC.Com))||CR||Col'[9;21H'Left(Ratio,5,' ')'[10;21H'Left(RatioType,5,' ')
   ss '[15;21H'Left(ByteLimit,10,' ')'[17;17H'Left(Limi,8,' ')'[7;61H'ConfAcc' [8;61H'Secs'  [9;61H'AutoRejoin'  '
   if NewUser = 'Yes' then ss '[12;61H'NewUser
  end; Com = 'Not'
 end
end
ss 'Exit no save.                     'CR'[0m'
SHUTDOWN; EXIT

/* ------------------------- Delusion 'n Virtual ------------------------- */

Change: Procedure		   /* Query Routine: Originally coded for  */
i = 1; Data = Arg(1)	 	   /* Quest(tm) & Connect(tm) by DLS of VTL*/
Parse Value Arg(3) With YY';'XX    /* Sntx: Change(Var,Lenght,X;Y,Col,Type)*/

sendmessage '['Arg(3)'H'Left(Data,Arg(2))'['Arg(3)'H'; L = length(Data)

Do until Input = 'D'x
 GetChar; Input = Result
 if Input > '1F'x & Input < '7F'x & L < Arg(2) then do; Data = Insert(Input,Data,i-1); i = i + 1; L = L + 1; end
 if Input = '08'x & i > 1                      then do; Data = SubStr(Data,1,i-2)||SubStr(Data,i,L-i+1)' '; i = i - 1; L = L - 1; end
 if Input = '7F'x & i <= L & Arg(5) ~= '*'     then do; Data = SubStr(Data,1,i-1)||SubStr(Data,i+1,L-i+1); L = L - 1; end
 sendmessage '['Arg(3)'H'Left(Data,Arg(2))'[21;64HPos: 'Right(i,2)' Len: 'Right(L,2)
end
sendstring '[0m'Arg(4)'['Arg(3)'H'Left(Data,Arg(2))'[21;64H[44m               '
return Data

Calcer: Procedure Expose SS CR Col	/* Calcer(Variabel,Lenght,Text,X;Y) */
Type = Que('[21;1H                                  [21;1H'Arg(3)' = 'Arg(1)' [ p','C')
if Type ~= '-' & Type ~= '*' & Type ~= '/' then Type = '+'; ss Type
Data = Change('',Arg(2),'[21;'Length(Arg(1))+7+Length(Arg(3)),'[33;44m')
Calc = Arg(1)
if DataType(Data,'N') = 1 then do
 if Type = '+' then Data = Arg(1) + Data
 if Type = '-' then Data = Arg(1) - Data
 if Type = '*' then Data = Arg(1) * Data
 if Type = '/' then Data = Arg(1) / Data
 if Data > -1 & Data < 9999999999 then do
  Calc = Trunc(Data)
  ss '[0 p'Col'['Arg(4)'H'Left(Calc,10)
 end
end
return Calc

Que: Procedure
sendmessage Arg(1); GetChar; Buffer = Upper(Result)
if Buffer = Arg(3) then transmit Arg(4)
if Buffer = Arg(5) then transmit Arg(6)
return Buffer

SaveDat: Procedure
PutUstr Arg(1); PutUser Arg(2)
return 0

LoadDat: Procedure
GetUser Arg(1)
return result

/* ------------------------- Delusion 'n Virtual ------------------------- */

Error: ; Syntax:; IOerr:
ss CR'[0mAn Error/Syntax Error Has Occured In The Main Program On Line #'sigl'! Exiting...'CR'Please Notify SYSOP. Or Delusion if Possible.'CR||CR
SHUTDOWN; EXIT

/* Nice source, ehh ? I hope you're impressed anyway! Cu l8er DUDE and do  */
/* Not steal all of my nice & clean code OK ? Signed: Delusion / Virtual   */