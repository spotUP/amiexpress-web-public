/* Prototypes for functions defined in
sercon.c
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


extern struct MsgPort *Nport;

extern struct MsgPort *replymp;

extern char NPortName[];

extern char MasterPort[];

extern long sersig;

int Register __PROTO((int ));

void ShutDown __PROTO((void));

BOOL PutToPort __PROTO((struct Message *));

void getuserstring __PROTO((char *, int ));

