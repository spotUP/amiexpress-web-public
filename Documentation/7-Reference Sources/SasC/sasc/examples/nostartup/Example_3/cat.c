/*
 * Copyright (c) 1992-1993 SAS Institute, Inc, Cary, NC, USA 
 * All Rights Reserved
 * Command: cat.c
 * Author: James E. Cooper Jr.
 * Change History:
 *  Date    Person	  Action
 * -------  ------------- -----------------
 * 20AUG92  Jim Cooper	  Initial Creation
 *
 * Notes:
 *   2.0 specific program similar to the UNIX 'cat' command, with full
 *   command-line parsing, wildcard support, and recursive subdirectory
 *   scanning.	The AmigaDOS ROM code makes this whole thing almost trivial!
 */
#define __USE_SYSBASE

#include <exec/types.h>
#include <exec/execbase.h>
#include <exec/memory.h>
#include <dos/dosextens.h>
#include <dos/rdargs.h>

#include <string.h>

#include <proto/dos.h>
#include <proto/exec.h>

#define DOSLIB	"dos.library"
#define DOSVER	36L			/* We require AT LEAST V36 of OS */

#define THISPROC   ((struct Process *)(SysBase->ThisTask))
#define Result2(x) THISPROC->pr_Result2 = x

#define BUFLEN 256			/* Size of buffer to read into */

#define MSG_CAT_FAILED "Cat failed"

#define TEMPLATE  "FILE/A/M,ALL/S"
#define OPT_FILE  0
#define OPT_ALL   1
#define OPT_COUNT 2

