/* Copyright (c) 1992-1993 SAS Institute, Inc., Cary, NC USA */
/* All Rights Reserved */


#ifndef  _ERRNO_H
#define  _ERRNO_H  1

/***
*
* The following symbols are the error codes use by the system
* functions.  Typically, a function returns -1 when an error occurs,
* and the global integer named errno contains one of these values.
*
***/

#define EOSERR -1	/* Operating system error */

#define EPERM 1		/* User is not owner */
#define ENOENT 2	/* No such file or directory */
#define ESRCH 3		/* No such process */
#define EINTR 4		/* Interrupted system call */
#define EIO 5		/* I/O error */
#define ENXIO 6		/* No such device or address */
#define E2BIG 7		/* Arg list is too long */
#define ENOEXEC 8	/* Exec format error */
#define EBADF 9		/* Bad file number */
#define ECHILD 10	/* No child process */
#define EAGAIN 11	/* No more processes allowed */
#define ENOMEM 12	/* No memory available */
#define EACCES 13	/* Access denied */
#define EFAULT 14	/* Bad address */
#define ENOTBLK 15	/* Bulk device required */
#define EBUSY 16	/* Resource is busy */
#define EEXIST 17	/* File already exists */
#define EXDEV 18	/* Cross-device link */
#define ENODEV 19	/* No such device */
#define ENOTDIR 20	/* Not a directory */
#define EISDIR 21	/* Is a directory */
#define EINVAL 22	/* Invalid argument */
#define ENFILE 23	/* No more files (units) allowed */
#define EMFILE 24	/* No more files (units) allowed for this process */
#define ENOTTY 25	/* Not a terminal */
#define ETXTBSY 26	/* Text file is busy */
#define EFBIG 27	/* File is too large */
#define ENOSPC 28	/* No space left */
#define ESPIPE 29	/* Seek issued to pipe */
#define EROFS 30	/* Read-only file system */
#define EMLINK 31	/* Too many links */
#define EPIPE 32	/* Broken pipe */
#define EDOM 33		/* Math function argument error */
#define ERANGE 34	/* Math function result is out of range */


extern int errno;
extern int __sys_nerr;
extern char *__sys_errlist[];

/***
*     OS error information
***/

extern int _OSERR;

extern int __os_nerr;

extern struct {
    short errnum;
    char  *msg;
} __os_errlist[];

#ifndef _STRICT_ANSI
#define OSERR _OSERR
#define os_nerr __os_nerr
#define os_errlist __os_errlist
#define sys_nerr __sys_nerr
#define sys_errlist __sys_errlist
#endif

#endif
