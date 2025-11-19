/* Prototypes for functions defined in
IconInfo.c
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


extern struct FileLock *pdir;

extern struct FileInfoBlock *dir_info;

void GetIconBBSInfo __PROTO((int ));

void GetIconNodeInfo __PROTO((int ));

int GetFileName __PROTO((char *, char *));

void free_pdir __PROTO((void));

