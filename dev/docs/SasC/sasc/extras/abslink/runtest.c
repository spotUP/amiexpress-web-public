
#define __USESYSBASE
#include <exec/types.h>
#include <exec/execbase.h>
#include <exec/memory.h>
#include <dos/dosextens.h>
#include <dos/rdargs.h>
#include <dos/dostags.h>
#include <stdarg.h>

#include <string.h>

#include <proto/dos.h>
#include <proto/exec.h>

#define TEMPLATE "FILE/A"
#define OPT_FILE 0

#define OPT_COUNT 1

#define MSG(x) Write(Output(),x,strlen(x))

int mysprintf(char *buffer, char *ctl, ...);

static char obuf[80];

int getfilesize(STRPTR);

struct DosLibrary *DOSBase;

/* Note: Since we link with no startup, this is where execution */
/* begins.  Don't try to run this program from the WorkBench!   */
int __saveds dotest(void)
{
   int i, memsize;
   long opts[OPT_COUNT];
   struct RDArgs *rdargs;
   BPTR fp = 0L;
   void *mem = NULL;
   int (* __asm func)(register __a0 char *arg);
   
   DOSBase = (struct DosLibrary *)OpenLibrary("dos.library", 37L);

   if(!DOSBase)
   {
      if(DOSBase = (struct DosLibrary *)OpenLibrary("dos.library", 0L))
      {
         MSG("Requires AmigaDOS 2.0 or higher\n");
         CloseLibrary(DOSBase);
      }
      return 20;
   }

   if(!(rdargs = ReadArgs(TEMPLATE, opts, NULL)))
   {
      PrintFault(IoErr(), NULL);
      return(20);
   }

   if((memsize=getfilesize((STRPTR)opts[OPT_FILE])) < 0)
      goto cleanup;

retry:
   /* Note that this is only a GUESS as to the final size. */
   mem = AllocMem(memsize, 0);
   if(mem == NULL)
   {
      MSG("No memory!\n");
      goto cleanup;
   }

   mysprintf(obuf, "abslink %s t:abslink addr=%ld", opts[OPT_FILE], mem);
   MSG(obuf);
   MSG("\n");
   if(SystemTags(obuf, SYS_UserShell, -1, TAG_DONE))
   {
      MSG("abslink failed!\n");
      goto cleanup;
   }

   if((i=getfilesize("t:abslink")) > memsize)
   {
      /* Oops, our guess was wrong */
      MSG("RUNTEST guessed wrong mem size, trying again\n");
      FreeMem(mem, memsize);
      memsize = i;
      goto retry;
   }

   if(!(fp=Open("t:abslink", MODE_OLDFILE)))
   {
      MSG("Can't open abslink output file!\n");
      goto cleanup;
   }

   if(Read(fp, mem, i) <= 0)
   {
      PrintFault(IoErr(), "Can't read abslink file: ");
      goto cleanup;
   }

   Close(fp);
   fp = NULL;

#pragma msg 147 ignore
   func = mem;

   i = (*func)("test");
   mysprintf(obuf, "Return code is %d\n", i);
   MSG(obuf);

cleanup:

   if(mem) FreeMem(mem, memsize);

   if(fp) Close(fp);
   
   if(DOSBase) CloseLibrary(DOSBase);

   return 0;
}

int __aligned getfilesize(STRPTR file)
{
   BPTR lock;
   struct FileInfoBlock __aligned fib;

   if(!(lock = Lock(file, SHARED_LOCK)))
   {
      mysprintf(obuf, "Can't find file \"%s\"\n", file);
      PrintFault(IoErr(),obuf);
      return(-1);
   }

   if(!Examine(lock, &fib))
   {
      PrintFault(IoErr(),NULL);
      UnLock(lock);
      return(-1);
   }

   UnLock(lock);
   return fib.fib_Size;
}

int mysprintf(char *buffer, char *ctl, ...)
{
   va_list args;

   va_start(args, ctl);

   /*********************************************************/
   /* NOTE: The string below is actually CODE that copies a */
   /*       value from d0 to A3 and increments A3:          */
   /*                                                       */
   /*          move.b d0,(a3)+                              */
   /*          rts                                          */
   /*                                                       */
   /*       It is essentially the callback routine needed   */
   /*       by RawDoFmt.  THIS FILE MUST BE COMPILED WITH   */
   /*       THE -cs OPTION OR THIS CODE WILL NOT WORK ON    */
   /*       THE 68040 DUE TO INSTRUCTION CACHE!!!!!         */
   /*********************************************************/

   RawDoFmt(ctl, args, (void (*))"\x16\xc0\x4e\x75", buffer);

   va_end(args);

   return((int)strlen(buffer));
}
