#include <proto/dos.h>
#include <stdio.h>

int b = 0;

__asm __saveds LIBtest1(void)
{
   printf("test1 called!\n");

   Delay(50);  // Delay for a little while to give the profiler
               // something to measure.

   printf("test1 exiting!\n");

   return(b);
}

__asm __saveds LIBtest2(register __d1 int a)
{
   printf("test2 called, parameter %d!\n", a);
   Delay(25);  // Delay half as long as test1
   b = a;
   printf("test2 exiting!\n");
   return(b);
}
