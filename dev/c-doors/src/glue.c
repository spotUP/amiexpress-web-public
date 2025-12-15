/*
 * AmiExpress Door Glue Implementation
 * vbcc-compatible implementation of the Glue API
 *
 * Based on AmiConSASc.c from AEKIT101 SDK
 */

#include "amiexpress.h"

/* Global Variables */
struct MsgPort *port = NULL;
struct MsgPort *replymp = NULL;
struct JHMessage *Jhmsg = NULL;
char instring[256];
int EXIT_FLAG = 0;

/*
 * Register - Initialize door communication with BBS
 * Must be called first in main()
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
    if (Jhmsg == 0) {
        printf("Not enough Memory for message structure\n");
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

    if (replymp == 0) {
        printf("Couldn't create reply port\n");
        FreeMem(Jhmsg, sizeof(struct JHMessage));
        exit(30);
    }

    /* Setup message structure */
    Jhmsg->Msg.mn_Node.ln_Type = NT_MESSAGE;
    Jhmsg->Msg.mn_Length = sizeof(struct JHMessage);
    Jhmsg->Msg.mn_ReplyPort = replymp;
    strcpy(Jhmsg->String, PortName);
    Jhmsg->Command = JH_REGISTER;
    Jhmsg->Data = 2;
    Jhmsg->NodeID = -1;
    Jhmsg->LineNum = 0;

    /* Find BBS control port */
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
 * Must be called last before exit
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
 */
void sendmessage(char mstring[], int nl)
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
        hotkey(ANYKEY, Temp);
        SM("\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b", 0);
        SM("                          ", 0);
        SM("\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b", 0);
    }
}

/*
 * mciputstr - Send MCI text with pagination
 */
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

/*
 * sendMessage - Low-level message send
 */
void sendMessage(char mstring[], int nl)
{
    Jhmsg->Data = nl;
    Jhmsg->Command = JH_SM;
    strcpy(Jhmsg->String, mstring);
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
}

/*
 * MciSendStr - Send MCI-encoded message
 */
void MciSendStr(char mstring[], int nl)
{
    Jhmsg->Data = nl;
    Jhmsg->Command = JH_MCI;
    strcpy(Jhmsg->String, mstring);
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
}

/*
 * prompt - Get user input with prompt
 */
void prompt(char mstring[], char *ostring, int len)
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
 * lineinput - Get line input with default
 */
void lineinput(char mstring[], char *ostring, int len)
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
void hotkey(char mstring[], char *ostring)
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
void showfile(char mstring[])
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
void showgfile(char mstring[])
{
    strcpy(Jhmsg->String, mstring);
    Jhmsg->Command = JH_SG;
    Jhmsg->Data = 0;
    PutMsg(port, (struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
}

/*
 * Download/Upload functions
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
 * System functions (may need platform-specific implementation)
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
 * System time function (simplified - may need full Amiga implementation)
 */
void getsystime(ULONG number, char *d, char *t)
{
    /* Simplified implementation - real version uses Amiga DateStamp */
    time_t current_time = time(NULL);
    struct tm *time_info = localtime(&current_time);

    if (d) {
        strftime(d, 22, "%m-%d-%y", time_info);
    }
    if (t) {
        strftime(t, 30, "%I:%M:%S %p", time_info);
    }
}