/* aedoor_amiga.c - AmigaOS implementation of the AmiExpress XIM door I/O
 * layer: the real message-port protocol against a running AmiExpress node.
 *
 * Structure and function-mapping are modelled directly on the two reference
 * doors named in the DoorRepo C client plan:
 *   amiexpress_doors/Sources/_C/AE_DOORS/AEDoor.c (Gord Dimitrieff, 1993) --
 *     PortStart() -> ae_start(), CheckMessage() -> the internal xim_call()
 *     round trip, TakeOffEh()/ShutDown() -> ae_fatal()/ae_shutdown(),
 *     GetString()/PutString() -> ae_get()/ae_put().
 *   amiexpress_doors/Sources/_AREXX/DC-X107I/DC-SX107install/SX/Developer/
 *     SASC/Example2.c -- the CreateMsgPort/PutMsg/WaitPort/GetMsg/
 *     DeleteMsgPort round trip this file's xim_call() follows directly
 *     (Example2.c:62-79).
 *
 * Every protocol constant and struct offset below is cited against
 * thoughts/shared/research/2026-08-17_xim-door-protocol-for-c-clients.md
 * (referred to as "research doc" in comments), which was extracted from the
 * original AmigaE sources, our emulator, and real door sources, and
 * corrects several points where doordocs.txt is wrong or stale -- most
 * importantly the true size of struct JHMessage (see below).
 *
 * There is no "#ifdef AMIGA" in this file: it is compiled only when the
 * Makefile (Task 6) targets AmigaOS, and aedoor_native.c is compiled
 * instead for the native/dev target. That file selection IS the platform
 * mechanism.
 *
 * C89. ASCII only.
 */

#include <exec/types.h>
#include <exec/nodes.h>
#include <exec/ports.h>
#include <exec/memory.h>
#include <dos/dos.h>
#include <dos/dosextens.h>
#include <proto/exec.h>
#include <proto/dos.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "aedoor.h"

/* ---- struct JHMessage --------------------------------------------------
 *
 * Canonical layout: axcommon.e:543-556, independently confirmed by
 * amiexpress_doors/Sources/_C/AMIXDOOR/AmiX.h:47-57 (decimal offsets in
 * comments there) and amiexpress_doors ximdoor.s:16-24; matches
 * research doc "Message structure - allocate the FULL 264 bytes".
 *
 * struct Message (exec/ports.h) is 20 bytes on m68k with no compiler
 * padding: ln_Succ(4)+ln_Pred(4)+ln_Type(1)+ln_Pri(1)+ln_Name(4) = 14 bytes
 * of struct Node, + mn_ReplyPort(4) + mn_Length(2) = 20. Every field from
 * String[200] onward falls on a naturally-aligned boundary already (220 is
 * divisible by 4), so this struct needs no #pragma pack to land at exactly
 * the offsets below.
 *
 * CRITICAL: do not stop this struct at Semi (which would total 248 bytes,
 * 0xF8). The BBS writes NodeID (offset 0xE4) and LineNum (offset 0xE8)
 * with NO mn_Length guard (research doc, citing xim/messages.ts:279-291 /
 * XIMProtocol.ts:625-632), so a 248-byte allocation is written past by the
 * BBS itself. The tail fields (Filler1/Filler2/strptr/Filler3) ARE
 * length-gated on mn_Length and are only usable at all once the struct --
 * and mn_Length -- are the full 264 bytes (research doc, citing
 * express.e:3919,4072,4552,4575 / messages.ts:66-107).
 */
struct JHMessage {
    struct Message  Msg;         /* 0x00  20 bytes; struct Message, exec/ports.h */
    char            String[200]; /* 0x14  data buffer, NUL-terminated; axcommon.e:546 */
    LONG            Data;        /* 0xDC  direction flag / length / result; axcommon.e:547 */
    LONG            Command;     /* 0xE0  command code (also carries some results); axcommon.e:548 */
    LONG            NodeID;      /* 0xE4  node/slot; set -1 at register time; axcommon.e:549 */
    LONG            LineNum;     /* 0xE8  line counter (do not paginate on this -- research doc divergence #2); axcommon.e:550 */
    ULONG           signal;      /* 0xEC  door's extra signal, JH_ExtHK; axcommon.e:551 */
    struct Process *task;        /* 0xF0  BB_GETTASK result; axcommon.e:552 */
    APTR            Semi;        /* 0xF4  MULTICOM result; axcommon.e:553 */
    APTR            Filler1;     /* 0xF8  generic pointer argument; research doc tail */
    APTR            Filler2;     /* 0xFC  generic pointer argument; research doc tail */
    char           *strptr;      /* 0x100 JH_SMPTR source pointer; research doc tail */
    LONG            Filler3;     /* 0x104 padding/reserved; research doc tail */
};                                /* SIZEOF = 0x108 = 264 bytes */

