/* Copyright (c) 1993 SAS Institute, Inc, Cary, NC, USA */
/* All Rights Reserved. */

#include <proto/exec.h>
#include <proto/dos.h>
#include <string.h>

char *first;
char *second;
int check = 5;

/* Can't use printf since it is not reentrant and will crash */
/* your machine if you make the non-cres version of this     */
/* program resident as per the instructions.                 */

static int myprintf(char *ctl, ...);

int main(int argc, char *argv[])
{
   first = argv[0];

   if (argc > 1)
   {
      second = argv[1];
   }
   else
   {
      second = "<Not Given>";
   }

   myprintf("You named me \"%s\", and my first parameter is \"%s\"\n",
            first, second);

   if (check == 5)
   {
      myprintf("Everything checks O.K.!\n");
   }
   else
   {
      myprintf("Something's wrong!  'check' = %ld\n", check);
   }

   check = *second;
}

static int myprintf(char *ctl, ...)
{
   long *arg1;
   char buffer[256];

   arg1 = (long *)(&ctl + 1);
   RawDoFmt(ctl, arg1, (void (*))"\x16\xc0\x4e\x75", buffer);
   Write(Output(), buffer, strlen(buffer));

   return 0;
}
