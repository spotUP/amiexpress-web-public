/*
 * AmiExpress Door Glue API Implementation
 * Real Amiga system calls for XIM protocol communication
 *
 * This implementation uses actual AmigaOS functions to communicate
 * with the BBS via the XIM protocol through message ports.
 */

#include "amiexpress.h"

/* Conditional compilation for different environments */
#ifdef __VBCC__
/* vbcc/Amiga environment - use real Amiga system calls */
#include <exec/ports.h>
#include <exec/memory.h>
#include <dos/dos.h>
#else
/* GCC/development environment - use stubs */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#endif

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
    ULONG portsig;
    int n1, n2, n3;
    int found = 0;
    char PortName[80];
    char DoorReply[] = "AEDoorRP.000";

    /* Allocate message structure */
    Jhmsg = (struct JHMessage *)AllocMem(sizeof(struct JHMessage), MEMF_PUBLIC);
    if (Jhmsg == NULL) {
        /* Emergency exit if no memory */
        exit(30);
    }

    /* Find unique reply port name */
    n1 = n2 = n3 = 0;
    while (n1 < 10) {
        n2 = 0;
        while (n2 < 10) {
            n3 = 0;
            while (n3 < 10) {
                DoorReply[9] = n1 + '0';
                DoorReply[10] = n2 + '0';
                DoorReply[11] = n3 + '0';
                if (FindPort(DoorReply)) {
                    n3++;
                    continue;
                }
                found = 1;
                break;
            }
            if (found) break;
            n2++;
        }
        if (found) break;
        n1++;
    }

    if (!found) {
        FreeMem(Jhmsg, sizeof(struct JHMessage));
        exit(30);
    }

    /* Create reply port */
    replymp = CreatePort(DoorReply, 0L);
    strcpy(PortName, DoorReply);

    if (replymp == NULL) {
        FreeMem(Jhmsg, sizeof(struct JHMessage));
        exit(30);
    }

    /* Setup message structure for XIM protocol */
    Jhmsg->Msg.mn_Node.ln_Type = NT_MESSAGE;
    Jhmsg->Msg.mn_Length = sizeof(struct JHMessage);
    Jhmsg->Msg.mn_ReplyPort = replymp;
    strcpy(Jhmsg->String, PortName);
    Jhmsg->Command = JH_REGISTER;
    Jhmsg->Data = 2;
    Jhmsg->NodeID = -1;
    Jhmsg->LineNum = 0;

    /* Find BBS control port (XIM uses AEDoorPort) */
    sprintf(PortName, "AEDoorPort%d", node);
    while (!(port = FindPort(PortName)));

    /* Send registration message */
    PutMsg(port, (struct Message *)Jhmsg);

    portsig = 1 << replymp->mp_SigBit;
    Wait(portsig);

    /* Get response */
    Jhmsg = (struct JHMessage *)GetMsg((struct MsgPort *)replymp);
}

/*
 * ShutDown - Clean shutdown of door
 * Sends shutdown message and cleans up resources
 */
VOID ShutDown(VOID)
{
    ULONG portsig, signal;

    Jhmsg->Command = JH_SHUTDOWN;
    PutMsg(port, (struct Message *)Jhmsg);
    portsig = 1 << replymp->mp_SigBit;
    signal = Wait(portsig);

    ClosePort();
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

/*
 * ShutDown - Stub implementation
 * In real implementation, this would send shutdown message and cleanup
 */
VOID ShutDown(VOID) {
    _end();
}

/*
 * sendmessage - Stub implementation
 * In real implementation, this would send text via XIM protocol
 */
void sendmessage(char *text, int newline) {
    /* Stub: Print to console for testing */
    printf("%s", text);
    if (newline) printf("\n");
}

/*
 * prompt - Stub implementation
 * In real implementation, this would get user input via XIM
 */
void prompt(char *prompt_text, char *result, int max_len) {
    /* Stub: Get input from stdin */
    printf("%s", prompt_text);
    if (fgets(result, max_len, stdin)) {
        /* Remove trailing newline */
        char *newline = strchr(result, '\n');
        if (newline) *newline = '\0';
    } else {
        result[0] = '\0';
    }
}

/*
 * hotkey - Stub implementation
 * In real implementation, this would get single key via XIM
 */
void hotkey(char *prompt_text, char *result) {
    /* Stub: Get single character */
    if (prompt_text && *prompt_text) {
        printf("%s", prompt_text);
    }
    int ch = getchar();
    if (result) {
        result[0] = (char)ch;
        result[1] = '\0';
    }
    /* Consume rest of line */
    while (getchar() != '\n');
}

/*
 * getuserstring - Stub implementation
 * In real implementation, this would get user data via XIM
 */
void getuserstring(char *result, int field_id) {
    /* Stub: Return dummy data based on field */
    switch (field_id) {
        case 100:  /* DT_NAME */
            strcpy(result, "TestUser");
            break;
        case 102:  /* DT_LOCATION */
            strcpy(result, "TestCity");
            break;
        case 11:   /* JH_BBSNAME */
            strcpy(result, "TestBBS");
            break;
        default:
            strcpy(result, "Unknown");
            break;
    }
}

/*
 * _end - Exit function (renamed to avoid conflict)
 */
void _end(void) {
    exit(0);
}