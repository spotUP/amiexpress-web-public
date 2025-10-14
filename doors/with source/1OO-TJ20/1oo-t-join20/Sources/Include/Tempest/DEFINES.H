#define UPARROW         300
#define SHIFTUPARROW    301

#define DOWNARROW       400
#define SHIFTDOWNARROW  401

#define LEFTARROW       500
#define SHIFTLEFTARROW  501

#define RIGHTARROW      600
#define SHIFTRIGHTARROW 601

// long UserBitsA 32 bits of toggle info for the user

#define B_EXPERT         (1<<0)  // Expert Mode On/Off
#define B_ANSI           (1<<1)  // Ansi        On/Off
#define B_MSGSTATS       (1<<2)  // Msg Info    On/Off
#define B_TIMEBAR        (1<<3)  // Time Bar    On/Off
#define B_BLANKLINE      (1<<4)  // Not USed?
#define B_REJOIN         (1<<5)  // Last in Msg or File Area (On=File Area)
#define B_MSGEDITOR      (1<<6)  // Internal / Full Screen Editors
#define B_CHECK_EMAIL    (1<<7)  // Auot Email Check On/oFf
#define B_FSCAN          (1<<8)  // File Scan direction
#define B_NEWUSERF       (1<<9)  // 0=Normal User, 1=NEW
#define B_SCRCLEAR       (1<<10) // 0=No , 1=Yes Screen Clear
#define B_PRESERVE       (1<<11) // 0=OK to delete, 1=Preserve
#define B_KEEPFLAGFILES  (1<<12) // Keep FlaggedFiles after logoff
#define B_ANNOUNCEUSERS  (1<<13) // Whether BBS Annouces other user's login/logoff
#define B_LSCRCLEAR      (1<<14) // File Listing Clear Screen
#define B_SEX            (1<<15) // Sex of User, 0=Male, 1=FeMale


// long UserBitsB 32 bits of toggle info for the user

#define B2_LP_ViewWelcome  (1<<0) //0 = On,  1 = Off
#define B2_LP_ViewWho      (1<<1) //0 = On,  1 = Off
#define B2_LP_AutoInvis    (1<<2) //0 = Off, 1 = On
#define B2_LP_AreaDisplay  (1<<3) //0 = On,  1 = Off
#define B2_LP_AutoMute     (1<<4) //0 = off, 1 = On
#define B2_LP_AnounceUsers (1<<5) //0 = Off, 1 = On

// Catalog Bit Flags

#define C_ACTIVE   (1<<0) // Active File Yes/No
#define C_FREE     (1<<1) // Free File   Yes/No
#define C_EXTDESC  (1<<2) // Extended Description Yes/No
#define C_DLOCK    (1<<3) // Deletion Protection (On=Protected)
#define C_ELOCK    (1<<4) // Editable Protection (On=Protected)
#define C_HDSTATUS (1<<5) // (On=Offline File)
#define C_ARCTEST  (1<<6) // Archive Tested
//#define C_       (1<<7)

// Account Editor Normal User Flags

#define NF1_MsgBaseAccess      (1<<0)
#define NF1_FileBaseAccess     (1<<1)
#define NF1_BulletinsAccess    (1<<2)
#define NF1_DoorsAreaAccess    (1<<3)
#define NF1_VotingBoothAccess  (1<<4)
#define NF1_FileMailAccess     (1<<5)
//#define NF1_                 (1<<6)
#define NF1_CanChangeAlias     (1<<7)
#define NF1_AbletoReLogon      (1<<8)
#define NF1_DefeatPageToggle   (1<<9)
#define NF1_DefeatSlowBaud     (1<<10)
#define NF1_DefeatLowAccess    (1<<11)
#define NF1_AreaUserList       (1<<12)
#define NF1_BreakSysopChat     (1<<13)
#define NF1_ViewWelcomeScreen  (1<<14)
#define NF1_ViewNodeLists      (1<<15)
#define NF1_InternodeMsgSend   (1<<16)
#define NF1_InternodeLineChat  (1<<17)
#define NF1_InternodeLiveChat  (1<<18)
#define NF1_RecieveNodeMsgs    (1<<19)
#define NF1_AbilitytoHide      (1<<20)

