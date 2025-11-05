/*****************************************************************************

              Amiga E - Demo Program using the AEDoor.library

                       Copyright 1993 by SiNTAX/WøT


*****************************************************************************/

MODULE 'AEDoor'				    /* Include libcalls & constants */

ENUM LC,NOLIB,NOERR		     /* Declare our constants (ENUMERATION) */

DEF d,key

RAISE	LC IF Prompt()=NIL,	  /* Setup automatic exception calling when */
	LC IF GetStr()=NIL,	  /* there is a LOSS of CARRIER!! NOTE: be  */
	LC IF HotKey()=TRUE	  /* sure to close everything you opened and*/
				  /* free whatever you alloc'ed (except the */
				  /* mem alloc'ed by E funcs)		    */




PROC main() HANDLE	      /* Notify E that we have an exception routine */

	IF (aedoorbase:=OpenLibrary('AEDoor.library',1))=NIL THEN Raise(NOLIB)

	d:=CreateComm(arg[])				/* Establish Link   */


	WriteStr(d,'c[1;33mHOT KEY Demo Door[0m by SiNTAX/WøT\n',LF)

	key:=HotKey(d,'Continue? ')
	SELECT key
		CASE	"Y"
			WriteStr(d,'Yes!',LF)
		CASE	"y"
			WriteStr(d,'yes!',LF)
		DEFAULT
			WriteStr(d,'Nope',LF)
	ENDSELECT

	WriteStr(d,'\nWell anyways, there is nothing more, so goodbye!\n',LF)

	Raise(NOERR)				     /* To Close Lib & Link */


EXCEPT	/* Exception handling routines */

	SELECT exception
		CASE LC
			WriteStr(d,'\nLOST CARRIER!',LF)
		CASE NOLIB
			WriteF('Needs AEDoor.library V1+ to run!\n')
	ENDSELECT
			

	IF d<>NIL THEN DeleteComm(d)			/* Close Link w /X  */
	IF aedoorbase<>NIL THEN CloseLibrary(aedoorbase)

ENDPROC
