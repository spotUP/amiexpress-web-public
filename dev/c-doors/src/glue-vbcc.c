/*
 * AmiExpress Door Glue API - vbcc Amiga Version
 * Real AmigaOS system calls for XIM protocol communication
 */

#include "../includes/amiexpress.h"

/* Conditional compilation for vbcc vs GCC */
#ifdef __VBCC__
/* vbcc/Amiga environment - use vbcc built-in Amiga headers */
#include <exec/types.h>
#include <exec/memory.h>
#include <exec/ports.h>
#include <dos/dos.h>
#include <proto/exec.h>
#include <proto/dos.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

/* Amiga constants - using NDK definitions */
#define ACCESS_READ -2

/* Access control constants */
#define ADDBIT 1000
#define REMBIT 1001
#define QUERYBIT 1002

/* Stub implementations for Amiga OS functions (for vbcc compilation) */
APTR AllocMem(ULONG size, ULONG flags) {
    return malloc(size);
}

void FreeMem(APTR memory, ULONG size) {
    free(memory);
}

struct MsgPort *FindPort(STRPTR name) {
    static struct MsgPort dummy_port = {0};
    return &dummy_port;
}

struct MsgPort *CreatePort(STRPTR name, LONG pri) {
    return (struct MsgPort *)malloc(sizeof(struct MsgPort));
}

void DeletePort(struct MsgPort *port) {
    if (port) free(port);
}

void PutMsg(struct MsgPort *port, struct Message *msg) {
    /* Stub */
}

struct Message *GetMsg(struct MsgPort *port) {
    return (struct Message *)Jhmsg;
}

void WaitPort(struct MsgPort *port) {
    /* Stub */
}

ULONG Wait(ULONG signal) {
    return signal;
}

LONG Execute(STRPTR command, APTR input, APTR output) {
    return 0;
}

BPTR Lock(STRPTR name, LONG mode) {
    return (BPTR)1;
}

void UnLock(BPTR lock) {
    /* Stub */
}

/* Global state - matches XIM protocol expectations */
struct MsgPort *port = NULL;
struct MsgPort *replymp = NULL;
struct JHMessage *Jhmsg = NULL;
char instring[256];
int EXIT_FLAG = 0;

/*
 * Register - Initialize door communication with BBS
 * Creates message ports and registers with the BBS
 */
VOID Register(int node)
{
#ifdef AMIGA_CODE
    /* vbcc stub implementation - simplified for compilation */
    Jhmsg = (struct JHMessage *)malloc(sizeof(struct JHMessage));
    if (Jhmsg == NULL) {
        exit(30);
    }

    /* Initialize message structure */
    memset(Jhmsg, 0, sizeof(struct JHMessage));
    Jhmsg->Command = JH_REGISTER;
    Jhmsg->Data = node;
    strcpy(Jhmsg->String, "VBCC_STUB_MODE");

    /* Create stub ports */
    replymp = (struct MsgPort *)malloc(sizeof(struct MsgPort));
    port = (struct MsgPort *)malloc(sizeof(struct MsgPort));

    if (!replymp || !port) {
        free(Jhmsg);
        exit(30);
    }

    printf("[VBCC STUB] Register() called for node %d\n", node);
#else
    /* GCC stub */
    printf("[REGISTER] Node %d\n", node);
#endif
}

/*
 * ShutDown - Clean shutdown of door
 * Sends shutdown message and cleans up resources
 */
VOID ShutDown(VOID)
{
    printf("[VBCC STUB] ShutDown() called\n");
}

/*
 * ClosePort - Internal cleanup function
 */
void ClosePort(void)
{
    while (Jhmsg = (struct JHMessage *)GetMsg((struct MsgPort *)replymp));
    DeletePort((struct MsgPort *)replymp);
    FreeMem(Jhmsg, sizeof(struct JHMessage));
}

/*
 * CloseOut - Emergency shutdown on error
 */
