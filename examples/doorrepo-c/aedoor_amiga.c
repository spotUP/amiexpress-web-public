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
#include <proto/exec.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#include "aedoor.h"

/* struct Process is only ever held here as an opaque pointer (JHMessage's
 * "task" field, BB_GETTASK result) -- never dereferenced -- so a forward
 * declaration is enough. This file makes no dos.library calls at all (every
 * function used -- AllocMem/FreeMem/CreateMsgPort/DeleteMsgPort/PutMsg/
 * WaitPort/GetMsg/FindPort/Forbid/Permit -- is exec.library), so <dos/dos.h>
 * and <proto/dos.h> are omitted entirely rather than just <dos/dosextens.h>.
 * This also sidesteps two "struct/union member needs identifier" warnings
 * from <devices/timer.h> (it declares anonymous unions, a C11-ism vbcc's
 * C99 mode does not parse) that would otherwise be dragged in transitively
 * -- confirmed by compiling both ways: with <proto/dos.h> included, vbcc's
 * own error trace shows the chain proto/dos.h -> (NDK) clib/dos_protos.h ->
 * dos/dosextens.h -> devices/timer.h, i.e. the warnings originate entirely
 * inside vendored NDK/vbcc headers, not this file's own code or include
 * order -- and without it, the warnings are gone. */
struct Process;

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
 * BBS-writes-past-a-248-byte-allocation bug described above.
 *
 * NOT a negative-array-size typedef (the more common C89 static-assert
 * trick): verified against vc +aos68k -c99 -- the only compiler that ever
 * builds this file -- that vbcc treats an array declared with a negative
 * size as a WARNING ("warning 61 ... array of size <=0 (set to 1)"), not
 * an error, and exits 0 with a valid object file. That form is inert on
 * this toolchain and would not have caught the exact bug this guard exists
 * to prevent. A negative-width bitfield DOES hard-fail under vbcc (error
 * 332, "illegal bitfield size", exit 1) as well as under host cc, so that
 * is the form used here. */
struct jh_size_check { int flag : (sizeof(struct JHMessage) == 264) ? 1 : -1; };

/* ---- command codes ------------------------------------------------------
 * Full numeric list: axcommon.e:72-364 (research doc). Only the subset this
 * door needs is reproduced here. */
#define JH_LI       0   /* line input, String is a PRE-FILLED default, no prompt; axcommon.e / research doc */
#define JH_REGISTER 1   /* first message, increments the node's active-door count; axcommon.e / research doc */
#define JH_SHUTDOWN 2   /* last message, mandatory, decrements the count; axcommon.e / research doc */
#define JH_SM       4   /* the normal output call: writes String; Data != 0 appends the BBS's line break and runs its pause check; research doc, express.e:3406-3411 */
#define JH_PM       5   /* prompt (String) + line input; unused here -- ae_get()'s prompt is already emitted via ae_put() */
#define JH_HK       6   /* prompt (String) then blocking single-key read; reply key lands in String[0]; research doc */
#define JH_FetchKey 17  /* non-blocking read: key in Command, or 0 when nothing is queued (express.e:3465-3472) */
/* RAWARROW toggles the BBS's rawArrow flag (axcommon.e:187, handled at
 * express.e:3814-3815). It is the difference between a door seeing the
 * cursor keys and never seeing them at all:
 *
 *   JH_HK is answered by readChar(), which loops
 *     UNTIL (((wasControl=FALSE) OR (raw)) AND (ch<>0)) ...
 *   and processInputMessage() sets wasControl:=1 for an arrow key UNLESS
 *   rawArrow is TRUE (express.e:7514-7528). rawArrow starts FALSE
 *   (express.e:303), so with it off the BBS swallows every arrow and keeps
 *   waiting for the "real" key - the door is never told anything happened.
 *
 * With rawArrow ON the same code still converts the sequence to
 * LEFT/RIGHT/UP/DOWN = 2/3/4/5 (axconsts.e:75-78); it only stops treating
 * them as control keys to be eaten. So a door enables this once and then
 * reads the single-byte codes it already understood.
 *
 * Reported from a real AmiExpress node: cursor keys did nothing. It went
 * unnoticed here because this project's emulator delivers arrows to a door
 * whether or not rawArrow is set. */
#define RAWARROW  501

