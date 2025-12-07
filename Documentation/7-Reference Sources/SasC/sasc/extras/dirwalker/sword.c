#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <proto/dos.h>
#include <proto/exec.h>
#include <dos.h>
#include <ctype.h>

#include "dirwalker.h"

char extbuf[FESIZE+1];

#define ISEXT(x) !stricmp(extbuf, x)

char *word;

char *skipexts[] =
{
   "o", "map", "exe", "nd", "info", NULL
};

int doext(char *ext)
{
   int i;
   for(i=0; skipexts[i]; i++)
      if(!stricmp(skipexts[i], ext)) return(0);
   return(1);
}

int isbinary(char *name)
{
   BPTR fh;
   int i;
   char buf[32];

   if(!(fh=Open(name, MODE_OLDFILE))) return(0);
   i = Read(fh, buf, sizeof(buf));
   Close(fh);

   for(i--; i>=0; i--)
   {
      if(!isprint(buf[i]) && !isspace(buf[i]))
         return(1);
   }

   return(0);
}

int doabort;

void chkabort(void)
{
   if(SetSignal(0,0) & (SIGBREAKF_CTRL_C|SIGBREAKF_CTRL_D))
   {
      Write(Output(), "***Break", 8);
      doabort = 1;
   }
}

int filefunc(char *path, char *name)
{
   char cmdbuf[256];

   chkabort();
   if(doabort) return(1);

   stcgfe(extbuf, name);

   if(!doext(extbuf)) return(0);

   if(isbinary(name)) return(0);

   printf("%s%s\n", path, name);
   sprintf(cmdbuf, "search quick %s %s", name, word);
   // printf("%s\n", cmdbuf); /* For debugging */

   Execute(cmdbuf, NULL, Output());

   return(0);
}

void main(int argc, char *argv[])
{
   char *dir = NULL;

   while(argc > 1)
   {
      if(!word) word = argv[1];
      else if(!dir) dir = argv[1];
      else
      {
         usage:
            fprintf(stderr, "sword - search for word in all text files\n");
         fprintf(stderr, "USAGE: sword <word> [dir]\n");
        exit(99);
      }
      argc--, argv++;
   }
   if(!word) goto usage;
   if(!dir) dir = "";

   dirwalker(dir, NULL, filefunc);
}
