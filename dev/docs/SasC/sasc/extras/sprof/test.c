#include <stdio.h>

#define FACTOR 1

#define CALL(func,x) for(i=0; i<((x)*FACTOR); i++) (func)();

#define DELAY for(i=0; i<100*FACTOR; i++)

static void f100static(void)
{
   int i;
   DELAY;
}

void f100(void)
{
   //int i;
   //DELAY;
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

void f3x100(void)
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

#if !SMALLTEST
int main(int argc, char *argv[])
{
   int i;
   //for(i=0; i<argc; i++) printf("%s\n", argv[i]);
   //printf("Hit a character, then RETURN: ");
   //scanf("\n", &i);
   CALL(f100static, 100);
   CALL(f100,100);
   CALL(f200,200);
   CALL(f300,300);
   CALL(f3x100,3);
   CALL(f100x3,100);
   return(0);
}

#else
int main(int argc, char *argv[])
{
   int i;
   for(i=0; i<argc; i++) printf("%s\n", argv[i]);
   f100();
   f200();
   f300();
   return 0;
}
#endif
