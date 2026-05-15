/* ********************************************************* *
 * $VER: Buy&Sale 1.00 ©1993 VesuVius/Broadway +49 511839997 *
 * AIM module for Ami Express v3.0x and higher               *
 * ********************************************************* *
 * Test configuration: A2000c 4mb 16bit                      *
 *                     A2630/25MHz 4mb 32bit                 *
 *                     Ami Express 3.10                      *
 * ****************** NO MODIFIABLE PARTS ****************** */ 

parse arg node;options results;address value "AERexxControl"node
signal on Syntax;signal on Error;signal on IOerr
parse value sourceline(2) with . . ProN ProV ProC ProA .
getuser 11;bbsname=result;getuser 12;sysop=result
getuser 100;from=result;getuser 102;location=result
getuser 105;level=result;getuser 131;mainline=upper(result)
tr=transmit;ss=sendstring
csi=x2c(1B5B);CurUp=csi"A";ClrL=csi"M";LF=x2c(0A);CR=x2c(0D);BS=x2c(08);cls=x2c(0C);SP=x2c(20);VC=csi" p";IC=csi"0 p"
col2=csi"32m";col3=csi"33m";col4=csi"34m";col5=csi"35m";col6=csi"36m";col7=csi"37m";col0=csi"0m"
configpath="BBS:Doors/VESUtils/Buy&Sale.cfg";null='00'x;newdat=0;replmsg=0
mon.1="Jan";mon.2="Feb";mon.3="Mar";mon.4="Apr";mon.5="May";mon.6="Jun";mon.7="Jul";mon.8="Aug";mon.9="Sep";mon.10="Okt";mon.11="Nov";mon.12="Dec"

if ~show('L','rexxsupport.library') then          
 if ~addlib('rexxsupport.library',0,-30,0) then do
     tr LF"Need Rexxsupport.library in LIBS:"LF   
    shutdown                                         exit                                             end

if ~exists(configpath) then do
    tr LF"Cant open config ficon    )TEget   nt op
                llF"Can(&Sa$,xists(conf,'D'
   do unors eofan(&S)        I;ss=se=;ss=pne=aD'
figpa|
   =length(       
figpa|
   k=index(       ,"="
figpa|
         Iinvelt('22'x,invelt('22'x,       ,k),h+l      Fter   na|
     h+l    dropa|
     h+l    )T op
      closeo unors     cfgcol0=CONFPATH"BBS:Doors   fs"
'00col0=CONFPATH"MSGBase/1="Novresult;ge"BUY"in LIBS:"LF    511vrePOerhase/Wtheed""LF    mBas     S    mBl0=CONFt   nt op
    vrePOers  /OfferF    mBas    59   cfg;ss= =lft(vreP,+l           hdfF t0s  f=seerF"Can
   din LIB     GoodBye0=CONFt  r1.11="No    )T o "axgnam";ct(vrebsnamesyso | ation   o "axgnam";ct(vrecs   40SECebsnam   o "1   59  No      o "0
   5 )T o "axgnPATH"BB
           oseo unWriteNewDATaxgnPATH,NCDLUMN)      oseo unRn
 DATaxgnPATH,NCDLUMN)    eNe.,ss 3    Moca  ecopies(SM,8)|m IOe" v"l,aca  ay e" vALUMN) LF; Mocation5BuyONFNrescopies(SM,  vr-42)|m(20)"W     lwrTo;=d Notice, sco"A"20)"Wtransmit;ss=sendstring
csIinvelt(       MN) LF; MoA3v"lp  cfg/rrrrrrrrrrrrrrrrrrrrrrhrrr0t;ge   )82UY"in LIBS:f1hrrr0  Ftesmb1hr; MoA3v"lp  cfg/rrrrRr 1rnrrrrrrrrr-42):MN) boolECeconwdF"C bool open owrF"C    )T o H,NCDLsolo=    S  ptiIC MoA3v"lp  cfg/rrrr n(&Sa$s=1 to oca  ecC    )T o HT o +ecs   40  5as   "Pto ocvMoc.s ~=0so   "PtoSocvMsl0so   "m";ct(s si"      rlp        rEt
CONFPATH"BBS:DoorrrrrrrrrBR)
   e;     ocvMoc" vALUMN'*o   .s 1hrS" rEt
C||ovresultY"in 0||VC
to oc999   r )T op
=re=""    S  ptc(1B||ovre)|m"BBS:Door(conf,'D'x;shhCfrnrrrrrrrrr-42):MN) bbNFPATH"d   mw0nabNFPATH"d   mw0nabNFPATH"t
CONFPAct(vrecs  )*Bs           )*Dec"eMPAct(vrecoolECe=|ECeconwd0coolECe=|ECeleav  ocvMoc" vALUMN   HT o +e >9ct(vrecoolECe=|Ereceive 2o oca  eccvMo#seppor0t; Fter   nar 11;bbscvMoc" vALUMN  t op
    vrePO|ovred   
     Pe o '
in5bbscvl      )*Ptoconwd0coo=    
CONFPAct(vrecs 0nabNFP1B||o        hd"0
  M***age(0=CONFPA,onwd0c.      e)       )*DecseerF"Can  )T o HT o +e     40  5as   "Pto oc     4     bD'