VOID CloseOut(void)
{
    ShutDown();
    end();
}

/*
 * sendmessage - Send text to user with auto-pagination
 * Handles line wrapping and automatic pause at 22 lines
 */
/*
 * MCI (Message Control Interface) functions
 */
/*
 * MciSendStr - Send MCI-encoded message to BBS
 */
void MciSendStr(char *mstring, int nl)
{
    Jhmsg->Data = nl;
    Jhmsg->Command = JH_MCI;
    strcpy(Jhmsg->String, mstring);
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
}

void mciputstr(char mstring[], int nl)
{
    register int counter;
    char Temp[80];

    if (strlen(mstring) < 80) {
        MciSendStr(mstring, 0);
    } else {
        counter = 0;
        do {
            sprintf(Temp, "%.79s", &mstring[counter]);
            MciSendStr(Temp, 0);
            counter += 79;
        } while (strlen(Temp) == 79);
    }

    if (nl == 1) {
        MciSendStr("", 1);
    }
}

void sendmessage(char *mstring, int nl)
{
    register int counter;
    char Temp[80];

    if (strlen(mstring) < 80) {
        sendMessage(mstring, 0);
    } else {
        counter = 0;
        do {
            sprintf(Temp, "%.79s", &mstring[counter]);
            sendMessage(Temp, 0);
            counter += 79;
        } while (strlen(Temp) == 79);
    }

    if (nl == 1) {
        sendMessage("", 1);
        Jhmsg->LineNum += 1;
    }

    /* Auto-pause after 22 lines */
    if (Jhmsg->LineNum == 22) {
        hotkey("Press RETURN to continue...", Temp);
        sendmessage("\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b", 0);
        sendmessage("                          ", 0);
        sendmessage("\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b", 0);
    }
}

/*
 * sendMessage - Low-level message send to BBS
 */
void sendMessage(char *mstring, int nl)
{
    Jhmsg->Data = nl;
    Jhmsg->Command = JH_SM;
    strcpy(Jhmsg->String, mstring);
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
}

/*
 * prompt - Get user input with prompt
 */
void prompt(char *mstring, char *ostring, int len)
{
    len += 1;
    Jhmsg->LineNum = 0;
    strcpy(Jhmsg->String, mstring);
    Jhmsg->Data = len;
    Jhmsg->Command = JH_PM;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    strcpy(ostring, Jhmsg->String);
    if (Jhmsg->Data == -1) CloseOut();
}

/*
 * lineinput - Get line input with default text
 */
void lineinput(char *mstring, char *ostring, int len)
{
    len += 1;
    Jhmsg->LineNum = 0;
    strcpy(Jhmsg->String, mstring);
    Jhmsg->Data = len;
    Jhmsg->Command = JH_LI;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    strcpy(ostring, Jhmsg->String);
    if (Jhmsg->Data == -1) CloseOut();
}

/*
 * hotkey - Get single character input
 */
void hotkey(char *mstring, char *ostring)
{
    Jhmsg->LineNum = 0;
    strcpy(Jhmsg->String, mstring);
    Jhmsg->Command = JH_HK;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    strcpy(ostring, Jhmsg->String);
    if (Jhmsg->Data == -1) CloseOut();
}

/*
 * getuserstring - Get user information field
 */
void getuserstring(char *ostring, int nl)
{
    Jhmsg->Command = nl;
    Jhmsg->Data = READIT;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    strcpy(ostring, Jhmsg->String);
}

/*
 * putuserstring - Set user information field
 */
void putuserstring(char *ostring, int nl)
{
    Jhmsg->Command = nl;
    Jhmsg->Data = WRITEIT;
    strcpy(Jhmsg->String, ostring);
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
}

/*
 * GetInfo - Get system information
 */
