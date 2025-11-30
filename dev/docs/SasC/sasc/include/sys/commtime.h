/* Copyright (c) 1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */

/* This header file contains common preprocessor symbol   */
/* definitions that were previously duplicated throughout */
/* the header files. Those definitions were moved here    */
/* and replaced with a #include of this header file.      */
/* This was done to purify the header files for GST       */
/* processing.                                            */

#ifndef _TIME_T
#define _TIME_T 1
typedef long time_t;
#endif