k
 H,NCDLsolo=    S oseo unRnGetM***ages(onwd0c.      e)       )*D"eMPAct(vre '
in5bbsc|VC
toATH"d   mw        rEt
C
        
 "inigpath) ten do
   /*

 DA = =lftFi00 ©199subject 
 unRnGetM***ages(onwd0c.      e) ***(1)=onwd0c.elin ***(2)=onwd0c.e0t;ge
*/
GetM***ages:a|
     h+lseek   59 0,'Bnt op
   h+=seek   59 0,'Ent op
    h+lseek   59 0,'Bnt op
  tik)       ***(1)t op
   
painuet  r               59)       )staN=D'
 ch   59 1          oseoseek   59 3         N:Dooc2d(D'
 ch   59 2ors eofan(ToN=D'
 ch   59 28rs eofan(TStamp=D'
 ch   59 3         F  )N=D'
 ch   59 31         SubNPOers D'
 ch   59 31 ,tik+2rs eofan(TimeNoc2d(D'
 ch   59 4ors eofan(CanSubNP***(1)||=csi|| 5asPto taNMoc"D|o           )*DCanS-42M***age(N:Do,F  )N,***(1),***(2),TStamp)   4     "eMPAct(vre  )*DCan h+=seek   59 7)4     "eMPAc
   rr0  F
 /*
S-42M***age(N:Do,F  )N,***(1),***(2),TStamp) ***(1)=m***agerr0t;ge ***(2)=   )TLUMNelin ***(3)=onwd0c.elin ***(4)=onwd0c.e0t;ge
***(5)=nPAeStamp
*/
S-42M***age:
elineOers ***(2),
figpa***(2),=csi)-1  SDPAe=HDFDPAe(Oers ***(5) 2orsTH"dls  
 "inTH"d :f1)*DDPAe)*D sco"A:esmb1h||Oers SDPAe 28,SPrrrrrrrrN0t;ge sco"A:esmb1h||***(1)nTH"d :f1)*DF  ))*D sco"A:esmb1h||elin TH"d :f1)*DSubject sco"A:esmb1h||Oers ***(3) 28,SPrrrrrrrrStaALU sco"A:esmb1h|| /Of  
 "inig42):MN)  cfg;s||***(1)no   rrrrrrrrrr )82UYD sco"A"20)"Wtelet=d NoticeR sco"A"20)"Wteplyd NoticeA sco"A"20)"Wtbort,   )82UY"in LIBS:f1hrNex     MN) hrS" rEt
C|'D'x;shhtas =result
getuseselec  shutdown           
w    tas "D|o    FPAct(vre1.11="No 0PtoelinMoc   )T     "eMPAct(vrecs   40SECe  cfg;s||***(1))T     "eMPAct(vre********commy +4'C:";ct(v')  cfg;s||***(1)n      oseoChangeTaxg***(4),"D|t op
    h+lseek   59 -103t op
    h+lw0
  ch   59 "D|t op
    h+lseek   59 tus)bbNFPATH""M***age delet=d!in 0||V"eMPAct(vr
   w    tas "A|o    Frr0  F 0 w    tas "R"n          
 if ~"Reply"
