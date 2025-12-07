/* Copyright (c) 1992-1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */


#ifndef _IOS1_H
#define _IOS1_H 1


/***
*
* The following structure is a UNIX file block that retains information about
* a file being accessed via the level 1 I/O functions.
*
***/

struct UFB {
    struct UFB *ufbnxt;   /* next UFB */
    int ufbflg;		  /* flags */
    long ufbfh;		  /* file handle */
    char *ufbfn;          /* file name */
};

#define NUFBS 40	  /* was number of UFBs defined (not used) */


/***
*
* UFB.ufbflg definitions
*
***/

#define UFB_RA   0x1   /* reading is allowed */
#define UFB_WA   0x2   /* writing is allowed */
#define UFB_CLO  0x4   /* use CLose to close not _close */
#define UFB_NC   0x10  /* no close */
#define UFB_APP  0x20  /* append on write */
#define UFB_XLAT 0x40  /* translate */
#define UFB_TEMP 0x80  /** temporary file */

/***
*
* External definitions
*
***/

extern int __nufbs;
extern struct UFB *__ufbs;

extern struct UFB *__chkufb(int);
#define   chkufb    __chkufb

#endif
