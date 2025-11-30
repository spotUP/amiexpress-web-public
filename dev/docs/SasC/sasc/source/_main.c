/***
*
*          Copyright © 1992 SAS Institute, Inc.
*
* name             __main - process command line, open files, and call main()
*
* synopsis         __main(line);
*                  char *line;     ptr to command line that caused execution
*
* description      This function performs the standard pre-processing for
*                  the main module of a C program.  It accepts a command
*                  line of the form
*
*                       pgmname arg1 arg2 ...
*
*                  and builds a list of pointers to each argument.  The first
*                  pointer is to the program name.  For some environments, the
*                  standard I/O files are also opened, using file names that
*                  were set up by the OS interface module XCMAIN.
*
***/

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <constructor.h>
#include <workbench/startup.h>
#include <libraries/dos.h>
#include <libraries/dosextens.h>
#include <proto/dos.h>
#include <proto/exec.h>
#include <exec/memory.h>

#define QUOTE       '"'
#define ESCAPE '*'
#define ESC '\x1b'
#define NL '\n'

#define isspace(c)      ((c == ' ')||(c == '\t') || (c == '\n'))

extern char __stdiowin[];
extern char __stdiov37[];

extern struct WBStartup *_WBenchMsg;
int main(int, void *);

static int argc;                   /* arg count */
static char **targv, **argv;       /* arg pointers */

void __stdargs __main(line)
    char *line;
{
    char *argbuf;
    int ret;
    int i;

/***
*     First count the number of arguments
***/
   argbuf = line;
   for (argc = 0; ; argc++)
   {
        while (isspace(*line))  line++;
        if (*line == '\0')      break;
        if (*line == QUOTE)
        {
            line++;
            while (*line != QUOTE && *line != 0)
            {
               if (*line == ESCAPE)
               {
                  line++;
                  if (*line == 0) break;
               }
               line++;
            }
            if (*line) line++;
        }
        else            /* non-quoted arg */
        {       
            while ((*line != '\0') && (!isspace(*line))) line++;
            if (*line == '\0')  break;
        }
   }

   if (argc)
   {
      argv = AllocMem((argc+1) * sizeof(char *), MEMF_CLEAR);
      if (argv == NULL)
         exit(20);
         
      /***
      *     Build argument pointer list
      ***/
      i = 0;
      line = argbuf;
      while (1)
      {
           while (isspace(*line))  line++;
           if (*line == '\0')      break;
           if (*line == QUOTE)
           {
               argbuf = argv[i++] = ++line;  /* ptr inside quoted string */
               while (*line != QUOTE && *line != 0)
               {
                  if (*line == ESCAPE)
                  {
                     line++;
                     switch (*line)
                     {
                        case '\0':
                           *argbuf = 0;
                           goto linedone;
                        case 'E':
                           *argbuf++ = ESC;
                           break;
                        case 'N':
                           *argbuf++ = NL;
                           break;
                        default:
                           *argbuf++ = *line;
                     }
                     line++;
                  }
                  else
                  {
                    *argbuf++ = *line++;
                  }
               }
               if (*line) line++;
               *argbuf++ = '\0'; /* terminate arg */
           }
           else            /* non-quoted arg */
           {       
               argv[i++] = line;
               while ((*line != '\0') && (!isspace(*line))) line++;
               if (*line == '\0')  break;
               else                *line++ = '\0';  /* terminate arg */
           }
      }  /* while */
   }
linedone:

    targv = (argc == 0) ? (char **) _WBenchMsg : (char **) &argv[0];


/***
*     Call user's main program
***/

    ret = main(argc, targv);                /* call main function */

    exit(ret);
}


MEMCLEANUP_DESTRUCTOR(argcleanup)
{
    if (argc && argv)
       FreeMem(argv, (argc+1) * sizeof(char *));
}