No      o "0
  M***age(0=CONFPA,***(3) ***(4),elin,***(1)t op
  "eMPAct(vr
   w    tas H"t
CONFPAcf ~"Seasul    ..."
"eMPAc
   o
COrwise
nop

       rr0  F 1
 /*n
 DA*********.nPA, 0nabhange,lw0
  e0=C bcsi(vrecn   buysay +4s***s.(vre***(1)=nPATH,N      ***(2)=conwd0co  *
 *      /

 DATax:
en config nPA$,***(1),  nt t  nc2d(D'
 ch nPA$,4orsCan otMocconwd0co          
  h+lseek nPA$,0,'Bnt op
  h+lw0
  ch nPA$,r 51t(di"MDLUMN)  ,4,=csi))   
  h+lseek nPA$,0,'Ent op
hrS" roconwd0c- otCant open cow0
  ch nPA$,oA3v"lp=csi 4ors eo'
in5bb  h+lseek nPA$,4,'Bnt op
0=CONFt  '
inhrSiA3v"lp  cfg/rrrr +e nc2d(D'
 ch nPA$,4ors o oc nc2d(D'
 ch nPA$,4ors'
inCan0=CONFt o        hd"0
  Bcsi() rr0  F
 /* I    seo********.nPA
hres NOt  40SE,lw0
  e********.nPA. Slt(  hd"lpncsi(vre***(1)=nPATH,N      ***(2)=conwd0co  *
 *      /
"0
   5 )T :
en config nPA$,***(1), Wnt en cow0
  ch nPA$,di"M***(2),4orshrS" ro***(2)
 open cow0
  ch nPA$,oA3v"lp=csi 8ors'
in  h+l    drnPA$)
0=CONFt  rr0  F
 "0
  Bcsi:
h'
 ="[" p     :[÷X÷]=÷=÷=÷=÷=÷=÷=÷=÷=÷=÷=÷=÷=[\xXx/]÷=÷=÷=÷=÷=+=÷=÷=÷=÷=÷[÷X÷]:[m";con config bcsi$, boolECe, Wnt en cow0
  lg bcsi$,dlst en cow0
  lg bcsi$,""t en cow0
  lg bcsi$,"["5m)T o H,NCDLsolo=    S*** ["2m& ["5m*****[m"v["2m,8)|m1)*[m"©["5m*****b* ["2mV["5m
ge["2mV["5m***[m";t en cow0
  lg bcsi$,"["6m)T o H,NCDLsolo=    S~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~;t en cow0
  lg bcsi$,"["4m)T o H,Nº                              ^    ["6mresult;g["4m/     ["6m****["4m/   º;t en cow0
  lg bcsi$,"     .º/^\º.       ["6mrrrrhrs          ["4m.º/X\º.  ["6m"BUY"i          m ["4m.º/^\º.;t en cow0
  lg bcsi$,h'
 rshrSiiA3v"lp  cfg/rrren cow0
  lg bcsi$,"["4m)T o :[÷]["2c(r 51t(ii,3,SPr"["2m "Oers onwd0c. i,24,SPr"["4m-·*·-    ["2c(r 51t( +e i,3,0)"["4m)T o¦    ["2c(r 51t( oc i,3,0)"["4m)T o [÷]:[m";rs'
in  h+lw0
  lg bcsi$,h'
 rs  h+l    drbcsi$)
0=CONFt0 rr0  F
 /*
Reply M***age:
   hd"0
  M***age(0=CONFPA,onwd0c.      e,toUUMN,m***ageN0t;ge) "0
  e0=C M***age:
   hd"0
  M***age(0   erencePH,NCsubject,n0t;ge) ***(1)=onCONFPA ***(2)=onwd0c.elin ***(3)=onwd0c.e0t;ge
***(4)=toUUMN
***(5)=m***ageN0t;ge
*/

"0
  M***age:; Mry="ofan(To )82UY:esmb12"  )82UY"in LIBS:f1h  MN)ngtBS:f1'NoticeALLtBS:f1'?   MN) ja   sco"ASubject scoUY:esmb12"  )82UYBlankIBS:f1h  MN)ngtBS:f1abort?   MN)   
 "inTH"d :f1)*DDDDDDDDDDDDDDDDDDDDD  )82UY------------------------------ )82UYh  MN6
vMoc" vA30nCan***(4)=""n          
 +e >9c MryN   HT   cTo =result
getuse     )sts o H(vrecs   cTo =""n       cTo ="ALLt
cseerF"CanValidUUMN(  cTo)   4       cTo "ALLt

    tr LF"CantTH" Mry||***(4se sts oR    cTo ***(4se"BBS:Doo1      
 ja  ||***(2) hrS" rEt
C| 
 "inTH"1)*DDDDDDrrrrrryn S tex  (rrrrr)(  o   
oo'
i. (75abhasi" vAL, 5  vALs," Mx)inTH"1)*D(---------------------------------------------------------------------------)invMoc" vA75 hrSl = 3v"lp5       H"BLvAL.lY"in 0+e >9cl"    
 H"BLvAL.l = vrePO|o     
 "invMoc" vA1
+e >9c)82UYS sco"A"20)"WtMPAd NoticeA sco"A"20)"Wtg   ,   )82UY"in LIBS:f1hrAbort    MN) yn =result
getuseselec ;w    yn "A|o    F      r;w    yn "S"n       =re    Sav   ...M***age N0t;ge ";"eMPAMN) ;o
COrwise;rr0  F;
       CanH"BLvAL.1=""n       ;f ~addlo
