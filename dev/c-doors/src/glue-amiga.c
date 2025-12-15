/*
 * AmiExpress Door Glue API - Amiga 68K Version
 *
 * ARCHITECTURAL FIX (2025-12-15):
 * This glue layer provides inline wrappers that call the REAL AEDoor.library.
 * NO stub implementations! The real library does all the work.
 *
 * See: AEDOOR_ARCHITECTURE_FIX.md for architecture details
 * See: C_DOOR_ARCHITECTURE_ISSUES.md for why stubs were wrong
 */

#include "../includes/amiexpress.h"

#ifndef NULL
#define NULL ((void *)0)
#endif

/* Amiga absolute memory locations */
#define ABSEXECBASE 4

/* Library bases - initialized by door startup */
struct ExecBase *SysBase = NULL;
struct Library *AEDoorBase = NULL;
struct Library *DOSBase = NULL;

/* Forward declaration of main() */
extern int main(int argc, char *argv[]);

/*
 * OpenLibrary() - Open an Amiga shared library
 *
 * Uses exec.library to open a shared library by name.
 * This is a system call that the emulator must handle.
 *
 * Parameters:
 *   libName - Name of library to open (e.g., "AEDoor.library")
 *   version - Minimum version required (0 = any version)
 *
 * Returns:
 *   Library base pointer, or NULL if library cannot be opened
 */
static inline struct Library *OpenLibrary(const char *libName, unsigned long version) {
    register struct Library *_res __asm("d0");
    register struct ExecBase *a6 __asm("a6") = SysBase;
    register const char *a1 __asm("a1") = libName;
    register unsigned long d0 __asm("d0") = version;

    __asm volatile (
        "jsr a6@(-552:w)"  /* LVO -552 (0xFDD8) - OpenLibrary */
        : "=r" (_res)
        : "r" (a6), "r" (a1), "r" (d0)
        : "d1", "a0", "a1", "memory"
    );

    return _res;
}

/*
 * CloseLibrary() - Close an Amiga shared library
 *
 * Parameters:
 *   libBase - Library base pointer from OpenLibrary()
 */
static inline void CloseLibrary(struct Library *libBase) {
    register struct ExecBase *a6 __asm("a6") = SysBase;
    register struct Library *a1 __asm("a1") = libBase;

    __asm volatile (
        "jsr a6@(-414:w)"  /* LVO -414 (0xFE62) - CloseLibrary */
        :
        : "r" (a6), "r" (a1)
        : "d0", "d1", "a0", "a1", "memory"
    );
}

/*
 * C Runtime Entry Point for Amiga 68K
 *
 * This is called by the Amiga OS when the door executable loads.
 * It performs initialization, calls main(), and cleans up.
 */
void _start(void) {
    int exitCode = 20;  /* Default: ERROR */

    /* Get ExecBase from absolute address 4 (Amiga convention) */
    SysBase = *((struct ExecBase **)ABSEXECBASE);
    if (!SysBase) {
        goto exit;  /* Cannot continue without ExecBase */
    }

    /* Open AEDoor.library - the BBS door API */
    AEDoorBase = OpenLibrary("AEDoor.library", 0);
    if (!AEDoorBase) {
        goto exit;  /* Door cannot run without AEDoor.library */
    }

    /* Open dos.library - for file I/O if needed */
    DOSBase = OpenLibrary("dos.library", 0);
    /* DOSBase is optional - some doors don't need it */

    /* Call the door's main() function */
    exitCode = main(0, NULL);  /* argc/argv not supported yet */

    /* Cleanup: Close libraries */
    if (DOSBase) {
        CloseLibrary(DOSBase);
        DOSBase = NULL;
    }

    if (AEDoorBase) {
        CloseLibrary(AEDoorBase);
        AEDoorBase = NULL;
    }

exit:
    /* Exit with code - emulator will terminate door process */
    /* For now, just loop forever (Amiga convention) */
    while(1) {
        __asm volatile ("nop");
    }
}

/* ============================================================================
 * AEDoor.library Function Wrappers
 *
 * These inline functions call the REAL AEDoor.library via LVO (Library Vector
 * Offset) jumps. The real library handles all XIM protocol communication.
 * ============================================================================
 */

/*
 * Register() - LVO -132 (0xFF7C) - PreCreateComm
 *
 * Initialize door session for specified node.
 * This is typically the first call a door makes.
 */
VOID Register(int node) {
    if (!AEDoorBase) return;

    register struct Library *a6 __asm("a6") = AEDoorBase;
    register int d0 __asm("d0") = node;

    __asm volatile (
        "jsr a6@(-132:w)"  /* PreCreateComm */
        :
        : "r" (a6), "r" (d0)
        : "d0", "d1", "a0", "a1", "memory"
    );
}

