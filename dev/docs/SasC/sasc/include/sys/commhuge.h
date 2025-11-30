/* Copyright (c) 1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */

/* This header file contains common preprocessor symbol   */
/* definitions that were previously duplicated throughout */
/* the header files. Those definitions were moved here    */
/* and replaced with a #include of this header file.      */
/* This was done to purify the header files for GST       */
/* processing.                                            */

#ifndef HUGE_VAL
#ifdef _FFP
#define HUGE_VAL 9.2337177e18
#else
#define HUGE_VAL 1.7976931348623157E+308
#endif
#endif
