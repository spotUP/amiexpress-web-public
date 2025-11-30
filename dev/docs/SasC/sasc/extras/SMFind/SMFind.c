/*-------------------------------------------------------------------*/
/* Copyright (c) 1993 SAS Institute, Inc.  All Rights Reserved.      */
/* Author: Doug Walker                                               */
/* Support: walker                                                   */
/*-------------------------------------------------------------------*/
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <dos/dos.h>
#include <exec/memory.h>
#include <exec/execbase.h>
#include <workbench/startup.h>

#include <proto/exec.h>
#include <proto/dos.h>
#include <proto/wb.h>
#include <proto/intuition.h>

#include "smcomm.h"

#include "toolversion.h"

static const char ver[] = "$VER: SAS/C_SMFind " TOOLVER TOOLDATE;

int ParseFile(char *file, char *pattern);
int GetLine(BPTR fh, char *buf, int buflen);

#define BSIZ 512

char buf[BSIZ];

#define V37 (SysBase->LibNode.lib_Version >= 36) 
extern struct ExecBase *SysBase;

struct MYALLOC
{
   long len;
   struct MYALLOC *next;
};

static struct MYALLOC *first;

void __stdargs _MemCleanup(void){}

void *myalloc(long len)
{
   struct MYALLOC *new;
   if(new = AllocMem(len+sizeof(struct MYALLOC), 0))
   {
      new->len = len;
      new->next = first;
      first = new;
   }
   return(new+1);
}

static BPTR oldcurdir;
static int dirchanged;

void _STDmyfree(void)
{
   struct MYALLOC *tmp;
   struct MYALLOC *next;
   for(tmp=first; tmp; tmp=next)
   {
      next = tmp->next;
      FreeMem(tmp, tmp->len+sizeof(struct MYALLOC));
   }
   if(dirchanged)
   {
      CurrentDir(oldcurdir);
      dirchanged = 0;
   }
}

// NAME:    msg
// PURPOSE: Communicate a message to the user
// NOTES:   Uses Output() if invoked from the CLI
//          Uses an AutoRequest if invoked from WorkBench

void msg(char *m)
{
   struct Library *IntuitionBase;
   struct IntuiText itext;
   static const struct IntuiText ntext =
   {
      (unsigned char)-1, (unsigned char)-1, 
      0, 0, 0, NULL, "Cancel", NULL
   };

   if(Output())
   {
      Write(Output(), m, strlen(m));
   }
   else
   {
      if(IntuitionBase = OpenLibrary("intuition.library", 0))
      {
         memcpy(&itext, &ntext, sizeof(itext));
         itext.LeftEdge = 14;
         itext.TopEdge = 14;
         itext.IText = m;

         AutoRequest(NULL, &itext, NULL, (struct IntuiText *)&ntext, 
                     0L, 0L, 400L, 60L);

         CloseLibrary(IntuitionBase);
      }

   }
}

// NAME:    FullName
// PURPOSE: get the full pathname of a file.
// NOTES:   Under AmigaDOS 2.0, use NameFromLock.
//          Under 1.3, we should do this ourselves, but instead we punt and 
//             just copy the incoming name over.

void FullName(BPTR parent, char *name, char *buf, int len)
{
   int i;
   if(V37)
   {
      if(NameFromLock(parent, buf, len-1))
      {
         i = strlen(buf);
         if(buf[i-1] != ':' && buf[i-1] != '/')
         {
            buf[i++] = '/';
            buf[i] = 0;
         }
      }
   }
   else
      i = 0;

   if(i < len-1) strncpy(buf+i, name, len-i-1);

   return;
}

#define READ(x,l) Read(Input(), x, l)

#define SEPS " \t\n="

struct ARGPARSE
{
   int argc;
   char **argv;
   char *cmdbuf;
   int cmdlen;
};

// NAME:    NextArg
// PURPOSE: Return the next command-line or WorkBench argument
// NOTES:   If invoked from the CLI, this just parses the incoming command-line
//             into tokens.
//          If invoked from WorkBench, this walks the WBArg list.
//          This function also implements the ? command-line option.

extern struct WBStartup *_WBenchMsg;