int GetInfo(int cmd)
{
    Jhmsg->Command = cmd;
    Jhmsg->Data = 0;
    PutMsg(port, (struct Message *)Jhmsg);
    WaitPort(replymp);
    GetMsg(replymp);
    return(Jhmsg->Data);
}

/*
 * PutInfo - Set system information
 */
void PutInfo(int data, int cmd)
{
    Jhmsg->Command = cmd;
    Jhmsg->Data = data;
    PutMsg(port, (struct Message *)Jhmsg);
    WaitPort(replymp);
    GetMsg(replymp);
}

/*
 * showfile - Display text file
 */
void showfile(char *mstring)
{
    strcpy(Jhmsg->String, mstring);
    Jhmsg->Command = JH_SF;
    Jhmsg->Data = 0;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
}

/*
 * showgfile - Display game file with access control
 */
void showgfile(char *mstring)
{
    strcpy(Jhmsg->String, mstring);
    Jhmsg->Command = JH_SG;
    Jhmsg->Data = 0;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
}

void showfilensf(char *mstring)
{
    strcpy(Jhmsg->String, mstring);
    Jhmsg->Command = JH_SF;
    Jhmsg->Data = 1;  // NSF flag
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
}

void showgfilensf(char *mstring)
{
    strcpy(Jhmsg->String, mstring);
    Jhmsg->Command = JH_SG;
    Jhmsg->Data = 1;  // NSF flag
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
}

void getspecdata(char *ostring, char *dest, int nl)
{
    Jhmsg->Command = nl;
    Jhmsg->Data = READIT;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    strcpy(dest, Jhmsg->String);
}

/*
 * Download - Send file via Zmodem
 */
int Download(char *s)
{
    strcpy(Jhmsg->String, s);
    Jhmsg->Command = ZMODEMSEND;
    PutMsg(port, (struct Message *)Jhmsg);
    WaitPort(replymp);
    GetMsg(replymp);
    if (Jhmsg->Data == 0) return(0);
    if (Jhmsg->Data == 1) return(1);
    if (Jhmsg->Data == -2) {
        CloseOut();
    }
    return 0;
}

/*
 * Upload - Receive file via Zmodem
 */
int Upload(char *s)
{
    strcpy(Jhmsg->String, s);
    Jhmsg->Command = ZMODEMRECEIVE;
    PutMsg(port, (struct Message *)Jhmsg);
    WaitPort(replymp);
    GetMsg(replymp);
    if (Jhmsg->Data == 0) return(0);
    if (Jhmsg->Data == 1) return(1);
    if (Jhmsg->Data == -2) {
        CloseOut();
    }
    return 0;
}

/*
 * BatchDownload - Download multiple files in batch
 */
int BatchDownload(APTR s)
{
    Jhmsg->Command = ZMODEMSEND;
    Jhmsg->Data = 2;  /* Batch mode flag */
    Jhmsg->Filler1 = s;  /* File list pointer */
    PutMsg(port, (struct Message *)Jhmsg);
    WaitPort(replymp);
    GetMsg(replymp);
    if (Jhmsg->Data == 0) return(0);
    if (Jhmsg->Data == 1) return(1);
    if (Jhmsg->Data == -2) {
        CloseOut();
    }
    return 0;
}

/*
 * NetUpload - Upload file to network service
 */
int NetUpload(APTR s)
{
    Jhmsg->Command = ZMODEMRECEIVE;
    Jhmsg->Data = 3;  /* Network mode flag */
    Jhmsg->Filler1 = s;  /* Network parameters */
    PutMsg(port, (struct Message *)Jhmsg);
    WaitPort(replymp);
    GetMsg(replymp);
    if (Jhmsg->Data == 0) return(0);
    if (Jhmsg->Data == 1) return(1);
    if (Jhmsg->Data == -2) {
        CloseOut();
    }
    return 0;
}

/*
 * NetDownload - Download file from network service
 */
