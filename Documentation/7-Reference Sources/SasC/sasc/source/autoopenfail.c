#include <proto/dos.h>
#include <proto/exec.h>
#include <string.h>

extern struct WBStartup *_WBenchMsg;
extern char __stdiowin[];
extern long __oslibversion;

void __regargs __autoopenfail(char *lib)
{
   struct DOSBase *DOSBase;
   long fh;
   char buf[50];
   
   DOSBase = (struct DOSBase *)OpenLibrary("dos.library",0);
   if (_WBenchMsg == NULL)
      fh = Output();
   else
      fh = Open(__stdiowin, MODE_NEWFILE);

   if (fh)
   {
       RawDoFmt("Can't open version %ld of ",
                &__oslibversion, (void (*))"\x16\xC0\x4E\x75", buf);
   
       Write(fh, buf, strlen(buf));
       Write(fh, lib, strlen(lib));
       Write(fh, "\n", 1);
   
       if (_WBenchMsg)
       {
           Delay(200);
           Close(fh);
       }
   }   

   
   CloseLibrary((struct Library *)DOSBase);
   ((struct Process *)FindTask(NULL))->pr_Result2 = 
                      ERROR_INVALID_RESIDENT_LIBRARY;

}