#define NF1_ReadMassMail       (1<<21)
#define NF1_ReadMessages       (1<<22)
#define NF1_PostMessages       (1<<23)
#define NF1_ReplytoMessages    (1<<24)
#define NF1_PostAnonymously    (1<<25)
#define NF1_UploadMsgAbility   (1<<26)
#define NF1_PrivateAnywhere    (1<<27)
//#define NF1_                 (1<<28)
#define NF1_MsgToNextCaller    (1<<29)
#define NF1_ForwardOwnMail     (1<<30)
#define NF1_EditOwnMail        (1<<31)
//#define NF2_                 (1<<0)
//#define NF2_                 (1<<1)
//#define NF2_                 (1<<2)
//#define NF2_                 (1<<3)
//#define NF2_                 (1<<4)
//#define NF2_                 (1<<5)
//#define NF2_                 (1<<6)
//#define NF2_                 (1<<7)
//#define NF2_                 (1<<8)
#define NF2_ArchiveMessages    (1<<9)

#define NF2_ViewFileListings   (1<<10)
#define NF2_DownloadAbility    (1<<11)
#define NF2_UploadAbility      (1<<12)
#define NF2_ViewTextFiles      (1<<13)
#define NF2_ViewTestArchives   (1<<14)
#define NF2_UploadsAutoValid   (1<<15)
#define NF2_SendFileMail       (1<<16)
#define NF2_CDRomTapeWorm      (1<<17)
#define NF2_DeleteOwnFiles     (1<<18)
//#define NF2_                 (1<<19)
#define NF2_TelnetInAbility    (1<<20)
#define NF2_FTPInAbility       (1<<21)
//#define NF2_                 (1<<22)
//#define NF2_                 (1<<23)
//#define NF2_                 (1<<24)
//#define NF2_                 (1<<25)
//#define NF2_                 (1<<26)
//#define NF2_                 (1<<27)
//#define NF2_                 (1<<28)
//#define NF2_                 (1<<29)
#define NF2_ArchiveCatalogs    (1<<30)
//#define NF2_                 (1<<31)


// Account Editor Sysop User Flags

#define SF1_EditSysopFlags      (1<<0)
#define SF1_AccountEditor       (1<<1)
#define SF1_EditOwnAccount      (1<<2)
#define SF1_DropToDos           (1<<3)
#define SF1_EditAnyTextFiles    (1<<4)
#define SF1_BBSConfigModule     (1<<5)
#define SF1_ViewBBSLogs         (1<<6)
#define SF1_SpecialUserLog      (1<<7)
#define SF1_ViewNewUserApps     (1<<8)
#define SF1_CreateAccounts      (1<<9)
//#define SF1_                  (1<<10)
//#define SF1_                  (1<<11)
#define SF1_SysopUserList       (1<<12)
//#define SF1_                  (1<<13)
//#define SF1_                  (1<<14)
//#define SF1_                  (1<<15)
#define SF1_SysopWho            (1<<16)
#define SF1_InternodeControl    (1<<17)
#define SF1_InternodeWatch      (1<<18)
#define SF1_InteractiveWatch    (1<<19)
#define SF1_CaptureUsersCalls   (1<<20)

#define SF1_PostMassMail        (1<<21)
#define SF1_ForwardAnyMail      (1<<22)
#define SF1_EditAnyMail         (1<<23)
#define SF1_EditMessageHeader   (1<<24)
#define SF1_DeleteAnyMail       (1<<25)
#define SF1_ViewPasswordMsgs    (1<<26)
#define SF1_AttachFilestoMsg    (1<<27)
#define SF1_ViewAllEMail        (1<<28)
//#define SF1_                  (1<<29)
//#define SF1_                  (1<<30)
//#define SF1_                  (1<<31)
//#define SF2_                  (1<<0)
//#define SF2_                  (1<<1)
//#define SF2_                  (1<<2)
#define SF2_BypassKickOff       (1<<3)
#define SF2_BypassAbortTrans    (1<<4)
#define SF2_MultipleLogin       (1<<5)
#define SF2_NoChargesforDLs     (1<<6)
#define SF2_BypassULDLLimits    (1<<7)
#define SF2_BypassMsgLimits     (1<<8)
#define SF2_BypassTimeLimits    (1<<9)

