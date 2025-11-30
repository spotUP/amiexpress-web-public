/* Copyright (c) 1993 SAS Institute, Inc, Cary, NC USA */
/* All Rights Reserved. */

#ifndef _FORK_H
#define _FORK_H

struct FAKE_SegList {
   long space;
   long length;
   BPTR nextseg;
   short jmp;
   void (*func)();
};

struct ProcMsg {               /* startup message sent to child */
   struct Message msg;
   char *prog;
   char *command;
   long len;
   long return_code;           /* return code from process     */
   BPTR std_in;
   BPTR std_out;
   BPTR console;
   struct FAKE_SegList *seg;   /* pointer to fake seglist so   */
   BPTR seglist;
   BPTR curdir;
};

#endif
