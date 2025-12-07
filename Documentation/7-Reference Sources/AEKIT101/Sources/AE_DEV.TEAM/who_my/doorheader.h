#include <exec/types.h>
#include <exec/exec.h>
#include <stdio.h>
#include <stdlib.h>


#define SEEK_SET 0
#define FOREVER for(;;)
#define NL NULL
#define JH_LI 0
#define JH_REGISTER 1
#define JH_SHUTDOWN 2
#define JH_WRITE 3
#define JH_SM 4
#define JH_PM 5
#define JH_HK 6
#define JH_SG 7
#define JH_SF 8
#define JH_EF 9
#define JH_CO 10
#define JH_BBSName 11
#define JH_Sysop 12
#define JH_FLAGFILE 13
#define JH_SHOWFLAGS 14
#define JH_DL 15
#define JH_ExtHK 15
#define JH_SIGBIT 16
#define JH_FetchKey 17
#define JH_FETCHKEY 17
#define JH_SO 18
/**************************** GET/SET Values from System ***********************/

#define DT_NAME           100
#define DT_PASSWORD       101
#define DT_LOCATION       102
#define DT_PHONENUMBER    103
#define DT_SLOTNUMBER     104
#define DT_SECSTATUS      105
#define DT_SECBOARD       106
#define DT_SECLIBRARY     107
#define DT_SECBULLETIN    108
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
#define ACTIVE_NODES      123
#define DT_DUMP           124
#define DT_TIMEOUT        125
#define BB_CONFNAME       126
#define BB_CONFLOCAL      127
#define BB_LOCAL          128
#define BB_STATUS         129
#define BB_COMMAND        130
#define BB_MAINLINE       131
#define NB_LOAD           132
#define DT_USERLOAD       133
#define BB_CONFIG         134
#define CHG_USER          135
#define RETURNCOMMAND     136
#define ZMODEMSEND        137
#define ZMODEMRECEIVE     138
#define SCREEN_ADDRESS    139
#define BB_TASKPRI        140
#define RAWSCREEN_ADDRESS 141
#define BB_CHATFLAG       142
#define DT_STAMP_LASTON   143
#define DT_STAMP_CTIME    144
#define DT_CURR_TIME      145
#define DT_CONFACCESS     146
#define BB_PCONFLOCAL     147
#define BB_PCONFNAME      148
#define BB_NODEID         149
#define BB_CALLERSLOG     150
#define BB_UDLOG          151
#define EXPRESS_VERSION   152
#define UNICONIFY         153
#define BB_CHATSET        162
#define ENVSTAT           163
#define GETKEY            500
#define RAWARROW          501
#define CHAIN             502

/****************** in progress ******************/
#define NODE_DEVICE       503
#define NODE_UNIT         504
#define NODE_BAUD         505
#define NODE_NUMBER       506
#define JH_MCI            507
/*************************************************/
#define PRV_COMMAND       508
#define PRV_GROUP         509
#define BB_CONFNUM        510
#define BB_DROPDTR        511
#define BB_GETTASK        512
#define BB_REMOVEPORT     513
#define BB_SOPT           514
#define NODE_BAUDRATE     516
#define BB_LOGONTYPE      517
#define BB_SCRLEFT        518
#define BB_SCRTOP         519
#define BB_SCRWIDTH       520
#define BB_SCRHEIGHT      521
#define BB_PURGELINE      522
#define BB_PURGELINESTART 523
#define BB_PURGELINEEND   524
#define BB_NONSTOPTEXT    525
#define BB_LINECOUNT      526
#define DT_LANGUAGE       527
#define DT_QUICKFLAG      528
#define DT_GOODFILE       529
#define DT_ANSICOLOR      530
#define MULTICOM          531
#define LOAD_ACCOUNT      532
#define SAVE_ACCOUNT      533
#define SAVE_CONFDB       534
#define LOAD_CONFDB       535
#define GET_CONFNUM       536
#define SEARCH_ACCOUNT    537
#define APPEND_ACCOUNT    538
#define LAST_ACCOUNTNUM   539
#define MOD_TYPE          540
#define DT_ISANSI         541
#define BATCHZMODEMSEND   542
#define DT_MSGCODE        543
#define ACP_COMMAND       544
#define DT_FILECODE       545
#define EDITOR_STRUCT     546
#define BYPASS_CSI_CHECK  547
#define SENTBY            548
#define DT_ADDBIT         1000
#define DT_REMBIT         1001
#define DT_QUERYBIT       1002
#define READIT 1
#define WRITEIT 0
#define SHUTDOWN 1
#define CHAIN_WAIT 0
struct JHMessage
{
 struct Message Msg;
  char String[200];
  int Data;
  int Command;
  int NodeID;
  int LineNum;
  unsigned long signal;
  struct Process *aeproc;
  APTR *Semi;
  APTR Filler1;
  APTR Filler2;
};
#define NEXTMSG    2
#define NONEXTMSG  1
#define MSGSTATUS  0