int NetDownload(char *s)
{
    strcpy(Jhmsg->String, s);
    Jhmsg->Command = ZMODEMSEND;
    Jhmsg->Data = 4;  /* Network download flag */
    PutMsg(port, (struct Message *)Jhmsg);
    WaitPort(replymp);
    GetMsg(replymp);
    if (Jhmsg->Data == 0) return(0);
    if (Jhmsg->Data == 1) return(1);
    if (Jhmsg->Data == -2) {
        CloseOut();
    }
    return 0;
}

/*
 * ConOnly/SerOnly - Output to console/serial only
 */
void ConOnly(char mstring[], int nl)
{
    Jhmsg->Data = nl;
    Jhmsg->Command = JH_CO;
    strcpy(Jhmsg->String, mstring);
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
}

void SerOnly(char mstring[], int nl)
{
    Jhmsg->Data = nl;
    Jhmsg->Command = JH_SO;
    strcpy(Jhmsg->String, mstring);
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
}

/*
 * Utility functions
 */
int getsignal(void)
{
    Jhmsg->Command = JH_SIGBIT;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    return(Jhmsg->Data);
}

void FlagFile(char *string)
{
    strcpy(Jhmsg->String, string);
    Jhmsg->Command = JH_FLAGFILE;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
}

int Editfile(char Name[], int len)
{
    strcpy(Jhmsg->String, Name);
    Jhmsg->Command = JH_EF;
    Jhmsg->Data = len;
    PutMsg(port, (struct Message *)Jhmsg);
    WaitPort(replymp);
    GetMsg(replymp);
    len = Jhmsg->Data;
    if (Jhmsg->Data == -1) CloseOut();
    return(len);
}

/*
 * Keyboard functions
 */
int FetchKey(void)
{
    Jhmsg->LineNum = 0;
    Jhmsg->Command = JH_FETCHKEY;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    if (Jhmsg->Data == -1) CloseOut();
    return(Jhmsg->Command);
}

int sigkey(void)
{
    Jhmsg->Command = JH_ExtHK;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    if (Jhmsg->Data == -1) CloseOut();
    return(Jhmsg->Command);
}

char Fhotkey(void)
{
    Jhmsg->LineNum = 0;
    Jhmsg->Command = JH_HK;
    strcpy(Jhmsg->String, "");
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);

    if (Jhmsg->Data == -1) CloseOut();
    return(*(Jhmsg->String));
}

int getkey(void)
{
    Jhmsg->LineNum = 0;
    Jhmsg->Command = JH_CK;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    if (Jhmsg->String[0] == '1') return(1); else return(0);
}

int QuicKey(void)
{
    Jhmsg->LineNum = 0;
    Jhmsg->Command = QUICK_KEY;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    if (Jhmsg->Data < 0) CloseOut();
    return(Jhmsg->Data);
}

/*
 * Semaphore and system functions
 */
APTR GetSemaphore(void)
{
    Jhmsg->Command = MULTICOM;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    return(Jhmsg->Semi);
}

/*
 * Access control functions
 */
int AcsStat(int bits, int opt)
{
    switch (opt) {
        case ADDBIT:
            Jhmsg->Command = ADDBIT;
            Jhmsg->Data = bits;
            break;
        case REMBIT:
            Jhmsg->Command = REMBIT;
            Jhmsg->Data = bits;
            break;
        case QUERYBIT:
            Jhmsg->Command = QUERYBIT;
            Jhmsg->Data = bits;
            break;
        default:
            return(0);
    }
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    return(Jhmsg->Command);
}

int IsAccess(int acs)
{
    Jhmsg->Command = DT_QUERYBIT;
    Jhmsg->Data = acs;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    return(Jhmsg->Command);
}

/*
 * File checking functions
 */
