/*==========================================================================*/
/*									    */
/*			   View/Check File V1.0				    */
/*			   ~~~~~~~~~~~~~~~~~~~~				    */
/*									    */
/*			   BY EMPIRE / EXT!INCE				    */
/*									    */
/*		  LaSt OuTpOsT  +31-721-57682  -  HOLLAND		    */
/*				~~~~~~~~~~~~~				    */
/*									    */
/*	   This DOOR is a Better Alternative to the 'V' Command.	    */
/*									    */
/*==========================================================================*/

parse arg node; options results; nodeid = "AERexxControl"node; address value nodeid
signal on syntax; signal on ioerr
bufferflush
FALSE= 0
TRUE = 1

Version = '/X View/Check File V1.0'

if exists("DOORS:EmP_Tools/ViewFile.cfg") then
  do
    open(ConfigFile,("DOORS:EmP_Tools/ViewFile.cfg"),'R')
    SysLevel=word(readln(ConfigFile),1)
    CosLevel=word(readln(ConfigFile),1)
    ViewPsw=upper(word(readln(ConfigFile),1))
    ArcPath=word(readln(ConfigFile),1)
    LogFile=word(readln(ConfigFile),1)
    close(ConfigFile)
  end
else
  do
    SysLevel=255
    CosLevel=250
    ViewPsw =''
    ArcPath ='DOORS:EmP_Tools/Archivers/'
    LogFile ='Doors:Doors.LOG'
  end

/* INSTRUCTION === CODE == LENGTH R/W  Definition ==============================*/
JH_BBSName       =  11  /*   41   *    BBS Name					*/
JH_Sysop         =  12  /*   41   *    SysopName				*/
JH_FLAGFILE      =  13  /*   12     *  FlagFile					*/
DT_NAME          = 100  /*   30   * *  User Name				*/
DT_PASSWORD      = 101  /*    8   * *  User Password				*/
DT_LOCATION      = 102  /*   29   * *  User Location				*/
DT_PHONENUMBER   = 103  /*   12   * *  User Phone Number			*/
DT_SLOTNUMBER    = 104  /*   NUM  *    User Slot Number				*/
DT_SECSTATUS     = 105  /*   NUM  * *  User Access level			*/
DT_SECBOARD      = 106  /*   ??							*/
DT_SECLIBRARY    = 107  /*   ??							*/
DT_SECBULLETIN   = 108  /*   ??							*/
DT_MESSAGESPOSTED= 109  /*   NUM  * *  User Messages Posted			*/
DT_UPLOADS       = 110  /*   NUM  * *  User Number of uploads			*/
DT_DOWNLOADS     = 111  /*   NUM  * *  USer Number of downloads			*/
DT_TIMESCALLED   = 112  /*   NUM  * *  User Number of times called		*/
DT_TIMELASTON    = 113  /*   NUML * *  User Date/time last on, packed format	*/
DT_TIMEUSED      = 114  /*   NUML * *  User TimeUsed today			*/
DT_TIMELIMIT     = 115  /*   NUML * *  User TimeLimit Today			*/
DT_TIMETOTAL     = 116  /*   NUML * *  User Remaining Time			*/
DT_BYTESUPLOAD   = 117  /*   NUML * *  User Bytes uploaded			*/
DT_BYTEDOWNLOAD  = 118  /*   NUML * *  User Bytes downloaded			*/
DT_DAILYBYTELIMIT= 119  /*   NUML * *  ??					*/
DT_DAILYBYTEDLD  = 120  /*   NUML * *  ??					*/
DT_EXPERT        = 121  /*    1   * *  User Expert mode status			*/
DT_LINELENGTH    = 122  /*   NUM  * *  Users screen length			*/
ACTIVE_NODES     = 123  /*    9   *    Returns string of Active Nodes		*/
DT_DUMP          = 124  /*  190     *  Dumps user data to specified file	*/
DT_TIMEOUT       = 125  /*   NUML * *  Keyboard time out limit			*/
BB_CONFNAME      = 126  /*   58   * *  Conference Name				*/
BB_CONFLOCAL     = 127  /*   58   * *  Directory of Conference			*/
BB_LOCAL         = 128  /*   40   * *  BBS Directory				*/
BB_STATUS        = 129  /*   10   *    IS A USER ONLINE ? Not used in door protocol*/
BB_COMMAND       = 130  /* reserv						*/
BB_MAINLINE      = 131  /*  190   *    Users last entry before entering door	*/
NB_LOAD          = 132  /* reserv 						*/
DT_USERLOAD      = 133  /* reserv						*/
BB_CONFIG        = 134  /* reserv 						*/
CHG_USER         = 135  /* reserv						*/
RETURNCOMMAND    = 136  /*  190     *  Command to execute when door exists	*/
ZMODEMSEND       = 137  /*  190     *  Send file (alpha stage)			*/
ZMODEMRECEIVE    = 138  /* reserv  						*/
SCREEN_ADDRESS   = 139  /*    8   *    Returns the screens address of Amiexpress*/
BB_TASKPRI       = 140  /*  190   *    Returns the task priority of AmiExpess	*/
RAWSCREEN_ADDRESS= 141  /*  NUML  *    Returns the packed screen address	*/
BB_CHATFLAG      = 142  /*    3   *    Returns ON/OFF for chat enabled		*/
DT_STAMP_LASTON  = 143  /*  190   *    Returns date/time stamp user last on	*/
DT_STAMP_CTIME   = 144  /*  190   *    Returns date/time stamp			*/
DT_CURR_TIME     = 145  /*  NUML  *    Returns date/time in packed format	*/
DT_CONFACCESS    = 146  /*    9   * *  User Conference access as XXXXXXX_X	*/
BB_PCONFLOCAL    = 147  /*   58   *    Specific conference location		*/
BB_PCONFNAME     = 148  /*   58   *    Specific conference name			*/
BB_NODEID        = 149  /*  NUML  *    Node ID of AmiExpress			*/
BB_CALLERSLOG    = 150  /*  190     *  Send message to Callers log		*/
BB_UDLOG         = 151  /*  190     *  Send message to UDLog			*/
EXPRESS_VERSION  = 152  /*   10   *    Returns AmiExpress version string	*/

