/*
 * AmiExpress Door Glue API - GCC Development Version
 * Stub implementations for development and testing
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Type definitions */
typedef void VOID;
typedef void *APTR;
typedef unsigned char BOOL;
typedef char *STRPTR;
typedef unsigned long ULONG;

/* Constants */
#define DT_NAME 100
#define DT_LOCATION 102
#define DT_SECSTATUS 105
#define JH_BBSNAME 11

/* Global state */
int EXIT_FLAG = 0;

/*
 * Register - Development stub
 */
VOID Register(int node) {
    printf("[DOOR] Registered on node %d\r\n", node);
    fflush(stdout);
}

/*
 * ShutDown - Development stub
 */
VOID ShutDown(VOID) {
    printf("[DOOR] Shutting down\r\n");
    fflush(stdout);
    exit(0);
}

/*
 * sendmessage - Development stub
 */
/*
 * MCI (Message Control Interface) functions
 */
void mciputstr(char *mstring, int nl) {
    // MCI processing with variable substitution
    printf("[MCI] %s", mstring);
    if (nl) printf("\r\n");
    fflush(stdout);
}

void MciSendStr(char *mstring, int nl) {
    // Send MCI-encoded message
    printf("[MCI] %s", mstring);
    if (nl) printf("\r\n");
    fflush(stdout);
}

void sendmessage(char *text, int newline) {
    printf("%s", text);
    if (newline) printf("\r\n");
    fflush(stdout);
}

/*
 * sendMessage - Development stub
 */
void sendMessage(char *mstring, int nl) {
    printf("[MSG] %s", mstring);
    if (nl) printf("\r\n");
    fflush(stdout);
}

/*
 * prompt - Development stub
 */
void prompt(char *prompt_text, char *result, int max_len) {
    printf("%s", prompt_text);
    if (fgets(result, max_len, stdin)) {
        char *newline = strchr(result, '\n');
        if (newline) *newline = '\0';
    } else {
        result[0] = '\0';
    }
}

/*
 * lineinput - Development stub
 */
void lineinput(char *mstring, char *ostring, int len) {
    printf("%s", mstring);
    if (fgets(ostring, len, stdin)) {
        char *newline = strchr(ostring, '\n');
        if (newline) *newline = '\0';
    } else {
        ostring[0] = '\0';
    }
}

/*
 * hotkey - Development stub
 */
void hotkey(char *prompt_text, char *result) {
    if (prompt_text && *prompt_text) {
        printf("%s", prompt_text);
    }
    int ch = getchar();
    if (result) {
        result[0] = (char)ch;
        result[1] = '\0';
    }
    while (getchar() != '\n'); /* consume rest of line */
}

/*
 * getuserstring - Development stub
 */
void getuserstring(char *result, int field_id) {
    switch (field_id) {
        case DT_NAME:
            strcpy(result, "TestUser");
            break;
        case DT_LOCATION:
            strcpy(result, "TestCity");
            break;
        case JH_BBSNAME:
            strcpy(result, "TestBBS");
            break;
        case DT_SECSTATUS:
            strcpy(result, "100");
            break;
        default:
            strcpy(result, "Unknown");
            break;
    }
}

/*
 * putuserstring - Development stub
 */
void putuserstring(char *ostring, int nl) {
    printf("[PUT] Field %d = %s\r\n", nl, ostring);
    fflush(stdout);
}

/*
 * GetInfo - Development stub
 */
int GetInfo(int cmd) {
    printf("[GET] Info %d\r\n", cmd);
    fflush(stdout);
    return 1;
}

/*
 * PutInfo - Development stub
 */
void PutInfo(int data, int cmd) {
    printf("[PUT] Info %d = %d\r\n", cmd, data);
    fflush(stdout);
}

void getspecdata(char *ostring, char *dest, int nl) {
    // Get special data (implementation depends on specific field)
    printf("[GETSPEC] Field %d\r\n", nl);
    fflush(stdout);
    strcpy(dest, "special_data");
}

/*
 * showfile - Development stub
 */
void showfile(char *mstring) {
    printf("[FILE] %s\r\n", mstring);
    fflush(stdout);
}