#define SF2_FileMaintance       (1<<10)
#define SF2_DLFilesNotListed    (1<<11)
#define SF2_ViewDLSysopFiles    (1<<12)
#define SF2_FullPathDownload    (1<<13)
#define SF2_DeleteAnyFile       (1<<14)
#define SF2_ViewPasswordFiles   (1<<15)
#define SF2_ValidateUploads     (1<<16)
#define SF2_ViewAllFileMail     (1<<17)
#define SF2_ViewTextbyPath      (1<<18)
#define SF2_LocalUploading      (1<<19)
//#define SF2_                  (1<<20)
//#define SF2_                  (1<<21)
//#define SF2_                  (1<<22)
//#define SF2_                  (1<<23)
//#define SF2_                  (1<<24)
//#define SF2_                  (1<<25)
//#define SF2_                  (1<<26)
//#define SF2_                  (1<<27)
//#define SF2_                  (1<<28)
//#define SF2_                  (1<<29)
#define SF2_PayUser             (1<<30)
//#define SF2_                  (1<<31)

// SystemData System Flags #1 & 2

#define SD1_LINKMSGFILEAREA     (1<<0)
#define SD1_NoNewUsers          (1<<1)
#define SD1_NewUserQuestions    (1<<2)
#define SD1_DefaultSysopAvail   (1<<3)
#define SD1_AskWhyBeforeChat    (1<<4)
#define SD1_UserCanBreakChat    (1<<5)
#define SD1_WhoOnLogon          (1<<6)
#define SD1_AllowHidingInWho    (1<<7)
#define SD1_RealNamesOnly       (1<<8)
#define SD1_MsgToNextCaller     (1<<9)
#define SD1_ReturnMsgPrompt     (1<<10)
#define SD1_CaptureFilter       (1<<11)
#define SD1_GoodbyeOptPrompt    (1<<12)
#define SD1_PWHackOptions       (1<<13)
#define SD1_BulletinsOnLogon    (1<<14)
#define SD1_StatsDuringLogon    (1<<15)
#define SD1_CanSkipLogOnOff     (1<<16)
#define SD1_AllowWildCardLogin  (1<<17)
#define SD1_AllowAnonymousMsg   (1<<18)
#define SD1_AllowPasswordMsgs   (1<<19)
#define SD1_AllowPasswordFile   (1<<20)
#define SD1_OpenScreenLogin     (1<<21)
#define SD1_OpenStatWinLogin    (1<<22)
#define SD1_OpenUserStatWin     (1<<23)
#define SD1_RemoveLogonStats    (1<<24)
// #define SD1_                  (1<<25)
// #define SD1_                  (1<<26)
// #define SD1_                  (1<<27)
// #define SD1_                  (1<<28)
#define SD1_LoadNodeDelay        (1<<29)
//#define SD1_                  (1<<30)
// #define SD1_                  (1<<31)

// #define SD2_                  (1<<0)
// #define SD2_                  (1<<1)
// #define SD2_                  (1<<2)
// #define SD2_                  (1<<3)
// #define SD2_                  (1<<4)
// #define SD2_                  (1<<5)
// #define SD2_                  (1<<6)
#define SD2_TimeBarDisplay      (1<<7)
#define SD2_ULFileNamePrompt    (1<<8)
#define SD2_DownloadCounter     (1<<9)
#define SD2_NoByteFileLimits    (1<<10)
#define SD2_AllFilesFree        (1<<11)
#define SD2_CountAborted        (1<<12)
#define SD2_OnlyResumedBytes    (1<<13)
#define SD2_ByteFileTimeChk     (1<<14)
#define SD2_FlagFileRatioChk    (1<<15)
#define SD2_ULFileTypePrompt    (1<<16)
#define SD2_ExtendedDescription (1<<17)
#define SD2_SelectDestUploads   (1<<18)
#define SD2_AllowDLInArchive    (1<<19)
#define SD2_AutoFlaggingonDL    (1<<20)
#define SD2_BatchULBP           (1<<21)
#define SD2_CatDupeFileCheck    (1<<22)
#define SD2_UseFileSignatures   (1<<23)
#define SD2_SubDupeFileCheck    (1<<24)
#define SD2_DetectFileid        (1<<25)
#define SD2_AutoUseFileid       (1<<26)
#define SD2_CreateFileid        (1<<27)
#define SD2_AutoCreateFileid    (1<<28)
#define SD2_FileidAnsiStrip     (1<<29)
#define SD2_UseLargeFileid      (1<<30)
// #define SD2_                  (1<<31)

