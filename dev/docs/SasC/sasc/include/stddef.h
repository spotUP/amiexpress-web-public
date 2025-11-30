/* Copyright (c) 1992-1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */


#ifndef _STDDEFH
#define _STDDEFH 1

#ifndef _COMMSIZE_H
#include <sys/commsize.h>
#endif

#ifndef _COMMCHAR_H
#include <sys/commchar.h>
#endif

#ifndef _COMMNULL_H
#include <sys/commnull.h>
#endif

typedef long int ptrdiff_t;

#define offsetof(type,memb)  (size_t) &(((type *) 0L)->memb)

#endif

