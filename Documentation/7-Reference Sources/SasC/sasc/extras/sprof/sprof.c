/*-------------------------------------------------------------------*/
/* Copyright (c) 1993 by SAS Institute Inc., Cary NC                 */
/* All Rights Reserved                                               */
/*                                                                   */
/* SUPPORT:    walker - Doug Walker                                  */
/*-------------------------------------------------------------------*/
#define __USE_SYSBASE 1

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <time.h>
#include <exec/ports.h>
#include <dos/dosextens.h>
#include <dos/dostags.h>
#include <exec/execbase.h>
#include <proto/exec.h>
#include <proto/dos.h>
#include <dos.h>
#include "sprofpriv.h"

#define V37 (SysBase->LibNode.lib_Version > 36) 

char nullid[] = "";

void __regargs __chkabort(void){}

static const char __ver[] = "$VER: SPROF 6.50 (26.8.93)";

char *process_status = "Initializing";

struct MsgPort *port;

struct SPDAT *spdat;
int spcur, spmax;

struct GPInfo **GPInfo;
int GPCur;
int GPMax;
int verbose;

char __stdiowin[] = "CON:0/0/639/199/";

unsigned long process;
static void spdoexit(SPM msg);

void _STDcleanup(void)
{
   if(port)
   {
      DeletePort(port);
      port = NULL;
   }
}

