/* Prototypes for functions defined in
StartProcess.c
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


extern struct TagItem tags[];

int StartProcess __PROTO((char *, ULONG ));