// NodeData Node Flags #1 & 2

#define ND1_WelcomeBulletin   (1<<0)
#define ND1_HideCopyMovePaths (1<<1)
#define ND1_AllowDropToDos    (1<<2)
#define ND1_GuestLogonAbility (1<<3)
#define ND1_StealthPassEntry  (1<<4)
// #define ND1_                  (1<<5)
// #define ND1_                  (1<<6)
// #define ND1_                  (1<<7)
// #define ND1_                  (1<<8)
// #define ND1_                  (1<<9)
// #define ND1_                  (1<<10)
// #define ND1_                  (1<<11)
// #define ND1_                  (1<<12)
// #define ND1_                  (1<<13)
// #define ND1_                  (1<<14)
// #define ND1_                  (1<<15)
// #define ND1_                  (1<<16)
// #define ND1_                  (1<<17)
// #define ND1_                  (1<<18)
// #define ND1_                  (1<<19)
// #define ND1_                  (1<<20)
// #define ND1_                  (1<<21)
// #define ND1_                  (1<<22)
// #define ND1_                  (1<<23)
// #define ND1_                  (1<<24)
// #define ND1_                  (1<<25)
// #define ND1_                  (1<<26)
// #define ND1_                  (1<<27)
// #define ND1_                  (1<<28)
// #define ND1_                  (1<<29)
// #define ND1_                  (1<<30)
// #define ND1_                  (1<<31)

// #define ND2_                  (1<<0)
// #define ND2_                  (1<<1)
// #define ND2_                  (1<<2)
// #define ND2_                  (1<<3)
// #define ND2_                  (1<<4)
// #define ND2_                  (1<<5)
// #define ND2_                  (1<<6)
// #define ND2_                  (1<<7)
// #define ND2_                  (1<<8)
// #define ND2_                  (1<<9)
// #define ND2_                  (1<<10)
// #define ND2_                  (1<<11)
// #define ND2_                  (1<<12)
// #define ND2_                  (1<<13)
// #define ND2_                  (1<<14)
// #define ND2_                  (1<<15)
// #define ND2_                  (1<<16)
// #define ND2_                  (1<<17)
// #define ND2_                  (1<<18)
// #define ND2_                  (1<<19)
// #define ND2_                  (1<<20)
// #define ND2_                  (1<<21)
// #define ND2_                  (1<<22)
// #define ND2_                  (1<<23)
// #define ND2_                  (1<<24)
// #define ND2_                  (1<<25)
// #define ND2_                  (1<<26)
// #define ND2_                  (1<<27)
// #define ND2_                  (1<<28)
// #define ND2_                  (1<<29)
// #define ND2_                  (1<<30)
// #define ND2_                  (1<<31)


#define ND3_NullModem            (1<<0)
// #define ND3_                  (1<<1)



// System Catalog Flags. (32)

#define CF_AnsiOnOff        (1<<0) //1=On
#define CF_SentBy           (1<<1) //1=On
#define CF_UseSeperater     (1<<2) //1=On
#define CF_CustomSentBy     (1<<3) //1=Used
#define CF_UploadTime       (1<<4) //1=On
#define CF_ArchiveDatesLine (1<<5) //1=On
#define CF_DateSeperater    (1<<6) //1=On

// System Log Flags On/Off

#define LOG_CallersMain      (1<<0) //1=On
#define LOG_CallersMsg       (1<<1) //1=On
#define LOG_CallersTransfer  (1<<2) //1=On
#define LOG_CallersDoors     (1<<3) //1=On
#define LOG_SysopActivity    (1<<4) //1=On
#define LOG_Capture          (1<<5) //1=On
#define LOG_Debug            (1<<6) //1=On

