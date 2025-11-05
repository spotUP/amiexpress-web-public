//**********************
//*****  Includes  *****
//**********************

#include "exec/types.h"

// * Numbers in () is the size of each field.

// * UBYTE & BYTE               = 1 Byte
// * UWORD, WORD, SHORT, USHORT = 2 Bytes
// * ULONG, LONG, int           = 4 Bytes

struct Globals
{
 TEXT activity[20];    // ( 20) Activity Name

 BYTE AN,              // (  1) Activity Number
      aborttransfer,   // (  1) Abort Transfer
      frontend,        // (  1)
      frontendstatus,  // (  1)
      hide,            // (  1) User hidden from who display
      kickuser,        // (  1)
      mute,            // (  1) User is in mute status
      shutdown;        // (  1)

 long ULCPS,           // (  4) UL CPS
      DLCPS,           // (  4) DL CPS
      CurrentBaudRate; // (  4)

 char ULFileName[100], // (100) Current UL FileName
      DLFileName[100]; // (100) Current DL FileName

 long ULPosition,      // (  4) Position of current file being uploaded
      DLPosition,      // (  4) Position of current file being downloaded

      ULFileSize,      // (  4) FileSize of current file being uploaded
      DLFileSize,      // (  4) FileSize of current file being downloaded

      ULBytes_Xfered,  // (  4) Total UL Bytes Transfered
      ULFiles_Xfered,  // (  4) Total UL Files Transfered

      DLBytes_Xfered,  // (  4) Total DL Bytes Transfered
      DLFiles_Xfered;  // (  4) Total DL Files Transfered

 BYTE ChatFlag,        // (  1) Sysop Avaialable Flag On       (1=Yes, 0=No) NOT ACTIVE YET
      TempSysopAccess; // (  1) Temporary Sysop Access Flag On (1=Yes, 0=No)

 UBYTE AreaType;       // (  1) What kind of area.  0=Msg Area, 1=File Area

 ULONG JoinedArea,     // (  4) Current Area joined.
       JoinedSubArea;  // (  4) Current Sub File Listing being used.

 TEXT ChatReason[50];  // ( 50) Operator Page Reason

 BYTE HydraDone;       // (  1)
 BYTE OLM;             // (  1) 0= No OLM waiting, 1= OLM Waiting

 char LargeFiller[2939]; // (2939) Blank data for Future Use.
};


//*************************
//*************************
//*************************
//*****  Struct User  *****  FiLE: Accounts.Data
//*************************  TOTAL SIZE: 710 Bytes
//*************************
//*************************

struct User
{
 UWORD   Slot_Number;            // (  2) Account#
 UBYTE   Status;                 // (  1) 0=Deleted, 1=Active, 2=New User, 3=Locked Out, 4=Created Account

 TEXT    Name[31],               // ( 31) Users Name
         RealName[26],           // ( 26) Real Name
         VoicePhone[21],         // ( 21) Voice Phone Number
         DataPhone[21],          // ( 21) Data  Phone Number
         Address[26],            // ( 26) Address
         City[26],               // ( 26) City
         State[4],               // (  4) State/Providence Code
         Country[4],             // (  4) Country Code
         MailRoute[15],          // ( 15) Zip Code / Mail Route
         ComputerType[21],       // ( 21) Computer Type (Possible Code Instead)
         Password[16],           // ( 16) Password
         Comment[31];            // ( 31) Comment String

 UBYTE   Security;               // (  1) Access Level
 UWORD   WeedDays,               // (  2) Days of inactivity until bbs auto deletes
         ReduceDays;             // (  2) Days Paid for by a payer.
 UBYTE   ReducePreset;           // (  1) Preset level to give to user after reduced days

 UBYTE   AnsiType,               // (  1) Ansi Type  0) Normal, 1) Amiga, 2) IBM, 3) RIP
         Protocol,               // (  1) Protocol Selected: 0:Zmodem 1:Hydra
         DEADProto,              // (  1) Not Used Anymore
         HelpLevel,              // (  1) Level of Help
         MSGHeader,              // (  1) Msg Header Type
         EditorLines,            // (  1) Max Lines allowed in Editor      (NOT USED YET)
         DescLines,              // (  1) File Listing lines, Descriptions
         ViewMode,               // (  1) File Listing View Mode
         WhoPrefs,               // (  1) Who Preferences
         MB_J,                   // (  1) Message Rejoin
         FB_J,                   // (  1) File rejoin
         Length,                 // (  1) Length of screen
         Width,                  // (  1) Width of screen
         Language,               // (  1)
         Translation,            // (  1) (NOT USED YET)
         TimeZone,               // (  1) Time Zone Offset (NOT USED YET)
         BirthDate_Day,          // (  1) DAY of birth
         BirthDate_Month,        // (  1) MONTH of birth
         BirthDate_Year,         // (  1) YEAR of birth
         IdleTime,               // (  1) Bypass Node Idle Time, If set higher than 0
         NodeLastOn;             // (  1) Last node user was on

 UWORD   ForwardMailSlot,        // (  2) Slot Number of user to forward mail to! (NOT USED YET)
         PWF;                    // (  2) Number of Password Failures

 UWORD   Total_Calls,            // (  2) # of Calls Total
         Total_Posts,            // (  2) Msgs left total
         Total_PostsReceived,    // (  2) Msgs Received
         Total_ULFiles,          // (  2) # of Uploads
         Total_DLFiles,          // (  2) # of Downloads
         Total_TimeBank;         // (  2) Time Bank Value
 ULONG   Total_ULBytes,          // (  4) Total Uploaded Bytes
         Total_DLBytes;          // (  4) Total Downloaded Bytes