/*==========================================================================*/
/* getuser	putuser		transmit	sendmessage	EditFile    */
/* sendstring	getchar		showfile	flagfile	showgfile   */
/* PUTUSTR	RECEIVE		QUERY		SHUTDOWN                    */
/*==========================================================================*/

tr = transmit   ;  hk = getchar ;  pm = prompt  ;  sendstring = sendmessage
ss = sendstring ;  gu = getuser ;  pu = putuser
NUL  = '0'X
OFF  = '[0m'
CLS  = D2C(12) || OFF			/*  Clear Screen		*/
CR   = D2C(10)				/*  Carriage Return		*/
TAB  = D2C(9)
RED='[31m';  GRN ='[32m'; YEL='[33m'; BLU='[34m'
MAG='[35m'; CYN='[36m';  REDYEL='[41;33m'; WHTRED='[47;31m';

Start:

UserName = getvar(DT_NAME)
BBS      = getvar(BB_LOCAL)		/*  Usual BBS:			*/
CnfPath  = getvar(BB_CONFLOCAL)		/*  Present Conference Path	*/
Level    = getvar(DT_SECSTATUS)		/*  User Access Level		*/
InLine   = getvar(BB_MAINLINE)

Name=word(InLine,2)
if Name~='' then
  do
    if (pos(':',Name)~=0 | pos('/',Name)~=0 | pos('>',Name)~=0) then
      do
        tr CR" You May Not Include Special Symbols!"CR
        call PressSpace
        signal DExit
      end
    Filename=FindConfDir(CnfPath,Name)
    if Filename=0 then
      do
        tr CR" File Not Found!"CR
        call PressSpace
        signal DExit
      end
    call Check4AscII; if result=FALSE then signal DExit
    tr ""
    showfile Filename
    call PressSpace
    signal DExit
  end

tr CLS""BLU" +----------------------------------------+"
tr BLU" |"CYN""center(VERSION,40)""BLU"|"
tr BLU" +----------------------------------------+"
tr BLU" |                                        |"
if Level>=CosLevel then tr BLU" |    "MAG"["CYN""1""MAG"]  "OFF"SysopView Text                 "BLU"|"
else tr BLU" |    "MAG"["CYN""1""MAG"]  "OFF"View Text                      "BLU"|"
tr BLU" |    "MAG"["CYN""2""MAG"]  "OFF"View Archive/Text              "BLU"|"
tr BLU" |    "MAG"["CYN""3""MAG"]  "OFF"Check Archive                  "BLU"|"
tr BLU" |                                        |"
tr BLU" |    "MAG"["CYN"Q"MAG"]  "OFF"Quit                           "BLU"|"
tr BLU" |                                        |"
tr BLU" +----------------------------------------+"
tr BLU" | "CYN"Supports: "GRN"TXT, DOC, EXE, LHA, LZH, ARJ "BLU"|"
tr BLU" |           "GRN"ZIP, DMS, WRP, ZOM, DEX, DMP "BLU"|"
tr BLU" +----------------------------------------+"
tr BLU" |         "CYN"DONE BY EMPIRE/EXT!NCE         "BLU"|"
tr BLU" |     "RED"LaSt OuTpOsT "CYN"==> "MAG"+31-721-57682     "BLU"|"
tr BLU" +----------------------------------------+"CR
ss OFF' Select: 'GRN'['YEL'1-3/Q'GRN'] 'OFF

