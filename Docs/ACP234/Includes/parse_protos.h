/* Prototypes for functions defined in
parse.c
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


int ParseImage __PROTO((char *, struct PSTR *));

