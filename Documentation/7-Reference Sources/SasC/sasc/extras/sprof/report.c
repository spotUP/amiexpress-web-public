/*-------------------------------------------------------------------*/
/* Copyright (c) 1993 by SAS Institute Inc., Cary NC                 */
/* All Rights Reserved                                               */
/*                                                                   */
/* SUPPORT:    walker - Doug Walker                                  */
/* HISTORY:    action                                   date   name  */
/*   Dont increment count for functions still on stack 31Aug93  hlc  */
/*-------------------------------------------------------------------*/
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <time.h>
#include <exec/ports.h>
#include <dos/dosextens.h>
#include <proto/exec.h>
#include <proto/dos.h>
#include "sprofpriv.h"

extern char nullid[];

extern char *process_status;

static int GetNumCols(int num)
{
   int i;

   if(num <= 0)
      i = 1, num = -num;
   else
      i = 0;

   while(num)
   {
      i++;
      num /= 10;
   }
   return(i);
}

static int GPByTime_array(struct GPInfo **a, struct GPInfo **b)
{
   return((*a)->time < (*b)->time ? 1 : (*a)->time > (*b)->time ?  -1 : 0);
}

void Report(sptime now)
{
   int i, j;
   int maxlen = 0;
   int maxcount = 0;
   long maxtot = 0;
   long maxtime;
   double sumtime;
   double inctime;
   double cumtime;
   sptime elapsed, subelapsed;
   struct GPInfo **rptGPInfo;
   struct GPInfo *gpi;
   int rptGPCur, rptGPMax;

   rptGPCur = GPCur;
   rptGPMax = GPMax;

   if(GPMax)
   {
      if((rptGPInfo = malloc(sizeof(struct GPInfo *)*rptGPMax)) == NULL)
      {
         printf("Out of memory, cannot produce report!\n");
         return;
      }

      memcpy(rptGPInfo, GPInfo, sizeof(struct GPInfo *)*rptGPCur);
   }
   else
      rptGPInfo = NULL;

   /* Accumulate data for functions that are still on the stack */
   subelapsed = 0;
   for(i=spcur-1; i>=0; i--)
   {
      elapsed = now - spdat[i].clk;
      if(spdat[i].id && spdat[i].id != nullid && 
           (gpi = FindGPI(&rptGPInfo, spdat[i].id,
                                       &rptGPCur, &rptGPMax)))
      {

         gpi->time += (elapsed - spdat[i].subrs - subelapsed);
         gpi->tottime += elapsed;
      }
      subelapsed = elapsed;
   }

   printf("\nSPROF Report\nStatus: %s\n", process_status);
   if(!rptGPCur) return;

   qsort(rptGPInfo, rptGPCur, sizeof(struct GPInfo *), 
         (int (*)(void *, void *))GPByTime_array);

   sumtime = cumtime = 0.0;
   for(i=0; i<rptGPCur; i++)
   {
      if(!rptGPInfo[i]->count) continue;

      if((j=strlen(rptGPInfo[i]->name)) > maxlen)
         maxlen = j;
      if(rptGPInfo[i]->count > maxcount)
         maxcount = rptGPInfo[i]->count;
      if(rptGPInfo[i]->tottime > maxtot)
         maxtot = rptGPInfo[i]->tottime;
      sumtime += rptGPInfo[i]->time;
   }

   /* Determine number of columns in each field */
   maxcount = GetNumCols(maxcount);
   maxtime  = GetNumCols((long)sumtime);
   maxtot   = GetNumCols(maxtot);

   /* Make sure the column headers fit */
   if(maxlen < 4)   maxlen = 4;
   if(maxcount < 5) maxcount = 5;
   if(maxtime < 5)  maxtime = 5;
   if(maxtot < 5)   maxtot = 5;

   printf("%-*s %*.*s %*.*s %*.*s Pct\n", 
               maxlen,  "Name", 
      maxcount,maxcount,"Count",
      maxtot, maxtot,   "ITime",
      maxtime, maxtime, "ETime");
   for(i=0; i<rptGPCur; i++)
   {
      if(!rptGPInfo[i]->count) continue;

      inctime = rptGPInfo[i]->time*100.0/sumtime;
      cumtime += inctime;;
      printf("%-*s %*ld %*ld %*ld %5.1f\n", 
                 maxlen,   rptGPInfo[i]->name,
                 maxcount, rptGPInfo[i]->count, 
                 maxtot,   rptGPInfo[i]->tottime,
                 maxtime,  rptGPInfo[i]->time,
                 inctime);
   }
   printf("%*s %*s %*s %*.*s -----\n",
      maxlen, "", maxcount, "", maxtot, "", maxtime, maxtime, "---------------");
   printf("%*s %*s %*s %*lu %4.1f\n", 
      maxlen, "", maxcount, "", maxtot, "", maxtime, 
      (unsigned long)sumtime, cumtime);

   free(rptGPInfo);
}