MainMenu:
 hk; MenuRes=upper(strip(result))
 if MenuRes='Q' then do; tr MenuRes CR; signal DExit; end
 if MenuRes='1' then do; tr MenuRes CR; signal ViewText; end
 if MenuRes='2' then do; tr MenuRes CR; signal ViewArc; end
 if MenuRes='3' then do; tr MenuRes CR; signal CheckArc; end
signal MainMenu

ViewText:
  if Level>=CosLevel then PLenght=60
  else PLenght=12
  Name=prompt(' Enter Filename: ',PLenght)
  if Name='' then signal Start
  if (pos(':',Name)~=0 | pos('/',Name)~=0 | pos('>',Name)~=0) then
    do
      if Level>=CosLevel then
        if (exists(Name)=TRUE & right(Name,1)~=':' & right(Name,1)~='/') then
          do
            if ViewPsw~='' then
              do
                Psw=''
                ss CR" Enter Password: "
                hk; PswChar=upper(result)
                do while PswChar~=D2C(13)
                  Psw=insert(Psw,PswChar)
                  ss '.'
                  hk; PswChar=upper(result)
                end
                if Psw~=ViewPsw then
                  do
                  call LogEntry
                  tr CR
                  signal DExit
                end
              end
            Filename=Name
          end
        else Filename=0
      else
        do
          tr CR" You May Not Include Special Symbols!"CR
          call PressSpace
          signal Start
        end
    end
  else Filename=FindConfDir(CnfPath,Name)
  if Filename=0 then
    do
      tr CR" File Not Found!"CR
      call PressSpace
      signal Start
    end
  call Check4AscII; if result=FALSE then signal Start
  tr CLS
  showfile Filename
  call PressSpace
signal Start

ViewArc:
  call CheckFile_Ext
  select
    when (Ext="TXT" | Ext="DOC" | Ext="DOX") then
      do
        call Check4AscII; if result=FALSE then signal Start
        tr CLS
        showfile Filename
      end
    when Ext="EXE" then
      address command ArcPath"HunkX >ram:ArcOutPut_TEMP "Filename
    when Ext="ARC" then
      address command ArcPath"Pkax >ram:ArcOutPut_TEMP -v "Filename
    when Ext="ARJ" then
      address command ArcPath"UnArj >ram:ArcOutPut_TEMP l "Filename
    when Ext="ZOO" then
      address command ArcPath"Zoo >ram:ArcOutPut_TEMP -list "Filename
    when (Ext="LZH" | Ext="LHA" | Ext="SFX") then
      address command ArcPath"Lha >ram:ArcOutPut_TEMP v "Filename
    when Ext="ZIP" then
      address command ArcPath"UnZip >ram:ArcOutPut_TEMP -v "Filename
    when Ext="DMS" then
      address command ArcPath"DMS >ram:ArcOutPut_TEMP view "Filename
    when Ext="WRP" then tr CR" Warp Files can Only be Checked!"CR
    when Ext="ZOM" then tr CR" Zoom Files can Only be Checked!"CR
    when (Ext="DMP" | Ext="DEX") then tr CR" DImp Files can Only be Checked!"CR
    otherwise tr CR" Archive Format not Recognized: "Ext""CR
  end
  if exists('ram:ArcOutPut_TEMP') then
    do
      tr CLS
      showfile 'ram:ArcOutPut_TEMP'
      address command "c:Delete ram:ArcOutPut_TEMP"
    end
  call PressSpace
signal Start