/*
 * ShutDown() - LVO -138 (0xFF76) - PostDeleteComm
 *
 * Clean shutdown of door session.
 * This is typically the last call a door makes.
 */
VOID ShutDown(VOID) {
    if (!AEDoorBase) return;

    register struct Library *a6 __asm("a6") = AEDoorBase;

    __asm volatile (
        "jsr a6@(-138:w)"  /* PostDeleteComm */
        :
        : "r" (a6)
        : "d0", "d1", "a0", "a1", "memory"
    );
}

/*
 * sendmessage() - Send text to user terminal
 *
 * This maps to WriteStr() in AEDoor.library.
 * LVO -84 (0xFFAC) - WriteStr
 */
void sendmessage(char *text, int newline) {
    if (!AEDoorBase || !text) return;

    register struct Library *a6 __asm("a6") = AEDoorBase;
    register char *a0 __asm("a0") = text;

    __asm volatile (
        "jsr a6@(-84:w)"  /* WriteStr */
        :
        : "r" (a6), "r" (a0)
        : "d0", "d1", "a0", "a1", "memory"
    );

    /* If newline requested, send CR+LF */
    if (newline) {
        static char crlf[] = "\r\n";
        register char *a0_nl __asm("a0") = crlf;
        __asm volatile (
            "jsr a6@(-84:w)"
            :
            : "r" (a6), "r" (a0_nl)
            : "d0", "d1", "a0", "a1", "memory"
        );
    }
}

/*
 * getkey() - Get single keypress from user
 *
 * This maps to GetData() in AEDoor.library.
 * LVO -66 (0xFFBE) - GetData
 */
int getkey(void) {
    if (!AEDoorBase) return 0;

    register int _res __asm("d0");
    register struct Library *a6 __asm("a6") = AEDoorBase;

    __asm volatile (
        "jsr a6@(-66:w)"  /* GetData */
        : "=r" (_res)
        : "r" (a6)
        : "d1", "a0", "a1", "memory"
    );

    return _res;
}

/*
 * prompt() - Prompt user for input
 *
 * LVO -78 (0xFFB2) - Prompt
 */
void prompt(char *prompt_text, char *result, int max_len) {
    if (!AEDoorBase || !result) return;

    register struct Library *a6 __asm("a6") = AEDoorBase;
    register char *a0 __asm("a0") = prompt_text;
    register char *a1 __asm("a1") = result;
    register int d0 __asm("d0") = max_len;

    __asm volatile (
        "jsr a6@(-78:w)"  /* Prompt */
        :
        : "r" (a6), "r" (a0), "r" (a1), "r" (d0)
        : "d0", "d1", "a0", "a1", "memory"
    );
}

/*
 * mciputstr() - Send MCI codes to terminal
 *
 * MCI codes are special formatting codes (like ANSI but BBS-specific).
 * Maps to WriteStr() since MCI processing happens in the BBS.
 */
void mciputstr(char *mstring, int nl) {
    sendmessage(mstring, nl);
}

/*
 * MciSendStr() - Alias for mciputstr()
 */
void MciSendStr(char *mstring, int nl) {
    mciputstr(mstring, nl);
}

/*
 * sendMessage() - Alias for sendmessage()
 */
void sendMessage(char *mstring, int nl) {
    sendmessage(mstring, nl);
}

/*
 * ConOnly() - Send to console only (not serial)
 *
 * In BBS context, this is the same as sendmessage()
 * since we're always outputting to the user's terminal.
 */
void ConOnly(char *mstring, int nl) {
    sendmessage(mstring, nl);
}

/*
 * SerOnly() - Send to serial only (not console)
 *
 * In BBS context, this is the same as sendmessage()
 * since the BBS handles routing to the appropriate output.
 */
void SerOnly(char *mstring, int nl) {
    sendmessage(mstring, nl);
}

/*
 * lineinput() - Get line of input from user
 *
 * LVO -72 (0xFFB8) - GetString
 */
void lineinput(char *mstring, char *ostring, int len) {
    if (!AEDoorBase || !ostring) return;

    /* Send prompt if provided */
    if (mstring) {
        sendmessage(mstring, 0);
    }

    register struct Library *a6 __asm("a6") = AEDoorBase;
    register char *a0 __asm("a0") = ostring;
    register int d0 __asm("d0") = len;

    __asm volatile (
        "jsr a6@(-72:w)"  /* GetString */
        :
        : "r" (a6), "r" (a0), "r" (d0)
        : "d0", "d1", "a0", "a1", "memory"
    );
}

/* ============================================================================
 * User Data Query Functions
 *
 * These query user information from the BBS.
 * They use XIM DT_* commands (Data Query commands).
 * ============================================================================
 */

/*
 * getlevel() - Get user's security level
 *
 * Returns user's access level (0-255, higher = more access)
 */
