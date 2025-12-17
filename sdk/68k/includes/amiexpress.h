/*
 * AmiExpress Door API Header
 * vbcc-compatible header for C door development
 *
 * Based on AEKIT101 SDK - DoorHeader.h, Glue.h, and AmiConSASc.c
 */

#ifndef AMIEXPRESS_H
#define AMIEXPRESS_H

/* Include configuration and type definitions */
#include "config.h"

/* Standard C headers - conditionally included for host development */
#ifdef __AMIGA_CROSS__
/* Cross-compilation: no standard headers */
#else
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#endif

/* Seek constants */
#define FOREVER for(;;)
#define NL NULL

/* JHMessage structure - Core communication structure */
#ifndef __VBCC__
struct JHMessage {
    struct Message Msg;        /* Exec message structure */
    char String[200];          /* Info buffer */
    int Data;                  /* Read/Write & result indicator */
    int Command;               /* Command sent from door */
    int NodeID;                /* Reserved */
    int LineNum;               /* Reserved */
     unsigned long signal;      /* Reserved */
     Process *aeproc;           /* BBS process pointer */
    APTR *Semi;                /* Multicom semaphore */
    APTR Filler1;              /* Bulk data pointer */
    APTR Filler2;              /* Bulk data pointer */
};
#endif

/* Command Constants - From DoorHeader.h */

/* Core JH Commands (0-99) */
#define JH_LI             0    /* Line input with default */
#define JH_REGISTER       1    /* Register door with node */
#define JH_SHUTDOWN       2    /* Shutdown door */
#define JH_WRITE          3    /* Send text (no CR) */
#define JH_SM             4    /* Send text with optional CR/LF */
#define JH_PM             5    /* Prompt for input */
#define JH_HK             6    /* Hotkey input */
#define JH_SG             7    /* Display g-file */
#define JH_SF             8    /* Display full path file */
#define JH_EF             9    /* Edit file */
#define JH_CO            10    /* Console-only output */
#define JH_BBSNAME       11    /* Get BBS name */
#define JH_Sysop         12    /* Get Sysop name */
#define JH_FLAGFILE      13    /* Flag file for download */
#define JH_SHOWFLAGS     14    /* Obsolete */
#define JH_DL            15    /* Reserved */
#define JH_ExtHK         15    /* Extended hotkey */
#define JH_SIGBIT        16    /* Reserved */
#define JH_FetchKey      17    /* Reserved */
#define JH_FETCHKEY      17    /* Reserved */
#define JH_SO            18    /* Reserved */

/* User Data Commands (100-199) */
#define DT_NAME           100
#define DT_PASSWORD       101
#define DT_LOCATION       102
#define DT_PHONENUMBER   103
#define DT_SLOTNUMBER    104
#define DT_SECSTATUS      105  /* Security status */
#define DT_SECBOARD       106  /* Ratio type */
#define DT_SECLIBRARY     107  /* Ratio */
#define DT_SECBULLETIN    108  /* Computer type */
#define DT_MESSAGESPOSTED 109
#define DT_UPLOADS        110
#define DT_DOWNLOADS      111
#define DT_TIMESCALLED    112
#define DT_TIMELASTON     113
#define DT_TIMEUSED       114
#define DT_TIMELIMIT      115
#define DT_TIMETOTAL      116
#define DT_BYTESUPLOAD    117
#define DT_BYTEDOWNLOAD   118
#define DT_DAILYBYTELIMIT 119
#define DT_DAILYBYTEDLD   120
#define DT_EXPERT         121
#define DT_LINELENGTH     122
#define DT_ISANSI         123  /* ANSI detection flag */
#define DT_REALNAME       124  /* User's real name */
#define DT_INTERNETNAME   125  /* Internet/email name */
#define ACTIVE_NODES      126
#define DT_DUMP           127
#define DT_TIMEOUT        128
#define DT_TRANSLATOR     129  /* Language translator setting */
#define DT_HOST_LANGUAGE  130  /* Host language preference */
#define DT_HOSTNAME       131  /* Host system name */
#define DT_HOSTIP         132  /* Host IP address */
#define DT_GEOGRAPHIC     133  /* Geographic location */
#define DT_SIZEUPLOAD     134  /* Upload size statistics */
#define DT_SIZEDOWNLOAD   135  /* Download size statistics */
#define DT_CONFACCESS2    136  /* Conference access level 2 */
#define DT_CBYTESUPLOAD   137  /* Conference bytes uploaded */
#define DT_CBYTESDOWNLOAD 138  /* Conference bytes downloaded */
#define DT_CFILESUPLOAD   139  /* Conference files uploaded */
#define DT_CFILESDOWNLOAD 140  /* Conference files downloaded */
#define DT_CALLEDTODAY    141  /* Calls made today */