int cmd_cat(void)
{
   struct ExecBase *SysBase = (*((struct ExecBase **) 4));
   struct DosLibrary *DOSBase;
   long temprc, rc;
   long opts[OPT_COUNT];
   struct RDArgs *rdargs;
   struct AnchorPath __aligned ua;
   BPTR oldlock, curlock, fh;
   char fname[32];
   char *curarg, **argptr, *buf;

   /*------------------------------------------------------------------------*/
   /* Set up the default return code.					     */
   /*------------------------------------------------------------------------*/
   rc = RETURN_FAIL;

   /*------------------------------------------------------------------------*/
   /* And open the dos library for our use.				     */
   /*------------------------------------------------------------------------*/
   if ((DOSBase = (struct DosLibrary *)OpenLibrary(DOSLIB, DOSVER)))
   {
      /*---------------------------------------------------------------------*/
      /* O.K., now we know we're running under the correct version of DOS.   */
      /* We need to get a buffer to read data into, in order for out program */
      /* to work.  If we can't get one, we'll just fall out with a failure.  */
      /*---------------------------------------------------------------------*/
      if ((buf = AllocVec(BUFLEN, 0L)) == NULL)
      {
	 PrintFault(IoErr(), MSG_CAT_FAILED);
      }
      else
      {
	 /*------------------------------------------------------------------*/
	 /* Clear the options array, just to be on the safe side...	     */
	 /*------------------------------------------------------------------*/
	 memset((char *)opts, 0, sizeof(opts));

	 /*------------------------------------------------------------------*/
	 /* Parse the command line.					     */
	 /*------------------------------------------------------------------*/
	 rdargs = ReadArgs(TEMPLATE, opts, NULL);

	 /*------------------------------------------------------------------*/
	 /* If there was an error parsing, print an error message and exit!  */
	 /*------------------------------------------------------------------*/
	 if (rdargs == NULL)
	 {
	    PrintFault(IoErr(), NULL);
	 }
	 else
	 {
	    /*---------------------------------------------------------------*/
	    /* Initialize for MultiArgs handling...			     */
	    /*---------------------------------------------------------------*/
	    argptr = (char **)opts[OPT_FILE];

	    /*---------------------------------------------------------------*/
	    /* The following while loop handles the MultiArgs spec.	     */
	    /*---------------------------------------------------------------*/
	    while (curarg = *argptr++)
	    {
	       /*------------------------------------------------------------*/
	       /* Clear our UserAnchor structure to all zeros before going   */
	       /* to the next step.					     */
	       /*------------------------------------------------------------*/
	       memset(&ua, 0, sizeof(struct AnchorPath));

	       /*------------------------------------------------------------*/
	       /* Set up a default message leader.			     */
	       /*------------------------------------------------------------*/
	       strcpy(fname, MSG_CAT_FAILED);

	       /*------------------------------------------------------------*/
	       /* Finally, call the matcher.				     */
	       /*------------------------------------------------------------*/
	       MatchFirst(curarg, &ua);
	       temprc = IoErr();

	       /*------------------------------------------------------------*/
	       /* Process all matches returned.  If 'MatchFirst()' returned  */
	       /* an error, the 'while()' let's us skip all this and fall    */
	       /* through the exit code.				     */
	       /*------------------------------------------------------------*/
	       while (temprc == 0)
	       {
		  strcpy(fname, ua.ap_Info.fib_FileName);

		  if (ua.ap_Info.fib_DirEntryType > 0 && opts[OPT_ALL])
		  {
		     /*------------------------------------------------------*/
		     /* The flag APF_DIDDIR tells us that we are 'backing    */
		     /* out' of a subdirectory... in other words, we have    */
		     /* processed all sub-files of that directory and we are */
		     /* moving back to its parent.  If this flag is set, we  */
		     /* need to clear it.				     */
		     /*------------------------------------------------------*/
		     if (!(ua.ap_Flags & APF_DIDDIR))
		     {
			/*---------------------------------------------------*/
			/* If we are printing ALL files, tell the matcher to */
			/* enter this directory.			     */
			/*---------------------------------------------------*/
			ua.ap_Flags |= APF_DODIR;
		     }
		     ua.ap_Flags &= ~APF_DIDDIR;
		  }

		  /*---------------------------------------------------------*/
		  /* If we have an error OTHER than that we are out of	     */
		  /* files, we need to exit IMMEDIATELY!		     */
		  /*---------------------------------------------------------*/
		  if (temprc && (temprc != ERROR_NO_MORE_ENTRIES))
		  {
		     break;
		  }

		  /*---------------------------------------------------------*/
		  /* Set us to the directory this file lives in.	     */
		  /*---------------------------------------------------------*/
		  curlock = DupLock(ua.ap_Current->an_Lock);
		  oldlock = CurrentDir(curlock);

		  /*---------------------------------------------------------*/
		  /* We must open the file to read.			     */
		  /*---------------------------------------------------------*/
		  if ((fh = Open(fname, MODE_OLDFILE)) == NULL)
		  {
		     temprc = IoErr();
		     CurrentDir(oldlock);
		     UnLock(curlock);
		     break;
		  }

		  /*---------------------------------------------------------*/
		  /* O.K., the file is open.  Now we simply read lines from  */
		  /* the file and write them out.  Simple two-function	     */
		  /* operation. 					     */
		  /*---------------------------------------------------------*/
		  while (FGets(fh, buf, BUFLEN))
		  {
		     PutStr(buf);
		  }

		  /*---------------------------------------------------------*/
		  /* Close the file, now that we're finished with it.        */
		  /*---------------------------------------------------------*/
		  Close(fh);

		  /*---------------------------------------------------------*/
		  /* Now change the directory back to where it was when we   */
		  /* got started.					     */
		  /*---------------------------------------------------------*/
		  CurrentDir(oldlock);
		  UnLock(curlock);

		  /*---------------------------------------------------------*/
		  /* Now get the next file which matches the given pattern.  */
		  /*---------------------------------------------------------*/
		  MatchNext(&ua);
		  temprc = IoErr();
	       }

	       /*------------------------------------------------------------*/
	       /* If the only error we had was that we ran out of files to   */
	       /* type, we are doing fine!  Set the return code so the user  */
	       /* knows everything went well.				     */
	       /*------------------------------------------------------------*/
	       if (temprc == ERROR_NO_MORE_ENTRIES)
	       {
		  rc = RETURN_OK;
	       }
	       else
	       {
		  PrintFault(temprc,fname);

		  /*---------------------------------------------------------*/
		  /* If the user hit Ctrl-C, we have to warn him that he is  */
		  /* being rude!					     */
		  /*---------------------------------------------------------*/
		  if (temprc == ERROR_BREAK)
		  {
		     rc = RETURN_WARN;
		  }
		  else
		  {
		     /*------------------------------------------------------*/
		     /* If there was any other error, FAIL!!!		     */
		     /*------------------------------------------------------*/
		     rc = RETURN_FAIL;
		  }
	       }
	       /*------------------------------------------------------------*/
	       /* We have to clean up after ourselves.			     */
	       /*------------------------------------------------------------*/
	       MatchEnd(&ua);
	    }
	    FreeArgs(rdargs);
	 }
      }
      CloseLibrary((struct Library *)DOSBase);
   }
   else
   {
      /*---------------------------------------------------------------------*/
      /* They tried to run us under the wrong version of the OS.  We need to */
      /* exit gracefully, yet still let them know what went wrong...	     */
      /*---------------------------------------------------------------------*/
      Result2(ERROR_INVALID_RESIDENT_LIBRARY);
   }
   return(rc);
}
