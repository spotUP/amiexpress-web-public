/* Copyright (c) 1992-1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */

#ifndef _FCTYPE_H
#define _FCTYPE_H 1

/**
*
* This header file defines the function forms of the various "is" and
* "to" operations.
*
**/

#ifndef _COMMARGS_H
#include <sys/commargs.h>
#endif

extern int isupper __ARGS((int));
extern int islower __ARGS((int));
extern int isdigit __ARGS((int));
extern int isxdigit __ARGS((int));
extern int isspace __ARGS((int));
extern int ispunct __ARGS((int));
extern int isalpha __ARGS((int));
extern int isalnum __ARGS((int));
extern int isprint __ARGS((int));
extern int isgraph __ARGS((int));
extern int iscntrl __ARGS((int));
extern int isascii __ARGS((int));
extern int iscsym __ARGS((int));
extern int iscsymf __ARGS((int));
extern int toupper __ARGS((int));
extern int tolower __ARGS((int));
extern int toascii __ARGS((int));

#ifndef _COMMNULL_H
#include <sys/commnull.h>
#endif

#endif
