/*-------------------------------------------------------------------*/
/* Copyright (c) 1993 SAS Institute, Inc.  All Rights Reserved.      */
/* Author: Doug Walker                                               */
/* Support: walker                                                   */
/*-------------------------------------------------------------------*/
#include <rexx/rxslib.h>
#include <exec/ports.h>

/* AddSCMSG: Add a new message to the SCMSG list.                   */
/*    'group' specifies the message group (compilation unit)        */
/*    'file' and 'line' are the associated filename and line number */
/*    'msg' is the message text                                     */
int AddSCMSG(char *group, char *file, int line, char *msg);

/* ClearSCMSG: Clear all messages in the SCMSG list in the specified group */
int ClearSCMSG(char *group);

