/* Copyright (c) 1993 SAS Institute, Inc, Cary, NC, USA */
/* All Rights Reserved */

#ifndef __UNISTD_H
#define __UNISTD_H

#ifndef _DOS_H
#include <dos.h>
#endif

#ifndef _FCNTL_H
#include <fcntl.h>
#endif

char *mktemp(char *template_arg);
int mkstemp(char *template_arg);

#endif
