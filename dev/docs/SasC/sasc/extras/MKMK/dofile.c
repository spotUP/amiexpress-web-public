/* Copyright (c) 1993 SAS Institute, Inc, Cary, NC USA */
/* All Rights Reserved */

#include "mkmk.h"

char buf[1024];

// Add a dependancy to a file
void AddDep(struct FileDesc *fd, struct FileDesc *newfd)
{
   int i;

   if(fd == newfd) return;  // Trivial circular dependancy

   for(i=0; i<newfd->ndirect; i++)
   {
      if(newfd->Direct[i] == fd)
      {
         myfprintf(out, "Circular dependancy: \"%s\" and \"%s\"\n",
            fd->name, newfd->name);
         return;  // Circular dependancy
      }
   }

   if(fd->ndirect >= fd->adirect)
   {
      fd->adirect += 20;
      fd->Direct = realloc(fd->Direct, fd->adirect*sizeof(struct FileDesc *));
      if(!fd->Direct) panic("No Memory!\n");
   }
   fd->Direct[fd->ndirect++] = newfd;
}

// Allocate memory and copy a string to it
char *scopy(char *s)
{
   char *t;
   t = malloc(strlen(s)+1);
   if(!t) panic("No Memory!\n");
   strcpy(t, s);
   return t;
}

// Get dependancies for a single file
void DoFile(struct FileList *fl, struct FileDesc *fd)
{
   BPTR fp;
   char *s, *t;
   struct FileDesc *newfd;

   myfprintf(out, "Processing \"%s\"\n", fd->name);

   if(!(fp = Open(fd->name, MODE_OLDFILE)))
   {
      myfprintf(out, "Can't open file \"%s\"!\n", fd->name);
      return;
   }

   while(FGets(fp, buf, sizeof(buf)))
   {
      if(!memcmp(buf, "#include ", sizeof("#include")))
      {
         for(t=buf+sizeof("#include"); *t && *t == ' '; t++);
         if(*t != '"') continue;
         s = ++t;
         for(; *t && *t != '"'; t++);
         *t = 0;
         newfd = AddFile(fl, scopy(s));
         AddDep(fd, newfd);
      }
   }

   Close(fp);   
}