/* AmiExpress doors sometimes deliberately send "bbs:" device/volume paths
 * via JH_SM to trigger file display instead of a printed line: our emulator
 * matches this by trimming the message text and testing a case-insensitive
 * prefix (io.ts:657-666 -- "const trimmed = text.trim(); ... if
 * (trimmed.toLowerCase().startsWith('bbs:')) { ...handleShowFile(...);
 * return; }"). This door only ever wants JH_SM to print. A sysop can
 * legitimately configure a download directory as "bbs:doors/", so a wholly
 * ordinary status line like "bbs:doors/FOO.LHA saved" would otherwise be
 * silently rerouted to file display instead of printed -- guarded here,
 * once, so no future caller has to remember the trap for every message it
 * ever adds.
 *
 * MUST be evaluated PER CHUNK, not once against the caller's whole string:
 * the BBS's reroute check runs on each JH_SM message independently (it has
 * no notion of "this is a continuation of an earlier line"), so for text
 * longer than one chunk, any chunk whose OWN first bytes happen to spell
 * "bbs:" is just as vulnerable as the first one -- checking only offset 0
 * of the logical string misses every later chunk. ae_put() below calls
 * this once per iteration against exactly the bytes that iteration is
 * about to send (text + offset, bounded to n = the candidate chunk length),
 * not against the unbounded remainder of the string -- bounding to n also
 * guarantees the p[1]/p[2]/p[3] lookahead never reads past this message's
 * own content.
 *
 * A leading SPACE does NOT defeat this: the BBS's check trims leading/
 * trailing whitespace BEFORE testing the prefix (text.trim(), io.ts:659),
 * and messages.ts:200 builds that JS string via String.fromCharCode() on
 * the raw bytes, so both an ASCII space (0x20) and a Latin-1 NBSP (0xA0)
 * are still classified as whitespace and stripped by .trim() -- verified
 * against the actual check: " bbs:x".trim().startsWith("bbs:") is true.
 * The guard byte must be printable and non-whitespace to survive trim();
 * a single leading period reliably breaks the match and renders as an
 * ordinary visible character on every terminal. isspace() here mirrors
 * only ASCII whitespace, which is what a topaz/Latin-1 door string will
 * ever realistically start with. */
static int would_reroute_to_file_display(const char *text, unsigned long n)
{
    unsigned long i;

    i = 0;
    while (i < n && isspace((unsigned char)text[i])) {
        i++;
    }
    if (i + 4 > n) {
        return 0; /* fewer than 4 bytes left in THIS message -- cannot match */
    }
    return (text[i] == 'b' || text[i] == 'B')
        && (text[i + 1] == 'b' || text[i + 1] == 'B')
        && (text[i + 2] == 's' || text[i + 2] == 'S')
        && text[i + 3] == ':';
}

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
    unsigned long budget;
    unsigned long remaining;
    unsigned long check_len;

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
     * BBS appends exactly one line break, never mid-string. The bbs:
     * reroute guard is re-evaluated on EVERY iteration, against exactly
     * the bytes that iteration is about to send -- see the comment above
     * would_reroute_to_file_display(). */
    while (offset < len) {
        int prefixed;

        remaining = len - offset;
        check_len = (remaining > (unsigned long)AE_MAX_LINE) ? (unsigned long)AE_MAX_LINE : remaining;
        prefixed = would_reroute_to_file_display(text + offset, check_len) ? 1 : 0;

        budget = (unsigned long)AE_MAX_LINE - (unsigned long)prefixed;
        chunk = remaining;
        if (chunk > budget) {
            chunk = budget;
        }

        if (prefixed) {
            msg->String[0] = '.'; /* guard byte: breaks the trimmed "bbs:" prefix match, see would_reroute_to_file_display() above */
            memcpy(msg->String + 1, text + offset, (size_t)chunk);
            msg->String[chunk + 1] = '\0';
        } else {
            memcpy(msg->String, text + offset, (size_t)chunk);
            msg->String[chunk] = '\0';
        }

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

int ae_key_nowait(void)
{
    if (msg == NULL || bbs_port == NULL) {
        return -1;
    }

    /* Unlike JH_HK the answer comes back in Command, not String[0]: the BBS
     * writes msg.command:=readChar(...) when checkInput() says something is
     * waiting, and msg.command:=0 when it is not (express.e:3465-3472). */
    msg->Command = JH_FetchKey;
    msg->Data = 1;
    msg->String[0] = '\0';
    xim_call();

    if (msg->Data == -1) {
        return -1;
    }
    return (int)(msg->Command & 0xff);
}

int ae_check(void)
{
    return carrier_lost;
}

/* Whether this door has flipped the BBS's rawArrow flag, so do_shutdown()
 * can flip it back. RAWARROW is a TOGGLE with no way to read the current
 * state, which is exactly why the restore has to be tracked rather than
 * assumed: leaving it on would change how the BBS's own line editor treats
 * the cursor keys for everything the user does after this door exits. */
static int raw_arrows_on = 0;

void ae_raw_arrows(int on)
{
    if (msg == NULL || bbs_port == NULL) {
        return;
    }
    if (on == raw_arrows_on) {
        return; /* already in the requested state - toggling would undo it */
    }
    msg->Command = RAWARROW;
    msg->Data = 0;
    msg->String[0] = '\0';
    xim_call();
    raw_arrows_on = on ? 1 : 0;
}

/* Shared tail of ae_shutdown()/ae_fatal(): notify the BBS (JH_SHUTDOWN is
 * mandatory on every exit path -- research doc: "Never exit without
 * JH_SHUTDOWN ... the BBS waits forever", AEDoor.c:147-148), then release
 * the door's own resources and terminate. Modelled on AEDoor.c's
 * TakeOffEh() (lines 231-239), which both ShutDown() and error paths funnel
 * through. */
static void do_shutdown(int code)
{
    /* Restore the BBS's arrow handling BEFORE the shutdown message, on every
     * exit path this function funnels (normal quit, carrier loss, fatal). */
    if (raw_arrows_on) {
        ae_raw_arrows(0);
    }

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