/* Additional User Data Constants (for compatibility) */
#define DT_ORGANIZATION   DT_LOCATION      /* Organization/Location */
#define DT_USERSTATUS     DT_SECBOARD      /* User status */
#define DT_CALLSIGN       DT_SECLIBRARY    /* Call sign */
#define DT_MAILBOX        DT_SECBULLETIN   /* Mailbox */
#define DT_MODEMTYPE      DT_MESSAGESPOSTED /* Modem type */

/* BBS System Commands (126-199) */
#define BB_CONFNAME       126
#define BB_CONFLOCAL      127
#define BB_LOCAL          128
#define BB_STATUS         129
#define BB_COMMAND        130
#define BB_MAINLINE       131
#define BB_PURGELINEEND   132  /* End of purge line */
#define BB_NONSTOPTEXT    133  /* Non-stop text display */
#define BB_LINECOUNT      134  /* Current line count */
#define BB_CONFACCOUNT    135  /* Conference accounting */
#define BB_CHATFLAG       142
#define DT_STAMP_LASTON   143
#define DT_STAMP_CTIME    144
#define DT_CURR_TIME      145
#define DT_CONFACCESS     146
#define BB_NODEID         149
#define BB_CALLERSLOG     150
#define BB_UDLOG          151
#define EXPRESS_VERSION   152
#define BB_CHATSET        162
#define ENVSTAT           163

/* Extended Commands (500+) */
#define GETKEY            500
#define RAWARROW          501
#define CHAIN             502
#define JH_CK             503    /* Check key pressed */
#define QUICK_KEY         504    /* Quick key input */
#define JH_UPDATE         505    /* Update user status */
#define JH_AUTOCOMMAND    506    /* Auto command execution */
#define JH_MCI            507
#define PRV_COMMAND       508
#define BB_CONFNUM        510
#define BB_DROPDTR        511
#define BB_GETTASK        512
#define JH_UPLOAD         513    /* Upload operation notification */
#define JH_DOWNLOAD       514    /* Download operation notification */
#define JH_CHATON         515    /* Chat mode enabled */
#define JH_CHATOFF        516    /* Chat mode disabled */
#define JH_QUIETON        517    /* Quiet mode enabled */
#define JH_QUIETOFF       518    /* Quiet mode disabled */
#define JH_TRANSFERCPS    519    /* Transfer speed/CPS updates */
#define JH_SMPTR          520    /* Send message with pointer */
#define JH_20             521    /* Unknown/reserved command */
#define DT_LANGUAGE       527
#define DT_QUICKFLAG      528
#define DT_GOODFILE       529
#define DT_ANSICOLOR      530
#define MULTICOM          531
#define LOAD_ACCOUNT      532
#define SAVE_ACCOUNT      533
#define SEARCH_ACCOUNT    534
#define APPEND_ACCOUNT    535
#define LAST_ACCOUNTNUM   536
#define GET_CONFNUM       537
#define SAVE_CONFDB       538
#define LOAD_CONFDB       539
#define ZMODEMSEND        540
#define ZMODEMRECEIVE     541
#define ACP_COMMAND       544
#define DT_MSGCODE        543
#define DT_FILECODE       545
#define EDITOR_STRUCT     546
#define BYPASS_CSI_CHECK  547
#define SENTBY            548
#define DT_ADDBIT         1000
#define DT_REMBIT         1001
#define DT_QUERYBIT       1002

/* ACP Command Constants */
#define ACP_CONTROLCOMMAND -1
#define ACP_CUSTOMCOMMAND  19
#define ACP_SysopLogin     1
#define ACP_InstantLogin   2
#define ACP_AEShell        3
#define ACP_ToggleChat     4
#define ACP_ExitNode       5
#define ACP_LocalLogin     6
#define ACP_ReserveNode    7
#define ACP_Accounts       8
#define ACP_InitModem      9
#define ACP_NodeOffHook    10
#define ACP_QuietNode      11
#define ACP_NodeConfig     12
#define ACP_NodeChat       13
#define ACP_SaveWin        14
#define ACP_NRAMS          15

/* I/O Constants */
#define READIT  1
#define WRITEIT 0
#define SHUTDOWN 1
#define CHAIN_WAIT 0

/* Glue API Function Prototypes */

/* Core Door Lifecycle */
extern VOID Register(int node);
extern VOID ShutDown(VOID);
extern void CloseOut(void);

/* Output Functions */
extern void sendmessage(char *mstring, int nl);
extern void mciputstr(char *mstring, int nl);
extern void MciSendStr(char *mstring, int nl);
extern void ConOnly(char *mstring, int nl);
extern void SerOnly(char *mstring, int nl);
extern void sendMessage(char *mstring, int nl);

