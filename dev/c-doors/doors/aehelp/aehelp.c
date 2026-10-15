/*
 * AEHelp Door for AmiExpress - vbcc Version
 *
 * Original by Nameless, fixed by EMPiRE/MYSTiC
 * Adapted for vbcc cross-compilation
 *
 * Build: export VBCC=/opt/homebrew/opt/vbcc && vc +aos68k -O2 -I$NDK_PATH aehelp.c -o aehelp
 */

#include <exec/types.h>
#include <exec/memory.h>
#include <exec/ports.h>
#include <exec/nodes.h>
#include <proto/exec.h>
#include <string.h>

/* ExecBase - vbcc startup provides this */
extern struct ExecBase *SysBase;

/* XIM Command Codes */
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

/* JHMessage structure - XIM protocol */
struct JHMessage {
    struct Message Msg;
    char String[200];
    int Data;
    int Command;
    int NodeID;
    int LineNum;
    unsigned long signal;
    struct Process *aeproc;
    APTR Semi;
    APTR Filler1;
    APTR Filler2;
};

/* Globals */
struct MsgPort *port = NULL;
struct MsgPort *replymp = NULL;
struct JHMessage *Jhmsg = NULL;
struct JHMessage *msg = NULL;
char DoorReply[] = "AEDoorRP.000";

/* Forward declarations */
void end(void);
void LastCommand(void);

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

/* Register with BBS */
void Register(int node) {
    ULONG portsig;
    int n1, n2, n3;
    int found = 0;
    char PortName[80];

    Jhmsg = (struct JHMessage *)AllocMem(sizeof(struct JHMessage), MEMF_PUBLIC | MEMF_CLEAR);
    if (!Jhmsg) return;

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
                if (FindPort(DoorReply)) { n3++; continue; }
                found = 1; break;
            }
            if (found) break;
            n2++;
        }
        if (found) break;
        n1++;
    }

    if (!found) {
        FreeMem(Jhmsg, sizeof(struct JHMessage));
        Jhmsg = NULL;
        return;
    }

    replymp = CreatePort(DoorReply, 0);
    strcpy(PortName, DoorReply);

    if (!replymp) {
        FreeMem(Jhmsg, sizeof(struct JHMessage));
        Jhmsg = NULL;
        return;
    }

    Jhmsg->Msg.mn_Node.ln_Type = NT_MESSAGE;
    Jhmsg->Msg.mn_Length = sizeof(struct JHMessage);
    Jhmsg->Msg.mn_ReplyPort = replymp;
    strcpy(Jhmsg->String, PortName);
    Jhmsg->Command = JH_REGISTER;
    Jhmsg->Data = 2;
    Jhmsg->NodeID = -1;
    Jhmsg->LineNum = 0;

    strcpy(PortName, "AEDoorPort");
    PortName[10] = '0' + node;
    PortName[11] = '\0';

    while (!(port = FindPort(PortName)));

    PutMsg(port, (struct Message *)Jhmsg);
    portsig = 1L << replymp->mp_SigBit;
    Wait(portsig);
    msg = (struct JHMessage *)GetMsg(replymp);
}

/* Shutdown */
void ShutDown(void) {
    ULONG portsig;

    if (!Jhmsg || !replymp || !port) return;

    LastCommand();

    portsig = 1L << replymp->mp_SigBit;
    Jhmsg->Command = JH_SHUTDOWN;
    PutMsg(port, (struct Message *)Jhmsg);
    Wait(portsig);

    while ((msg = (struct JHMessage *)GetMsg(replymp)));
    DeletePort(replymp);
    FreeMem(Jhmsg, sizeof(struct JHMessage));

    replymp = NULL;
    Jhmsg = NULL;
    port = NULL;
}

