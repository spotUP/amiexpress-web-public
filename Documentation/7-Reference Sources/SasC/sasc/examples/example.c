#include <stdio.h>
#include <math.h>
#include <proto/dos.h>

int main(void)
{
   int i=42;
   double d$,d;

   d=i/2;
   d$=2;
   printf("i = %d, d=%2.1f\n",i,d);
   Delay(60);
   return(0);
}

