#include <proto/dos.h>
#include <proto/exec.h>
#include <string.h>

int x = 5;
int y;

void print(char *);

int __saveds main(void)
{
   print("Hello, World!\n");
   if(x != 5) print("x != 5!\n");
   else       print("x is ok\n");
   if(y != 0) print("y != 0!\n");
   else       print("y is ok\n");
   return(x);
}

void print(char *string)
{
   struct Library *DOSBase;

   DOSBase=OpenLibrary("dos.library", 0L);
   Write(Output(), string, strlen(string));
   CloseLibrary(DOSBase);
}

