/*-------------------------------------------------------------------*/
/* Copyright (c) 1993 SAS Institute, Inc.  All Rights Reserved.      */
/* Author: Doug Walker                                               */
/* Support: walker                                                   */
/*-------------------------------------------------------------------*/

#include <string.h>
#include <dos/dos.h>
#include <rexx/rxslib.h>
#include <exec/memory.h>
#include <proto/exec.h>
#include <proto/dos.h>

#include "smcomm.h"

/* NAME:    LaunchSCMSG                                           */
/* PURPOSE: Invoke the SCMSG utility if it is not already running */

static struct MsgPort *LaunchSCMSG(void)
{
   static int scmsg_launched;  // If non-zero, we've tried once already
   struct MsgPort *smport;
   BPTR fh1, fh2;
   int i;

   if(!(smport = FindPort("SC_SCMSG")))
   {
      if(scmsg_launched) return(NULL);  // Tried once and failed; give it up

      fh1 = Open("nil:", MODE_NEWFILE);
      fh2 = Open("nil:", MODE_NEWFILE);
      Execute("run >nil: <nil: sc:c/scmsg", fh1, fh2);
      Close(fh1);
      Close(fh2);
      for(i=0; i<15; i++)
      {
         Delay(20);  // 0.4 seconds delay
         if(smport = FindPort("SC_SCMSG")) break;
      }
   }
   scmsg_launched = 1;
   return(smport);
}

/* NAME:    CreateRexxMsg2                                                */
/* PURPOSE: Create a RexxMsg structure in order to communicate with SCMSG */

static struct RexxMsg *CreateRexxMsg2(struct MsgPort *rport, 
                                      char *file, 
                                      char *comm)
{
	struct RexxMsg *rm;
	
	rm = AllocMem(sizeof(struct RexxMsg), MEMF_CLEAR | MEMF_PUBLIC);
	if (!rm) return NULL;
	rm->rm_CommAddr = comm;
	rm->rm_FileExt = file;
	rm->rm_Node.mn_ReplyPort = rport;
	rm->rm_Node.mn_Length = 128;
	return rm;
}

/* NAME:    DeleteRexxMsg2                                  */
/* PURPOSE: Delete a previously allocated RexxMsg structure */

static void DeleteRexxMsg2(struct RexxMsg *rm)
{
	FreeMem(rm, sizeof(struct RexxMsg));
}

static char msgline[512];

/* NAME:    DoSCMSG                                     */
/* PURPOSE: Perform the actual communication with SCMSG */

static int DoSCMSG(char *line)
{
   struct MsgPort *scmport, *rport;
   struct RexxMsg *RXMsg;
   int rc = 0;

   LaunchSCMSG();  // Run SCMSG if it's not already running

   /* Create the REXX reply port */
   if(!(rport = CreatePort(NULL, 0L)))
      return(-1);

   if((RXMsg=CreateRexxMsg2(rport, "scm", "SC_SCMSG")) != NULL)
   {
      RXMsg->rm_Action = RXCOMM;
      RXMsg->rm_Args[0] = line;
      RXMsg->rm_Args[1] = (void *)strlen(line);
      Forbid();
      /* We do this under Forbid() to prevent SCMSG from exiting */
      /* before our message gets there                           */
      if(scmport = FindPort("SC_SCMSG"))
      {
         PutMsg(scmport, (struct Message *)RXMsg);
         Permit();

         /* Wait for SCMSG's reply */
         while(GetMsg(rport) == NULL)
            WaitPort(rport);
      }
      else
      {
         Permit();
         rc = -1;
      }
   }

   // Free up the REXX reply port
   FreeSignal((long)(rport->mp_SigBit));
   DeletePort(rport);

   if(RXMsg) DeleteRexxMsg2(RXMsg);

   return(rc);
}

static int addtext(char *to, char *from, int quotes)
{
   int i, j;
   if(quotes)
   {
      *to = '\"';
      i = 1;
   }
   else
      i = 0;
   j = strlen(from);
   memcpy(to+i, from, j);
   i += j;
   if(quotes) to[i++] = '\"';
   to[i] = ' ';
   return(i+1);
}

/* NAME:    AddSCMSG                                                    */
/* PURPOSE: Add a new message to the SCMSG list                         */
/* NOTES:   We must construct the message from the provided components, */
/*             then call DoSCMSG to do the communications work.         */

int AddSCMSG(char *cunit, char *file, int line, char *msg)
{
   int save_char, save_pos = 0;
   int len;
   if(strlen(file) + strlen(msg) + strlen(cunit) + 20 > sizeof(msgline))
      return(-1);  // Message too long

   // Construct the message
   strcpy(msgline, "newmsg ");
   len = strlen(msgline);
   len += addtext(msgline+len, cunit, 1);
   len += addtext(msgline+len, file, 1);
   len += stci_d(msgline+len, line);
   msgline[len++] = ' ';
   len += addtext(msgline+len, "0 \"\" 0 ", 0);

   /* If you want anything but informational messages, you need to change */
   /* the line below to add something other than "Info 0".  For example,  */
   /* to add error number 1156, use "Error 1156".  Use "Error", "Warning",*/
   /* or "Info" for the message class, and any integer less than 32767 for*/
   /* the message number.                                                 */
   len += addtext(msgline+len, "Info 0 ", 0);

   if(strlen(msg) > sizeof(msgline) - len - 2)
   {
      save_pos = sizeof(msgline) - len - 2;
      save_char = msg[save_pos];
      msg[save_pos] = 0;
   }

   len += addtext(msgline+len, msg, 0);

   if(save_pos)
      msg[save_pos] = save_char;

   msgline[len-1] = 0;

   return DoSCMSG(msgline);
}

/* NAME:    ClearSCMSG                                                        */
/* PURPOSE: Get rid of the results of the previous call to SCMSG that has     */
/*             the specified "compilation unit".  When the compiler does      */
/*             this, the "compilation unit" represents the C source file      */
/*             being compiled; i.e. when foo.c gets recompiled, all previous  */
/*             messages from foo.c disappear.  Other utilities such as smfind */
/*             can name their compilation units as they see fit and clear     */
/*             them at a single shot with ClearSCMSG.                         */

int ClearSCMSG(char *cunit)
{
   // No need for Forbid()/Permit() here; if the port does exist, then
   // DoSCMSG will Forbid() at the appropriate time.  We check for the
   // port's existence before calling just so we don't invoke SCMSG
   // if it's not already invoked.
   if(FindPort("SC_SCMSG"))
   {
      strcpy(msgline, "newbld \"");
      strcpy(msgline+8, cunit);
      strcpy(msgline+strlen(msgline), "\"");
      return DoSCMSG(msgline);
   }
   return(0);
}
