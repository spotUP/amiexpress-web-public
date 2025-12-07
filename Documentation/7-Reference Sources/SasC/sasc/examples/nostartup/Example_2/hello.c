#include <string.h>
#include <proto/dos.h>
#include <proto/exec.h>

#define MSG "Hello, World!\n"

void hello(void)
{
   struct DosLibrary *DOSBase = 
                      (struct DosLibrary *)OpenLibrary("dos.library", 0L);

   Write(Output(), MSG, strlen(MSG));

   CloseLibrary((struct Library *)DOSBase);
}