/* Compile-time guard: if this struct's size ever drifts from 264 bytes
 * (e.g. someone "cleans up" the tail fields back out because they look
 * unused), the build fails here instead of silently reintroducing the
 * BBS-writes-past-a-248-byte-allocation bug described above. C89-safe
 * negative-array-size trick (no static_assert in C89). */
typedef char jh_size_check[(sizeof(struct JHMessage) == 264) ? 1 : -1];

/* ---- command codes ------------------------------------------------------
 * Full numeric list: axcommon.e:72-364 (research doc). Only the subset this
 * door needs is reproduced here. */
#define JH_LI       0   /* line input, String is a PRE-FILLED default, no prompt; axcommon.e / research doc */
#define JH_REGISTER 1   /* first message, increments the node's active-door count; axcommon.e / research doc */
#define JH_SHUTDOWN 2   /* last message, mandatory, decrements the count; axcommon.e / research doc */
#define JH_SM       4   /* the normal output call: writes String; Data != 0 appends the BBS's line break and runs its pause check; research doc, express.e:3406-3411 */
#define JH_PM       5   /* prompt (String) + line input; unused here -- ae_get()'s prompt is already emitted via ae_put() */
#define JH_HK       6   /* prompt (String) then blocking single-key read; reply key lands in String[0]; research doc */

/* ---- module state: one outstanding message at a time, exactly as the
 * reference doors do (AEDoor.c keeps one statically allocated XIM_Msg and
 * reuses it for every call; Example2.c's `themsg` is the same idea). */
static struct MsgPort  *bbs_port = NULL;
static struct MsgPort  *reply_port = NULL;
static struct JHMessage *msg = NULL;
static int               carrier_lost = 0;

/* CheckMessage() equivalent (AEDoor.c:154-183) collapsed to the minimal
 * exec round trip shown in Example2.c's XIMFunction() (lines 62-79): send
 * the pre-filled message, block on the door's own reply port, retrieve the
 * (mutated in place) reply. AEDoor.c applies the Data==-1 carrier-loss
 * check uniformly after every round trip regardless of command, which is
 * the convention followed here (AEDoor.c:170). */
static void xim_call(void)
{
    PutMsg(bbs_port, (struct Message *)msg);
    WaitPort(reply_port);
    GetMsg(reply_port);

    if (msg->Data == -1) {
        /* research doc: "Data == -1 from any input call means carrier loss
         * or timeout -- the caller must stop and shut down." */
        carrier_lost = 1;
    }
}

int ae_start(int node)
{
    char portname[32];

    /* Port name AEDoorPort<node>, node from argv[1]; research doc, citing
     * express.e:4317,4327 (BBS creates the port) and express.e:4308
     * (node arrives as argv[1] only). */
    sprintf(portname, "AEDoorPort%d", node);

    reply_port = CreateMsgPort();
    if (reply_port == NULL) {
        return 1;
    }

    msg = (struct JHMessage *)AllocMem(sizeof(struct JHMessage), MEMF_PUBLIC | MEMF_CLEAR);
    if (msg == NULL) {
        DeleteMsgPort(reply_port);
        reply_port = NULL;
        return 2;
    }

    /* Guarded by Forbid()/Permit() so the port cannot be torn down between
     * the lookup and use, matching AEDoor.c:205-207. */
    Forbid();
    bbs_port = FindPort(portname);
    Permit();

    if (bbs_port == NULL) {
        /* Not running under AmiExpress -- research doc startup sequence
         * step 1. */
        FreeMem(msg, sizeof(struct JHMessage));
        msg = NULL;
        DeleteMsgPort(reply_port);
        reply_port = NULL;
        return 3;
    }

    msg->Msg.mn_Node.ln_Type = NT_MESSAGE;
    msg->Msg.mn_Length = sizeof(struct JHMessage); /* MUST equal sizeof(struct JHMessage) -- see the struct comment above */
    msg->Msg.mn_ReplyPort = reply_port;
    msg->NodeID = -1; /* research doc: "NodeID = -1 at register" */

    msg->Command = JH_REGISTER;
    msg->Data = 0;
    msg->String[0] = '\0';
    xim_call();

    carrier_lost = 0;
    return 0;
}

