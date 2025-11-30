#ifndef D_LOAD_H
#define D_LOAD_H

#include <dos/doshunks.h>

typedef struct HUNK
{
   long type;    // Code or data hunk
   long size;    // Allocated size of hunk in longwords
   unsigned long addr;  // Absolute address of start of hunk data
   char *name;   // Null-terminated hunk name
   void *data;   // Hunk data
} HUNK;

typedef struct MODULE
{
   long hnum;             // Total number of hunks
   long hcur;             // Current hunk
   HUNK *hunks;           // Dynamically allocated array of hunks
   int (*entry)(void);    // Program entry point (first code hunk)
} MODULE;

void UnLoad(MODULE *p);
int Load(MODULE *p, char *file, unsigned long addr);

#endif /* D_LOAD_H */