 UWORD   Limit_Calls,            // (  2) Calls ALLOWED per Day
         Limit_Posts,            // (  2) Messages Allowed p/d
         Limit_ULFiles,          // (  2) # of Uploads Per Period
         Limit_DLFiles,          // (  2) # of Downloads Per Period
         Limit_Time,             // (  2) Time Limit per day.
         Limit_TimeBank,         // (  2)
         Limit_ChatTime;         // (  2) Limit of Time user can be in chat door
 ULONG   Limit_ULBytes,          // (  4) Limit Upload Bytes Per Period
         Limit_DLBytes;          // (  4) Limit Download Bytes Per Period

 UBYTE   F_Ratio,                // (  1) File Ratio
         B_Ratio;                // (  1) Byte Ratio

 UBYTE   Period_Type;            // (  1) Mins, Hours, Days, Weeks, Months, Years    (NOT USED YET)
 BYTE    ExtraCrap;              // (  1) Not Used

 UWORD   Period_Length,          // (  2) 24 hours or whatever! Set Limits by Period (NOT USED YET)
         Period_Calls,           // (  2) Calls made  Today
         Period_Posts,           // (  2) Todays Msgs Sent
         Period_ULFiles,         // (  2) Todays Ul's
         Period_DLFiles,         // (  2) Todays Dl's
         Period_ChatTime;        // (  2) Time user has been in chat this period
 ULONG   Period_ULBytes,         // (  4) Period Bytes Uploaded
         Period_DLBytes;         // (  4) Period Bytes Downloaded

 UWORD   Left_DLFiles,           // (  2) Files left available for download
         Left_ChatTime,          // (  2) Limit of Time user can be in chat door
         Left_Time;              // (  2) Time Left
 ULONG   Left_DLBytes;           // (  4) Bytes left for this period

 UWORD   DayCredits,             // (  2) For Payers
         FileCredits;            // (  2) Files Paid for by a payer.

 ULONG   ByteCredits,            // (  4) Bytes Paid for by a payer.
         PersonalBytes,          // (  4) Personal Area Bytes Limit
         LastBaudRate;           // (  4) Last Baud Rate of a user.

 LONG    Time_First_Called,      // (  4) Time First Logged On
         Time_Last_Logoff,       // (  4) Last Time LOGGED OFF
         Time_Last_Connect;      // (  4) Time last CONNECTED

LONGBITS UserBitsA,              // (  4)
         UserBitsB,              // (  4)
         UtilBits,               // (  4) 32 bits for Programmers to use as they wish for utils.
         LastCallFlags,          // (  4) Flags for activities during last call. Posted,UL,DL,etc (NOT USED YET)
         CatFlags,               // (  4) Flags for Custom File Listing (NOT USED YET)
         NFlags1,                // (  4) Normal Flags Part 1
         NFlags2,                // (  4) Normal Flags Part 2
         SFlags1,                // (  4) Sysop  Flags Part 1
         SFlags2;                // (  4) Sysop  Flags Part 2

 char    MsgBase[41],            // (1x41=41) MB 0-39 Flags N,Y,S   // Change to 2 LONGBITS
         FileBase[41];           // (1x41=41) FB 0-39 Flags N,Y,S   // one for normal, one for sysop

 UWORD   Last_Read_Message[40],  // (40x2=80) -position change- Last read pointer
         Last_Scan_Message[40];  // (40x2=80)

 BYTE    AnsiColor;              // (  1) Ansi Color
 BYTE    ReduceDay,              // (  1)
         ReduceMonth,            // (  1)
         ReduceYear;             // (  1)

 ULONG   AutoJoinArea;           // (  4) Auto Re-Joine Area (0=Last Joined Area)

 BYTE    BExtras[22];            // (1x22=22)

 UWORD   CheckSum;               // (  2)

 ULONG   SerialNumber;           // (  4) Unique seiral number for
                                 //       Flagged Files, PMail, FMail, Signatures, Resume Files

 SHORT   SExtras[2];             // (2x2=4)

 long    Last_Scan_Mass;         // (  4) Last Time Scanned Mass Mail Index
 long    Last_Scan_PMail;        // (  4) Last Time Scanned PMail Index
 long    Last_Scan_FMail;        // (  4) Last Time Scanned FMail Index
};

struct Csum // TOTAL SIZE: 2 Bytes
{
 UWORD Csum; // (  2)
};

struct UserSerial // TOTAL SIZE: 4 Bytes
{
 ULONG SerialNumber; // (  4)
};

//*******************************
//*******************************
//*******************************
//*****  Struct SystemData  ***** FiLE: SystemData.Data - (GLOBAL SETTINGS!)
//*******************************
//*******************************
//*******************************

struct SystemData // 5006 Bytes
{
 TEXT  Name[31],                  // ( 31) Name of BBS System
       Location[51],              // ( 51) Location of BBS System
       SysopName[31],             // ( 31) Sysop's Name

       // System Paths

       MainPath[41],              // ( 41) Main Path & Accounts.data

       NotUsed1[40],              // ( 40) Not Used

       AccountInfoPath[41],       // ( 41) Path to User Info Files

       NotUsed2[40],              // ( 40) Not Used

       CatalogsPath[41],          // ( 41) Path to Catalog files

       NotUsed3[121],             // (121) Not Used

       LogsPath[41],              // ( 41) path for Log & transcript

       LocalULPath[41],           // ( 41) Default asl requester path for local uploading
       LocalDLPath[41],           // ( 41) Default asl requester path for local downloading

       NotUsed4[80],              // ( 80) Not Used

       TextDirPath[41],           // ( 41) Path to Text Directory

       NotUsed5[80],              // ( 80) Not Used

