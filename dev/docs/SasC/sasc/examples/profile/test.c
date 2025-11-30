/* Example program for demonstrating profiling */

#include <string.h>
#include <stdio.h>
#include <sprof.h>
#include <dos.h>

int factor = 10;

#define CALL(func,x) for(i=0; i<(x); i++) (func)();

#define DELAY {__chkabort(); for(i=0; i<100*factor; i++);}

static void f100static(void)
{
   int i;
   DELAY;
}

void f100(void)
{
   int i;
   DELAY;
}

void f100b(void)
{
   int i;
   DELAY;
}

void f100c(void)
{
   int i;
   DELAY;
}

void f200(void)
{
   int i;
   DELAY;
}

void f300(void)
{
   int i;
   DELAY;
}

void f30x100(void)
{
   int i;
   CALL(f100b,100);
}

void f100x3(void)
{
   f100c();
   f100c();
   f100c();
}

int main(int argc, char *argv[])
{
   int i;
   if(argc > 1)
   {
      stcd_i(argv[1], &factor);
      if(factor <= 0) factor = 10;
      PROFILE_OFF();
      /* These statements doesn't count when profiling with SPROF */
      printf("Using delay factor of %d\n", factor);
      printf("Hit RETURN to continue: ");
      getch();
      printf("Continuing...\n");
      PROFILE_ON();
   }
   CALL(f100static, 100);
   CALL(f100,100);
   CALL(f200,200);
   CALL(f300,300);
   CALL(f30x100,30);
   CALL(f100x3,100);
   return(0);
}
