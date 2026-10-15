/*
 * XIM Door for AmiExpress - vbcc Version
 *
 * This door uses the SAME XIM protocol as AEKIT101 reference doors:
 * - Direct exec.library calls via vbcc inline headers
 * - JHMessage structure for XIM protocol
 * - Communication via AEDoorPort{n} message ports
 *
 * Based on: Documentation/7-Reference Sources/AEKIT101/AE.Includes/AmiConSASc.c
 *
 * Build with: export VBCC=/opt/homebrew/opt/vbcc && vc +aos68k xim-vbcc.c -o xim-vbcc
 */

#include <exec/types.h>
#include <exec/memory.h>
#include <exec/ports.h>
#include <exec/nodes.h>
#include <proto/exec.h>
#include <string.h>

/* ExecBase - vbcc startup provides this, we just declare it */
extern struct ExecBase *SysBase;

/* Debug marker - write to fixed memory location for debugging */
#define DEBUG_ADDR ((volatile ULONG *)0xDEB000)
#define DEBUG(x) (*DEBUG_ADDR = (x))

/* XIM Command Codes (from AEKIT101 doorheader.h) */
#define JH_LI           0    /* Line Input */
#define JH_REGISTER     1    /* Register with BBS */
#define JH_SHUTDOWN     2    /* Shutdown door */
#define JH_WRITE        3    /* Write to terminal */
#define JH_SM           4    /* Send Message */
#define JH_PM           5    /* Prompt */
#define JH_HK           6    /* Hot Key */
#define JH_SG           7    /* Show GFile */
#define JH_SF           8    /* Show File */

/* Data query codes */
#define DT_NAME         100
#define DT_LOCATION     102
#define DT_SECSTATUS    105
#define BB_CONFNAME     126

#define READIT          1
#define WRITEIT         0

/* JHMessage structure - XIM protocol message format (from AEKIT101) */
struct JHMessage {
    struct Message Msg;       /* Standard Amiga message header */
    char String[200];         /* Text data */
    int Data;                 /* Numeric data */
    int Command;              /* XIM command code */
    int NodeID;               /* Node number */
    int LineNum;              /* Line counter for paging */
    unsigned long signal;     /* Signal bits */
    struct Process *aeproc;   /* Process pointer */
    APTR Semi;               /* Semaphore pointer */
    APTR Filler1;            /* Extra data pointer 1 */
    APTR Filler2;            /* Extra data pointer 2 */
};

/* Global variables (same as AEKIT101) */
struct MsgPort *port = NULL;      /* BBS port (AEDoorPortN) */
struct MsgPort *replymp = NULL;   /* Our reply port */
struct JHMessage *Jhmsg = NULL;   /* Message structure */
struct JHMessage *msg = NULL;     /* Reply message pointer */
char DoorReply[] = "AEDoorRP.000";

/* Forward declarations */
void end(void);
void LastCommand(void);

/* Inline NewList - initialize a list structure */
static void NewList(struct List *list) {
    list->lh_Head = (struct Node *)&list->lh_Tail;
    list->lh_Tail = NULL;
    list->lh_TailPred = (struct Node *)&list->lh_Head;
}

/* Create a message port - simplified version */
struct MsgPort *CreatePort(char *name, long pri) {
    BYTE sigBit;
    struct MsgPort *mp;

    DEBUG(0x2001);  /* CreatePort entry */
    sigBit = AllocSignal(-1);
    DEBUG(0x2002 + (sigBit & 0xFF));  /* After AllocSignal, low byte = signal */
    if (sigBit == -1) {
        DEBUG(0xDEA4);  /* AllocSignal failed */
        return NULL;
    }

    mp = (struct MsgPort *)AllocMem(sizeof(struct MsgPort), MEMF_PUBLIC | MEMF_CLEAR);
    DEBUG(0x2003);  /* After AllocMem for port */
    if (!mp) {
        DEBUG(0xDEA5);  /* AllocMem for port failed */
        FreeSignal(sigBit);
        return NULL;
    }

