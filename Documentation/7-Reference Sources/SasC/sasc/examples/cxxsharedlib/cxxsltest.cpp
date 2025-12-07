#include <iostream.h>
#include "cxxsharedlib.h"
#include <proto/exec.h>

struct Library *FOOBase;
#define FOONAME "foo.library"

int _STI_4500_foo(void)
{
   FOOBase = OpenLibrary((unsigned char *)FOONAME, 0L);
   if(FOOBase == NULL)
   {
      /*************************************************/
      /* Note: We must use printf(), not cout, because */
      /*       the iostreams library hasn't yet been   */
      /*       initialized when this code is called.   */
      /*       iostreams is initialized at priority    */
      /*       4990, and we're running at priority     */
      /*       4500.                                   */
      /*************************************************/
      printf("Can't open library \"" FOONAME "\"\n");
      return -1;
   }
   printf("Library \"" FOONAME "\" opened\n");
   return 0;
}

void _STD_4500_foo(void)
{
   if(FOOBase) 
   {
      CloseLibrary(FOOBase);
      FOOBase = NULL;
      /* Use printf since iostreams has already been terminated */
      printf("Library \"" FOONAME "\" closed\n");
   }
}


FOO bar(20);

int main(void)
{
   FOO foo(10);
   bar.foofunc(2);
   bar.foofunc("Hello, this is bar");
   foo.foofunc(4);
   foo.foofunc("Hello, this is foo");
   return 0;
}
