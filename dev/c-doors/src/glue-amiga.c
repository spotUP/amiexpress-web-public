/*
 * AmiExpress Door Glue API - m68k-amiga-elf-gcc Amiga Version
 * Minimal implementations for bare-metal Amiga cross-compilation
 *
 * ============================================================================
 * WARNING - ARCHITECTURAL ISSUE (2025-12-15)
 * ============================================================================
 *
 * This file contains STUB IMPLEMENTATIONS that are ARCHITECTURALLY WRONG!
 *
 * PROBLEM:
 * - Hardcoded library base address (0xc0000)
 * - Stub functions that do nothing (sendmessage, prompt, etc.)
 * - Doors using this glue will appear to run but produce NO OUTPUT
 *
 * CORRECT APPROACH:
 * C doors should call the REAL AEDoor.library via OpenLibrary():
 *
 *   struct Library *AEDoorBase = NULL;
 *   struct ExecBase *SysBase = *(struct ExecBase **)4;
 *
 *   AEDoorBase = OpenLibrary("AEDoor.library", 0);
 *   if (!AEDoorBase) return 20;
 *
 *   struct DoorInfo *di = CreateComm();  // Calls LVO -30 in REAL library
 *   WriteStr("Hello!\n");                // Calls LVO -42 in REAL library
 *   DeleteComm(di);
 *   CloseLibrary(AEDoorBase);
 *
 * The REAL library (./Libs/AEDoor.library - 1128 bytes of 68K code) does
 * all the work. The emulator intercepts message port I/O (PutMsg/GetMsg)
 * to bridge between the real library and the BBS backend.
 *
 * See: C_DOOR_ARCHITECTURE_ISSUES.md for complete details
 * See: AEDOOR_ARCHITECTURE_FIX.md for the correct architecture
 *
 * TODO: Replace this entire file with proper inline library call wrappers
 * ============================================================================
 */

#include "../includes/amiexpress.h"

#ifndef NULL
#define NULL ((void *)0)
#endif

/* Amiga constants */
#define MEMF_PUBLIC 0
#define NT_MESSAGE 5
#define ACCESS_READ -2

/* Access control constants */
#define ADDBIT 1000
#define REMBIT 1001
#define QUERYBIT 1002

/* Structures are defined in amiexpress.h and NDK includes */

/* Global variables - these are set up by the emulator */
struct JHMessage *Jhmsg = NULL;
struct MsgPort *replymp = NULL;
struct MsgPort *port = NULL;

/* AEDoor.library base - emulator loads it at 0xc0000 */
/* WARNING: This hardcoded address is WRONG! Use OpenLibrary() instead! */
struct Library *AEDoorBase = (struct Library *)0xc0000;

/* Door API implementations - THESE ARE STUBS AND DO NOT WORK! */
/* TODO: Replace with inline wrappers that call the real library */
VOID Register(int node)
{
    /* Stub - emulator handles initialization */
}

VOID ShutDown(VOID)
{
    /* Stub - emulator handles cleanup */
}

void sendmessage(char *text, int newline)
{
    /* Send message via XIM protocol using Jhmsg */
    if (!text) return;

    /* For now, just don't crash - Jhmsg setup is complex */
    /* TODO: Implement proper message sending */
    /* The emulator should handle stdout from printf, but that doesn't work for 68K doors */

    /* Temporary: do nothing to avoid crashes */
}

int getkey(void)
{
    /* Stub - return a key to continue execution */
    return ' ';  /* Space key */
}

void mciputstr(char *mstring, int nl)
{
    /* Stub implementation */
}

void MciSendStr(char *mstring, int nl)
{
    /* Stub implementation */
}

void sendMessage(char *mstring, int nl)
{
    /* Stub implementation */
}

void ConOnly(char *mstring, int nl)
{
    /* Stub implementation */
}

void SerOnly(char *mstring, int nl)
{
    /* Stub implementation */
}