char *NextArg(struct ARGPARSE *ap)
{
   static struct WBStartup WBM;
   static char buf[256];
   static struct WBArg *wba;
   char *name;

   if(ap->argc == 0)
   {
      /* Workbench startup */
      if(_WBenchMsg == NULL) return(NULL);  // No WB arguments

      if(wba == NULL) 
      {
         /* This is the first time we have been called.    */
         /* Make a copy of the WBenchMsg and set up wba so */
         /* we can use it to traverse all the arguments.   */
         WBM = *_WBenchMsg;
         WBM.sm_NumArgs--;
         wba = WBM.sm_ArgList;
         dirchanged = 1;
         oldcurdir = CurrentDir(wba->wa_Lock);
         if(!stricmp(wba->wa_Name, "Find"))
         {
            /* They clicked on a "Find" icon in a directory */
            /* Pretend that's the location of the actual program */
            wba++;
            WBM.sm_NumArgs--;
         }
      }

      if(WBM.sm_NumArgs <= 0) return(NULL);  // No WB arguments

      wba++;                   // Advance to the next argument
      WBM.sm_NumArgs--;  // Reduce the argument count

      if(!strcmp(wba->wa_Name, "Find"))
      {
         /* This is the WB icon for "Find", so ignore it */
         if(!dirchanged)
         {
            dirchanged = 1;
            oldcurdir = CurrentDir(wba->wa_Lock);
         }
         else
            CurrentDir(wba->wa_Lock);
         wba++;
         WBM.sm_NumArgs--;
         if(WBM.sm_NumArgs <= 0) return(NULL);
      }

      /* Get the full pathname of the argument into 'buf' */
      FullName(wba->wa_Lock, wba->wa_Name, buf, sizeof(buf));

      /* Allocate memory to store the argument name */
      name = myalloc(strlen(buf)+1);
      strcpy(name, buf);

      return(name);
   }
   else if(ap->argc == -1)
   {
      /* We previously did a ? operation and the user entered data */
      /* This data is now all set up to use as our "command line"  */
      /* so just call strtok() to get the next token.              */
      return(strtok(NULL, SEPS));
   }
   else if(ap->argc < 2)
   {
      /* Some kind of weird error.  This should never happen. */
      return(NULL);
   }
   else
   {
      /* Normal, everyday CLI command-line argument. */
      /* Use argc and argv to get it.                */
      ap->argc--;
      ap->argv++;
      if(ap->argc == 1 && !strcmp("?", ap->argv[0]))
      {
         // They want help; give it to them.
         msg("PATTERN/K/A,FILES/M: ");
         if(READ(ap->cmdbuf, ap->cmdlen) <= 0) return((char *)-1);

         ap->argc = -1;  // Indicates that from now on, we are to use strtok
                         // to get arguments instead of argc, argv

         return(strtok(ap->cmdbuf, SEPS));
      }
      else
      {
         // No help requested, just return the current argument
         return(ap->argv[0]);
      }
   }
   // No return necessary since all cases above have a return
}

// NAME:    query
// PURPOSE: query the user for input
// NOTES:   Opens a CON: window the first time it is called.
//          Does not close the CON: window until it is called
//             with a NULL prompt argument.  This prevents annoying
//             multiple popup CON: windows.

char *query(char *prompt)
{
   static BPTR qwin;
   int i;
   char tmpbuf[256];
   char *reslt = NULL;

   if(!prompt)
   {
      // Null prompt string means close the window.
      if(qwin) Close(qwin);
      qwin = NULL;
      return(NULL);
   }

   // Open the window if necessary
   if(qwin || (qwin=Open("CON:0/0/450/100/SMFind", MODE_NEWFILE)))
   {
      Write(qwin, prompt, strlen(prompt));
      i = Read(qwin, tmpbuf, sizeof(tmpbuf));
      if(i > 1)
      {
         tmpbuf[i-1] = 0;
         reslt = myalloc(strlen(tmpbuf)+1);
         strcpy(reslt, tmpbuf);
      }
   }

   return(reslt);
}

// Copy the "from" string to the "to" string
// Return the address of the first unused byte in the "to" string
static char *updatestr(char *to, char *from)
{
   int i;
   i = strlen(from);
   memcpy(to, from, i);
   return(to+i);
}

// Create a temporary filename
char *tmpnam(char *s)
{
   int i;
   char *tmpptr;
   BPTR lock;

   strcpy(s, "T:TMPsmfind0");
   tmpptr = s + 11;
   for(i=0; i<10; i++)
   {
      *tmpptr = '0' + i;
      if(lock=Lock(s, SHARED_LOCK))
         UnLock(lock);
      else if(IoErr() == ERROR_OBJECT_NOT_FOUND)
         return(s);
   }
   return(NULL);
}

