/* Copyright (c) 1992 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */

#ifndef _SYS_DIR_H
#define _SYS_DIR_H

#include <sys/commargs.h>

#include <sys/types.h>
#include <stat.h>

#define	DEV_BSIZE	1024
#define  DIRBLKSIZ	DEV_BSIZE
#define	MAXNAMLEN	255

struct	dirent {
	u_long	d_ino;			/* inode number of entry */
	u_short	d_reclen;		/* length of this record */
	u_short	d_namlen;		/* length of string in d_name */
	off_t	   d_off;			/* offset of disk directory entry */
	char	   d_name[MAXNAMLEN + 1];	/* name must be no longer than this */
};

/*
 * The DIRSIZ macro gives the minimum record length which will hold
 * the directory entry.  This requires the amount of space in struct direct
 * without the d_name field, plus enough space for the name with a terminating
 * null byte (dp->d_namlen+1), rounded up to a 4 byte boundary.
 */
#undef DIRSIZ
#define DIRSIZ(dp) \
    ((sizeof (struct dirent) - (MAXNAMLEN+1)) + (((dp)->d_namlen+1 + 3) &~ 3))

/*
 * Definitions for library routines operating on directories.
 */
typedef struct _dirdesc {
	long    dd_fd;
	long	dd_loc;
	long	dd_size;
	char	*dd_buf;
} DIR;

#include <sys/commnull.h>

extern	DIR           *opendir __ARGS((const char *));
extern	struct dirent *readdir __ARGS((DIR *));
extern	long          telldir  __ARGS((DIR *));
extern	void          seekdir  __ARGS((DIR *, long));
extern	void          closedir __ARGS((DIR *));
#define rewinddir(dirp)	seekdir((dirp), (long)0)

#endif