       UploadPath[41],            // ( 41) Path for all uploads and resume directory

       NotUsed6[40],              // ( 40) Not Used

       DoorsPath[41],             // ( 41) Door Path

       NotUsed7[202],             // (202) Not Used
                                         
       // Passwords

       LocalAccessPassword[21],   // ( 21) Password: Local Access (Sysop/Local Logins)
       SysopCmdsPassword[21],     // ( 21) Password: Sysop Commands
       NewUserPassword[21],       // ( 21) Password: New User's to apply
       SystemEntryPassword[21],   // ( 21) Password: Users to enter system

       // Scripts

       LocalShell[101],           // (101) command to launch local cli

       NotUsed8[101],             // (101) NOT USED

       FontName[31],              // ( 31) Font Name

       RemoteShellPassword[21],   // ( 21) Password: Local Shell Access
       LocalLogonPassword[21],    // ( 21) Password: Local Logon Password

       ServerPassword[21],        // ( 21) Password: Server Protect Password

       NotUsed9[60],              // ( 60) Not Used

       PresetD[16][26],           // (16x26=416) Descriptions of Presets

       BBSConfigPassword[21],     // ( 21) Password: BBSConfig Module

       Phone[31],                 // ( 31) BBS Phone Number

       NotUsed10[50],             // ( 50) Not Used

       NotUsedxx[81],             // ( 81) Not Used

       CHAR_Extra[2278];          // (2278)
 //________________________________________________________________________

 UBYTE LockViewMode,              // (  1) View mode to lock users into
       Chat_H,                    // (  1) Chat Color for USER
       Chat_M,                    // (  1) Chat Color for SYSOP
       ULRewardP_Time,            // (  1) Percentage of time gained for uploads
       MaxPages,                  // (  1) Maximum time user can page sysop per call
       WindowToFront,             // (  1) window to front

       ChatMethod,                // (  1) Default Sysop Chat Method (0=Normal,1=Horizontal,2=Vertical)

       BitPlanes,                 // (  1) Bit Planes
       Auto_Iconify,              // (  1) 0: open normal  1: open into icon
       BackGround,                // (  1) BBS screen to back ground
       UseWBReal,                 // (  1) Use Workbench Screen for Real Nodes.
       UseWBLocal,                // (  1) Use WOrkbench Screen for Local Nodes.
       HALFSCREEN,                // (  1) Half Screen Mode (1)
       HydraChatTimeout,          // (  1) Timeout (in minutes) of hydra chat timeout
       LNBitPlanes,               // (  1) Bit Planes for Local Nodes

       Auto_IconifyL,             // (  1) Local Nodes (auto iconify or not)
       BackGroundL,               // (  1) BBS screen to back ground (local)

       ASLRequesters,             // (  1) 0=Ask, 1=Always Use, 2=Never Use

       ProtocolDefault,           // (  1) Default Protocol (0:zmodem,1:Hydra)
       ProtocolForce,             // (  1) Force Protocol   (0:None,1:ZModem,2:Hydra)
       EditorDefault,             // (  1) Default Msg Editor (0:Line,1:Full)

       ConsoleSnap,               // (  1) Console Snap Windows (0=No, 1=Yes)

       CatalogColors[30],         // ( 30) Catalog Definable Colors

       ZippyMemoryFlag,           // (  1) Load Complete Data files in at once with zippy search

       PublicScreen,              // (  1) Make Tempest Screens Public? 0:No, 1:Yes

       SystemFlags[72],           // ( 72)

       ULRewardP_DLCredits,       // (  1) Download Credits for a day for uploads

       AttemptsName,              // (  1) User Name Attempts
       AttemptsPass,              // (  1) User Password Attempts
       AttemptsSysP,              // (  1) System Password Attempts
       AttemptsNewU,              // (  1) New User Password Attempts

       PassMinimum,               // (  1) Minimum characters required for user passwords.

       MAXDLINES,                 // (  1) Maximum Description Lines Allowed

       FontStyle,                 // (  1)
       FontFlags,                 // (  1)

       LogType,                   // (  1) 0 = Remote Only, 1 = Local Only, 2 = All Nodes

       PageLength,                // (  1) Number of times to beep sysop in operator page.

       UBYTE_Extras[85];          // (1x85=85)

 BOOL  AutoScroll,                // (  2) Auto Scroll Screen Mode (Real Nodes)
       AutoScrollL;               // (  2) Auto Scroll Screen Mode (Local Nodes)

 //________________________________________________________________________

 WORD  NumberOfLines,             // (  2) Total Number of Nodes

       NotUsedWord1,              // (  2)
       NotUsedWord2,              // (  2)

       MaxEditorLines,            // (  2) Max number of editor lines allowed for msg editor.
       MaxFlaggedFiles,           // (  2) Max number of flagged files allowed at one time.

       WORDExtras[30];            // (2x30=60)

 UWORD SWidthL,                   // (  2) Screen Width  (Local Nodes)
       SHeightL,                  // (  2) Screen Height (Local Nodes)
       OverScanTypeL,             // (  2) Overscan type (Local Nodes)
       SWidth,                    // (  2) Screen Width  (Real Nodes)
       SHeight,                   // (  2) Screen Height (Real Nodes)
       OverScanType;              // (  2) Overscan type (Real Nodes)
 //________________________________________________________________________

 int   FontSize;                  // (  4) 8: Defualt

 ULONG MaxUsers;                  // (  4) Maximim User's allowed on system

 int   BBSPriority,               // (  4) Normal Priority
       FileTransferPriority,      // (  4) File Trasfer Priority
       DoorsPriority,             // (  4) Doors Priority
       ExtraPriority,             // (  4)