int main(int argc, char *argv[])
{
   char *pattern;
   static char tmpfile[BSIZ];
   char cmdbuf[256];
   BPTR fh1, fh2;
   struct ARGPARSE ap;
   char *arg;
   char *tmpptr;

   // Set up the argument parsing structure
   ap.argc = argc;
   ap.argv = argv;
   ap.cmdbuf = cmdbuf;
   ap.cmdlen = sizeof(cmdbuf);

   if(argc == 0)
   {
      /* Invoked from WorkBench - query user for pattern */
      pattern = query("Enter search string: ");
   }
   else
   {
      pattern = NextArg(&ap);
      if(pattern && !stricmp(pattern, "pattern"))
         pattern = NextArg(&ap);
   }
   if(!pattern)
   {
      // No pattern specified - error exit
      query(NULL);  // Close query window if open

      usage:
      if(Output())
         msg("USAGE: smfind <pattern> <file> [<file>...]\n");
      return(20);
   }

   if(!(arg=NextArg(&ap)) && argc == 0)
   {
      arg = query("Enter file or file pattern: ");
   }

   query(NULL);  // Close query window if open

   // If no files specified, it's an error
   if(!arg) goto usage;

   // Clear the results of the last SMFIND run from SCMSG
   ClearSCMSG("smfind");

   while(arg)
   {
      // Create a new temporary filename
      if(!tmpnam(tmpfile))
      {
         if(Output())
            msg("ERROR: Can't create temporary file\n");
         break;
      }

      // Execute the sc:c/grep command, redirecting its output to
      // our temporary file
      tmpptr = updatestr(buf, "sc:c/grep >");
      tmpptr = updatestr(tmpptr, tmpfile);
      *(tmpptr++) = ' ';
      tmpptr = updatestr(tmpptr, pattern);
      *(tmpptr++) = ' ';
      tmpptr = updatestr(tmpptr, arg);
      *tmpptr = 0;

      fh1 = Open("nil:", MODE_NEWFILE);
      fh2 = Open("nil:", MODE_NEWFILE);
      Execute(buf, fh1, fh2);
      Close(fh1);
      Close(fh2);

      // Parse the results of the grep command, looking for
      // filenames and line numbers
      ParseFile(tmpfile, arg);

      // Get rid of the temporary file
      DeleteFile(tmpfile);

      // Move on to the next file
      arg = NextArg(&ap);
   }
   return(0);
}

// NAME:    ParseFile
// PURPOSE: Read grep output and generate SCMSG entries for the lines found
// NOTES:   grep output contains a filename followed by all the entries for
//             that file.  The file's entries are each preceded by a line number.

int ParseFile(char *file, char *pattern)
{
   BPTR fh;
   int curline;
   int i, j;
   static char curfile[BSIZ];

   if(!(fh=Open(file, MODE_OLDFILE)))
      return(1);

   strcpy(curfile, pattern);
   while(GetLine(fh, buf, sizeof(buf)))
   {
      // Skip leading blanks
      for(i=0; buf[i] == ' '; i++);

      if(i == 0)
      {
         // No leading blanks indicates that this is a new filename
         for(j=0; i<sizeof(buf) && buf[i] != '\n' && buf[i]; i++, j++)
            curfile[j] = buf[i];
         curfile[j-1] = 0;  // Chop off the trailing ':'
      }
      else
      {
         // Not a filename, so it's a line number and text

         i += stcd_i(buf+i, &curline) + 1;  // Read the line number, skip the ':'

         // Copy the line text
         for(j=i; buf[j] && buf[j] != '\n'; j++)
            if(buf[j] == '\t') buf[j] = ' ';

         buf[j] = 0;  // Null terminate it

         // Install the new occurrence in SCMSG
         AddSCMSG("smfind", curfile, curline, buf+i);
      }
   }

   Close(fh);

   return(0);
}

/* Equivalent of fgets() for AmigaDOS file handles */
/* Works under 1.3 and 2.0 */
int GetLine(BPTR fh, char *buf, int buflen)
{
   static char iobuf[256];
   static int iocur, iomax;
   int maxcopy;

   buflen--;
   while(buflen)
   {
      if(iocur >= iomax)
      {
         iomax = Read(fh, iobuf, sizeof(iobuf));
         if(iomax <= 0)
            return(0);
         iocur = 0;
      }

      if(iomax-iocur > buflen)
         maxcopy = iocur+buflen;
      else
         maxcopy = iomax;

      for(; iocur<maxcopy; iocur++, buflen--, buf++)
      {
         if((*buf = iobuf[iocur]) == '\n')
         {
            iocur++;
            buf[1] = 0;
            return(1);
         }
      }
   }
   *buf = 0;
   return(1);
}
