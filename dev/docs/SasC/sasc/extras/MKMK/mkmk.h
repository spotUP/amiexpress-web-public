/****************************************************/
/*                                                  */
/* Copyright (c) 1993 SAS Institute, Inc.           */
/*                                                  */
/* Support: walker                                  */
/* Script:  splatam                                 */
/* Date:    07/12/93                                */
/*                                                  */
/****************************************************/

#define __USE_SYSBASE
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <dos.h>
#include <dos/dosextens.h>
#include <dos/rdargs.h>
#include <exec/execbase.h>

#include <proto/dos.h>
#include <proto/exec.h>
#include <proto/icon.h>

// Flags for file descriptor 'flags' field
#define FD_CSRC   0x80000000    // C source file
#define FD_HDR    0x40000000    // Header file
#define FD_CXXSRC 0x20000000    // C++ source file
#define FD_ASM    0x10000000    // Assembler file
#define FD_OPTS   0x08000000    // Options file
#define FD_MAKE   0x04000000    // Makefile

// File descriptor structure.  Contains information on the file like filename, file type,
// direct dependancies (files directly #included by this file), as well as linkage
// information to allow FileDesc structures to be linked into a list.
typedef struct FileDesc
{
   struct FileDesc *next;
   struct FileDesc *prev;
   char *name;                 // Name of file
   unsigned long flags;        // See above
   int ndirect;                // Number of direct dependancies
   int adirect;                // Available slots for dd's
   struct FileDesc **Direct;   // Direct dependancies
} FileDesc;

// The FileList structure is basically just a header to allow lists of FileDesc structures
// to be created.
typedef struct FileList
{
   struct FileDesc *head;
   struct FileDesc *tail;
   struct FileDesc *cur;
} FileList;

/* Prototypes for functions defined in
dofile.c
 */

extern unsigned char buf[1024];

void AddDep(struct FileDesc * , struct FileDesc * );

unsigned char * scopy(unsigned char * );

void DoFile(struct FileList * , struct FileDesc * );

/* Prototypes for functions defined in
gensmake.c
 */

int filetype(unsigned char * );

unsigned char * suffix(unsigned char * );

unsigned char * prefix(unsigned char * );

unsigned char * objout(unsigned char * );

void ExpandDeps(struct FileDesc * );

void GenSmake(FileList * );

void makeicon(unsigned char * );

int iconexists(unsigned char * );

/* Prototypes for functions defined in
mkmk.c
 */

extern BPTR out;

extern unsigned char * makefile;

extern unsigned char * target;

extern int force;

void panic(unsigned char * );

void AddPattern(FileList * , unsigned char * );

struct FileDesc * FindFile(FileList * , unsigned char * );

struct FileDesc * AddFile(FileList * , unsigned char * );

struct FileDesc * NextFile(FileList * );

int main(void);

int __stdargs myfprintf(BPTR , unsigned char * , ...);

int __stdargs mysprintf(unsigned char * , unsigned char * , ...);

#define TOOLVER "6.55"
#define TOOLDATE " " __AMIGADATE__