    mp->mp_Node.ln_Name = name;
    mp->mp_Node.ln_Pri = pri;
    mp->mp_Node.ln_Type = NT_MSGPORT;
    mp->mp_Flags = PA_SIGNAL;
    mp->mp_SigBit = sigBit;
    mp->mp_SigTask = FindTask(NULL);
    DEBUG(0x2004);  /* After setting port fields */

    /* Initialize message list */
    NewList(&mp->mp_MsgList);
    DEBUG(0x2005);  /* After NewList */

    if (name) {
        AddPort(mp);
        DEBUG(0x2006);  /* After AddPort */
    }

    DEBUG(0x2007);  /* CreatePort success */
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

/* Register with BBS (from AEKIT101 AmiConSASc.c) */
void Register(int node) {
    ULONG portsig;
    int n1, n2, n3;
    int found = 0;
    char PortName[80];

    DEBUG(0x1001);  /* Register() entry */

    /* Allocate message structure */
    Jhmsg = (struct JHMessage *)AllocMem(sizeof(struct JHMessage), MEMF_PUBLIC | MEMF_CLEAR);
    DEBUG(0x1002);  /* After AllocMem */
    if (!Jhmsg) {
        DEBUG(0xDEAD);  /* AllocMem failed */
        return;
    }
    DEBUG(0x1003);  /* AllocMem succeeded */

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

    DEBUG(0x1004);  /* After port name search */
    if (!found) {
        DEBUG(0xDEA2);  /* No unique port name found */
        FreeMem(Jhmsg, sizeof(struct JHMessage));
        Jhmsg = NULL;
        return;
    }
    DEBUG(0x1005);  /* Found unique port name */

    /* Create reply port */
    replymp = CreatePort(DoorReply, 0);
    strcpy(PortName, DoorReply);
    DEBUG(0x1006);  /* After CreatePort */

    if (!replymp) {
        DEBUG(0xDEA3);  /* CreatePort failed */
        FreeMem(Jhmsg, sizeof(struct JHMessage));
        Jhmsg = NULL;
        return;
    }
    DEBUG(0x1007);  /* CreatePort succeeded */

    /* Setup message */
    Jhmsg->Msg.mn_Node.ln_Type = NT_MESSAGE;
    Jhmsg->Msg.mn_Length = sizeof(struct JHMessage);
    Jhmsg->Msg.mn_ReplyPort = replymp;
    strcpy(Jhmsg->String, PortName);
    Jhmsg->Command = JH_REGISTER;
    Jhmsg->Data = 2;  /* XIM door type */
    Jhmsg->NodeID = -1;
    Jhmsg->LineNum = 0;

    /* Build BBS port name: "AEDoorPort{node}" */
    strcpy(PortName, "AEDoorPort");
    PortName[10] = '0' + node;
    PortName[11] = '\0';

    /* Wait for BBS port to exist */
    while (!(port = FindPort(PortName)));

    /* Send registration message */
    PutMsg(port, (struct Message *)Jhmsg);

    /* Wait for reply */
    portsig = 1L << replymp->mp_SigBit;
    Wait(portsig);
    msg = (struct JHMessage *)GetMsg(replymp);
}

/* Shutdown door (from AEKIT101) */
void ShutDown(void) {
    ULONG portsig;

    if (!Jhmsg || !replymp || !port) return;

    LastCommand();

    portsig = 1L << replymp->mp_SigBit;
    Jhmsg->Command = JH_SHUTDOWN;
    PutMsg(port, (struct Message *)Jhmsg);
    Wait(portsig);

    /* Cleanup */
    while ((msg = (struct JHMessage *)GetMsg(replymp)));
    DeletePort(replymp);
    FreeMem(Jhmsg, sizeof(struct JHMessage));

    replymp = NULL;
    Jhmsg = NULL;
    port = NULL;
}

/* Send message to terminal (from AEKIT101) */
void sendMessage(char *mstring, int nl) {
    if (!Jhmsg || !replymp || !port) return;

    Jhmsg->Data = nl;
    Jhmsg->Command = JH_SM;
    strcpy(Jhmsg->String, mstring);
    PutMsg(port, (struct Message *)Jhmsg);
    WaitPort(replymp);
    GetMsg(replymp);
}

/* Send message with long string handling (from AEKIT101) */
void sendmessage(char *mstring, int nl) {
    int counter;
    char Temp[80];
    int len = strlen(mstring);

    if (len < 80) {
        sendMessage(mstring, 0);
    } else {
        counter = 0;
        do {
            int i;
            for (i = 0; i < 79 && mstring[counter + i]; i++) {
                Temp[i] = mstring[counter + i];
            }
            Temp[i] = '\0';
            sendMessage(Temp, 0);
            counter += 79;
        } while (strlen(Temp) == 79);
    }

    if (nl == 1) {
        sendMessage("", 1);
        if (Jhmsg) Jhmsg->LineNum += 1;
    }
}

/* Query user/BBS data (from AEKIT101) */
void getuserstring(char *ostring, int cmd) {
    if (!Jhmsg || !replymp || !port) {
        ostring[0] = '\0';
        return;
    }

    Jhmsg->Command = cmd;
    Jhmsg->Data = READIT;
    PutMsg(port, (struct Message *)Jhmsg);
    WaitPort(replymp);
    GetMsg(replymp);
    strcpy(ostring, Jhmsg->String);
}

void LastCommand(void) {
    sendmessage("", 1);
}

void end(void) {
    /* Exit */
}

/* Main entry point */
int main(int argc, char *argv[]) {
    char username[64];
    char location[64];
    char confname[64];
    int node = 1;

    DEBUG(0x0001);  /* main() entry */

    /* SysBase is already set by vbcc startup code */

    /* Parse node number from args if provided */
    if (argc >= 2 && argv[1]) {
        node = argv[1][0] - '0';
        if (node < 0 || node > 9) node = 1;
    }
    DEBUG(0x0002 + node);  /* After arg parsing, low byte = node */

    /* Register with BBS */
    Register(node);
    DEBUG(0x0003);  /* After Register() */

    if (!Jhmsg) {
        DEBUG(0xFA11);  /* Registration failed */
        return 20;  /* Error: couldn't register */
    }
    DEBUG(0x0004);  /* Registration succeeded */

    /* Send output */
    sendmessage("", 1);
    sendmessage("\x1b[1;36m========================================\x1b[0m", 1);
    sendmessage("\x1b[1;33m    XIM Door (vbcc) - Direct Protocol\x1b[0m", 1);
    sendmessage("\x1b[1;36m========================================\x1b[0m", 1);
    sendmessage("", 1);
    sendmessage("\x1b[0;32mThis door uses DIRECT XIM protocol:\x1b[0m", 1);
    sendmessage("  - vbcc cross-compiler", 1);
    sendmessage("  - Standard Amiga exec.library calls", 1);
    sendmessage("  - JHMessage XIM communication", 1);
    sendmessage("", 1);

    /* Query user data */
    getuserstring(username, DT_NAME);
    getuserstring(location, DT_LOCATION);
    getuserstring(confname, BB_CONFNAME);

    sendmessage("\x1b[0;33mUser Data Query Results:\x1b[0m", 1);
    sendmessage("  Name: ", 0);
    sendmessage(username[0] ? username : "(unknown)", 1);
    sendmessage("  Location: ", 0);
    sendmessage(location[0] ? location : "(unknown)", 1);
    sendmessage("  Conference: ", 0);
    sendmessage(confname[0] ? confname : "(unknown)", 1);
    sendmessage("", 1);

    sendmessage("\x1b[0;32mDoor completed successfully!\x1b[0m", 1);
    sendmessage("", 1);

    /* Shutdown */
    ShutDown();
    end();

    return 0;
}
