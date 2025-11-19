/* Prototypes for functions defined in
semis.c
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


extern struct MultiPort *SemiNodes;

extern struct SinglePort *SingleNode;

extern char MultiName[];

extern char SingleName[];

void CreateSemaphores __PROTO((void));

void InitSemaSemiNodes __PROTO((struct MultiPort *));

void ShutDownSemis __PROTO((void));