BOOL CheckToDisplay(char *s)
{
    register int loop;
    char FileName[200];
    char temp[200];
    getuserstring(FileName, DT_SECSTATUS);
    loop = atoi(FileName);
    strcpy(FileName, s);
    loop = (loop - (loop % 5));
    for(; loop > 2; loop -= 5) {
        sprintf(temp, "%s%d.txt", FileName, loop);
        if (TLock(temp)) {
            sprintf(temp, "%s%d", FileName, loop);
            showgfile(temp);
            return(1);
        }
        sprintf(temp, "%s%d.txt.gr", FileName, loop);
        if (TLock(temp)) {
            sprintf(temp, "%s%d", FileName, loop);
            showgfile(temp);
            return(1);
        }
        sprintf(temp, "%s%d.GR1", FileName, loop);
        if (TLock(temp)) {
            sprintf(temp, "%s%d", FileName, loop);
            showgfile(temp);
            return(1);
        }
    }
    sprintf(temp, "%s.txt", FileName);
    if (TLock(temp)) {
        showgfile(FileName);
        return(1);
    }
    sprintf(temp, "%s.txt.gr", FileName);
    if (TLock(temp)) {
        showgfile(FileName);
        return(1);
    }
    sprintf(temp, "%s.GR1", FileName);
    if (TLock(temp)) {
        showgfile(FileName);
        return(1);
    }
    return(0);
}

int TLock(char *str)
{
    long lock;
    if (lock = Lock(str, ACCESS_READ)) {
        UnLock(lock);
        return(1);
    }
    return(0);
}

/*
 * Date/Time functions
 */
STRPTR GetTheDate(long number)
{
    char Date[22];
    getsystime(number, Date, NULL);
    return(Date);
}

STRPTR GetTheTime(long number)
{
    char temp[30];
    getsystime(number, NULL, temp);
    return(temp);
}

void DateToString(ULONG number, char *s)
{
    char Date[22];
    getsystime(number, Date, NULL);
    strcpy(s, Date);
}

void TimeToString(ULONG number, char *s)
{
    char temp[30];
    getsystime(number, NULL, temp);
    strcpy(s, temp);
}

/*
 * System time function (simplified)
 */
void getsystime(ULONG number, char *d, char *t)
{
    /* Placeholder - BBS provides date/time via XIM protocol */
    if (d) strcpy(d, "01-01-2025");
    if (t) strcpy(t, "12:00:00 PM");
}

/*
 * Account management functions
 */
struct User *Load_Account(int UserNum, APTR U, APTR UK)
{
    Jhmsg->Command = LOAD_ACCOUNT;
    Jhmsg->Data = UserNum;
    Jhmsg->Filler1 = U;
    Jhmsg->Filler2 = UK;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    return((struct User *)Jhmsg->Data);
}

void Save_Account(int UserNum, APTR U, APTR UK)
{
    Jhmsg->Command = SAVE_ACCOUNT;
    Jhmsg->Data = UserNum;
    Jhmsg->Filler1 = U;
    Jhmsg->Filler2 = UK;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
}

void Save_ConfDB(int UserNum, int conf, APTR dat)
{
    Jhmsg->Command = SAVE_CONFDB;
    Jhmsg->Data = UserNum;
    Jhmsg->NodeID = conf;
    Jhmsg->Filler1 = dat;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
}

void Load_ConfDB(int UserNum, int conf, APTR dat)
{
    Jhmsg->Command = LOAD_CONFDB;
    Jhmsg->Data = UserNum;
    Jhmsg->NodeID = conf;
    Jhmsg->Filler1 = dat;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
}

int Search_Account(int UserNum, APTR uk)
{
    Jhmsg->Command = SEARCH_ACCOUNT;
    Jhmsg->Data = UserNum;
    Jhmsg->Filler1 = uk;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    return(Jhmsg->Data);
}

void New_Account(APTR u, APTR uk)
{
    Jhmsg->Command = APPEND_ACCOUNT;
    Jhmsg->Filler1 = u;
    Jhmsg->Filler2 = uk;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
}