       INT_Extras[26];            // (4x26=104)
 //________________________________________________________________________

 long  LowFreeSpace,              // (  4) Low point for warning of low harddrive space
       NoFreeSpace,               // (  4) Required harddrive space for uploads

       MaxSizeViewText,           // (  4) Max size of a file that can be viewed
                                  // (  4) with online view text file command.

       SystemFlags1,              // (  4) System Flags (32 Flags) #1
       SystemFlags2,              // (  4) System Flags (32 Flags) #2
       SystemFlags3,              // (  4) System Flags (32 Flags) #3
       SystemFlags4,              // (  4) System Flags (32 Flags) #4
       SystemFlags5,              // (  4) System Flags (32 Flags) #5
       SystemFlags6,              // (  4) System Flags (32 Flags) #6
       SystemFlags7,              // (  4) System Flags (32 Flags) #7
       SystemFlags8,              // (  4) System Flags (32 Flags) #8

       LogFlags,                  // (  4) Log Flags (32 Flags)

       CatalogFlags,              // (  4) Custom Catalog On/Off Switchs.

       CopyBuffer,                // (  4) Defineable Copy Buffer

       LONG_Extras[26];           // (4x26=104)

  ULONG DisplayIDL,               // (  4) For Screen Mode (Local Nodes)
        DisplayID;                // (  4) For Screen Mode (Real Nodes)
};

//*******************************
//*******************************
//*******************************
//*****  Struct NodeData  ******* FiLE: NodeData-x.Data - (PER NODE SETTINGS!)
//*******************************
//*******************************
//*******************************

struct NodeData // 4296 Bytes
{
 TEXT  NotUsed1[264],             // (264) Not Used

       // Modem Information

       DeviceName[31],            // ( 31) serial.device

       NotUsed2[50],              // ( 50) Not Used

       Open[61],                  // ( 61) Modem INIT string
       Reset[31],                 // ( 31) Hangup/reset string
       Ring[31],                  // ( 31) RING DETECTED string
       Answer[31],                // ( 31) What to do when a ring
       Busy[31],                  // ( 31) to make the modem off-hook
       OnHook[21],                // ( 21) to make modem on-hook
       Escape[21],                // ( 21) to get modems attention
       ConnectDetect[31],         // ( 31) Connect Detect String


       NotUsed3[71],              // ( 71) Not Used

       NodePassword[21],          // ( 21) Password for this node!

       CHAR_Extra[2979];          //(2979) Not Used
 //________________________________________________________________________

 UBYTE LocalMode,                 // (  1) 0: Serial routines active  1:View Mode
       Serial_Shared,             // (  1) 0: Normal,  1: Open in shared mode
       AutoLoad,                  // (  1) 0: Yes,     1: No
       HandShake,                 // (  1) 0: RTS/CTS 1: XON/XOFF 2:NONE

       DTR,                       // (  1) 0: No, 1: Yes Drop DTR on Hangup

       Parity,                    // (  1) 0:None 1:Even 2:Odd 3:Mark 4:Space
       BitsChar,                  // (  1) 0:8 Bits 1:7 Bits
       RAD_BOG,                   // (  1) 0:off  1:on
       StopBits,                  // (  1) 0:1 Bit 1:2 Bits

       Telnet,                    // (  1) 0:No, 1: Yes (Allows connect if no connect string was detectd)

       Parse,                     // (  1) 0:Parse 1:quick

       NotUsed6,                  // (  1) Not Used

       FLUSH,                     // (  1) 0: Normal  1:FLUSH SERIAL

       NotUsed7,                  // (  1) Not Used

       TIMEOT,                    // (  1) 30(Defalut) for hangu[p on incomming call

       NotUsed8,                  // (  1)
       NotUsed9,                  // (  1)
       NotUsed10,                 // (  1)
       NotUsed11,                 // (  1)
       NotUsed12,                 // (  1)

       Define[119],               // (119) Define Flags

       PrinterDumpStatus,         // (  1)
       DEAD6,                     // (  1)
       DEAD7,                     // (  1)
       DEAD8,                     // (  1)
       Sleeplogoff,               // (  1) Time before sleep logoff - was Define[41]
       NotUsed13,                 // (  1)
       NotUsed14,                 // (  1)
       NotUsed15,                 // (  1)
       MinAccessLevel,            // (  1) Minimum access level to logon to this node.
       LoadedLanguage,            // (  1) Current Loaded Lanugage
       NumberOfRings,             // (  1) Number of rings before modem picks up.
       ModemPauseDelay,           // (  1) Delay for modem pause.
       ModemCharDelay,            // (  1) Delay in between characters.

       ReadWriteBufferSize,       // (  1) in KB
       SerialBufferSize,          // (  1) in KB

       BYTE_Extras[86];           // ( 86)
 //________________________________________________________________________

 WORD  CurrentNode,               // (  2) Current Node #

       WORDExtras[40];            // (2x40=80)
 //________________________________________________________________________

 int   SerialDeviceNumber,        // (  4) serial device unit #  (ULONG)
       DeadF1,                    // (  4) Not Used
       DEADFLAG1,                 // (  4) Not Used
       DEADFLAG2,                 // (  4) Not Used
       DEADCRAP,                  // (  4) Not Used

       FrontEnd,                  // (  4) Front End Flag

       DEADFLAG3,                 // (  4) Not Used

       INT_Extras[28];            // (4x28=112)
 //________________________________________________________________________

 long  HighestBaudRate,           // (  4) Highest BAUD RATE / DTE Rate
       MinBaudRate,               // (  4) Minimum Baud Rate

       NodeFlags1,                // (  4) Node Flags (32 Flags) #1

