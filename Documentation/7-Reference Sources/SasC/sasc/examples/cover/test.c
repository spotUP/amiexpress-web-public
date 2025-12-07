#include <stdio.h>
#include <stdlib.h>

int test2(int);

int main(int argc, char *argv[])
{
   int num;

   if(argc<2)
   {
      fprintf(stderr, "USAGE: test <number>\n");
      exit(20);
   }

   num = atoi(argv[1]);
   if(num < 0)
   {
      printf("Number is negative\n");
   }
   else if(num<10)
   {
      printf("0 <= Number < 10\n");
   }
   else if(num <100)
   {
      printf("10 <= Number < 100\n");
   }
   else
   {
      printf("Number >= 100\n");
   }

   test2(num);

   return(0);
}