void showgfile(char *mstring) {
    printf("[GFILE] %s\r\n", mstring);
    fflush(stdout);
}

void showfilensf(char *mstring) {
    // Show file without stopping on full screen
    printf("[FILE-NSF] %s\r\n", mstring);
    fflush(stdout);
}

void showgfilensf(char *mstring) {
    // Show G-file without stopping on full screen
    printf("[GFILE-NSF] %s\r\n", mstring);
    fflush(stdout);
}

/*
 * Download - Development stub
 */
int Download(char *s) {
    printf("[DOWNLOAD] %s\r\n", s);
    fflush(stdout);
    return 1;
}

/*
 * Upload - Development stub
 */
int Upload(char *s) {
    printf("[UPLOAD] %s\r\n", s);
    fflush(stdout);
    return 1;
}

int BatchDownload(APTR s) {
    // Batch download multiple files
    printf("[BATCH-DOWNLOAD]\r\n");
    fflush(stdout);
    return 1;
}

int NetUpload(APTR s) {
    // Network upload
    printf("[NET-UPLOAD]\r\n");
    fflush(stdout);
    return 1;
}

int NetDownload(char *s) {
    // Network download
    printf("[NET-DOWNLOAD] %s\r\n", s);
    fflush(stdout);
    return 1;
}

/*
 * ConOnly/SerOnly - Development stubs
 */
void ConOnly(char mstring[], int nl) {
    printf("[CON] %s", mstring);
    if (nl) printf("\r\n");
    fflush(stdout);
}

void SerOnly(char mstring[], int nl) {
    printf("[SER] %s", mstring);
    if (nl) printf("\r\n");
    fflush(stdout);
}

/*
 * Utility functions - Development stubs
 */
int getsignal(void) { return 1; }
void FlagFile(char *string) { printf("[FLAG] %s\r\n", string); fflush(stdout); }
int Editfile(char Name[], int len) { printf("[EDIT] %s\r\n", Name); fflush(stdout); return len; }
int FetchKey(void) { return 0; }
int sigkey(void) { return 0; }
char Fhotkey(void) { return ' '; }
int getkey(void) { return 0; }
int QuicKey(void) { return 0; }
APTR GetSemaphore(void) { return NULL; }
int AcsStat(int bits, int opt) { return 1; }
int IsAccess(int acs) { return 1; }
BOOL CheckToDisplay(char *s) { printf("[CHECK] %s\r\n", s); fflush(stdout); return 1; }
int TLock(char *str) { printf("[LOCK] %s\r\n", str); fflush(stdout); return 1; }

/*
 * Date/Time functions - Development stubs
 */
STRPTR GetTheDate(long number) { return "01-01-2025"; }
STRPTR GetTheTime(long number) { return "12:00:00 PM"; }
void DateToString(ULONG number, char *s) { strcpy(s, "01-01-2025"); }
void TimeToString(ULONG number, char *s) { strcpy(s, "12:00:00 PM"); }
void getsystime(ULONG number, char *d, char *t) {
    if (d) strcpy(d, "01-01-2025");
    if (t) strcpy(t, "12:00:00 PM");
}

/*
 * Account management - Development stubs
 */
struct User *Load_Account(int UserNum, APTR U, APTR UK) { return NULL; }
void Save_Account(int UserNum, APTR U, APTR UK) {}
void Save_ConfDB(int UserNum, int conf, APTR dat) {}
void Load_ConfDB(int UserNum, int conf, APTR dat) {}
int Search_Account(int UserNum, APTR uk) { return 0; }
void New_Account(APTR u, APTR uk) {}
int LastAccountNum(void) { return 1000; }
int Get_ConfName(APTR n, APTR l, int num) { return 1; }
void GetFiller1(APTR Filler, int Command) {}
void PutFiller1(APTR Filler, int Command) {}
void Chain(char *str, int node, int opt) {}
void AcpCommand(char mstring[], int command, int node) {}

/*
 * System functions
 */
void end(void) {
    exit(0);
}

void LastCommand(void) {}

/*
 * CloseOut - Emergency shutdown
 */
VOID CloseOut(void) {
    ShutDown();
    end();
}