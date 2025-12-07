/* Example program that uses the functions define in process.c */

#include "process.h"

long process1(void)
{
   long out;
   char buff[1];
   char *a;
   
   /* Cause an enforcer hit */
   a = NULL;
   *a = 0;

   out = Open("CON:10/120/520/80/New Process 1", MODE_OLDFILE);
   if (out == NULL) return -1;

   Write(out, "Hit Return to Close Window\n", 27);
   Read(out, buff, 1);

   Close(out);
   return 1;
}


main(argc, argv)
int argc;
char *argv[];
{
   struct ProcMsg *start_msg1;
   long ret;
   
   /* Start process 1 */
   start_msg1 = start_process(process1, 0, 4000);
   if (start_msg1 == NULL)
   {
      printf("Can't start process 1\n");
      exit(1);
   }
   
   /* Wait for processes to finish */
   ret = wait_process(start_msg1);
   printf("Return from process 1 is %d\n",ret);

   exit(0);
}