       NodeFlags2,                // (  4) Node Flags (32 Flags) #2
       NodeFlags3,                // (  4) Node Flags (32 Flags) #3
       NodeFlags4,                // (  4) Node Flags (32 Flags) #4
       NodeFlags5,                // (  4) Node Flags (32 Flags) #5
       NodeFlags6,                // (  4) Node Flags (32 Flags) #6
       NodeFlags7,                // (  4) Node Flags (32 Flags) #7
       NodeFlags8,                // (  4) Node Flags (32 Flags) #8

       LONG_Extras[30];           // (4x30=120)
};
//=========================================================================
//*****************************
//*****************************
//*****  Struct Msg_Area  ***** FiLE: Messages.data
//*****************************
//*****************************
//=========================================================================
struct Msg_Area  // 294 Bytes Per Area
{
 TEXT     Name[31],       // ( 31) Name of Area
          What[41],       // ( 41) Description of Area
          Path[51],       // ( 51) Path
          Password[21],   // ( 21) Password
          EChar[50];      // ( 50)

 BYTE     ON,             // (  1) On/Off Switch
          Sex,            // (  1) Sex Type Allowed (0:Both,1:Male Only,2:Female Only)
          EBYTE[20];      // ( 20)

 UBYTE    AccessLevel,    // (  1) Minimum Access Level Required
          Area,           // (  1) Area Number
          MinAge,         // (  1) Minimum Age to enter
          MaxAge,         // (  1) Maximum Age allowed to enter
          Allow,          // (  1) DEAD FLAG - 0 = All, 1=Private Only, 2=Public Only, 3=Aynonoums Only
          EUBYTE[19];     // ( 19)

 WORD     RollOver,       // (  2)
          WExtras[4];     // (2x4=8)

 int      Eint[4];        // (4x4=16)
 long     ELong[5];       // (4x5=20)

 LONGBITS Flags1,         // (  4)
          Flags2;         // (  4)
};

#define MA1_ALLOW_MSGREAD  (1<<0) // Allow Users to read messages  (0=Off,1=On)
#define MA1_ALLOW_MSGPOST  (1<<1) // Allow Users to write messages (0=Off,1=On)

#define MA1_ALLOW_PUBLIC   (1<<2) // Allow Public Msgs             (0=Off,1=On)
#define MA1_ALLOW_PRIVATE  (1<<3) // Allow Private Msgs            (0=Off,1=On)
#define MA1_ALLOW_ANON     (1<<4) // Allow Anonymous Msgs          (0=Off,1=On)
#define MA1_ALLOW_EALL     (1<<5) // Allow EALL's / Priority Mail. (0=Off,1=On)

#define MA1_ALLOW_EDIT     (1<<6) // Allow Edit of existing messages. (0=Off,1=On)
#define MA1_ALLOW_ULPOST   (1<<7) // Allow Msgs to be uploaded        (0=Off,1=On)
#define MA1_ALLOW_ATTACH   (1<<8) // Allow Files to be attached to messages. (0=Off,1=On)
#define MA1_FORCE_ANON     (1<<9) // Force Amonymous Messages (0=NO, 1=YES)

//#define MA1_
//#define MA1_
//#define MA1_
//#define MA1_
//#define MA1_
//#define MA1_
//#define MA1_
//=========================================================================
//******************************
//******************************
//*****  Struct File_Area  ***** FiLE: Files.data
//******************************
//******************************
//=========================================================================
struct File_Area // 298 Bytes Per Area
{
 TEXT     Name[31],       // ( 31) Name of Area
          What[41],       // ( 41) Description of Area
          Path[51],       // ( 51) Path
          Password[21],   // ( 21) Password to enter.
          EChar[50];      // ( 50)

 BYTE     DelMonths,      // (  1) Deletion Months, 0 = Disabled.
          ON,             // (  1) On/Off Switch
          Sex,            // (  1) Sex Type Allowed (0:Both,1:Male Only,2:Female Only)

          ULTimesCredit,  // (  1) How many times credit a user gets given for uploads
          DLTimesCredit,  // (  1) How many times credit a user gets taken for downloads
                          //       0 & 1 both give 1x credit, to give no credits there is
                          //       another flag for that.
          EBYTE[18];      // ( 18)

 UBYTE    AccessLevel,    // (  1) Minimum Access Level Required
          Area,           // (  1)
          MinAge,         // (  1)
          MaxAge,         // (  1)
          ULTimeReward,   // (  1) Upload Time Reward Percentage.
          DLTimeReward,   // (  1) Download Time Reward Percentage.
          DLBonusReward,  // (  1) Reward given to upload for every download of his UL's
          FileIDDetection,// (  1) Dead Flag!
          FileIDCreation, // (  1) Dead Flag!
          Allow,          // (  1) Dead Flag!
          Catalogs,       // (  1) Number of Catalog Listings in Area
          MaxFNLength,    // (  1) Max FileName Length Allowed in this area

          EUBYTE[15];     // ( 15)

 WORD     RollOver,       // (  2) (NOT USED YET)
          WExtras[4];     // (2x4=8)
 int      Eint[4];        // (4x4=16)
 long     ELong[5];       // (4x5=20)

 LONGBITS Flags,          // (  4)
          Flags2;         // (  4)
};
// Flags Bits

