/*
 * AEDoor - XIM Template for AmiExpress (vbcc version)
 * Original (c) 1993 by Gord Dimitrieff (aka Garindan)
 * Adapted for vbcc cross-compilation
 *
 * Build: export VBCC=/opt/homebrew/opt/vbcc && vc +aos68k -O2 -I$NDK_PATH aedoor.c -o aedoor
 */

#include <exec/types.h>
#include <exec/ports.h>
#include <exec/memory.h>
#include <proto/exec.h>
#include <string.h>

extern struct ExecBase *SysBase;

struct XIM {
    struct Message Msg;
    char String[200];
    int Data;
    int Command;
    int NodeID;
    int LineNum;
    unsigned long signal;
    struct Process *task;
    APTR Semi;
};

struct MsgPort *DoorControlPort = NULL;
struct MsgPort *DoorReplyPort = NULL;
struct XIM *XIM_Msg = NULL;
struct XIM *reply = NULL;
ULONG usersig, portsig, signals;
char doorport[30];
int EXIT_FLAG = 0;
char instring[256];

/* Forward declarations */
int CheckMessage(void);
int PortStart(void);
void TakeOffEh(int code);
void ShutDown(void);
void GetString(char *text, int len);
void PutString(char *text, int lf);

/* Inline NewList */
static void NewList(struct List *list) {
    list->lh_Head = (struct Node *)&list->lh_Tail;
    list->lh_Tail = NULL;
    list->lh_TailPred = (struct Node *)&list->lh_Head;
}

/* CreatePort */
struct MsgPort *CreatePort(char *name, long pri) {
    BYTE sigBit;
    struct MsgPort *mp;

    sigBit = AllocSignal(-1);
    if (sigBit == -1) return NULL;

    mp = (struct MsgPort *)AllocMem(sizeof(struct MsgPort), MEMF_PUBLIC | MEMF_CLEAR);
    if (!mp) {
        FreeSignal(sigBit);
        return NULL;
    }

    mp->mp_Node.ln_Name = name;
    mp->mp_Node.ln_Pri = pri;
    mp->mp_Node.ln_Type = NT_MSGPORT;
    mp->mp_Flags = PA_SIGNAL;
    mp->mp_SigBit = sigBit;
    mp->mp_SigTask = FindTask(NULL);
    NewList(&mp->mp_MsgList);

    if (name) {
        AddPort(mp);
    }

    return mp;
}

void DeletePort(struct MsgPort *mp) {
    if (!mp) return;
    if (mp->mp_Node.ln_Name) {
        RemPort(mp);
    }
    FreeSignal(mp->mp_SigBit);
    FreeMem(mp, sizeof(struct MsgPort));
}

int CheckMessage(void) {
    int ret = 0;

    if (DoorControlPort) {
        Forbid();
        PutMsg(DoorControlPort, (struct Message *)XIM_Msg);
        Permit();

        signals = Wait(usersig | portsig);
        if (signals & portsig) {
            reply = (struct XIM *)GetMsg(DoorReplyPort);
            if (reply) {
                strcpy(instring, XIM_Msg->String);
                if (XIM_Msg->Data == -1) EXIT_FLAG = 1;
                ret = XIM_Msg->Data;
            }
        }
        if (signals & usersig) EXIT_FLAG = 1;
    } else {
        EXIT_FLAG = 1;
    }
    if (EXIT_FLAG) ShutDown();
    return ret;
}

int PortStart(void) {
    int error = 0;

    DoorReplyPort = CreatePort(0, 0);
    if (DoorReplyPort) {
        portsig = 1 << DoorReplyPort->mp_SigBit;
        usersig = 0x1000;  /* SIGBREAKF_CTRL_C */

        XIM_Msg = (struct XIM *)AllocMem(sizeof(struct XIM), MEMF_PUBLIC | MEMF_CLEAR);
        if (XIM_Msg) {
            XIM_Msg->Msg.mn_Node.ln_Type = NT_MESSAGE;
            XIM_Msg->Msg.mn_Length = sizeof(struct XIM);
            XIM_Msg->Msg.mn_ReplyPort = DoorReplyPort;
            XIM_Msg->Command = 1;  /* Register */

            Forbid();
            DoorControlPort = FindPort(doorport);
            Permit();

            if (DoorControlPort == NULL) {
                error = 3;
            } else {
                CheckMessage();
            }
        } else {
            error = 2;
        }
    } else {
        error = 1;
    }

    return error;
}

void TakeOffEh(int code) {
    if (XIM_Msg) {
        XIM_Msg->Command = 2;  /* Shutdown */
        if (DoorControlPort) CheckMessage();
        FreeMem(XIM_Msg, sizeof(struct XIM));
    }
    if (DoorReplyPort) DeletePort(DoorReplyPort);
}

void ShutDown(void) {
    TakeOffEh(0);
}

void GetString(char *text, int len) {
    XIM_Msg->Command = 0;
    XIM_Msg->Data = len;
    strcpy(XIM_Msg->String, text);
    CheckMessage();
}

void PutString(char *text, int lf) {
    XIM_Msg->Command = 4;
    XIM_Msg->Data = lf;
    strcpy(XIM_Msg->String, text);
    CheckMessage();
}

/* Simple sprintf for building port name */
void make_doorport(int node) {
    strcpy(doorport, "AEDoorPort");
    doorport[10] = '0' + node;
    doorport[11] = '\0';
}

int main(int argc, char *argv[]) {
    int line_num;

    if (argc < 2) {
        return 0;
    }

    line_num = argv[1][0] - '0';
    make_doorport(line_num);

    if (PortStart() != 0) {
        TakeOffEh(40);
        return 20;
    }

    /* Door content */
    PutString("", 1);
    PutString("[36m========================================[0m", 1);
    PutString("[33m   AEDoor Template (vbcc compiled)[0m", 1);
    PutString("[36m========================================[0m", 1);
    PutString("", 1);
    PutString("[32mThis door demonstrates:[0m", 1);
    PutString("  - XIM protocol communication", 1);
    PutString("  - vbcc cross-compilation", 1);
    PutString("  - Message passing to AmiExpress", 1);
    PutString("", 1);
    PutString("[32mDoor completed successfully![0m", 1);
    PutString("", 1);

    ShutDown();
    return 0;
}
