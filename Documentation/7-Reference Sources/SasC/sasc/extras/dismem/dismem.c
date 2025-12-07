
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

#define HEADER  "      section text,code\n"
#define TRAILER "      END\n"

int mysprintf(char *buffer, char *ctl, ...);

int __saveds dismem(void)
{
   int i, j;
   BPTR lock = 0L;
   long opts[OPT_COUNT];
   struct RDArgs *rdargs;
   BPTR fp = 0L, ofp = 0L;
   long buf[256];
   char obuf[80];
   struct Library *DOSBase = OpenLibrary("dos.library", 36L);

   if(!DOSBase) return 20;

   if(!(rdargs = ReadArgs(TEMPLATE, opts, NULL)))
   {
      PrintFault(IoErr(), NULL);
      return(20);
   }

   if(!(fp=Open((STRPTR)opts[OPT_FILE], MODE_OLDFILE)))
   {
      PrintFault(IoErr(), NULL);
      return(20);
   }

   if(!(ofp=Open("t:dismem.a", MODE_NEWFILE)))
   {
      PrintFault(IoErr(),NULL);
      goto cleanup;
   }

   Write(ofp, HEADER, strlen(HEADER));

   while((i=Read(fp,buf,sizeof(buf))) > 0)
   {
      if(i<0)
      {
         PrintFault(IoErr(), NULL);
         goto cleanup;
      }
      for(j=0, i/=4; j<i; j++)
      {
         mysprintf(obuf, "      dc.l $%08lx\n", buf[j]);
         Write(ofp, obuf, strlen(obuf));
      }
   }

   Write(ofp, TRAILER, strlen(TRAILER));

   Close(ofp);
   ofp = NULL;

   lock = CurrentDir(Lock("T:", SHARED_LOCK));

   i = SystemTags("asm dismem.a", SYS_UserShell, -1, TAG_DONE);

   UnLock(CurrentDir(lock));

   if(i)
   {
      MSG("Assembler failed!\n");
      goto cleanup;
   }

   if(SystemTags("omd t:dismem.o >dismem.omd", SYS_UserShell, -1, TAG_DONE))
   {
      MSG("OMD failed!\n");
      goto cleanup;
   }

   MSG("Output is in \"dismem.omd\"\n");

cleanup:

   if(ofp) Close(ofp);

   if(fp) Close(fp);

   return 0;
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
   /*       by RawDoFmt.                                    */
   /*********************************************************/

   RawDoFmt(ctl, args, (void (*))"\x16\xc0\x4e\x75", buffer);

   va_end(args);

   return((int)strlen(buffer));
}

