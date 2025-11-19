/* Prototypes for functions defined in
AcpCycle.c
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


extern char LastUsers[][];

extern char LastUploads[][];

extern char LastDownloads[][];

extern struct NodeUsers NdUser[];

extern struct NodeUsers NdUploads[];

extern struct NodeUsers NdDownloads[];

extern char LastBlank[];

void RegLastUser __PROTO((char *, int ));

void RegNodeUser __PROTO((char *, int ));

void ShowLastUser __PROTO((struct Window *));

void ShowNdLastUser __PROTO((struct Window *, int ));

void RegLastUploads __PROTO((char *, int ));

void RegNodeUploads __PROTO((char *, int ));

void ShowLastUploads __PROTO((struct Window *));

void ShowNdLastUploads __PROTO((struct Window *, int ));

void RegLastDownloads __PROTO((char *, int ));

void RegNodeDownloads __PROTO((char *, int ));

void ShowLastDownloads __PROTO((struct Window *));

void ShowNdLastDownloads __PROTO((struct Window *, int ));

void InitCycles __PROTO((void));

void InitNdCycles __PROTO((void));

extern struct IntuiText t;

void PrintMyText __PROTO((struct RastPort *, char *, int , int ));

