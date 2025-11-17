*****************************************************************************
* Super-Directory Adder, for Super-DupeCheck - (C)1994-5 Leo Davidson       *
*****************************************************************************
;TEST	; Include Debug-Labels, etc.

VERSION	MACRO
	dc.b	"v1.00"
	ENDM
REVDATE	MACRO
	dc.b	"24-Dec-94"
	ENDM
RELNUMB	MACRO
	dc.b	"1"
	ENDM
BETANUM	MACRO
	dc.b	"B00"
	ENDM
PROGNAM	MACRO
	dc.b	155,"1 pSuper-DirAdd"
	ENDM
******************************************************************************
	Include	Asm:Include/Constants.i
	Opt	D-			Debug info OFF
	Section	Super_DOS,Code		Assemble to Public Mem
	IFD	TEST			-.
	Opt	D+			 |_ If In Test-Mode
	Opt	hcln			 |  Debug info ON
	ENDC				-'
******************************************************************************
*****************************************************************************
ProgBeg	Bsr	Setup			Allocate Mem and initialize stuff.
;===========================================================================;
	Bsr.s	BuildLine		Build the line for output.
	Bsr.s	WriteLine		Write the line to the dir file.
;===========================================================================;
	Bra	AllDone			Finish with ALL DONE message.
*****************************************************************************
******************************************************************************
VerStr	Dc.b	"$VER: "		-.
	PROGNAM				 |
	Dc.b	" "			 |
ActVer	VERSION				 |
	Dc.b	" ("			 |- For 2.0+ Version Command
	REVDATE				 |
	Dc.b	")",10,0		-'
*****************************************************************************
	Even
*****************************************************************************
*: The Variables (Address Equates for Space allocated at program start) ::::*
*****************************************************************************
	RSReset
;===========================================================================;
FilHead		Rs.b	260		; File-Header - MUST BE LW ALLIGNED ;
;===========================================================================;
FH_DiskKey	Equ	FilHead+000	[LW]
FH_DirEntryType	Equ	FilHead+004	[LW] If < 0, File. If > 0, Directory.
FH_FileName	Equ	FilHead+008	[108] FileName Null Term. MAX 30chars
FH_Protection	Equ	FilHead+116	[LW] Protection Bit Mask. rwxd=3-0
FH_EntryType	Equ	FilHead+120	[LW]
FH_Size		Equ	FilHead+124	[LW] Number of Bytes In File.
FH_NumBlocks	Equ	FilHead+128	[LW] Number of Blocks In File.
FH_DateStamp	Equ	FilHead+132	[12] DateStamp of time Last Changed.
FH_Comment	Equ	FilHead+144	[80] File Command. Null Term.
FH_Reserved	Equ	FilHead+224	[36] RESERVED.
;= SWITCHES ================================================================;
;Fil_F_1		Rs.b	1		Files In Memory.
STD_F_1		Rs.b	1		Standard files.
		RSEven
;= DATA ====================================================================;
;= FILES ===================================================================;
FileNam		Rs.l	1		Active  File Name
FileHdl		Rs.l	1		Active  File Handle
FileLok		Rs.l	1		Active  File Lock
;= ADDRESS-POINTERS ========================================================;
StarStk		Rs.l	1		Original Stack Pointer
DosBase		Rs.l	1		Dos.Library Base
CLI_Hdl		Rs.l	1		Output CLI (or whatever) handle
NoFilRt		Rs.l	1		Routine to call when no file exists.
NWrtNFd		Rs.l	1		Routine to call when no file exists.
;= TEMP ====================================================================;
;Temp001	Rs.l	1		-.
;Temp002	Rs.l	1		 |_ Temperarary Pointers for
;Temp003	Rs.l	1		 |  Subroutine Calls and for
Temp004		Rs.l	1		-'  using instead of the stack!
;= BUFFERS =================================================================;
ErrBuffLen	Equ	100
ErrBuff		Rs.b	ErrBuffLen	For Fault() to write Error Text.
LineBufLen	Equ	14
LineBuf		Rs.b	LineBufLen	Buffer for line to output file.
;= READARGS() STUFF ========================================================;
RDA_Rtn		Rs.l	1		Pointer to returned RDArgs structure
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
RDA_Array	Equ	__RS		Array of longwords matching template
RDA_Template
Filename_KA	Rs.l	1
		Dc.b	"FN=FILENAME/K/A"	Filename to add to dir.
DirFile_KA	Rs.l	1
		Dc.b	",DF=DIRFILE/K/A"	DirFile to add to.
RDA_Temp_Len	Equ	*-RDA_Template
		Dc.b	0
		Even