CheckArc:
  call CheckFile_Ext
  select
    when Ext="EXE" then
      address command ArcPath"HunkX >ram:ArcOutPut_TEMP "Filename
    when Ext="ARC" then
      address command ArcPath"Pkax >ram:ArcOutPut_TEMP -t "Filename
    when Ext="ARJ" then
      address command ArcPath"UnArj >ram:ArcOutPut_TEMP t "Filename
    when Ext="ZOO" then
      address command ArcPath"Zoo >ram:ArcOutPut_TEMP -test "Filename
    when (Ext="LZH" | Ext="LHA" | Ext="SFX") then
      address command ArcPath"Lha >ram:ArcOutPut_TEMP t "Filename
    when Ext="ZIP" then
      address command ArcPath"UnZip -t "Filename" >ram:ArcOutPut_TEMP"
    when Ext="DMS" then
      address command ArcPath"DMS >ram:ArcOutPut_TEMP test "Filename
    when Ext="WRP" then
      address command ArcPath"WarpChecker >ram:ArcOutPut_TEMP "Filename
    when Ext="ZOM" then
      address command ArcPath"ZoomCheck >ram:ArcOutPut_TEMP "Filename
    when (Ext="DMP" | Ext="DEX") then
      address command ArcPath"Dimp >ram:ArcOutPut_TEMP info "Filename
    otherwise tr CR" Archive Format "Ext" Can't be Checked!"CR

  end
  if exists('ram:ArcOutPut_TEMP') then
    do
      tr CLS
      showfile 'ram:ArcOutPut_TEMP'
      address command "c:Delete ram:ArcOutPut_TEMP"
    end
  call PressSpace
signal Start

Check4AscII:
  open(File,Filename,'R')
  FileLength=seek(File,0,'E')
  if FileLength<40 then do; close(File); return TRUE; end
  dummy=seek(File,4,'B')
  do i=1 to 36
    ChkAscII=C2D(readch(File,1))
    if (ChkAscII<9 | ChkAscII>127) then 
      do 
        tr CR" "Name" is Not a Text File!"CR
        close(File)
        call PressSpace
        return FALSE
      end
  end
  close(File)
return TRUE

CheckFile_Ext:
  Name=prompt(' Enter Filename: ',12)
  if Name='' then signal Start
  if (pos(':',Name)~=0 | pos('/',Name)~=0 | pos('>',Name)~=0) then
    do
      tr CR" You May Not Include Special Symbols!"CR
      call PressSpace
      signal Start
    end
  Filename=FindConfDir(CnfPath,Name)
  if filename=0 then
    do
      tr CR" File Not Found!"CR
      call PressSpace
      call Start
    end
  PntPos=lastpos('.',Filename)
  if PntPos=0 then
    do
      tr CR" No Extension Found!"CR
      call PressSpace
      signal Start
    end
  else Ext=upper(right(Filename,length(Filename)-PntPos))
return

/*==========================================================================*/
PressSpace:
  ss OFF""GRN" ("YEL"Pause"GRN")"BLU"..."GRN"Space to Resume"YEL": "RED
  hk; Key=upper(strip(result))
  tr CR OFF
return

/*==========================================================================*/
GetDate:

  DAY   = SubStr(Date(U),4,2)
  MONTH = SubStr(Date(E),4,2)  /* 05/28/92 */
  YEAR  = SubStr(Date(U),7,2)
  DAYN  = SubStr(Date(W),1,3)  /* Thursday */

  DATE  = MONTH'-'DAY'-'YEAR
  YEAR  = YEAR + 1900
return

/*==========================================================================*/
LogEntry:

  call GetDate
  if exists(LogFile) then
    open(File,LogFile,A)
  else
    open(File,LogFile,W)
  writeln(File,"----------+----------+---------------------------------------------------------")
  writeln(File," "DATE" | "TIME()" | "UserName" Accessed: "Version)
  writeln(File,"          |          | View Password Failure: "Psw)
  close(File)
return

/*==========================================================================*/
IOERR:
  tr "I/O Error: Missing File/Directory"
ERROR:
SYNTAX:
  tr "Error in Line.. #"sigl" Exiting.."
  tr errortext(sigl)

/*==========================================================================*/
DExit:
  bufferflush
  ShutDown
Exit

/*==========================================================================*/
/*  PROCEDURES                                                              */
/*==========================================================================*/


prompt: procedure
parse arg message,length
 RECEIVE length
 QUERY message
return result

putvar: procedure
parse arg string1,string2
 PUTUSTR string1
 PUTUSER string2
return 0

getvar: procedure
parse arg string1
 getuser string1
return result

FindConfDir:
 arg CnfPath,Name
 open(Path,(CnfPath'paths'),'R')
 do while EOF(Path)=FALSE
   Filename=readln(Path)||Name
   if exists(Filename) then
     do
       close(Path)
       return (Filename)
     end
 end
close(Path)
return 0

/*==========================================================================*/