#define FA_FREEDL           (1<<2) // All files are free donwload?     0=No, 1=Yes
#define FA_NOULCREDITS      (1<<3) // No Upload Credits for this area. 0=Credits, 1=No
#define FA_AUTOVALIDATE     (1<<4) // Files are auto validated?        0=No, 1=Yes
#define FA_ALLOW_UPLOAD     (1<<5) // Allow Uploading                  0=No
#define FA_ALLOW_DOWNLOAD   (1<<6) // Allow Downloading                0=No
#define FA_ALLOW_VIEWLIST   (1<<7) // Allow viwing file listings       0=No
#define FA_USECDDATPATH     (1<<8) // Use CD/DAT Temporary Path        0=No
#define FA_CatDupeFileCheck (1<<9) // Use Dupe File Check              0=No
//=========================================================================
//****************************
//*****  Struct Letters  ***** FiLE: MsgArea_x.data
//****************************
//=========================================================================
struct Letters  // 176 Bytes
{
 TEXT  Receiver [31],     // ( 31)
       Sender   [31],     // ( 31)
       Subject  [31];     // ( 31)

 UBYTE Type,              // (  1) 0 Public, 1 Private, 2 MassMail
       Kind2;             // (  1) Not used   (Forwarded Msg)

 BYTE  Extra1;            // (  1) Not Used

 UWORD Lines,             // (  2) Number of lines in message
       Read;              // (  2) Times the message has been read

 long  Sent,              // (  4) Time posted
       Rcvd;              // (  4) Time Received

 ULONG Area,              // (  4) Msg Area Number
       SubArea,           // (  4) DEAD (NOT USED)
       Number,            // (  4) Actual Msg Number
       NumberInArea,      // (  4) Msg # from Area msg is stored in.
       ReplyFrom,         // (  4) Replied from Msg #
       FirstReply;        // (  4) First Reply to Msg

 // Restrictions

 TEXT  Password[4],       // (  4) (MASS MAIL ONLY) Optional Password
       StateCode[4],      // (  4) (MASS MAIL ONLY) Optional State Code
       CountryCode[4];    // (  4) (MASS MAIL ONLY) Optional Country Code

 UBYTE MinAccessLev,      // (  1) (MASS MAIL ONLY) Minimum Access Level to read message
       MaxAccessLev,      // (  1) (MASS MAIL ONLY) Maximum Access Level that can read message
       MinAge,            // (  1) (MASS MAIL ONLY) Minimum Age
       MaxAge,            // (  1) (MASS MAIL ONLY) Maximum Age
       DelDays;           // (  1) Delete after so many days.

 BYTE  Extra2;            // (  1) Not Used

 LONGBITS Flags1,         // (  4) Flags 1 (look below)
          Flags2;         // (  4) Flags 2 (look below)

 char extraroom[18];      // ( 18) Not Used
};

#define LET_ACTIVE     (1<<0)  // Active/Deleted, 0=Active, 1=Deleted
#define LET_ANONYMOUS  (1<<1)  //
#define LET_LOCKED     (1<<2)  // Locked Msg, 0=No, 1=Yes (can't be deleted)

#define LET_ATTACHFILE (1<<10) // Attached Files? 0=No, 1=Yes
#define LET_DEL_A_FILE (1<<11) // Auto Delete Attached Files? 0=No, 1=Yes

//=========================================================================
struct LettersPointer     // FiLE: MsgArea_x.point
{                         // TOTAL SIZE: 12
 ULONG SlotPosition,      // (  4)
       FirstNumber,       // (  4)
       LastNumber;        // (  4)
};
//=========================================================================
struct LettersIdx         // FiLE: MsgArea_x.idx
{                         // TOTAL SIZE: 66
 TEXT  Receiver [31],     // ( 31)
       Sender   [31];     // ( 31)
 ULONG Number;            // (  4)
};
//=========================================================================
struct LettersCSum        // FiLE: MsgArea_x.csum
{                         // TOTAL SIZE: 4
 UWORD Receiver,          // (  2)
       Sender;            // (  2)
};
//=========================================================================
//**************************
//*****  Today Struct  *****  FiLE: Runtime.data
//**************************
//=========================================================================
struct Today // 424 Bytes
{
 TEXT   NMName[31],   // ( 31) Name who sent message to next caller
        TEXTextra[45];// ( 45)

 UWORD  CBAUD[20],    // (2x20=40) 300,1200,2400,4800,7200,9600,12000,14400,16800,19200,28800
        AbortedDl,    // (  2) Number of Aborted Uploads today (May not be installed)
        AbortedUl,    // (  2) Number of Aborted Downloads today (May not be installed)
        UpRes,        // (  2) Number of Resumed Uploads today (May not be installed)
        DLRes,        // (  2) Number of Resumed Downloads today (May not be installed)
        Users,        // (  2)
        Uploads,      // (  2) Number of Uploads today
        Downloads,    // (  2) Number of Downloads today
        Feedback,     // (  2) Number of Comment to Sysops today
        New,          // (  2) Number of New Users today
        Messages,     // (  2) Number of Messages Posted today
        F_Sysop;      // (  2)

 int    Calls,        // (  4) Number of Calls Today
        NMAno,        // (  4)
        BBSNumbers,   // (  4)
        Busy,         // (  4) Minutes Busy Today
        intextra1,    // (  4)
        intextra2,    // (  4)
        Total;        // (  4)

 long   dl_bytes,     // (  4) D/L Bytes Today
        ul_bytes,     // (  4) U/L Bytes Today
        NMDate,       // (  4)
        TODAY,        // (  4)
        L_ext1,       // (  4)
        L_ext2,       // (  4)
        connected;    // (  4)

 TEXT   Last[31];     // ( 31) Last Caller on BBS
 BYTE   BYTEextra1;   // (  1) Not Used

 UWORD  CurrentUser;  // (  2) Current User Online Slot Number

 TEXT   Reserved[31]; // ( 31) Reserved Caller
 BYTE   BYTEextra2;   // (  1) Not Used

 UWORD  CTYPE[20];    // (2x20=40) (0,HST),(1,v32),(2,vFC),(3,v34),(4,Telnet)

