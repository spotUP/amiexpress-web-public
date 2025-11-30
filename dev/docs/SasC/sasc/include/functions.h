/* Copyright (c) 1993 SAS Institute, Inc, Cary, NC USA */
/* All Rights Reserved. */

#ifndef __FUNCTIONS_H
#define __FUNCTIONS_H

typedef void (*PVF)(void);

#ifndef PROTO_ALL_H
#include <proto/all.h>
#endif

#ifndef _SCRCNTL_H
#include <scrcntl.h>
#endif

long dos_packet(struct MsgPort *port, long type,
		long arg1, long arg2, long arg3, long arg4,
		long arg5, long arg6, long arg7);

char *scdir(const char *pat);
char *mktemp(char *template_arg);
int mkstemp(char *template_arg);
#endif
