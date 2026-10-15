/*
 * AmiExpress C Door Build Configuration
 */

#ifndef CONFIG_H
#define CONFIG_H

/* Build Configuration */
#define VBCC_BUILD 1
#define AMIEXPRESS_VERSION "2.20"
#define MAX_MESSAGE_LEN 200
#define MAX_NODES 32

/* Amiga Type Definitions for vbcc */
#ifndef EXEC_TYPES_H
#define EXEC_TYPES_H

/* Basic Amiga Types */
typedef void VOID;
typedef char BYTE;
typedef unsigned char UBYTE;
typedef short WORD;
typedef unsigned short UWORD;
typedef unsigned short USHORT;  /* Alias for UWORD */
typedef long LONG;
typedef unsigned long ULONG;
typedef void *APTR;
typedef void *BPTR;
typedef long BSTR;
typedef void *CPTR;

/* Boolean Type */
typedef unsigned char BOOL;
#define TRUE 1
#define FALSE 0

/* String Pointer */
typedef char *STRPTR;
typedef const char *CONST_STRPTR;

/* Function Pointer */
typedef void (*VOID_FUNC)(void);

/* Exec Library Types (minimal) */
struct Library {
    struct Library *lib_Node;
    UBYTE lib_Flags;
    UBYTE lib_pad;
    UWORD lib_NegSize;
    UWORD lib_PosSize;
    UWORD lib_Version;
    UWORD lib_Revision;
    APTR lib_IdString;
    ULONG lib_Sum;
    UWORD lib_OpenCnt;
};

struct Node {
    struct Node *ln_Succ;
    struct Node *ln_Pred;
    UBYTE ln_Type;
    BYTE ln_Pri;
    char *ln_Name;
};

struct MinNode {
    struct MinNode *mln_Succ;
    struct MinNode *mln_Pred;
};

struct List {
    struct Node *lh_Head;
    struct Node *lh_Tail;
    struct Node *lh_TailPred;
    UBYTE lh_Type;
    UBYTE lh_pad;
};

struct MinList {
    struct MinNode *mlh_Head;
    struct MinNode *mlh_Tail;
    struct MinNode *mlh_TailPred;
};

struct Message {
    struct Node mn_Node;
    struct MsgPort *mn_ReplyPort;
    UWORD mn_Length;
};

struct MsgPort {
    struct Node mp_Node;
    UBYTE mp_Flags;
    UBYTE mp_SigBit;
    void *mp_SigTask;
    struct List mp_MsgList;
};

struct SemaphoreRequest {
    struct MinNode sr_Link;
    struct Task *sr_Waiter;
};

struct SignalSemaphore {
    struct Node ss_Link;
    WORD ss_NestCount;
    struct MinList ss_WaitQueue;
    struct SemaphoreRequest ss_MultipleLink;
    struct Task *ss_Owner;
    WORD ss_QueueCount;
};

struct Task {
    struct Node tc_Node;
    UBYTE tc_Flags;
    UBYTE tc_State;
    BYTE tc_IDNestCnt;
    BYTE tc_TDNestCnt;
    ULONG tc_SigAlloc;
    ULONG tc_SigWait;
    ULONG tc_SigRecvd;
    ULONG tc_SigExcept;
    UWORD tc_TrapAlloc;
    UWORD tc_TrapAble;
    APTR tc_ExceptData;
    APTR tc_ExceptCode;
    APTR tc_TrapData;
    APTR tc_TrapCode;
    APTR tc_SPReg;
    APTR tc_SPLower;
    APTR tc_SPUpper;
    VOID (*tc_Switch)(void);
    VOID (*tc_Launch)(void);
    struct List tc_MemEntry;
    APTR tc_UserData;
};

typedef struct Task Process;
typedef struct Task *PTask;

#endif /* EXEC_TYPES_H */

#endif /* CONFIG_H */