void ae_put(const char *text, int newline)
{
    unsigned long len;
    unsigned long offset;
    unsigned long chunk;

    if (msg == NULL || bbs_port == NULL) {
        return;
    }
    if (text == NULL) {
        text = "";
    }

    len = (unsigned long)strlen(text);
    offset = 0;

    if (len == 0) {
        if (newline) {
            msg->Command = JH_SM;
            msg->Data = 1; /* Data != 0: BBS appends the break and runs its pause check; research doc */
            msg->String[0] = '\0';
            xim_call();
        }
        return;
    }

    /* Usable String payload is AE_MAX_LINE (198) chars + NUL, not the full
     * 200-byte array -- research doc. Chunk longer text across multiple
     * JH_SM sends; only the FINAL chunk carries Data=1 (newline) so the
     * BBS appends exactly one line break, never mid-string. */
    while (offset < len) {
        chunk = len - offset;
        if (chunk > AE_MAX_LINE) {
            chunk = AE_MAX_LINE;
        }

        memcpy(msg->String, text + offset, (size_t)chunk);
        msg->String[chunk] = '\0';

        msg->Command = JH_SM;
        msg->Data = ((offset + chunk) >= len && newline) ? 1 : 0;
        xim_call();

        offset += chunk;
    }
}

void ae_get(char *buf, int maxlen)
{
    int cap;

    if (buf == NULL || maxlen <= 0) {
        return;
    }
    if (msg == NULL || bbs_port == NULL) {
        buf[0] = '\0';
        return;
    }

    cap = maxlen - 1;
    if (cap > AE_MAX_LINE) {
        cap = AE_MAX_LINE; /* String only holds 198 usable chars -- research doc */
    }
    if (cap < 1) {
        cap = 1;
    }

    /* JH_LI: line input where String is a PRE-FILLED default, no prompt --
     * the caller has already emitted the prompt via ae_put(). Always pass
     * a sane Data (max length): 0 or >= 65536 with an empty String
     * auto-replies empty (research doc divergence #5). */
    msg->Command = JH_LI;
    msg->Data = cap;
    msg->String[0] = '\0';
    xim_call();

    strncpy(buf, msg->String, (size_t)(maxlen - 1));
    buf[maxlen - 1] = '\0';
}

int ae_key(void)
{
    if (msg == NULL || bbs_port == NULL) {
        return -1;
    }

    /* JH_HK: prompt (none here) then blocking single-key read; reply key
     * lands in String[0], String[1] = 0 -- research doc. */
    msg->Command = JH_HK;
    msg->Data = 1;
    msg->String[0] = '\0';
    xim_call();

    if (msg->Data == -1) {
        return -1;
    }
    return (int)(unsigned char)msg->String[0];
}

int ae_check(void)
{
    return carrier_lost;
}

/* Shared tail of ae_shutdown()/ae_fatal(): notify the BBS (JH_SHUTDOWN is
 * mandatory on every exit path -- research doc: "Never exit without
 * JH_SHUTDOWN ... the BBS waits forever", AEDoor.c:147-148), then release
 * the door's own resources and terminate. Modelled on AEDoor.c's
 * TakeOffEh() (lines 231-239), which both ShutDown() and error paths funnel
 * through. */
static void do_shutdown(int code)
{
    if (bbs_port != NULL && msg != NULL) {
        msg->Command = JH_SHUTDOWN;
        msg->Data = 0;
        xim_call();
    }

    if (msg != NULL) {
        FreeMem(msg, sizeof(struct JHMessage));
        msg = NULL;
    }
    if (reply_port != NULL) {
        DeleteMsgPort(reply_port);
        reply_port = NULL;
    }

    exit(code);
}

void ae_shutdown(void)
{
    do_shutdown(0);
}

void ae_fatal(int code)
{
    do_shutdown(code);
}
