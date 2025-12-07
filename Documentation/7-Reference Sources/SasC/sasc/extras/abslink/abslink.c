
#define __USE_SYSBASE 1

#include <exec/types.h>
#include <exec/execbase.h>
#include <exec/memory.h>
#include <dos/dosextens.h>
#include <dos/rdargs.h>

#include <string.h>
#include <ctype.h>
#include <stdarg.h>

#include <proto/dos.h>
#include <proto/exec.h>
#include "load.h"

#define TEMPLATE "EXE/A,OUT/A,ADDR=ADDRESS"
#define OPT_EXE  0
#define OPT_OUT  1
#define OPT_ADDR 2

#define OPT_COUNT 3

#define MSG(x) Write(Output(),x,strlen(x))

MODULE m;
int myprintf(char *ctl, ...);

unsigned long parsenum(char *n)
{
   long l;

   if(n[0] == '0' && toupper(n[1]) == 'X')
      stch_l(n+2, &l);
   else if(n[0] == '$')
      stch_l(n+1, &l);
   else
      stcd_l(n, &l);

   return (unsigned long)l;
}

int main(void)
{
   int i;
   long opts[OPT_COUNT];
   struct RDArgs *rdargs;
   unsigned long addr = 0L;
   BPTR fp;

   if(SysBase->LibNode.lib_Version < 37)
   {
      MSG("Requires AmigaDOS Version 2.0 or later\n");
      return 20;
   }

   memset(opts, 0, sizeof(opts));

   if(!(rdargs = ReadArgs(TEMPLATE, opts, NULL)))
   {
      PrintFault(IoErr(), NULL);
      return(99);
   }

   if(opts[OPT_ADDR]) addr = parsenum((char *)opts[OPT_ADDR]);

   if(i=Load(&m, (char *)opts[OPT_EXE], addr)) return 20;

   if(!(fp=Open((STRPTR)opts[OPT_OUT], MODE_NEWFILE)))
   {
      MSG("Can't open \"");
      MSG((APTR)opts[OPT_OUT]);
      MSG("\" for output\n");
      return(20);
   }

   for(i=0; i<m.hnum; i++)
      Write(fp, m.hunks[i].data, m.hunks[i].size*4);

   UnLoad(&m);

   Close(fp);

   return 0;
}

int myprintf(char *ctl, ...)
{
   char buffer[256];
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
