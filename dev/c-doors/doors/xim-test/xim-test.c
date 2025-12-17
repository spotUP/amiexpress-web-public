/*
 * XIM Test Door - Direct XIM Protocol Implementation
 *
 * This door uses the SAME approach as AEKIT101 reference doors:
 * - Direct exec.library calls (AllocMem, CreatePort, FindPort, PutMsg, etc.)
 * - JHMessage structure for XIM protocol
 * - NO AEDoor.library dependency
 *
 * Based on: Documentation/7-Reference Sources/AEKIT101/AE.Includes/AmiConSASc.c
 */

/* Amiga OS includes - using our local headers */
#include "../../includes/amiga/exec/types.h"
#include "../../includes/amiga/exec/exec.h"
#include "../../includes/amiga/exec/ports.h"
#include "../../includes/amiga/exec/memory.h"
#include "../../includes/amiga/exec/nodes.h"

/* Absolute ExecBase location */
#define ABSEXECBASE 4

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

#define READIT          1
#define WRITEIT         0

/* JHMessage structure - XIM protocol message format */
struct JHMessage {
    struct Message Msg;       /* Standard Amiga message header */
    char String[200];         /* Text data */
    int Data;                 /* Numeric data */
    int Command;              /* XIM command code */
    int NodeID;               /* Node number */
    int LineNum;              /* Line counter for paging */
    unsigned long signal;     /* Signal bits */
    void *aeproc;            /* Process pointer */
    void *Semi;              /* Semaphore pointer */
    void *Filler1;           /* Extra data pointer 1 */
    void *Filler2;           /* Extra data pointer 2 */
};

/* Global variables */
struct ExecBase *SysBase = 0;
struct MsgPort *port = 0;      /* BBS port (AEDoorPortN) */
struct MsgPort *replymp = 0;   /* Our reply port */
struct JHMessage *Jhmsg = 0;   /* Message structure */
struct JHMessage *msg = 0;     /* Reply message pointer */
char DoorReply[] = "AEDoorRP.000";

/* Exec library LVO offsets */
#define LVO_AllocMem        -198
#define LVO_FreeMem         -210
#define LVO_FindPort        -390
#define LVO_AddPort         -354
#define LVO_RemPort         -360
#define LVO_PutMsg          -366
#define LVO_GetMsg          -372
#define LVO_WaitPort        -384
#define LVO_Wait            -318
#define LVO_AllocSignal     -330
#define LVO_FreeSignal      -336
#define LVO_FindTask        -294

/* Forward declarations */
void end(void);
void LastCommand(void);
int strlen(const char *s);
char *strcpy(char *d, const char *s);
void sprintf_node(char *buf, int node);

/* ============================================================================
 * Exec Library Inline Functions
 * ============================================================================ */

static inline void *AllocMem(unsigned long size, unsigned long flags) {
    register void *_res __asm("d0");
    register struct ExecBase *a6 __asm("a6") = SysBase;
    register unsigned long d0 __asm("d0") = size;
    register unsigned long d1 __asm("d1") = flags;

    __asm volatile (
        "jsr a6@(-198:w)"
        : "=r" (_res)
        : "r" (a6), "r" (d0), "r" (d1)
        : "a0", "a1", "memory"
    );
    return _res;
}

static inline void FreeMem(void *mem, unsigned long size) {
    register struct ExecBase *a6 __asm("a6") = SysBase;
    register void *a1 __asm("a1") = mem;
    register unsigned long d0 __asm("d0") = size;

    __asm volatile (
        "jsr a6@(-210:w)"
        :
        : "r" (a6), "r" (a1), "r" (d0)
        : "d0", "d1", "a0", "memory"
    );
}

static inline struct MsgPort *FindPort(char *name) {
    register struct MsgPort *_res __asm("d0");
    register struct ExecBase *a6 __asm("a6") = SysBase;
    register char *a1 __asm("a1") = name;

    __asm volatile (
        "jsr a6@(-390:w)"
        : "=r" (_res)
        : "r" (a6), "r" (a1)
        : "d1", "a0", "memory"
    );
    return _res;
}

static inline void AddPort(struct MsgPort *port) {
    register struct ExecBase *a6 __asm("a6") = SysBase;
    register struct MsgPort *a1 __asm("a1") = port;

    __asm volatile (
        "jsr a6@(-354:w)"
        :
        : "r" (a6), "r" (a1)
        : "d0", "d1", "a0", "memory"
    );
}

static inline void RemPort(struct MsgPort *port) {
    register struct ExecBase *a6 __asm("a6") = SysBase;
    register struct MsgPort *a1 __asm("a1") = port;

    __asm volatile (
        "jsr a6@(-360:w)"
        :
        : "r" (a6), "r" (a1)
        : "d0", "d1", "a0", "memory"
    );
}

static inline void PutMsg(struct MsgPort *port, struct Message *msg) {
    register struct ExecBase *a6 __asm("a6") = SysBase;
    register struct MsgPort *a0 __asm("a0") = port;
    register struct Message *a1 __asm("a1") = msg;

    __asm volatile (
        "jsr a6@(-366:w)"
        :
        : "r" (a6), "r" (a0), "r" (a1)
        : "d0", "d1", "memory"
    );
}

