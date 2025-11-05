/*****************************************************************************

              Amiga E - Demo Program using the AEDoor.library

                       Copyright 1993 by SiNTAX/WøT


*****************************************************************************/

MODULE 'AEDoor'				    /* Include libcalls & constants */

ENUM LC,NOLIB,NOERR		     /* Declare our constants (ENUMERATION) */


RAISE	LC IF Prompt()=NIL,	  /* Setup automatic exception calling when */
	LC IF GetStr()=NIL,	  /* there is a LOSS of CARRIER!! NOTE: be  */
	LC IF HotKey()=TRUE	  /* sure to close everything you opened and*/
				  /* free whatever you alloc'ed (except the */
				  /* mem alloc'ed by E funcs)		    */


DEF d,key,x


PROC main() HANDLE	      /* Notify E that we have an exception routine */

	IF (aedoorbase:=OpenLibrary('AEDoor.library',1))=NIL THEN Raise(NOLIB)

	d:=CreateComm(arg[])				/* Establish Link   */

	WriteStr(d,'c[1;33;44m HOT KEY Manager Door V0.1[0;31;44m   by   [33mSiNTAX/WøT[31m                                    [0m\n[9yc',LF)
	REPEAT
		key:=HotKey(d,NIL)
		WriteStr(d,'cWorking...\n',LF)
		IF (key>="a") AND (key<="z") THEN key:= (key-32)

		SELECT key
			CASE	"A"
				func('A',FALSE)
			CASE	"B"
				func('B',FALSE)
			CASE	"C"
				func('C',FALSE)
			CASE	"D"
				func('D',TRUE)
			CASE	"E"
				func('E',FALSE)
			CASE	"F"
				func('F',TRUE)
			CASE	"G"
				SetDT(d,RETURNCOMMAND,'G')
				key:="Q"
			CASE	"H"
				func('H',FALSE)
			CASE	"J"
				func('J',FALSE)
			CASE	"L"
				func('L',FALSE)
			CASE	"M"
				func('M',TRUE)
			CASE	"N"
				func('N',TRUE)
			CASE	"O"
				func('O',FALSE)
			CASE	"R"
				func('R',FALSE)
			CASE	"S"
				func('S',TRUE)
			CASE	"T"
				func('T',TRUE)
			CASE	"U"
				func('U',TRUE)
			CASE	"V"
				func('V',FALSE)
			CASE	"W"
				func('W',FALSE)
			CASE	"Z"
				func('Z',TRUE)
			CASE	"Q"
				SetDT(d,RETURNCOMMAND,'')
			CASE	"?"
				ShowGFile(d,'DOORS:hotkey.menu')
			CASE	"."
				x:=Prompt(d,60,'[35mEnter [33m/X[35m command:[31m ')
				func(x,TRUE)
			DEFAULT
				WriteStr(d,'[HUnknown hotkey! Press ? for help\n',LF)
		ENDSELECT
	UNTIL key="Q"

	Raise(NOERR)				     /* To Close Lib & Link */


EXCEPT	/* Exception handling routines */

	SELECT exception
		CASE LC
			WriteStr(d,'\nLOST CARRIER!',LF)
		CASE NOLIB
			WriteF('Needs AEDoor.library V1+ to run!\n')
	ENDSELECT
	WriteStr(d,'c[yc[35m[4;20HThank you for using HOT KEY Manager. Goodbye![8;1H',LF)
			

	IF d<>NIL THEN DeleteComm(d)			/* Close Link w /X  */
	IF aedoorbase<>NIL THEN CloseLibrary(aedoorbase)

ENDPROC

PROC func(str,wait)
	SendStrCmd(d,PRV_COMMAND,str)
	IF wait THEN HotKey(d,'\n[28C[32;47m --- Press any key ---[0m')
	WriteStr(d,'c',NOLF)
ENDPROC

