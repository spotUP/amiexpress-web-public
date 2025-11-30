/* Copyright (c) 1992-1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */

#ifndef _STAT_H
#define _STAT_H 1

#ifndef _INO_T
#define _INO_T 1
typedef unsigned long ino_t;
#endif

#ifndef _DEV_T
#define _DEV_T 1
typedef long dev_t;
#endif

#ifndef _OFF_T
#define _OFF_T 1
typedef long off_t;
#endif

#ifndef _COMMTIME_H
#include <sys/commtime.h>
#endif

struct stat {
    unsigned short    st_mode;         /* file mode */
    ino_t             st_ino;          /* inode number */
    dev_t             st_dev;          /* file system identifier */
    char              *st_rdev;        /* device identifier (volume name) */
    short             st_nlink;        /* number of links */
    unsigned short    st_uid;          /* file owner user-id */
    unsigned short    st_gid;          /* file group user-id */
    off_t             st_size;         /* file size in bytes */
    time_t            st_atime;        /* time last accessed */
    time_t            st_mtime;        /* time last modified */
    time_t            st_ctime;        /* time last status change */
    short             st_type;         /* Amiga file type */
    char              *st_comment;     /* Amiga file comment */
};


int stat(const char *, struct stat *);
int lstat(const char *, struct stat *);
int fstat(int, struct stat *);


/***
*     The following defines can be used to test st_dev.
***/

#define  OFS     0x444F5300      /*  Old File System (Floppy)  */
#define  FFS     0x444F5301      /*  Fast File System  */

#ifndef _COMMIFMT_H
#include <sys/commifmt.h>
#endif

#endif