int main(int argc, char *argv[])
{
   SPM msg;
   int i, len;
   int keepon = 1;
   char *modname = NULL;
   char *cmd;
   int wait = 0;
   int reporttime = 0;
   int doreport = 0;
   int forcereport = 0;
   int process_stopped = 0;
   long waitbits, timerbit, res;
   sptime now = 0;
   struct ExecBase *SysBase = *(struct ExecBase **)4;

   if(!V37)
   {
      fprintf(stderr, "This program requires AmigaDOS 2.0 or higher\n");
      /* If we were run from the 1.3 WorkBench, our stderr window will */
      /* close when we exit, so delay for 4 seconds.                   */
      if(argv == NULL) Delay(200);
      exit(20);
   }

   /* Parse workbench arguments */
   if(argc == 0)
   {
      /* See <dos.h> */
      argc = _WBArgc;
      argv = _WBArgv;
   }

   timerbit = waitbits = OpenTimer();

   if(waitbits == 0)
   {
      fprintf(stderr, "ERROR: Can't open timer.device\n");
      exit(20);
   }

   waitbits |= (SIGBREAKF_CTRL_C|SIGBREAKF_CTRL_F);

   /* We can't use ReadArgs because our parameters are positional. */
   /* We want arguments specified after the program name to be     */
   /* program arguments, and ReadArgs doesn't support this.        */
   if(argc)
   {
      while(argv[1])
      {
         if(!stricmp(argv[1], "WAIT")) wait = 1;
         else if(!strnicmp(argv[1], "REPORT", 6))
         {
            if(argv[1][6])
            {
               if(argv[1][6] != '=')
               {
                  /* It was a mistake, just LOOKED like the REPORT keyword */
                  modname = argv[1];
               }
               else
               {
                  if(stcd_i(argv[1]+7, &reporttime) <= 0)
                     goto usage;
               }
            }
            else
            {
               if(argv[2] == NULL ||
                  stcd_i(argv[2], &reporttime) <= 0)
               {
                  usage:
                  fprintf(stderr, "USAGE: sprof [WAIT] [VERBOSE] [REPORT <n>] [FORCE] [<program> [<arguments>...]]\n");
                  exit(20);
               }
               argv++;
            }
            reporttime *= 1000; // Needs to be in milliseconds
         }
         else if(!stricmp(argv[1], "VERBOSE"))
         {
            verbose = 1;
         }
         else if(!stricmp(argv[1], "FORCE"))
         {
            /* Produce reports even at the expense of the program */
            /* being profiled.  If FORCE is not set, reports will */
            /* only be produced when the program is suspended.    */
            forcereport = 1;
         }
#if DODEBUG
         else if(!stricmp(argv[1], "DEBUG"))
         {
            dodebug=1;
         }
#endif
         else
         {
            modname = argv[1];
            argv++;
            break; /* Args after this belong to program */
         }
 
         argv++;
      }
   }

   /* Check to make sure there isn't already another SPROF process */
   /* running.  If there isn't, go ahead and allocate our MsgPort. */
   /* Since it's possible that one would start up after the call to*/
   /* FindPort() but before the call to CreatePort(), we do the    */
   /* FindPort()/CreatePort() pair under Forbid().                 */
   Forbid();
   if(FindPort(SPROFPORT))
   {
      Permit();
      fprintf(stderr, "Message port \"" SPROFPORT "\" already open\n");
      exit(99);
   }

   port = CreatePort(SPROFPORT, 0L);
   Permit();

   if(port == NULL)
   {
      fprintf(stderr, "Can't allocate message port \"" SPROFPORT "\"\n");
      exit(99);
   }

   waitbits |= (1<<port->mp_SigBit);

   if(!modname || wait)
      printf("SPROF: Please run the program to be profiled now.\n");
   else
   {
      BPTR fh1, fh2;

      for(i=1, len=strlen(modname) + 2; argv[i]; i++)
         len += strlen(argv[i]) + 1;

      if(!(cmd = malloc(len)))
      {
         fprintf(stderr, "Can't allocate %d bytes!\n", len);
         exit(20);
      }

      cmd[0] = 0;

      strcat(cmd, modname);
      for(i=1, len=strlen(cmd); argv[i]; i++)
      {
         cmd[len] = ' ';
         strcpy(cmd+len+1, argv[i]);
         len += strlen(argv[i]) + 1;
      }

      fh1 = Open("*", MODE_OLDFILE);
      fh2 = Open("*", MODE_OLDFILE);

      printf("SPROF: Executing command \"%s\"\n", cmd);

      if(SystemTags(cmd,  SYS_Input, fh1,
                          SYS_Output, fh2, 
                          SYS_Asynch, -1,
                          SYS_UserShell, -1,
                          TAG_DONE))
      {
         invoke_error:
         fprintf(stderr, "Can't invoke command \"%s\"!\n", cmd);
         exit(20);
      }
      free(cmd);
   }
   printf("SPROF: Waiting for process...\n");

   while(keepon)
   {
      res = SetSignal(0,SIGBREAKF_CTRL_C|SIGBREAKF_CTRL_F);
      if(res & SIGBREAKF_CTRL_C)
      {
         doctrlc:
         if(process)
         {
            printf("SPROF: Sending CTRL-C to process...\n");
            Signal((struct Task *)process, SIGBREAKF_CTRL_C);
         }
         else
            break;
      }
      if(res & SIGBREAKF_CTRL_F)
      {
         doctrlf:
         BUG(("CTRL-F received, setting up for report\n"))
         if(forcereport)
            Report(now);
         else
            doreport = 1;
      }

      if(msg=(SPM)GetMsg(port))
      {
         process_stopped = 1;
         switch(msg->flags)
         {
            case SPROF_INIT:
               if(process == NULL) 
               {
                  BUG(("Accepting SPROF_INIT message, process 0x%08lx\n", msg->process))
                  printf("SPROF: Contacted process 0x%08lx\n", msg->process);
                  process = msg->process;
                  PostTimerReq(reporttime);
                  process_status = "Running";
               }
               else
               {
                  BUG(("Rejecting SPROF_INIT message, process 0x%08lx\n", msg->process))
                  msg->flags = SPROF_DENIED;
               }
               break;

            case SPROF_ENTRY:
               if(verbose)
                  printf("SPROF: ENTRY timestamp %ld \"%s\"\n", msg->clk, 
                         msg->id ? msg->id : "PROFILE_OFF");
               if(spcur>=spmax)
               {
                  spmax += SPINCR;
                  spdat = realloc(spdat, spmax*SIZSPDAT);
                  if(!spdat)
                  {
                     keepon = 0;
                     break;
                  }
               }
               spdat[spcur].subrs = spdat[spcur].off = 0;
               spdat[spcur].clk   = now = msg->clk;
               spdat[spcur].id    = msg->id ? msg->id : nullid;
               spcur++;
               break;

            case SPROF_EXIT:
               if(verbose)
                  printf("SPROF: EXIT timestamp %ld \"%s\"\n", 
                          msg->clk, msg->id ? msg->id : "PROFILE_ON");
               if(msg->id == NULL) msg->id = nullid;
               spdoexit(msg);
               now = msg->clk;
               break;
            
            case SPROF_TERM:
            case SPROF_ABORT:
               BUG(("SPROF_TERM/SPROF_ABORT\n"))
               keepon = 0;
               doreport = 1;
               process_status = "Complete";
               break;

            default:
               BUG(("Unknown message flags %d(0x%08lx\n", msg->flags, msg->flags))
               msg->flags = SPROF_ABORT;
               break;
         }

         if(process_stopped && doreport)
         {
            Report(now);
            doreport = 0;
         }

         process_stopped = 0;
         ReplyMsg(msg);
      }
      else
      {
         if(!process && verbose) printf("Waiting for process...\n");
         res = Wait(waitbits);
         if(res & SIGBREAKF_CTRL_C) goto doctrlc;
         if(res & SIGBREAKF_CTRL_F) goto doctrlf;
         if(res & timerbit)
         {
            BUG(("Timeout, setting up for report\n"))
            if(forcereport)
               Report(now);
            else
               doreport = 1;
            GetTimerPkt(reporttime, 0);
         }
      }
   }

   Forbid();
   while(msg=(SPM)GetMsg(port))
   {
      msg->flags = SPROF_TERM;
      ReplyMsg(msg);
   }
   DeletePort(port);
   Permit();
   port = NULL;

   return(0);
}

