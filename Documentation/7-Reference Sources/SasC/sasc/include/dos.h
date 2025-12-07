/* Copyright (c) 1992-1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */


#ifndef _DOS_H
#define _DOS_H 1

#ifndef EXEC_TYPES_H
#include <exec/types.h>
#endif

#ifndef EXEC_PORTS_H
#include <exec/ports.h>
#endif

#ifndef EXEC_LISTS_H
#include <exec/lists.h>
#endif

#ifndef LIBRARIES_DOS_H
#include <libraries/dos.h>
#endif

#ifndef LIBRARIES_DOSEXTENS_H
#include <libraries/dosextens.h>
#endif

#ifndef _COMMSIZE_H
#include <sys/commsize.h>
#endif

/***
*
* The following type definitions take care of the particularly nasty
* machine dependency caused by the unspecified handling of sign extension
* in the C language.  When converting "char" to "int" some compilers
* will extend the sign, while others will not.  Both are correct, and
* the unsuspecting programmer is the loser.  For situations where it
* matters, the new type "byte" is equivalent to "unsigned char".
*
***/

typedef unsigned char byte;


/***
*
* Miscellaneous definitions
*
***/

#define SECSIZ 512		/* disk sector size */


/***
*
* The following symbols define the sizes of file names and node names.
*
***/

#define FNSIZE 108	/* maximum file node size      - DOS limit */
#define FMSIZE 256	/* maximum file name size      - DOS limit */
#define FESIZE 32	/* maximum file extension size - arbitrary */


/***
*
* The following structure appears at the beginning (low address) of
* each free memory block.
*
***/

struct MELT {
    struct MELT *fwd;	        /* points to next free block */
    long size;		        /* number of MELTs in this block */
};

#define MELTSIZE sizeof(struct MELT)


/***
*
* The following structure is used to keep track of currently allocated
* system memory
*
***/

struct MELT2 {
    struct MELT2 *fwd;	        /* points to next block */
    struct MELT2 *bwd;	        /* points to previous block */
    unsigned long size;	        /* size of this block */
};

#define MELT2SIZE sizeof(struct MELT2)


/***
*
* The following structures are used with the AmigaDOS fork() and wait()
* functions
*
***/

struct ProcID {				/* packet returned from fork()  */
    struct ProcID *nextID;		/* link to next packet		*/
    struct Message *process;	        /* startup message to child     */
    int UserPortFlag;
    struct MsgPort *parent;		/* termination msg destination	*/
    struct MsgPort *child;		/* child process' task msg port	*/
    BPTR seglist;			/* child process' segment list	*/
};

struct FORKENV {
    long priority;			/* new process priority		*/
    long stack;			        /* stack size for new process	*/
    BPTR std_in;			/* stdin for new process	*/
    BPTR std_out;			/* stdout for new process	*/
    BPTR console;			/* console window for new process */
    struct MsgPort *msgport;	        /* msg port to receive termination */
};      				/* message from child		*/

struct TermMsg {			/* termination message from child */
    struct Message msg;
    long _class;			        /* class == 0			*/
    short type;			        /* message type == 0		*/
    struct Process *process;	        /* process ID of sending task	*/
    long ret;			        /* return value			*/
};


extern int forkl(char *, char *, ...);
extern int forkv(char *, char **, struct FORKENV *, struct ProcID *);
extern int wait(struct ProcID *);
extern struct ProcID *waitm(struct ProcID **);

/***
*
* Level 0 I/O services
*
***/

extern int dfind(struct FileInfoBlock *, const char *, int);
extern int dnext(struct FileInfoBlock *);

extern int           _dclose(long);
extern long          _dcreat(const char *, int);
extern long          _dcreatx(const char *, int);
extern long          _dopen(const char *, int);
extern unsigned int  _dread(long, char *, unsigned int);
extern long          _dseek(long, long, int);
extern unsigned int  _dwrite(long, char *, unsigned int);

extern int getcd(int, char *);
extern int chdir(const char *);
extern char *getcwd(char *, int);
extern int mkdir(const char *);
extern int rmdir(const char *);

extern int getfnl(const char *, char *, size_t, int);
extern int getdfs(const char *, struct InfoData *);
extern int getfa(const char *);
extern long getft(const char *);

extern int getpath(BPTR, char *);
extern BPTR findpath(const char *);


/***
*
* External definitions used by the startup code
*
***/

extern long _BackGroundIO;   /* Declare and init to 1 to get stdout */
                             /* in a cback program                  */
extern BPTR _Backstdout;     /* Points to stdout in a cback program */
                             /* If _BackGroundIO was set.  You are  */
                             /* responsible for closing this!       */
extern long __priority;      /* Default priority of cback programs  */
extern char *__procname;     /* Default process name for cback progs*/                             
#ifdef _M68881
extern char __near __stdiowin[];  /* stdio window specification */
#else
extern char __stdiowin[];    /* stdio window specification */
#endif
extern char __stdiov37[];    /* Modifiers for stdio window, V37+ */
extern long __oslibversion;  /* Minimum OS version for autoopen libs */
extern long __stack;         /* Minimum stack size for program */
extern long __STKNEED;       /* Minimum stack size for function */

#ifndef _COMMWBEN_H
#include <sys/commwben.h>
#endif

/***
*
* Miscellaneous external definitions
*
***/

extern int datecmp(const struct DateStamp *, const struct DateStamp *);
extern int chgclk(const unsigned char *);
extern void getclk(unsigned char *);
extern int onbreak(int (*)(void));
extern int poserr(const char *);

/* Note: If you attempt to replace the library version of  */
/* __chkabort(), you must declare your version with the    */
/* __regargs keyword in order to match these prototypes.   */
extern void __regargs __chkabort(void);

extern void chkabort(void);
extern void Chk_Abort(void);
struct DeviceList *getasn(const char *);

extern unsigned long stacksize(void);
extern unsigned long stackused(void);
extern unsigned long stackavail(void);

#define geta4 __builtin_geta4
extern void geta4(void);

#define getreg __builtin_getreg
extern long getreg(int);

#define putreg __builtin_putreg
extern void putreg(int, long);

#define __emit __builtin_emit
extern void __emit(int);

#define REG_D0 0
#define REG_D1 1
#define REG_D2 2
#define REG_D3 3
#define REG_D4 4
#define REG_D5 5
#define REG_D6 6
#define REG_D7 7
#define REG_A0 8
#define REG_A1 9
#define REG_A2 10
#define REG_A3 11
#define REG_A4 12
#define REG_A5 13
#define REG_A6 14
#define REG_A7 15
#define REG_FP0 16
#define REG_FP1 17
#define REG_FP2 18
#define REG_FP3 19
#define REG_FP4 20
#define REG_FP5 21
#define REG_FP6 22
#define REG_FP7 23
#endif
