/* Copyright (c) 1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */

/* This header file contains common preprocessor symbol   */
/* definitions that were previously duplicated throughout */
/* the header files. Those definitions were moved here    */
/* and replaced with a #include of this header file.      */
/* This was done to purify the header files for GST       */
/* processing.                                            */

#ifndef WBenchMsg
#pragma msg 148 ignore push   /* Ignore message if tag is undefined*/
extern struct WBStartup *_WBenchMsg;  /* WorkBench startup, if the */
#define WBenchMsg _WBenchMsg          /* program was started from  */
#pragma msg 148 pop                   /* WorkBench.   Same as argv.*/
#endif

/* The following two externs give you the information in the   */
/* WBStartup structure parsed out to look like an (argc, argv) */
/* pair.  Don't define them in your code;  just include this   */
/* file and use them.  If the program was not run from         */
/* WorkBench, _WBArgc will be zero.                            */

extern int _WBArgc;    /* Count of the number of WorkBench arguments */
extern char **_WBArgv; /* The actual arguments                       */