 LONG   LastLogOff,   // (  4) Used to cacluate the idle time of a node.
        ReservedWhen, // (  4) Reserved Node at xxx time
        ReservedTime; // (  4) Reserve Node for how many minutes
 TEXT   ExtraNotUsed[112]; // (112)
};
//=========================================================================
//*******************
//*****  Rates  *****  FiLE: Baud-x.data (x=Node)
//*******************  Total Size: 76
//=========================================================================
struct RATES
{
 ULONG MinNewUserBaud,      // (  4)
       MinULBaud[24],       // ( 24)
       MinDLBaud[24],       // ( 24)
       MinConnectBaud[24];  // ( 24)
};
//=========================================================================
//****************************
//*****  Presets Struct  *****  FiLE: Presets.Data
//****************************
//=========================================================================
struct Defaults  // 418 bytes per preset
{
 char     MB[41],          // ( 41) Msg Base Access Flags
          FB[41];          // ( 41) File Base Access Flags

 UBYTE    Security,        // (  1) Secuity Level
          F_Ratio,         // (  1) File Ratio
          B_Ratio,         // (  1) Byte Ratio
          IdleTime,        // (  1) Bypass Idle Time
          ViewMode,        // (  1) File Listing View Mode
          NotUsed;         // (  1) Not Used

 UWORD    DayCredits,      // (  2)
          FileCredits,     // (  2)
          WeedDays,        // (  2)
          ReduceDays,      // (  2)
          ReducedAccess;   // (  2)

 UWORD    Limit_Calls,     // (  2) Limit Calls
          Limit_Posts,     // (  2) Limit Posts
          Limit_ULFiles,   // (  2) Limit Upload Files
          Limit_DLFiles,   // (  2) Limit Download Files
          Limit_Time,      // (  2) Limit Time
          Limit_TimeBank,  // (  2) Limit Time Bank Minutes
          Limit_ChatTime;  // (  2) Limit Chat Time
 ULONG    Limit_ULBytes,   // (  4) Limit Upload Bytes
          Limit_DLBytes;   // (  4) Limit Download Bytes

 UWORD    Total_ULFiles,   // (  2) Starting Total Uploaded Files
          Total_DLFiles;   // (  2) Starting Total Downloaded Files
 ULONG    Total_ULBytes,   // (  4) Starting Total Uploaded Bytes
          Total_DLBytes,   // (  4) Starting Total Downloaded Bytes
          ByteCredits,     // (  4) Byte Credits
          PersonalBytes;   // (  4) Personal Bytes

 LONGBITS NFlags1,         // (  4) Normal User Flags 1
          NFlags2,         // (  4) Normal User Flags 2
          SFlags1,         // (  4) Sysop User Flags 1
          SFlags2,         // (  4) Sysop User Flags 2
          CatFlags;        // (  4) Catalog Flags

 char     CExtra[110];     // (110)
 UBYTE    UBExtra[50];     // ( 50)
 UWORD    UWExtra[25];     // ( 25)
 ULONG    ULExtra[12];     // ( 12)
};
//=========================================================================
//*******************************
//*****  Flag Files Struct  *****
//*******************************
//=========================================================================
struct FLAG // 116 Bytes per entry
{
 TEXT  FileName[31],         // ( 31)
       ShortDesc[47];        // ( 47)
 ULONG Area,                 // (  4)
       SubArea,              // (  4)
       Number,               // (  4)
       Bytes;                // (  4)
 BYTE  COST;                 // (  1) 0=Normal , 1=Free
 char  filler[21];           // ( 21)
};
//=========================================================================
//****************************
//*****  Catalog Struct  *****  FiLE: Catalog_x.data
//****************************   132 Bytes
//=========================================================================
struct Catalogs
{
 ULONG    SeekPosition;      // (  4) Seek Position for Description Entry
 UWORD    SizeOfEntry;       // (  2) Size to Read In

 TEXT     FileName[31],      // ( 31)
          Uploader[31],      // ( 31)
          Password[4],       // (  4)
          DateComment[9];    // (  9) Date Comment Overlay

 BYTE     Security,          // (  1) 1 = Public, -1 = Sysop, -2 = UnVal, -3 = BadArchive
          Level,             // (  1) Secuirty Level Number to download/view.
          LevelType;         // (  1) Secuirty Type (Below, Equal too, Greather than

 WORD     PurgeDays,         // (  2) Days before Auto Purge
          ReceiverSlot,      // (  2) Slot Number of Receiver
          TimesDL;           // (  2) Times Downloaded

 long     DateU,             // (  4) Date file was uploaded
          LastDateD,         // (  4) Last Date file was downloaded
          DAfterDate,        // (  4) Date that file can start being downloaded
          PurgeDate,         // (  4) Purge file after this date.
          ExtraDate;         // (  4)

 ULONG    Bytes;             // (  4) Filesize

 UWORD    FilePayBack,       // (  2) File Payback to U/L
          FileCost;          // (  2) File Cost to D/L
 ULONG    BytePayBack,       // (  4) Byte PayBack to U/L
          ByteCost;          // (  4) Byte Cost for D/L

 UWORD    BestCPS;           // (  2)

