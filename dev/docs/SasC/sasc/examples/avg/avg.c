/*-----------------------------------------------------------------------*
 * Copyright (c) 1989-1993 by SAS Institute Inc., Cary NC, USA
 * All Rights Reserved
 *
 * Name       : avg.c 
 * Author     : Michael S. Whitcher
 * Date       : 02June92
 * Description: This is an example to demonstrate how to 
 *              -- call assembly language routines from C
 *              -- call assembly language routines from assembler
 *              -- call into AmigaDos from assembler and C routines
 *              -- call a registerized parameter link library routine 
 *              -- setup an assembler routine to handle the passing 
 *                   parameters on the stack and by register
 * Sources    : avg.c avg2.c
 *
 * Buildline  : sc avg.c avg2.a link
 *              Writes the final executable to the name 'avg'.
 *
 * Scoptions  : Here is a list of options that you can use to vary how
 *                 the example is built.  It gives you the opportunity 
 *                 to see how the final executable changes as you change
 *                 options.
 *
 *              DEBUG=SYMBOL  -- build with symbolic debugging information
 *                This will allow you to use cpr to step through the program
 *                in source mode and watch its execution.
 *                                        
 *              PARAMETERS=REGISTERS  -- pass the parameters to function calls
 *                in register instead of storing them on the stack.
 *
 *              NOSTACKCHECK -- do not add code to check for stack overflows
 *
 *              SMALLCODE  -- merge all code hunks together into one
 *
 *              SMALLDATA  -- merge all data hunks together into one
 *
 *              ADDSYMBOLS -- generate a H_SYMBOL hunk for use by cpr
 *
 *              STARTUP=cres  -- make the executable residentable
 *              
 *             
 * Notes      : To build with registerized parameters add the 
 *                parms=register option to the sc command line
 *                or scoptions file.
 *
 *-----------------------------------------------------------------------*/

#include <dos/dos.h>
#include <proto/dos.h>
#include <pragmas/dos_pragmas.h>
#include <string.h>

/* This is an assembler routine that calls AmigaDos to write a string to */
/* an open AmigaDos file handle.                                         */
extern int __asm prnts(register __d0 BPTR fh, register __a0 char *str);

/* This is an assembler routine that calculates the average of a set of  */
/* numbers.  The routine is built so that it can be called with the      */
/* parameters placed onto the stack or in register.                      */
extern long avg(int argc, char **argv);

main(argc, argv)
int argc;
char **argv;
{
   BPTR fh;
   long l;
   char buf[16];
   
   /* Call into AmigaDos to get the name of the file handle that points */
   /* to the output window from which we are executing.                 */
   fh = Output();
   
   /* prnts() is an assembly routine that will write to the output      */
   /* window.  avg() is an assembly routine that will compute the       */
   /* average for us.                                                   */

   if (argc < 2)
      prnts(fh, "Usage: average <int1> <int2> ...\n");
   else
   {
      /* compute the average */
      l = avg(argc-1, argv+1);
      
      /* convert the number to a string */
      stcl_d(buf, l);
      
      /* output the average to the user */
      prnts(fh, "average = ");
      prnts(fh, buf);
      prnts(fh, "\n");
   }
   
   /* successful */
   return 0;
}
