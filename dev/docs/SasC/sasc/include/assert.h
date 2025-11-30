/* Copyright (c) 1992-1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */

/* assert.h is allowed to included multiple times */
/* for the purposes of debugging.                 */

#ifdef assert
#undef assert
#endif

#ifndef NDEBUG
#define assert(x)  __assert((int)(x), #x, __FILE__, __LINE__)
#else
#define assert(ignore)  ((void) 0)
#endif

extern void __assert(int, const char *, const char *, int);

