#include <proto/dos.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "load.h"

int myprintf(char *ctl, ...);

void UnLoad(MODULE *p)
{
   int i;
   HUNK *h;
   for(i=0, h=p->hunks; i<p->hnum; i++, h++)
   {
      if(h->size)
         free(h->data);
   }

   memset(p, 0, sizeof(p));
}

static int GetLong(BPTR fp, long *res)
{
   long l;
   int rc;

   if(res == NULL) res = &l;

   rc = FRead(fp, res, 4, 1);

   if(rc < 0) return(99);

   if(rc == 0) return(-1);

   return(0);
}

static int Skip(BPTR fp, long count)
{
   char buf[256];
   long amt;
   while(count)
   {
      amt = count > sizeof(buf) ? sizeof(buf) : count;
      if(FRead(fp, buf, 1, amt) <= 0) return(-1);
      count -= amt;
   }
   return(0);
}

static int SkipNBlock(BPTR fp)
{
   int rc;
   int count;

   if(FRead(fp, &count, 4, 1) <= 0) return(-1);

   if(rc=Skip(fp, count*4))
      return(rc);

   return(count);
}

static int SkipSymbolInfo(BPTR fp)
{
   long namelen;
   int nsymbols = 0;

   while(1)
   {
      if(GetLong(fp, &namelen))
         return(-1);

      if(namelen == 0)
         return(nsymbols);

      if(namelen & 0xff000000)
      {
         myprintf("ERROR: Bad symbol hunk header 0x%08lx\n", namelen);
         return(-1);
      }

      nsymbols++;

      if(Skip(fp, namelen*4))
         return(-1);

      if(GetLong(fp, NULL))   /* Symbol location */
         return(-1);
   }
}

static int GetHunkHeader(MODULE *p, BPTR fp, unsigned long addr)
{
   long l;
   int i;
   char *reason = NULL;

   if(GetLong(fp, &l) || l != HUNK_HEADER)
   {
      reason = "No HUNK_HEADER";
      goto badfile;
   }

   while(SkipNBlock(fp) > 0);

   if(GetLong(fp, &p->hnum) || p->hnum<=0)
   {
      reason = "Can't read hunk table size";
      goto badfile;
   }

   GetLong(fp, NULL);
   GetLong(fp, NULL);  // First and last hunks

   if(!(p->hunks = malloc(p->hnum*sizeof(HUNK))))
   {
      reason = "Out of memory\n";
      goto badfile;
   }

   memset(p->hunks, 0, p->hnum*sizeof(HUNK));

   for(i=0; i<p->hnum; i++)
   {
      if(GetLong(fp, &p->hunks[i].size))
      {
         reason = "Can't read hunk size table";
         goto badfile;
      }
      if(!(p->hunks[i].data = malloc(p->hunks[i].size*4)))
      {
         reason = "Out of memory";
         goto badfile;
      }
      p->hunks[i].addr = addr;
      addr += p->hunks[i].size*4;
   }

   return(0);

   badfile:
   myprintf("ERROR: File could not be loaded\n");
   if(reason) myprintf("       %s\n", reason);

   return(99);
}

static int DoRelocs(MODULE *p, BPTR fp)
{
   long count, ocount;
   long offset, loc;
   char *data;

   if(GetLong(fp, &ocount)) return(-1);

   if(ocount != 0)
   {
      if(GetLong(fp, &offset)) return(-1);

      offset = (long)p->hunks[offset].addr;

      count = ocount;

      data = p->hunks[p->hcur-1].data;

      while(count--)
      {
         if(GetLong(fp, &loc)) return(-1);
         *(long *)(data+loc) += offset;
      }
   }

   return(ocount);
}

int Load(MODULE *p, char *file, unsigned long addr)
{
   BPTR fp;
   long l;
   int rc, i;
   HUNK *h;
   int dataread;

   if(!(fp = Open(file, MODE_OLDFILE)))
   {
      myprintf("ERROR: Can't open file \"%s\"\n", file);
      return(99);
   }

   if(GetHunkHeader(p, fp, addr))
      return(99);

   while(!(rc=GetLong(fp, &l)))
   {
      switch(l)
      {
         case HUNK_UNIT:
         case HUNK_NAME:
            SkipNBlock(fp);
            break;

         case HUNK_CODE:
            if(GetLong(fp, &l) || l < 0)
            {
               myprintf("Error reading Code hunk\n");
               goto badfile;
            }
            h = p->hunks + p->hcur++;
            h->type = HUNK_CODE;
            dataread = l*4;
            if(p->entry == NULL) p->entry = (int (*)(void))h->data;
            goto dohunk;

         case HUNK_DATA:
            if(GetLong(fp, &l) || l < 0)
            {
               myprintf("Error reading Data hunk\n");
               goto badfile;
            }
            h = p->hunks + p->hcur++;
            h->type = HUNK_DATA;
            dataread = l*4;

            dohunk:
            if(h->size < l)
            {
               myprintf("Invalid hunk size for hunk #%d\n",
                  p->hcur-1);
               goto badfile;
            }
            if(dataread && FRead(fp, h->data, dataread, 1) <= 0)
            {
               myprintf("I/O error or unexpected EOF\n");
               goto badfile;
            }
            if(h->size > l)
            {
               l *= 4;
               memset(((char *)h->data) + l, 0, h->size*4 -l);
            }
            break;

         case HUNK_BSS:
            if(GetLong(fp, &l) || l < 0)
            {
               myprintf("Error reading BSS hunk\n");
               goto badfile;
            }
            h = p->hunks + p->hcur++;
            h->type = HUNK_BSS;
            dataread = 0;
            memset(h->data, 0, l*4);
            break;

         case HUNK_RELOC32:
            while(rc=DoRelocs(p, fp));
            if(rc<0) goto badfile;
            break;

         case HUNK_RELOC16:
         case HUNK_RELOC8:
         case HUNK_EXT:
            goto unimp;

         case HUNK_SYMBOL:
            if(SkipSymbolInfo(fp) < 0)
            {
               myprintf("Error reading HUNK_SYMBOL\n");
               goto badfile;
            }
            break;
         
         case HUNK_DEBUG:
            SkipNBlock(fp);
            break;

         case HUNK_END:
            break;

         case HUNK_HEADER:
            myprintf("Error: Unexpected HUNK_HEADER\n");
            goto badfile;

         case HUNK_OVERLAY:
         case HUNK_BREAK:
         case HUNK_DREL32:
         case HUNK_DREL16:
         case HUNK_DREL8:
         case HUNK_LIB:
         case HUNK_INDEX:
         unimp:
            myprintf("Error: Unimplemented hunk type %d\n", l);
            goto badfile;

         default:
            myprintf("Error: Unrecognized hunk type %d\n", l);
            goto badfile;
      }
   }
   if(rc > 0)
   {
      poserr("ERROR: I/O error loading program file: ");
      goto badfile;
   }

   // Set any uninitialized hunks to zeroes
   for(i=0, h=p->hunks; i<p->hnum; i++, h++)
   {
      if(h->type == 0 && h->size)
         memset(h->data, 0, h->size*4);
   }

   Close(fp);
   return(0);

badfile:
   Close(fp);
   return(99);
}
