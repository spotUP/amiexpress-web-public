/* Copyright (c) 1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */

/* This header file contains common preprocessor symbol   */
/* definitions that were previously duplicated throughout */
/* the header files. Those definitions were moved here    */
/* and replaced with a #include of this header file.      */
/* This was done to purify the header files for GST       */
/* processing.                                            */

#ifndef S_IFMT
/***
*
* The following flags are used to establish the protection mode.
*
***/
#define S_IFMT     (S_IFDIR|S_IFREG)
#define S_IFDIR    2048
#define S_IFREG    1024

#define S_ISCRIPT   64
#define S_IPURE     32
#define S_IARCHIVE  16
#define S_IREAD     8
#define S_IWRITE    4
#define S_IEXECUTE  2
#define S_IDELETE   1
#endif
