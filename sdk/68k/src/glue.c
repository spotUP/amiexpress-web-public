/*
 * AmiExpress Door Glue API - vbcc Version
 * Calls AEDoor.library functions directly
 */

#include <clib/exec_protos.h>
#include <exec/types.h>
#include <exec/libraries.h>

#ifndef NULL
#define NULL ((void *)0)
#endif

/* Library bases */
extern struct Library *SysBase;  /* Provided by vbcc startup code */
struct Library *AEDoorBase = NULL;

/* Forward declaration */
extern int main(int argc, char **argv);

/* AEDoor.library function wrappers (assembly) */
extern void WriteStr(char *text, struct Library *base);
extern void Register_Asm(int node, struct Library *base);
extern void ShutDown_Asm(struct Library *base);

/* Minimal libc functions */
int strlen(const char *s) {
    int n = 0;
    while (*s++) n++;
    return n;
}

void *memset(void *s, int c, unsigned long n) {
    unsigned char *p = s;
    while (n--) *p++ = c;
    return s;
}

void *memcpy(void *d, const void *s, unsigned long n) {
    unsigned char *dest = d;
    const unsigned char *src = s;
    while (n--) *dest++ = *src++;
    return d;
}

char *strcpy(char *d, const char *s) {
    char *r = d;
    while ((*d++ = *s++));
    return r;
}

char *strncpy(char *d, const char *s, unsigned long n) {
    char *r = d;
    while (n && (*d++ = *s++)) n--;
    while (n--) *d++ = '\0';
    return r;
}

int strcmp(const char *a, const char *b) {
    while (*a && *a == *b) { a++; b++; }
    return *(unsigned char *)a - *(unsigned char *)b;
}

int sprintf(char *str, const char *format, ...) {
    /* Minimal sprintf - just copy format string for now */
    return strcpy(str, format) - str;
}

int atoi(const char *str) {
    int n = 0;
    int neg = 0;
    if (*str == '-') { neg = 1; str++; }
    while (*str >= '0' && *str <= '9') {
        n = n * 10 + (*str - '0');
        str++;
    }
    return neg ? -n : n;
}

/* Initialize AEDoor.library */
static int init_aedoor(void) {
    if (AEDoorBase) return 1;
    AEDoorBase = OpenLibrary("AEDoor.library", 0);
    return AEDoorBase != NULL;
}

/* AEDoor API implementations */
void Register(int node) {
    if (!init_aedoor()) return;
    Register_Asm(node, AEDoorBase);
}

void ShutDown(void) {
    if (AEDoorBase) {
        ShutDown_Asm(AEDoorBase);
        CloseLibrary(AEDoorBase);
        AEDoorBase = NULL;
    }
}

void sendmessage(char *text, int newline) {
    if (!text) return;
    if (!init_aedoor()) return;
    WriteStr(text, AEDoorBase);
    if (newline) {
        WriteStr("\r\n", AEDoorBase);
    }
}

void sendMessage(char *text, int nl) {
    sendmessage(text, nl);
}

void MciSendStr(char *text, int nl) {
    sendmessage(text, nl);
}

void ConOnly(char *text, int nl) {
    sendmessage(text, nl);
}

void SerOnly(char *text, int nl) {
    sendmessage(text, nl);
}

void prompt(char *text) {
    sendmessage(text, 0);
}

void lineinput(char *prompt, char *buffer, int maxlen) {
    sendmessage(prompt, 1);
    /* TODO: Actually read input */
    buffer[0] = '\0';
}

char getkey(void) {
    return '\0';
}

char Hotkey(void) {
    return '\r';
}

/* User data functions - return dummy data */
int getlevel(void) {
    return 100;
}

void getname(char *buffer, int maxlen) {
    strcpy(buffer, "TestUser");
}

void getlocation(char *buffer, int maxlen) {
    strcpy(buffer, "Test Location");
}

int getnode(void) {
    return 1;
}

void getbbsname(char *buffer, int maxlen) {
    strcpy(buffer, "AmiExpress Web BBS");
}

void getuserstring(char *buffer, int dt_code) {
    strcpy(buffer, "N/A");
}

void mciputstr(char *text) {
    sendmessage(text, 0);
}

/* File operations */
void showfile(char *filename) {
    sendmessage("[showfile: ", 0);
    sendmessage(filename, 0);
    sendmessage("]", 1);
}

void showgfile(char *filename) {
    showfile(filename);
}

void showfilensf(char *filename) {
    showfile(filename);
}

int Download(char *filename) {
    return 0;
}

int Upload(char *path) {
    return 0;
}

int Editfile(char *name, int len) {
    return 0;
}

void FlagFile(char *filename) {
}

/* System functions */
int GetInfo(int dt_code) {
    return 0;
}

void PutInfo(int data, int dt_code) {
}

int getsignal(void) {
    return 0;
}

void *GetSemaphore(void) {
    return NULL;
}

int CheckToDisplay(void) {
    return 1;
}

int TLock(char *str) {
    return 0;
}

int IsAccess(int level) {
    return 1;
}

int AcsStat(int node) {
    return 0;
}

/* Date/Time functions */
void GetTheDate(char *buffer, int maxlen) {
    strcpy(buffer, "16-Dec-2025");
}

void GetTheTime(char *buffer, int maxlen) {
    strcpy(buffer, "12:00:00");
}

void DateToString(void *date, char *buffer) {
    strcpy(buffer, "16-Dec-2025");
}

void TimeToString(void *time, char *buffer) {
    strcpy(buffer, "12:00:00");
}

long getsystime(void) {
    return 0;
}

/* Account management */
int LastAccountNum(void) {
    return 1;
}

int Search_Account(char *name) {
    return -1;
}

int Get_ConfName(void *name, void *loc, int num) {
    strcpy((char *)name, "Main");
    return 1;
}

void Load_Account(int num, void *u, void *uk) {
}

void Save_Account(int num, void *u, void *uk) {
}

void New_Account(void *u, void *uk) {
}

/* Additional functions */
int FetchKey(void) {
    return 0;
}

int sigkey(void) {
    return 0;
}

char Fhotkey(void) {
    return '\0';
}

int QuicKey(void) {
    return '\r';
}

void LastCommand(void) {
}

void Chain(char *str, int node, int opt) {
}

void AcpCommand(char *str, int cmd, int node) {
}

void GetFiller1(void *filler, int cmd) {
}

void PutFiller1(void *filler, int cmd) {
}

void CloseOut(void) {
    ShutDown();
}

void putuserstring(char *str, int dt_code) {
}

void getspecdata(char *ostring, char *dest, int nl) {
}

int BatchDownload(void *s) {
    return 0;
}

int NetUpload(void *s) {
    return 0;
}

int NetDownload(char *s) {
    return 0;
}

void Save_ConfDB(int num, int conf, void *dat) {
}

void Load_ConfDB(int num, int conf, void *dat) {
}
