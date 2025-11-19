/* Prototypes for functions defined in
mymenus.c
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


extern char __chip Version[];

extern int menuset;

void CreateCustomMenus __PROTO((int ));

void MaddNodes __PROTO((int ));

void MaddItem __PROTO((UBYTE , char *, char *, UWORD , LONG , APTR ));

void MaddRem __PROTO((void));