;===========================================================================;
NULLEND		Equ	__RS		;------- Overlays Start Here -------;
;===========================================================================;
;===========================================================================;
LENVARS		Equ	__RS		;---- End of variables/overlays ----;
;===========================================================================;
*****************************************************************************
* Builds the line to add to the file.					    *
*****************************************************************************
BuildLine
	Move.l	Filename_KA(a5),a0	Going to write given filename.
	Bsr	NullLen			Length -> d0
	Cmpi.l	#12,d0			-._ Make sure filename
	Bgt	FileNameTooLong		-'  isn't illegaly long.

	Move.l	Filename_KA(a5),a0	Going to write filename,
	Move.l	d0,d3			which is this long...
	Lea	LineBuf(a5),a1		Into the buffer,
	Moveq	#13,d1			Which is this long.
	Bsr	SpaOver
	Move.b	#10,(a1)		Return terminate the line.
	
	Lea	LineBuf(a5),a2		Uppercase the filename.
	Moveq	#12,d0
	Bra	Upper
;;;;;;;	RTS for us.
*****************************************************************************
* Write the line to the output dir file.                                    *
*****************************************************************************
WriteLine
	Move.l	DirFile_KA(a5),FileNam(a5)	Openning the output file...
	Bsr.s	NWrite2			Open the file for writting.
; If a file already existed, Seek() to the end of it so we'll append to it.
	Move.l	FileHdl(a5),d1		File Handle for Seek()
	Moveq	#0,d2			Zero bytes...
	Moveq	#OFFSET_END,d3		...from the END of the file.
	CALLDOS	Seek
	CALLDOS	IoErr			Will return 0 on Success.
	Tst.l	d0			-._ If an error was returned,
	Bne	Error			-'  branch to the error routine.

	Lea	LineBuf(a5),a0		Write the line to the file.
	Moveq	#14,d3
	Bsr	FilRite
	Bra	FilClos			Close the file.
;;;;;;;	RTS for us.
*****************************************************************************
;===========================================================================;
; Dos Subroutines							    ;
;===========================================================================;
DOS_CLIRITE	; Write text using CLI_Hdl(a5) as output handle.
DOS_FILRITE	; Write to a file.
DOS_WRITNOR	; Open a file as new/old for writting...
DOS_FILEXIS	; Check if a file exists. Also locks the file.
DOS_FILCLOS	; Close a file.
DOS_FILOPEN	; Open a file.
DOS_FILULOK	; Unlock a file.
DOS_READARG	; ReadArgs() routine.
DOS_FREEARG	; FreeArgs() routine.
	Include	ASM:Source/Routines/DOS.s
;===========================================================================;
; Data Subroutines. (Number/String Handling, etc etc)                       ;
;===========================================================================;
DATA_NULLLEN	; Calculate the length of a Null-Term String.
DATA_CHARCNT	; Copy x chars with Null-Term
DATA_UPPACAZ	; Upper-Case.
DATA_SPAOVER	; Overlay output with (space) padding.
	Include	ASM:Source/Routines/Data.s
