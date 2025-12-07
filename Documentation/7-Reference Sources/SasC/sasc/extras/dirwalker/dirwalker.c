#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <proto/dos.h>
#include <proto/exec.h>
#include <dos.h>

#include "dirwalker.h"

#define PATHMAX 512

struct DWSTATE
{
   char path[PATHMAX+1];
   int  pathmax;
   int  pathcur;
   int (*dirfunc)(char *path, char *name);
   int (*filefunc)(char *path, char *name);
};

static int walkdir(BPTR lock, struct DWSTATE *dws);

int dirwalker(char *name, 
              int (*dirfunc)(char *path, char *dir), 
              int (*filefunc)(char *path, char *file))
{
   BPTR lock = NULL;
   struct DWSTATE *dws;
   int rc;
   struct FileInfoBlock *fib = NULL;

   if(!(dws=AllocMem(sizeof(*dws), 0))) return(-1);

   dws->path[0]  = 0;
   dws->pathcur  = 0;
   dws->pathmax  = PATHMAX;
   dws->dirfunc  = dirfunc;
   dws->filefunc = filefunc;

   if(name) 
   {
      if(!(fib = AllocMem(sizeof(*fib), 0)) ||
         !(lock = Lock(name, SHARED_LOCK)))
      {
         rc = -1;
         goto cleanup;
      };
      Examine(lock, fib);
      if(fib->fib_DirEntryType <= 0)
      {
         rc = -1;  /* File, not directory */
         goto cleanup;
      }
   }
   else
      CurrentDir(DupLock(lock=CurrentDir(NULL)));

   rc = walkdir(lock, dws);

cleanup:
   FreeMem(dws, sizeof(*dws));
   if(fib) FreeMem(fib, sizeof(*fib));
   if(lock) UnLock(lock);
   return(rc);
}

static int walkdir(BPTR lock, struct DWSTATE *dws)
{
   struct FileInfoBlock *fib;
   BPTR dirlock, odir;
   int i;
   int pathcur = dws->pathcur;

   fib = AllocMem(sizeof(struct FileInfoBlock), 0);
   odir = CurrentDir(lock);

   if(Examine(lock, fib))
   {
      i = strlen(fib->fib_FileName);
      if(i+1+dws->pathcur < dws->pathmax)
      {
         strcpy(dws->path+dws->pathcur, fib->fib_FileName);
         dws->pathcur += i;
         dws->path[dws->pathcur++] = '/';
         dws->path[dws->pathcur] = 0;
      }
      else
      {
         if(dws->pathcur > PATHMAX-3) dws->pathcur = PATHMAX-3;
         strcpy(dws->path+dws->pathcur, "...");
         dws->pathcur = PATHMAX;
      }
      while(ExNext(lock, fib))
      {
         if(fib->fib_DirEntryType > 0)
         {
            dirlock = Lock(fib->fib_FileName, SHARED_LOCK);
            if(dws->dirfunc && 
                 (*dws->dirfunc)(dws->path, fib->fib_FileName))
            {
               i = -1;
               goto cleanup;
            }
            else
               i = walkdir(dirlock, dws);
            UnLock(dirlock);
            if(i < 0) goto cleanup;
         }
         else if(fib->fib_DirEntryType < 0)
         {
            if(dws->filefunc)
               if((*dws->filefunc)(dws->path, fib->fib_FileName))
               {
                  i = -1;
                  goto cleanup;
               }
         }
      }
   }
   if((i=IoErr()) != ERROR_NO_MORE_ENTRIES && i)
      poserr(dws->path);
   else
      i = 0;

cleanup:
   FreeMem(fib, sizeof(struct FileInfoBlock));
   CurrentDir(odir);
   dws->pathcur = pathcur;
   dws->path[dws->pathcur] = 0;

   return(i);
}