static struct GPInfo *NewGPI(char *id)
{
   struct GPInfo *gpi;
   
   gpi = malloc(sizeof(struct GPInfo) + strlen(id) + 1);
   if(!gpi)
   {
      fprintf(stderr, "Out of memory!\n");
      exit(20);
   }

   memset(gpi, 0, sizeof(*gpi));

   gpi->id = id;  // For sorting purposes
   gpi->name = (char *)(gpi+1);
   if(id) strcpy(gpi->name, id);

   return gpi;
}


struct GPInfo *FindGPI(struct GPInfo ***GPInfo_p, char *id,
                       int *cur, int *tot)
{
   int i;
   struct GPInfo **gpi;
   struct GPInfo **GPInfo = *GPInfo_p;

   for(i=0; i<*cur && GPInfo[i]->id < id ; i++);

   if(i<*cur && GPInfo[i]->id == id)
      return GPInfo[i];

   if(!tot) return NULL;

   /* Need to insert a new one right here */
   if(*cur >= *tot)
   {
      *tot += 100;
      if(!(gpi = malloc(*tot*sizeof(struct GPInfo *))))
      {
         fprintf(stderr, "Out of memory!\n");
         exit(20);
      }
      if(i) memcpy(gpi, GPInfo, i*sizeof(struct GPInfo *));
      gpi[i] = NewGPI(id);
      if(i<*cur) memcpy(gpi+i+1, GPInfo+i, (*cur-i)*sizeof(struct GPInfo *));
      if(GPInfo) free(GPInfo);
      GPInfo = *GPInfo_p = gpi;
      (*cur)++;
   }
   else
   {
      if(i < *cur)
         memmove(GPInfo+i+1, GPInfo+i, (*cur-i)*sizeof(struct GPInfo *));
      GPInfo[i] = NewGPI(id);
      (*cur)++;
   }
   return GPInfo[i];
}


static void spdoexit(SPM msg)
{
   sptime elapsed;
   struct GPInfo *gpi;

   if(spcur <= 0)
   {
      /* Should never happen */
      if(verbose) printf("SPROF: Call stack underflow! \"%s\"\n", msg->id);
      return;
   }

   /* Determine net elapsed time since function entry */
   /* NOT COUNTING any time spent in PROFILE_OFF      */
   spcur--;
   elapsed = msg->clk - spdat[spcur].clk;

   if(msg->id == nullid)
   {
      /* PROFILE_ON() seen */
      /* Adjust our parent's "off" time */
      spdat[spcur-1].off += elapsed;
      return;
   }

   /* Adjust our parent's "subroutine elapsed" field */
   spdat[spcur-1].subrs += elapsed - spdat[spcur].off;

   /* Adjust our parent's "off" field */
   spdat[spcur-1].off += spdat[spcur].off;

   /* Now we need to associate the elapsed time with the function */
   /* that is returning                                           */
   gpi = FindGPI(&GPInfo, msg->id, &GPCur, &GPMax);

   gpi->count++;
   gpi->time += elapsed - spdat[spcur].subrs - spdat[spcur].off;
   gpi->tottime += elapsed - spdat[spcur].off;

   return;
}

#if DODEBUG
void bug(char *fmt, ...)
{
   va_list arg;
   char buf[512];

   va_start(arg,fmt);
   vsprintf(buf, fmt, arg);
   va_end(arg);

   Write(Output(), buf, strlen(buf));
}
#endif