static inline struct Message *GetMsg(struct MsgPort *port) {
    register struct Message *_res __asm("d0");
    register struct ExecBase *a6 __asm("a6") = SysBase;
    register struct MsgPort *a0 __asm("a0") = port;

    __asm volatile (
        "jsr a6@(-372:w)"
        : "=r" (_res)
        : "r" (a6), "r" (a0)
        : "d1", "a1", "memory"
    );
    return _res;
}

static inline struct Message *WaitPort(struct MsgPort *port) {
    register struct Message *_res __asm("d0");
    register struct ExecBase *a6 __asm("a6") = SysBase;
    register struct MsgPort *a0 __asm("a0") = port;

    __asm volatile (
        "jsr a6@(-384:w)"
        : "=r" (_res)
        : "r" (a6), "r" (a0)
        : "d1", "a1", "memory"
    );
    return _res;
}

static inline unsigned long Wait(unsigned long signals) {
    register unsigned long _res __asm("d0");
    register struct ExecBase *a6 __asm("a6") = SysBase;
    register unsigned long d0 __asm("d0") = signals;

    __asm volatile (
        "jsr a6@(-318:w)"
        : "=r" (_res)
        : "r" (a6), "r" (d0)
        : "d1", "a0", "a1", "memory"
    );
    return _res;
}

static inline signed char AllocSignal(signed char signal) {
    register signed char _res __asm("d0");
    register struct ExecBase *a6 __asm("a6") = SysBase;
    register signed char d0 __asm("d0") = signal;

    __asm volatile (
        "jsr a6@(-330:w)"
        : "=r" (_res)
        : "r" (a6), "r" (d0)
        : "d1", "a0", "a1", "memory"
    );
    return _res;
}

static inline void FreeSignal(signed char signal) {
    register struct ExecBase *a6 __asm("a6") = SysBase;
    register signed char d0 __asm("d0") = signal;

    __asm volatile (
        "jsr a6@(-336:w)"
        :
        : "r" (a6), "r" (d0)
        : "d0", "d1", "a0", "a1", "memory"
    );
}

static inline struct Task *FindTask(char *name) {
    register struct Task *_res __asm("d0");
    register struct ExecBase *a6 __asm("a6") = SysBase;
    register char *a1 __asm("a1") = name;

    __asm volatile (
        "jsr a6@(-294:w)"
        : "=r" (_res)
        : "r" (a6), "r" (a1)
        : "d1", "a0", "memory"
    );
    return _res;
}

/* ============================================================================
 * Port Creation (simplified from AEKIT101)
 * ============================================================================ */

struct MsgPort *CreatePort(char *name, long pri) {
    signed char sigBit;
    struct MsgPort *mp;

    sigBit = AllocSignal(-1);
    if (sigBit == -1) return 0;

    mp = (struct MsgPort *)AllocMem(sizeof(struct MsgPort), MEMF_PUBLIC | MEMF_CLEAR);
    if (!mp) {
        FreeSignal(sigBit);
        return 0;
    }

    mp->mp_Node.ln_Name = name;
    mp->mp_Node.ln_Pri = pri;
    mp->mp_Node.ln_Type = NT_MSGPORT;
    mp->mp_Flags = PA_SIGNAL;
    mp->mp_SigBit = sigBit;
    mp->mp_SigTask = (struct Task *)FindTask(0);