void prompt(char *prompt_text, char *result, int max_len)
{
    /* Stub - copy a default response */
    if (result && max_len > 0) {
        result[0] = 't';
        result[1] = 'e';
        result[2] = 's';
        result[3] = 't';
        result[4] = '\0';
    }
}

void lineinput(char *mstring, char *ostring, int len)
{
    /* Stub implementation */
    if (ostring) {
        ostring[0] = 'i';
        ostring[1] = 'n';
        ostring[2] = 'p';
        ostring[3] = 'u';
        ostring[4] = 't';
        ostring[5] = '\0';
    }
}

void hotkey(char *prompt_text, char *result)
{
    /* Stub implementation */
    if (result) {
        result[0] = 'Y';
        result[1] = '\0';
    }
}

void getuserstring(char *result, int field_id)
{
    /* Stub implementation - return test data */
    if (result) {
        switch (field_id) {
            case 100: /* DT_NAME */
                result[0] = 'T';
                result[1] = 'e';
                result[2] = 's';
                result[3] = 't';
                result[4] = 'U';
                result[5] = 's';
                result[6] = 'e';
                result[7] = 'r';
                result[8] = '\0';
                break;
            case 102: /* DT_LOCATION */
                result[0] = 'T';
                result[1] = 'e';
                result[2] = 's';
                result[3] = 't';
                result[4] = 'C';
                result[5] = 'i';
                result[6] = 't';
                result[7] = 'y';
                result[8] = '\0';
                break;
            default:
                result[0] = '\0';
                break;
        }
    }
}

void putuserstring(char *ostring, int nl)
{
    /* Stub implementation */
}

int GetInfo(int cmd)
{
    /* Stub implementation - return test values */
    switch (cmd) {
        case 121: /* DT_EXPERT */
            return 1;
        case 122: /* DT_LINELENGTH */
            return 80;
        default:
            return 0;
    }
}

void PutInfo(int data, int cmd)
{
    /* Stub implementation */
}

void getspecdata(char *ostring, char *dest, int nl)
{
    /* Stub implementation */
}

void showfile(char *mstring)
{
    /* Stub implementation */
}

void showgfile(char *mstring)
{
    /* Stub implementation */
}

void showfilensf(char *mstring)
{
    /* Stub implementation */
}

void showgfilensf(char *mstring)
{
    /* Stub implementation */
}

int Download(char *s)
{
    /* Stub implementation */
    return 1; /* Success */
}

int Upload(char *s)
{
    /* Stub implementation */
    return 1; /* Success */
}

int BatchDownload(void *s)
{
    /* Stub implementation */
    return 1; /* Success */
}

int NetUpload(void *s)
{
    /* Stub implementation */
    return 1; /* Success */
}

int NetDownload(char *s)
{
    /* Stub implementation */
    return 1; /* Success */
}

int getsignal(void)
{
    /* Stub implementation */
    return 0;
}

void FlagFile(char *string)
{
    /* Stub implementation */
}

int Editfile(char *Name, int len)
{
    /* Stub implementation */
    return len;
}

void *GetSemaphore(void)
{
    /* Stub implementation */
    return (void *)1;
}

int AcsStat(int bits, int opt)
{
    /* Stub implementation */
    return 1; /* Success */
}

int IsAccess(int acs)
{
    /* Stub implementation */
    return 1; /* Access granted */
}

BOOL CheckToDisplay(char *s)
{
    /* Stub implementation */
    return 1;
}

int TLock(char *str)
{
    /* Stub implementation */
    return 1; /* File exists */
}

void Chain(char *str, int node, int opt)
{
    /* Stub implementation */
}

void AcpCommand(char *mstring, int command, int node)
{
    /* Stub implementation */
}

void LastCommand(void)
{
    /* Stub implementation */
}

int FetchKey(void)
{
    /* Stub implementation */
    return 0;
}

int sigkey(void)
{
    /* Stub implementation */
    return 0;
}

char Fhotkey(void)
{
    /* Stub implementation */
    return ' ';
}

