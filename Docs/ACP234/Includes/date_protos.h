/* Prototypes for functions defined in
date.c
 */


#ifndef __NOPROTO

#ifndef __PROTO
#define __PROTO(a) a
#endif

#else
#ifndef __PROTO
#define __PROTO(a) ()

#endif
#endif


extern char *VerStr;

extern char *MyVerStr;

extern char *ACPVer;

char * GetDate __PROTO((void));