;===========================================================================;
*****************************************************************************
*****************************************************************************
;===========================================================================;
; For residence, allocate memory for anything that'll change, and null it   ;
;===========================================================================;
Setup	Move.l	#LENVARS,d0			-.  Allocate
	Move.l	#Memf_Public!Memf_Clear,d1	 |_ Memory for
	CALEXEC	AllocMem			-'  Variables.
	Move.l	d0,a5			Put variable/overlay address into A5
	Tst.l	d0			(Moves to a? don't set CCR).
	Beq	Fin_1			If Allocation failed, Exit Program
	IFD	LENOVER
	Lea	NULLEND(a5),a0		-.
	Lea	Over01(pc),a1		 |  Copy Overlay
	Moveq	#(LENOVER/2)-1,d0	 |- Backings onto
OverPrL	Move.w	(a1)+,(a0)+		 |  Overlay Space (word moves)
	DBra	d0,OverPrL		-'
	ENDC
;===========================================================================;
	Move.l	a7,StarStk(a5)		Store Stack Pointer
	Addq.l	#4,StarStk(a5)		Compensate for this being a subrout.
	Lea	DosName(pc),a1		Get Address of Dos.Library Name
	Moveq	#36,d0			DOS v36 or Higher Required
	CALEXEC	OpenLib			Open Dos.Library (exec v36 req)
	Move.l	d0,DosBase(a5)		Store Address of Dos.Library
	Beq	Fin_2			If OpenLib failed, end Program
	CALLDOS	OutPut			-._ Get output Handle
	Move.l	d0,CLI_Hdl(a5)		-'  (CLI window or whatever)

;;;;	Lea	UtlName(pc),a1		Get Address of Utility.Library Name
;;;;	Moveq	#36,d0			v36 or above.
;;;;	CALEXEC	OpenLib			Open it.
;;;;	Move.l	d0,UtlBase(a5)		Store the base adr.
;;;;	Beq	Fin_3			If Failed, End.

	Lea	Welcome(pc),a0		-.
	Move.l	#WelcLen,d3		 |- Output Welcome Message
	Bsr	CLIRite			-'

;;;;;;;	Setup any non-zero default values for switch options here (below).

	Bra	RArgNor			Parse the commandline with ReadArgs
;;;;;;;	RTS for us.

DosName	Dc.b	"dos.library",0
;UtlName	Dc.b	"utility.library",0
Welcome	Dc.b	10,155,"32;1m"
	PROGNAM
	Dc.b	" "
	VERSION
	Dc.b	" ",155,"0m[",155,"33m"
	IFD	TEST
	Dc.b	"REL-"
	RELNUMB
	Dc.b	" "
	BETANUM
	ELSE
	Dc.b	"RELEASE "
	RELNUMB
	ENDC
	Dc.b	155,"0m] ",155,"32m- ",155,"33m©1994 P0T-NOoDLE of Gods'Gift/ANTHR0X",155,"0m",10
	Dc.b	155,"3mSupport program for Super-DupeCheck v1.03 or above.",155,"0m",10
	Dc.b	10
	Dc.b	"This util will add the specified filename to a stripped-down dir listing",10
	Dc.b	"suitable for SDupeCheck.",10
	Dc.b	"The filename you give should NOT contain any path!!",10
	Dc.b	10
	Dc.b	155,"3mRead the docs to Super-DupeCheck (v1.03 or above) for more information. ",155,"0m",10
	Dc.b	10
WelcLen	Equ	*-Welcome
	Even
*****************************************************************************
*****************************************************************************
*****************************************************************************
*****************************************************************************
ADMsg	PROGNAM
	Dc.b	": All Finished!",10
ADMsgL	Equ	*-ADMsg
	Even
AllDone	Lea	ADMsg(pc),a0
	Moveq	#ADMsgL,d3
	Bsr	CLIRite
*=- FINISH -=****************************************************************
* Close Everything Down, Return Memory Etc to System and End Program        *
*****************************************************************************
Finish
	IFD	TEST
	Lea	RTN_Msg(pc),a0
	Move.l	#RTN_Len,d3
	Bsr	CLIRite
	Bra.s	RTN_End
RTN_Msg	Dc.b	"*** Finish routine run. ***",10
RTN_Len	Equ	*-RTN_Msg
	Even
RTN_End
	ENDC
FinSkp1	Bsr.s	BigDAlo			Deallocate any files in memory.
	Bsr	FArgNor			Free the commandline related memory.
;;;;	Move.l	UtlBase(a5),a1		-._ Close down
;;;;	CALEXEC	CloseLib		-'  utility.library
Fin_3	Move.l	DosBase(a5),a1		-._ Close down
	CALEXEC	CloseLib		-'  dos.library
Fin_2	Move.l	StarStk(a5),a7		Ignore all Branches
	Move.l	#LENVARS,d0		-.
	Move.l	a5,a1			 |- Unallocate Variables/Overlays
	CALEXEC	FreeMem			-'
	Moveq	#RETURN_OK,d0		No Error return code to dos
Fin_1	RTS				End Program
*****************************************************************************
*****************************************************************************
*= BIG DE-ALLOCATE =*********************************************************
* Uses Fil_F_x(a5) to check which files are in mem and need De-Allocating   *
*****************************************************************************
BigDAlo	Move.l	#0,FileNam(a5)		Clear filename.
	Bsr	FilClos			Close the Default File
	Bsr	FilULok			Unlock the Default File
Big_E	RTS
*****************************************************************************
*****************************************************************************
*****************************************************************************
*****************************************************************************
*- ERROR MESSAGES -**********************************************************
* HELP TEXTS AND ERROR MESSAGES                                             *
*****************************************************************************
GenAbrt	Movem.l	d3/a0,-(SP)
	Lea	ErrHead(pc),a0		General header for Abort messages...
	Moveq	#ErrHedL,d3		Length of above.
	Bsr	CLIRite			Send it to them.
	Movem.l	(SP)+,d3/a0
GenAbt2	Bsr	CLIRite			Send msg from calling routine.
	Bra.s	Finish			End the program.
Internal Lea	InterM(pc),a0
	Moveq	#InterML,d3
	Bra.s	GenAbrt
FileNameTooLong
	Lea	FNTLM(pc),a0
	Moveq	#FNTLML,d3
	Bra.s	GenAbrt
ErrHead	Dc.b	10,155,"0m"
	PROGNAM
	Dc.b	" *ABORTED*",0			For Fault() DOS Call.
ErrHedL	Equ	(*-ErrHead)-1
InterM	Dc.b	": internal error!!",10
InterML	Equ	*-InterM
FNTLM	Dc.b	": Filename too long! 12 chars MAX.",10
FNTLML	Equ	*-FNTLM
	Even
*****************************************************************************
*****************************************************************************