/* Input Functions */
extern void prompt(char *mstring, char *ostring, int len);
extern void lineinput(char *mstring, char *ostring, int len);
extern void hotkey(char *mstring, char *ostring);
extern char Hotkey(void);

/* User Data Access */
extern void getuserstring(char *ostring, int nl);
extern void putuserstring(char *ostring, int nl);
extern int GetInfo(int cmd);
extern void PutInfo(int data, int cmd);
extern void getspecdata(char *ostring, char *dest, int nl);
extern int getlevel(void);
extern char *getname(void);
extern char *getlocation(void);
extern int getnode(void);
extern char *getbbsname(void);

/* File Operations */
extern void showfile(char *mstring);
extern void showgfile(char *mstring);
extern void showfilensf(char *mstring);
extern void showgfilensf(char *mstring);
extern int Editfile(char *Name, int len);
extern void FlagFile(char *string);

/* File Transfer */
extern int Download(char *s);
extern int Upload(char *s);
extern int BatchDownload(APTR s);
extern int NetUpload(APTR s);
extern int NetDownload(char *s);

/* System Functions */
extern int getsignal(void);
extern APTR GetSemaphore(void);
extern BOOL CheckToDisplay(char *s);
extern int TLock(char *str);
extern int AcsStat(int bits, int opt);
extern int IsAccess(int acs);

/* Utility Functions */
extern void Chain(char *str, int node, int opt);
extern void AcpCommand(char *mstring, int command, int node);
extern void LastCommand(void);
extern int FetchKey(void);
extern int sigkey(void);
extern char Fhotkey(void);
extern int getkey(void);
extern int QuicKey(void);

/* Date/Time Functions */
extern STRPTR GetTheDate(long number);
extern STRPTR GetTheTime(long number);
extern void DateToString(ULONG number, char *s);
extern void TimeToString(ULONG number, char *s);
extern void getsystime(ULONG number, char *d, char *t);

/* Account Management */
extern struct User *Load_Account(int UserNum, APTR U, APTR UK);
extern void Save_Account(int UserNum, APTR U, APTR UK);
extern void Save_ConfDB(int UserNum, int conf, APTR dat);
extern void Load_ConfDB(int UserNum, int conf, APTR dat);
extern int Search_Account(int UserNum, APTR uk);
extern void New_Account(APTR u, APTR uk);
extern int LastAccountNum(void);
extern int Get_ConfName(APTR n, APTR l, int num);

/* Advanced Functions */
extern void GetFiller1(APTR Filler, int Command);
extern void PutFiller1(APTR Filler, int Command);

/* Standard C Library Functions (minimal subset for cross-compilation) */
#ifdef __AMIGA_CROSS__
extern unsigned long strlen(const char *s);
extern char *strcpy(char *dest, const char *src);
extern char *strncpy(char *dest, const char *src, unsigned long n);
extern int strcmp(const char *s1, const char *s2);
extern char *strcat(char *dest, const char *src);
extern int atoi(const char *str);
extern int sprintf(char *str, const char *format, ...);
extern void *memset(void *s, int c, unsigned long n);
extern void *memcpy(void *dest, const void *src, unsigned long n);
#endif

/* Global Variables */
extern struct MsgPort *port;
extern struct MsgPort *replymp;
extern struct JHMessage *Jhmsg;
extern char instring[256];
extern int EXIT_FLAG;

/* User Structure (from WHAT door) */
#ifndef __VBCC__
struct User {
    char    Name[31], Pass[9], Location[30], PhoneNumber[13];
    USHORT  Slot_Number;
    USHORT  Sec_Status,
        Sec_Board,                   /* File or Byte Ratio */
        Sec_Library,                 /* Ratio              */
        Sec_Bulletin,                /* Computer Type      */
        Messages_Posted;
    /* Note ConfYM = the last msg you actually read, ConfRead is the same ?? */
    ULONG   NewSinceDate, ConfRead1, ConfRead2, ConfRead3, ConfRead4,
        ConfRead5;
    UWORD   XferProtocol, Filler2;
    UWORD   Lcfiles, BadFiles;
    ULONG   AccountDate;
    UWORD   ScreenType, Filler1;
    char    Conference_Access[10];
    USHORT  Uploads, Downloads, ConfRJoin, Times_Called;
    long    Time_Last_On, Time_Used, Time_Limit, Time_Total;
    ULONG   Bytes_Download, Bytes_Upload, Daily_Bytes_Limit, Daily_Bytes_Dld;
    char    Expert;
    ULONG   ConfYM1, ConfYM2, ConfYM3, ConfYM4, ConfYM5, ConfYM6, ConfYM7,
        ConfYM8, ConfYM9;
    long    BeginLogCall;
    UBYTE   Protocol, UUCPA, LineLength, New_User;
};
#endif /* __VBCC__ */

#endif /* AMIEXPRESS_H */