 LONGBITS Flags;             // (  4) Active,Free,ExtDesc,DLock,ELock,HDOnline,ArcTest- 32 Togglable Bits
};
//=========================================================================
//*********************************
//*****  Fast Catalog Struct  *****  FiLE: Catalog_x.seek
//*********************************   37 bytes
//=========================================================================
struct SeekCatalogs
{
 ULONG    SeekPosition;      // (  4) Seek Position for Description Entry
 UWORD    SizeOfEntry;       // (  2) Size to Read In
 TEXT     FileName[31];      // ( 31)
};
//=========================================================================
struct CatalogsIndex  // Catalog Index File
{
 char FileName[31];          // ( 31)
};
//=========================================================================
//*****************************************
//*****  Catalog Descriptions Struct  *****
//*****************************************
//=========================================================================
struct CatalogsD   // Just a work structure, does NOT match any files.
{
 TEXT DateU[9],              // (  9)
      LastDateD[9],          // (  9)
      Receiver[31];          // ( 31)
 BYTE NotUsed;               // (  1)

 TEXT Line[20][46];          // (20x46=920)
};
//=========================================================================
struct R_SLOTS
{                            // TOTAL SIZE: 96
 UBYTE MinAccess00[24],      // ( 24)
       MinAccess15[24],      // ( 24)
       MinAccess30[24],      // ( 24)
       MinAccess45[24];      // ( 24)
};
/* the struct to tell the protocol what files are to be downloaded */
//=========================================================================
struct Down_Load // 548 Bytes
{
 TEXT File[255],             // (255)
      FileName[31],          // ( 31)
      ShortDesc[46],         // ( 46)
      ex_string[124];        // (124)

 int  Area,                  // (  4)
      Cost,                  // (  4)
      FileNumber;            // (  4)

 ULONG SubArea;              // (  4)

 int  ex_ints[8];            // (4x8=32)
 long Bytes;                 // (  4)
 LONGBITS Flags;             // (  4)    (1<<0) = CD Rom Path or not.
 long ex_longs[9];           // (4x9=36)
};
//=========================================================================
// the protocol, fills in these stats about each file downloaded so the bbs
// knows what happened, and how to charge the user for the downloads
//=========================================================================
struct DownLoad_Status
{
 TEXT  File[255],            // (255)
       FileName[31],         // ( 31)
       extra[1244];          //(1244)

 int   Cost,                 // (  4) 1: Free dl,  0: charge normal
       Area,                 // (  4)
       Good,                 // (  4)
       Errors,               // (  4)
       Mins,                 // (  4)
       Secs,                 // (  4)
       FileNumber;           // (  4)

 ULONG SubArea;              // (  4)

 int   ex_ints[6];           // (4x6=24)

 long  First_Byte_Sent,      // (  4)
       Last_Byte_Sent,       // (  4)
       Bytes_To_Charge,      // (  4)
       Files_To_Charge,      // (  4)
       CPS,                  // (  4)
       FileSize,             // (  4)
       Seconds,              // (  4)
       ex_longs[9];          // (4x9=36)
};
//=========================================================================
struct Name  // Accounts Index File
{
 char Username[31];          // ( 31)
};
//=========================================================================
struct TempMessage // New Tempest Server Structure.
{
 struct Message Msg;         // (  ?)
 UWORD  command;             // (  2)
 UWORD  node;                // (  2)

 WORD   word1;               // (  2)
 WORD   word2;               // (  2)
 WORD   word3;               // (  2)

 LONG   long1;               // (  4)
 LONG   long2;               // (  4)
 LONG   long3;               // (  4)

 ULONG  ulong1;              // (  4)
 ULONG  ulong2;              // (  4)
 ULONG  ulong3;              // (  4)

 char string[200];           // (200) string for passing strings.
 char extra[200];            // (200) Extra space for future variables.
};
//=========================================================================
//***********************
//***********************
//*****  Node_Info  *****  FiLE: NodeInfo_x
//***********************
//***********************  // Add a ton more extra pointers next upgrade.
//=========================================================================
struct node_info // 132 Bytes
{
 struct Globals *GLOB;

 int  *mode;

 long *fileshouldbe;
 long *timelimit;

 struct User *UserInfo;
 struct SystemData *SystemDataInfo;
 struct NodeData *NodeDataInfo;
 struct Today *TodayInfo;
 struct Iconify *IconInfo;
 struct OptMenu *OM;              // Not used for anything

 struct Screen *screen1Info;
 struct Window *windowInfo, *StatusPaneInfo, *iconInfo, *twindowInfo;

 struct IOExtSer *WriteSerReqInfo, *ReadSerReqInfo;
 struct IOStdReq *WriteConReqInfo, *ReadConReqInfo;
 struct IOStdReq *StatWriteReqInfo;

 struct MsgPort *WriteSerPortInfo, *ReadSerPortInfo, *TimerPortInfo;
 struct MsgPort *WriteConPortInfo, *ReadConPortInfo;
 struct MsgPort *StatWritePortInfo;

 struct timerequest *TimerMsgInfo;
 struct Msg_Area *MSGInfo;
 struct File_Area *FILESInfo;
 struct RATES *RATESInfo;
 struct R_SLOTS *R_SLOTSInfo;
 struct Questions *NotUsedAnyMore; // Get rid of in future version
 struct Runtimeinfo *RI;            // Get rid of in future version
};
//=========================================================================
struct tmenus
{
 struct OptMenu *optmenus[8]; // Global, Conf, MsgA, FileA, Bulls, Doors, FileList, MsgRead

 UWORD optlimits[8];
};

//******************************
//*****  System_Info File  ***** FiLE: Node:system_info   
//******************************
//=========================================================================
struct system_info // 228 Bytes
{
 struct SystemData   *SystemData;   // System Data structure
 struct Msg_Area     *Msg_Areas;    // Message Base Data
 struct File_Area    *File_Areas;   // File Base Data
 struct ScreenColors *ScreenColors;
 struct F_KEYS       *FK;

 char *extras[49];

 char                  *prompts;    // prompts.set file
 struct ptable         *ptable;     // Table for prompts.set
 struct tmenus         *MS;         // For Loaded in defined command sets
};