int getlevel(void) {
    /* TODO: Implement via XIM DT_LEVEL query */
    return 255;  /* Temporary: return sysop level */
}

/*
 * getname() - Get user's name
 *
 * Returns pointer to static buffer containing user's name.
 */
char *getname(void) {
    static char name[32] = "User";
    /* TODO: Implement via XIM DT_NAME query */
    return name;
}

/*
 * getlocation() - Get user's location (city/state)
 */
char *getlocation(void) {
    static char location[32] = "Unknown";
    /* TODO: Implement via XIM DT_LOCATION query */
    return location;
}

/*
 * getnode() - Get current node number
 */
int getnode(void) {
    /* TODO: Implement via XIM DT_NODENUM query */
    return 1;  /* Temporary: return node 1 */
}

/*
 * getbbsname() - Get BBS name
 */
char *getbbsname(void) {
    static char bbsname[32] = "AmiExpress BBS";
    /* TODO: Implement via XIM BB_BBSNAME query */
    return bbsname;
}

/* ============================================================================
 * File Display Functions
 * ============================================================================
 */

/*
 * showfile() - Display a text file
 *
 * LVO -96 (0xFFA0) - ShowFile
 */
int showfile(char *file_name) {
    if (!AEDoorBase || !file_name) return 0;

    register int _res __asm("d0");
    register struct Library *a6 __asm("a6") = AEDoorBase;
    register char *a0 __asm("a0") = file_name;

    __asm volatile (
        "jsr a6@(-96:w)"  /* ShowFile */
        : "=r" (_res)
        : "r" (a6), "r" (a0)
        : "d1", "a0", "a1", "memory"
    );

    return _res;
}

/*
 * showgfile() - Display a graphics file (ANSI/RIP/etc.)
 *
 * LVO -90 (0xFFA6) - ShowGFile
 */
int showgfile(char *file_name, int gtype) {
    if (!AEDoorBase || !file_name) return 0;

    register int _res __asm("d0");
    register struct Library *a6 __asm("a6") = AEDoorBase;
    register char *a0 __asm("a0") = file_name;
    register int d0 __asm("d0") = gtype;

    __asm volatile (
        "jsr a6@(-90:w)"  /* ShowGFile */
        : "=r" (_res)
        : "r" (a6), "r" (a0), "r" (d0)
        : "d1", "a0", "a1", "memory"
    );

    return _res;
}

/* ============================================================================
 * Utility Functions
 * ============================================================================
 */

/*
 * Hotkey() - Get single key without waiting
 *
 * LVO -126 (0xFF82) - HotKey
 */
char Hotkey(void) {
    if (!AEDoorBase) return 0;

    register char _res __asm("d0");
    register struct Library *a6 __asm("a6") = AEDoorBase;

    __asm volatile (
        "jsr a6@(-126:w)"  /* HotKey */
        : "=r" (_res)
        : "r" (a6)
        : "d1", "a0", "a1", "memory"
    );

    return _res;
}

/*
 * Fhotkey() - Alias for Hotkey()
 */
char Fhotkey(void) {
    return Hotkey();
}

/* ============================================================================
 * Standard C Library Functions
 *
 * Minimal implementations of standard C library functions.
 * These avoid the need for linking with newlib or similar.
 * ============================================================================
 */

/*
 * strlen() - Calculate string length
 */
int strlen(const char *str) {
    int len = 0;
    if (!str) return 0;
    while (*str++) len++;
    return len;
}

/*
 * strcpy() - Copy string
 */
char *strcpy(char *dest, const char *src) {
    char *d = dest;
    if (!dest || !src) return dest;
    while ((*d++ = *src++));
    return dest;
}

/*
 * strncpy() - Copy string with length limit
 */
char *strncpy(char *dest, const char *src, int n) {
    char *d = dest;
    if (!dest || !src) return dest;
    while (n-- > 0 && (*d++ = *src++));
    while (n-- > 0) *d++ = '\0';
    return dest;
}

/*
 * strcmp() - Compare strings
 */
int strcmp(const char *s1, const char *s2) {
    if (!s1 || !s2) return 0;
    while (*s1 && (*s1 == *s2)) {
        s1++;
        s2++;
    }
    return *(unsigned char *)s1 - *(unsigned char *)s2;
}

/*
 * memset() - Fill memory with byte value
 */
void *memset(void *s, int c, int n) {
    unsigned char *p = (unsigned char *)s;
    if (!s) return s;
    while (n--) *p++ = (unsigned char)c;
    return s;
}

/*
 * memcpy() - Copy memory
 */
void *memcpy(void *dest, const void *src, int n) {
    unsigned char *d = (unsigned char *)dest;
    const unsigned char *s = (const unsigned char *)src;
    if (!dest || !src) return dest;
    while (n--) *d++ = *s++;
    return dest;
}