C    "lpsMPA!";rr0  F;
    seppor0t; Fton config msb9   cfg;ssMailStaAs"   nt op
  Migpa|
 D'
 ch msb9 18rs eofa otalnc2d(subigp(Migpa|
,5 4ors eofare  otal0t; Fton config msg9   cfg;s|| otal, Wnt recs "BBS:Doorn          
   h+lw0
  lg msg9 d :f1)*DDDD" /Of"',0,0   erenceesmb1h||onCONAMErrrrrrrrrrrrhrrsmb1h||***(2ors eof  h+lw0
  lg msg9 ""t op
    xxA3v"lpl-1         oseow0
  lg msg9 dein L(H"BLvAL.xx,80ors eof'
in5bbs  h+lw0
  lg msg9 ""t op
   h+lw0
  lg msg9 d 3v"lp  c53rrrrrrrcopies mb1h||IOe"    ocvca  aymb1ht op
 subject=***(2o||=csi|| 5as
of'
in5b seppor0t; F   xxA3v"lpl-1         oseow0
  lg msg9 dein L(H"BLvAL.xx,80ors eof'
in5bbssubject=***(2o
r   na|
     h+lseek msb9 4,'Bnt op
  en cow0
  ch msb9 r 51t(di"M otalIin,4,=csi))   
    h+l    drmsb9)   
  StampTime=HDFDPAe()   
  'D'LUMN) 45;oATrTime=Oers di"Mt
getus tu,=csi)   
  H,xists(cos||r 51t(di"M otal),5 =csi)||Oers   cTo 28,=csi)||StampTime||=csi||Oers    ) 31 =csi)||Oers subject,32 =csi)||oATrTime op
  "ock=seek   59 0)DDDDDDDDD/* hold cATreinlseasul position  /
op
    h+lseek   59 0,'E't op
    h+lw0
  ch   59 HI;ss=se=;ss=p  h+lseek   59 "ock,'Bnt op
  en co    drmsllF"Can(&cs "BBS:Doorn          
      oseoChangeTaxg***(3) )       )*log,xists(pies(:d"0
     " /Of"'M***age No." otal"',0,0 rrhrrs***(2o||LF 2o oca  eccvMo#seppor0t; Fter log,xists(pies(:dReply " /Of"'M***age No."***(5)"',0,0 rrhrrs***(2o||LF 2o oc ocvMBS:Door 2o oca  eccvMoeNe.,ss log,xists" vALUMN) LF; eofare " ...do  !"LF rr0  F
 /*
dPAe=HDFDPAe(<2byte>) decomp*****trS" rm "07 Dec ****"
dPAe=HDFDPAe()DDDDDDDDcomp*****trS2byte
*/
HDFDPAe:
nCan***(1) =""n     Datiodi"Mdeligp(comp****rnPAe('E't,"/"),5 1)t #seppor0t; Datior 51t(c2d(***(1)t,5 ht op
pasie var Dati A +2 B +2 C o oca DatioA|o" /n.B" ***"C      rr0  F Dati

ValidUUMN:nCan***(1) oc"EALLto    Frr0  F 0 aorrnfo "BBS:Acc***/ACS."Oevel".rnfo"
LUMNrnfo "BBS:Acc***/"   )".rnfo"
m** "ACS.EALL_MESSAGES"
nCan  40SECeLUMNrnfo)T     
recs   40SECeaorrnfo)o    Frr0  F 0  S oseo unRnnfig rnf$,*orrnfo   nt  oseo unRnnfig rnf$,LUMNrnfo   nt    =seek rnf$,0,'E't   h+lseek rnf$,0,'Bnt i 
pstior'
 ch rnf$,   )
valid=
figpai 
psti,m**rs  h+l    drrnf$) rr0  F valid
 /* c rrhrre0t;ge,[D]  /
ChangeTax:nCan  )T o HT    Fp0
 =-4; oseop0
 =0
SPos=8****(1)+p0
 
  h+lseek nPA$,SPos,'Bnt ifo***(2)  "D|o    FtNo c2d(D'
 ch nPA$,4or-1   oseotNo c2d(D'
 ch nPA$,4oro o  h+lseek nPA$,-4t en cow0
  ch nPA$,di"MtNo 4ors  h+l    drnPA$)
0=CONFt    h+l
 DATax(nPATH,N,DLUMN)   rr0  F
 Error: 
rSyntax: 
rIOerN:n	 
 "Error OccAT"i On LvAL #"sigl"! ErrorTex :eserrortex (rc)n	 
 ""
GoodBye:
igpath) ten do
    
 ""
GoodBye:
igpath) ten do
    
 ""
GoodBye:
igpath