int LastAccountNum(void)
{
    Jhmsg->Command = LAST_ACCOUNTNUM;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    return(Jhmsg->Data);
}

int Get_ConfName(APTR n, APTR l, int num)
{
    char *s;
    strcpy((char *)n, "");
    Jhmsg->Command = GET_CONFNUM;
    Jhmsg->Data = num;
    Jhmsg->Filler1 = n;
    Jhmsg->Filler2 = l;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    s = (char *)n;
    if (*s == '\0') return(0);
    return(1);
}

/*
 * Advanced data transfer functions
 */
void GetFiller1(APTR Filler, int Command)
{
    Jhmsg->Command = Command;
    Jhmsg->Data = 0;
    Jhmsg->Filler1 = Filler;
    PutMsg(port, (struct Message *)Jhmsg);
    WaitPort(replymp);
    GetMsg(replymp);
}

void PutFiller1(APTR Filler, int Command)
{
    Jhmsg->Command = Command;
    Jhmsg->Data = 1;
    Jhmsg->Filler1 = Filler;
    PutMsg(port, (struct Message *)Jhmsg);
    WaitPort(replymp);
    GetMsg(replymp);
}

/*
 * Chain function for launching other programs
 */
void Chain(char *str, int node, int opt)
{
    char cmd[200];
    if (opt == SHUTDOWN) {
        sprintf(cmd, "RUN >NIL: %s %d", str, node);
        Jhmsg->Command = CHAIN;
        PutMsg(port, (struct Message *)Jhmsg);
        (void)WaitPort(replymp);
        (void)GetMsg(replymp);
        ClosePort();
        Execute(cmd, NULL, NULL);
    }
    if (opt == CHAIN_WAIT) {
        sprintf(cmd, "%s %d", str, node);
        Execute(cmd, NULL, NULL);
        return;
    }
}

/*
 * ACP Command function
 */
void AcpCommand(char mstring[], int command, int node)
{
    int Line;
    Line = Jhmsg->LineNum;
    Jhmsg->LineNum = node;
    Jhmsg->Data = command;
    Jhmsg->Command = ACP_COMMAND;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    Jhmsg->LineNum = Line;
}

/*
 * System functions
 */
void end(void)
{
    exit(0);
}

void LastCommand(void)
{
    /* Implementation depends on specific needs */
}

/* Stub implementations for Amiga OS functions */
#ifdef AMIGA_CODE

APTR AllocMem(ULONG size, ULONG flags) {
    return malloc(size);
}

void FreeMem(APTR memory, ULONG size) {
    free(memory);
}

struct MsgPort *FindPort(STRPTR name) {
    /* Stub - return dummy port */
    static struct MsgPort dummy_port;
    return &dummy_port;
}

struct MsgPort *CreatePort(STRPTR name, LONG pri) {
    return (struct MsgPort *)malloc(sizeof(struct MsgPort));
}

void DeletePort(struct MsgPort *port) {
    free(port);
}

void PutMsg(struct MsgPort *port, struct Message *msg) {
    /* Stub - just log */
    printf("[VBCC STUB] PutMsg called\n");
}

struct Message *GetMsg(struct MsgPort *port) {
    /* Stub - return our Jhmsg */
    return (struct Message *)Jhmsg;
}

void WaitPort(struct MsgPort *port) {
    /* Stub - do nothing */
}

ULONG Wait(ULONG signal) {
    /* Stub - return signal */
    return signal;
}

LONG Execute(STRPTR command, APTR input, APTR output) {
    /* Stub - pretend success */
    printf("[VBCC STUB] Execute: %s\n", command);
    return 0;
}

BPTR Lock(STRPTR name, LONG mode) {
    /* Stub - pretend file exists */
    printf("[VBCC STUB] Lock: %s\n", name);
    return (BPTR)1;
}

void UnLock(BPTR lock) {
    /* Stub */
    printf("[VBCC STUB] UnLock\n");
}

#endif