    /* Initialize message list */
    mp->mp_MsgList.lh_Head = (struct Node *)&mp->mp_MsgList.lh_Tail;
    mp->mp_MsgList.lh_Tail = 0;
    mp->mp_MsgList.lh_TailPred = (struct Node *)&mp->mp_MsgList.lh_Head;

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

/* ============================================================================
 * XIM Protocol Functions (from AEKIT101 AmiConSASc.c)
 * ============================================================================ */

void Register(int node) {
    unsigned long portsig;
    int n1, n2, n3;
    int found = 0;
    char PortName[80];

    /* Allocate message structure */
    Jhmsg = (struct JHMessage *)AllocMem(sizeof(struct JHMessage), MEMF_PUBLIC | MEMF_CLEAR);
    if (!Jhmsg) {
        return;
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
        Jhmsg = 0;
        return;
    }

    /* Create reply port */
    replymp = CreatePort(DoorReply, 0);
    strcpy(PortName, DoorReply);

    if (!replymp) {
        FreeMem(Jhmsg, sizeof(struct JHMessage));
        Jhmsg = 0;
        return;
    }

    /* Setup message */
    Jhmsg->Msg.mn_Node.ln_Type = NT_MESSAGE;
    Jhmsg->Msg.mn_Length = sizeof(struct JHMessage);
    Jhmsg->Msg.mn_ReplyPort = replymp;
    strcpy(Jhmsg->String, PortName);
    Jhmsg->Command = JH_REGISTER;
    Jhmsg->Data = 2;  /* XIM door type */
    Jhmsg->NodeID = -1;
    Jhmsg->LineNum = 0;

    /* Find BBS port */
    sprintf_node(PortName, node);  /* "AEDoorPort{node}" */

    /* Wait for BBS port to exist */
    while (!(port = FindPort(PortName)));

    /* Send registration message */
    PutMsg(port, (struct Message *)Jhmsg);

    /* Wait for reply */
    portsig = 1 << replymp->mp_SigBit;
    Wait(portsig);
    msg = (struct JHMessage *)GetMsg(replymp);
}

void ShutDown(void) {
    unsigned long portsig;

    if (!Jhmsg || !replymp || !port) return;

    LastCommand();

    portsig = 1 << replymp->mp_SigBit;
    Jhmsg->Command = JH_SHUTDOWN;
    PutMsg(port, (struct Message *)Jhmsg);
    Wait(portsig);

    /* Cleanup */
    while ((msg = (struct JHMessage *)GetMsg(replymp)));
    DeletePort(replymp);
    FreeMem(Jhmsg, sizeof(struct JHMessage));

    replymp = 0;
    Jhmsg = 0;
    port = 0;
}

void sendMessage(char *mstring, int nl) {
    if (!Jhmsg || !replymp || !port) return;

    Jhmsg->Data = nl;
    Jhmsg->Command = JH_SM;
    strcpy(Jhmsg->String, mstring);
    PutMsg(port, (struct Message *)Jhmsg);
    WaitPort(replymp);
    GetMsg(replymp);
}

void sendmessage(char *mstring, int nl) {
    /* Send string, handling long strings by chunking */
    int counter;
    char Temp[80];

    if (strlen(mstring) < 80) {
        sendMessage(mstring, 0);
    } else {
        counter = 0;
        do {
            /* Copy up to 79 chars */
            int i;
            for (i = 0; i < 79 && mstring[counter + i]; i++) {
                Temp[i] = mstring[counter + i];
            }
            Temp[i] = 0;
            sendMessage(Temp, 0);
            counter += 79;
        } while (strlen(Temp) == 79);
    }

    if (nl == 1) {
        sendMessage("", 1);
        if (Jhmsg) Jhmsg->LineNum += 1;
    }
}

void getuserstring(char *ostring, int cmd) {
    if (!Jhmsg || !replymp || !port) {
        ostring[0] = 0;
        return;
    }

    Jhmsg->Command = cmd;
    Jhmsg->Data = READIT;
    PutMsg(port, (struct Message *)Jhmsg);
    WaitPort(replymp);
    GetMsg(replymp);
    strcpy(ostring, Jhmsg->String);
}

/* ============================================================================
 * Utility Functions
 * ============================================================================ */

int strlen(const char *s) {
    int len = 0;
    if (!s) return 0;
    while (*s++) len++;
    return len;
}

char *strcpy(char *d, const char *s) {
    char *orig = d;
    if (!d || !s) return d;
    while ((*d++ = *s++));
    return orig;
}

void sprintf_node(char *buf, int node) {
    /* Build "AEDoorPort{node}" string */
    strcpy(buf, "AEDoorPort");
    buf[10] = '0' + node;
    buf[11] = 0;
}

void LastCommand(void) {
    sendmessage("", 1);
}

void end(void) {
    /* Exit - just return to _start which will loop */
}

/* ============================================================================
 * Main Entry Point
 * ============================================================================ */

void _start(void);

int main(int argc, char *argv[]) {
    char username[64];
    char location[64];

    /* Register with BBS on node 1 */
    Register(1);

    if (!Jhmsg) {
        return 20;  /* Error: couldn't register */
    }

    /* Send output */
    sendmessage("", 1);
    sendmessage("[1;36m========================================[0m", 1);
    sendmessage("[1;33m    XIM Test Door - Direct Protocol[0m", 1);
    sendmessage("[1;36m========================================[0m", 1);
    sendmessage("", 1);
    sendmessage("[0;32mThis door uses DIRECT XIM protocol:[0m", 1);
    sendmessage("  - exec.library calls (AllocMem, PutMsg, etc.)", 1);
    sendmessage("  - JHMessage structure for communication", 1);
    sendmessage("  - NO AEDoor.library dependency!", 1);
    sendmessage("", 1);

    /* Query user data */
    getuserstring(username, DT_NAME);
    getuserstring(location, DT_LOCATION);

    sendmessage("[0;33mUser Data Query Results:[0m", 1);
    sendmessage("  Name: ", 0);
    sendmessage(username[0] ? username : "(unknown)", 1);
    sendmessage("  Location: ", 0);
    sendmessage(location[0] ? location : "(unknown)", 1);
    sendmessage("", 1);

    sendmessage("[0;32mDoor completed successfully![0m", 1);
    sendmessage("", 1);

    /* Shutdown */
    ShutDown();
    end();

    return 0;
}

/* C Runtime Entry Point */
void _start(void) {
    /* Get ExecBase from absolute address 4 */
    SysBase = *((struct ExecBase **)ABSEXECBASE);
    if (!SysBase) {
        while(1) { __asm volatile ("nop"); }
    }

    /* Call main */
    main(0, 0);

    /* Loop forever (Amiga convention - process will be terminated) */
    while(1) { __asm volatile ("nop"); }
}