/* Send message to terminal */
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
    int counter;
    char Temp[80];

    if (strlen(mstring) < 80) {
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

#define sm sendmessage

/* Prompt for input */
void prompt(char *mstring, char *ostring, int len) {
    if (!Jhmsg || !replymp || !port) {
        ostring[0] = '\0';
        return;
    }

    len += 1;
    Jhmsg->LineNum = 0;
    strcpy(Jhmsg->String, mstring);
    Jhmsg->Data = len;
    Jhmsg->Command = JH_PM;
    PutMsg(port, (struct Message *)Jhmsg);
    WaitPort(replymp);
    GetMsg(replymp);
    strcpy(ostring, Jhmsg->String);
}

/* Simple string uppercase */
char *strupr(char *s) {
    char *p = s;
    while (*p) {
        if (*p >= 'a' && *p <= 'z') *p -= 32;
        p++;
    }
    return s;
}

void LastCommand(void) {
    sm("", 1);
}

void end(void) {
    /* Exit */
}

/* Main entry */
int main(int argc, char *argv[]) {
    int match;
    char buff[20];
    char *example = "[37m-*- EXAMPLE USE -*-[0m";
    char *sysop = "[37m-*- SYSOP INFO -*-[0m";

    if (argc != 2) {
        return 0;
    }

    Register(argv[1][0] - '0');
    if (!Jhmsg) return 20;

LOOP:
    match = 0;

    sm(" ", 1);
    sm(" ", 1);
    sm("[32m** [33mHelp v0.3 by -= [37mNameless[33m =- of Snarfs' Pub BBS (407) 267-8155 [32m**[0m", 1);
    sm(" ", 1);

    sm("Below are the available AmiExpress commands with brief descriptions.", 1);
    sm(" ", 1);
    sm("[32m?   - [0mShow the current conf menu  [32mB   - [0mBulletins", 1);
    sm("[32mC   - [0mComment to Sysop            [32mD   - [0mDownload file(s)", 1);
    sm("[32mE   - [0mEnter mail/message          [32mF   - [0mList files", 1);
    sm("[32mG   - [0mGoodbye                     [32mH   - [0mHelp with bbs", 1);
    sm("[32mJ   - [0mJoin a conference           [32mM   - [0mANSI graphics on/off", 1);
    sm("[32mN   - [0mNew files                   [32mO   - [0mOperator page, chat", 1);
    sm("[32mR   - [0mRead mail                   [32mS   - [0mPrint your stats", 1);
    sm("[32mT   - [0mThe current time            [32mU   - [0mUpload a file", 1);
    sm("[32mUR  - [0mUpload Resume a file(tm)    [32mV   - [0mView a text file", 1);
    sm("[32mW   - [0mWrite your stats            [32mX   - [0mToggle expert mode on/off", 1);
    sm("[32mZ   - [0mZippy file search           [32mOPEN- [0mOpen the door menu", 1);
    sm("[32mZOOM- [0mGathers all messages since last call for free (D)ownload", 1);
    sm(" ", 1);

    prompt("Enter command you want HELP with [[32mpress <RETURN> to quit[0m]-> ", buff, 4);

    if (*buff != 0) sm(" ", 1);
    sm(" ", 1);

    if (!strcmp("?", strupr(buff))) {
        sm("[37m-*- (?) Show current menu -*-[0m", 1);
        sm(" ", 1);
        sm("When you have expert mode selected, you won't see the menu regularly.", 1);
        sm("This command is very convenient to bring the menu back up when you", 1);
        sm("need quick help while in expert mode.", 1);
        sm(" ", 1);
        sm("Press X to toggle expert mode on/off (ie.. menu on/off)", 1);
        match = 1;
    }

    if (!strcmp("B", strupr(buff))) {
        sm("[37m-*- (B)ulletins -*-[0m", 1);
        sm(" ", 1);
        sm("When b is pressed you will get a listing of available bulletins.", 1);
        sm("from there you can select which bulletin to view.", 1);
        match = 1;
    }

    if (!strcmp("C", strupr(buff))) {
        sm("[37m-*- (C)omment to Sysop -*-[0m", 1);
        sm(" ", 1);
        sm("Comment to Sysop is a private message to the Sysop.", 1);
        match = 1;
    }

    if (!strcmp("D", strupr(buff))) {
        sm("[37m-*- (D)ownload file(s) -*-[0m", 1);
        sm(" ", 1);
        sm("When d is pressed file information about the users is printed.", 1);
        match = 1;
    }

    if (!strcmp("E", strupr(buff))) {
        sm("[37m-*- (E)nter message/mail -*-[0m", 1);
        sm(" ", 1);
        sm("When you press 'e' you will be asked who the message is going to.", 1);
        match = 1;
    }

    if (!strcmp("G", strupr(buff))) {
        sm("[37m-*- (G)oodbye -*-[0m", 1);
        sm(" ", 1);
        sm("Goodbye logs the current user out.", 1);
        match = 1;
    }

    if (!strcmp("H", strupr(buff))) {
        sm("[37m-*- (H)elp with BBS -*-[0m", 1);
        sm(" ", 1);
        sm("This program will display help information.", 1);
        match = 1;
    }

    if (!strcmp("O", strupr(buff))) {
        sm("[37m-*- (O)perator page -*-[0m", 1);
        sm(" ", 1);
        sm("Beeps every second for 30 seconds and flashes the sysops screen", 1);
        sm("to alert him that you want to chat (if he's available).", 1);
        match = 1;
    }

    if (!strcmp("R", strupr(buff))) {
        sm("[37m-*- (R)ead mail (+ or -) -*-[0m", 1);
        sm(" ", 1);
        sm("When you press 'r' at the main menu you will be shown the next unread message.", 1);
        match = 1;
    }

    if (*buff != 0) {
        if (match == 0) {
            sm("Sorry - no help is available for that command...", 1);
        }
        sm(" ", 1);
        prompt("[32mPress <RETURN> to continue with more help...[0m", buff, 1);
        goto LOOP;
    }

    ShutDown();
    end();

    return 0;
}
