/* Copyright (c) 1992-1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */


#ifndef _FCNTL_H
#define _FCNTL_H 1

/***
*
* The following symbols are used for the "open" and "creat" functions.
* They are generally UNIX-compatible, except for O_APPEND under MSDOS,
* which has been moved in order to accomodate the file sharing flags
* defined in MSDOS Version 3.
*
* Also, O_TEMP and O_RAW are SAS extensions.
*
***/

#define O_RDONLY  0	/*  Read-only value (right byte of mode word) */
#define O_WRONLY  1	/*  Write-only value            */
#define O_RDWR    2	/*  Read-write value            */
#define O_NDELAY  0	/*  Non-blocking I/O flag (N/A) */
#define O_APPEND  8	/*  Append mode flag            */

#define O_CREAT   0x0100	/* File creation flag */
#define O_TRUNC   0x0200	/* File truncation flag */
#define O_EXCL    0x0400	/* Exclusive access flag */

#define O_LOCK    0x1000        /* Open for exclusive write */
#define O_TEMP    0x2000        /* Temporary file (delete on close) */
#define O_XLATE   0x4000        /* Remove/Add CRs */
#define O_RAW     0x8000	/* Raw I/O flag (SAS feature) */
#define O_BINARY  0x8000        /* Same as Raw mode */

#ifndef _COMMIFMT_H
#include <sys/commifmt.h>
#endif

/***
*
* The following symbols are used for the "fcntl" function.
*
***/

#define F_DUPFD 0	/* Duplicate file descriptor */
#define F_GETFD 1	/* Get file descriptor flags */
#define F_SETFD 2	/* Set file descriptor flags */
#define F_GETFL 3	/* Get file flags */
#define F_SETFL 4	/* Set file flags */

/***
*
* External definitions
*
***/

extern int  __creat  (const char *, int);
extern long __lseek  (int, long, int);

#ifndef __cplusplus
extern int  __open   (const char *, int, ...);
extern int  __read   (int, void *, unsigned int);
extern int  __write  (int, const void *, unsigned int);
extern int  __close  (int);
#endif

extern int  open   (const char *, int, ...);
extern int  creat  (const char *, int);
extern int  read   (int, void *, unsigned int);
extern int  write  (int, const void *, unsigned int);
extern long lseek  (int, long, int);
extern long tell   (int);
extern int  close  (int);
extern int  unlink (const char *);
extern int  iomode (int, int);
extern int  isatty (int);

#define creat __creat
#define lseek __lseek

#ifndef __cplusplus
#define open __open
#define read __read 
#define write __write
#define close __close
#endif

#define tell(x)    lseek(x, 0L, 1)

#ifndef _COMMNULL_H
#include <sys/commnull.h>
#endif

#endif


