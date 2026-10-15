*****************************************************************************
* Super-Directory Stripper, for Super-DupeCheck - (C)1994 Leo Davidson      *
*****************************************************************************
;TEST	; Include Debug-Labels, etc.

LineDel_Const = 20		Update percentage-done message every X lines.

VERSION	MACRO
	dc.b	"v1.01"
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
	dc.b	155,"1 pSuper-DirStrip"
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
	Bsr.s	Open_Files		Open the input and output files.
	Bsr	Do_Main			Strip input to output.
	Bsr	Do_Percentage		Make it write 100%
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
Over01	Dc.b	155,"3D"
Over01L	Equ	*-Over01
Over02	Dc.b	"xxx"
PerMsgL	Equ	*-Over01
	Even
Over02L	Equ	*-Over01
LENOVER	Equ	*-Over01
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
Fil_F_1		Rs.b	1		Files In Memory.
X1_InOpen	Equ	0		Input file is open.

STD_F_1		Rs.b	1		Standard files.
		RSEven
;= DATA ====================================================================;
LineDel		Rs.l	1		Lines to do before %-done updated.
;= FILES ===================================================================;
FileNam		Rs.l	1		Active  File Name
FileHdl		Rs.l	1		Active  File Handle
FileLok		Rs.l	1		Active  File Lock
FileSze		Rs.l	1		Active  File Size
;FileAdr	Rs.l	1		Active  File Address
In__Hdl		Rs.l	1		Input   File Handle
In__Sze		Rs.l	1		Input   File Size
;= ADDRESS-POINTERS ========================================================;
StarStk		Rs.l	1		Original Stack Pointer
DosBase		Rs.l	1		Dos.Library Base
UtlBase		Rs.l	1		Utility.Library Base
CLI_Hdl		Rs.l	1		Output CLI (or whatever) handle
NoFilRt		Rs.l	1		Routine to call when no file exists.
NWrtNFd		Rs.l	1		Routine to call when no file exists.
;= TEMP ====================================================================;
;Temp001	Rs.l	1		-.
Temp002		Rs.l	1		 |_ Temperarary Pointers for
;Temp003	Rs.l	1		 |  Subroutine Calls and for
Temp004		Rs.l	1		-'  using instead of the stack!
;= BUFFERS =================================================================;
ErrBuffLen	Equ	100
ErrBuff		Rs.b	ErrBuffLen	For Fault() to write Error Text.
;LineBufLen	Equ	36		(Enough for Name,Flag,Size,Date).
LineBufLen	Equ	1024		1k so entire lines can fit in.
LineBuf		Rs.b	LineBufLen	Buffer for lines from input file.
;= READARGS() STUFF ========================================================;
RDA_Rtn		Rs.l	1		Pointer to returned RDArgs structure
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
RDA_Array	Equ	__RS		Array of longwords matching template
RDA_Template
From_KA		Rs.l	1
		Dc.b	"FROM/K/A"	Input Filename string.
To_KA		Rs.l	1
		Dc.b	",TO/K/A"	Output Filename string.
IncInfo_S	Rs.l	1
		Dc.b	",INCINFO/S"	Include dates, etc switch.
New_S		Rs.l	1
		Dc.b	",NEW/S"	Create new file switch.
RDA_Temp_Len	Equ	*-RDA_Template
		Dc.b	0
		Even
;===========================================================================;
NULLEND		Equ	__RS		;------- Overlays Start Here -------;
;===========================================================================;
PerMsg		Rs.b	Over01L		Percentage done message.
PerMsg.Num	Rs.b	Over02L		Actual 3-digit percentage bit.
;===========================================================================;
LENVARS		Equ	__RS		;---- End of variables/overlays ----;
;===========================================================================;
*****************************************************************************
* Open the input and output files, as given by ReadArgs()                   *
*****************************************************************************
Open_Files
	Move.l	From_KA(a5),a0		Openning the input file...
	Bsr	FilExi0			Make sure the file exists.

	Move.l	FileNam(a5),d1		(FileNam(a5) setup by FilExi0)
	Move.l	#Mode_Old,d2
	Bsr	FilOpn2			Open the file.
	Bsr	FilMeas			Find the size of the file.
	Bsr	FilULok			Free lock from FilExis routine.

	Move.l	FileSze(a5),In__Sze(a5)
	Move.l	FileHdl(a5),In__Hdl(a5)	-.
	BClr	#SF1_Open,STD_F_1(a5)	 |- Free STD pointers.
	BSet	#X1_InOpen,Fil_F_1(a5)	-'
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
; If new option given, delete old file (if there is one).		    ;
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
	Tst.l	New_S(a5)		Did they give the new option?
	Beq.s	NoNewSwitchSkip		No = Don't delete.
	Move.l	To_KA(a5),FileNam(a5)	Going to delete the output file...
	Bsr	FileDe3			Delete the file if it exists...
NoNewSwitchSkip
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
	Move.l	To_KA(a5),FileNam(a5)	Openning the output file...
	Move.l	#Mode_Old,Temp002(a5)	If exists, open old file.
	Bsr	NWrite2			Open the file for writting.

; If a file already existed, Seek() to the end of it so we'll append to it.

	Move.l	FileHdl(a5),d1		File Handle for Seek()
	Moveq	#0,d2			Zero bytes...
	Moveq	#OFFSET_END,d3		...from the END of the file.
	CALLDOS	Seek
	CALLDOS	IoErr			Will return 0 on Success.
	Tst.l	d0			-._ If an error was returned,
	Bne	Error			-'  branch to the error routine.
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
	RTS
*****************************************************************************
* Strips the input file down onto the end of the output file...             *
*****************************************************************************
DoMMsg	PROGNAM
	Dc.b	": Please wait, processing your file! Ctrl-C to Break...",155,"0m",10
	Dc.b	"Done: 000%",155,"1D",155,"0 p"
DoMMsgL	Equ	*-DoMMsg
	Even

Do_Main	Lea	DoMMsg(pc),a0		Send "Doing..." message.
	Moveq	#DoMMsgL,d3
	Bsr	CLIRite
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
; First, read in a line from the input file...				    ;
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
RLineAg	Bsr	CkCtrlC			Check for Ctrl-C press...

	Bsr.s	Update_Percentage	Update and send Percentage-done msg.

	Move.l	From_KA(a5),FileNam(a5)	Input file is active (in case error)
	Move.l	In__Hdl(a5),d1		Input file handle...
	Lea	LineBuf(a5),a0		Buffer to read into.
	Move.l	a0,d2
	Move.l	#LineBufLen-1,d3	-1 as v36/v37 reads 1 too many.
	CALLDOS	FGets			Read one line into the buffer.
	Tst.l	d0			If d0 = 0, then either error or EOF.
	Bne.s	LinedOK
	CALLDOS	IoErr			Check if it was an error or EOF.
	Tst.l	d0
	Bne	Error3			If it WAS an error, treat it normally
	RTS				Else, file done, return.
;;;;;;;	(Leave closing of the two files to the Finish routine).
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
; Now we check if it is a filename line...				    ;
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
LinedOK	Lea	LineBuf(a5),a0		Read line buffer...
	Bsr	NullLen			Lenght of string -> d0.
;;;;;;;	Cmpi.l	#LineBufLen-2,d0	Make sure long enough to be filename.
	Cmpi.l	#34,d0
	Blt.s	RLineAg			If not, read the next line.

	Cmp.b	#" ",LineBuf(a5)	-._ If starts with space,
	Beq.s	RLineAg			-'  skip the line.
;;;;;;;	Below removed for people with slightly unstandard filelistings...
;;;;;;;	(e.g. strange NUKE messages, etc...)
;;;	Move.b	#" ",d0
;;;	Cmp.b	LineBuf(a5),d0		-._ If starts with space,
;;;	Beq.s	RLineAg			-'  skip the line.
;;;	Cmp.b	LineBuf+12(a5),d0	-.
;;;	Bne.s	RLineAg			 |
;;;	Cmp.b	LineBuf+21(a5),d0	 |
;;;	Bne.s	RLineAg			 |
;;;	Cmp.b	LineBuf+22(a5),d0	 |_ Skip if spaces not found
;;;	Bne.s	RLineAg			 |  where the should be.
;;;	Cmp.b	LineBuf+31(a5),d0	 |
;;;	Bne.s	RLineAg			 |
;;;	Cmp.b	LineBuf+32(a5),d0	 |
;;;	Bne.s	RLineAg			-'
;;;	Cmp.b	#"-",LineBuf+25(a5)	-.
;;;	Bne.s	RLineAg			 |_ Skip if no valid
;;;	Cmp.b	#"-",LineBuf+28(a5)	 |  data string.
;;;	Bne.s	RLineAg			-'
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
; It appears to be a filename line, so we have to write it to the output.   ;
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
	Move.l	To_KA(a5),FileNam(a5)	Output file is active (in case error)
	Lea	LineBuf(a5),a0		For FilRite and quick access...

	Tst.l	IncInfo_S(a5)		Have they asked for the extra info?
	Beq.s	WrtNInf			If not, just write the filename/flag.
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
;;;;;;;	Include extra info on filesize and date.
	Move.b	#10,31(a0)	Return terminate the line.

	Moveq	#32,d3			Write 32 chars...
WrtGenI	Move.l	d3,d0			Length to d0 for Upper
	Move.l	a0,a2			Pointer to a2 for upper.
;;;;;;;	d1/d2 destroyed as well, but d3/a0 (for FilRite) are left alone.
	Bsr	Upper			Convert it to uppercase.
	Bsr	FilRite			...to the output file.
	Bra.s	RLineAg			And check out the next line!...
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
WrtNInf	Move.b	#10,13(a0)		Return terminate the line.

	Moveq	#14,d3			Write 14 chars...
	Bra.s	WrtGenI			Rest is the same...
*****************************************************************************
* Updates and sends the percentage-done message.			    *
*****************************************************************************
Update_Percentage
	Subq.l	#1,LineDel(a5)		Decrement count of lines before upd8.
	Beq.s	Do_Percentage		-._ If still more lines to do,
DonePer	RTS				-'  return.
Do_Percentage
	Move.l	#LineDel_Const,LineDel(a5)

	Move.l	In__Hdl(a5),d1		Flush file as FGets() is a buffered
	CALLDOS	Flush			Routine while Read() is not.
	Tst.l	d0			Currently the OS always returns
	Beq	Error			success, but just incase it's fixed.

	Move.l	In__Hdl(a5),d1		File Handle for Seek()
	Moveq	#0,d2			Zero bytes...
	Moveq	#OFFSET_CURRENT,d3	...from current position...
	CALLDOS	Seek
	Move.l	d0,-(SP)
	CALLDOS	IoErr			Will return 0 on Success.
	Tst.l	d0			-._ If an error was returned,
	Bne	Error			-'  branch to the error routine.

	Move.l	(SP)+,d0
	Moveq	#100,d1
	Move.l	UtlBase(a5),a6
	Jsr	UMult32(a6)

	Move.l	In__Sze(a5),d1
	Beq.s	DonePer			Should never happen, but if filesize
;;;;;;;					is zero, make sure no div-by-0 err.
	Move.l	UtlBase(a5),a6		Going to use utility.library
	Jsr	UDivMod32(a6)		Quotient -> d0, Remainder -> d1

	Move.l	d0,d1			-.
	Lea	PerMsg.Num(a5),a1	 |- Write out the ascii number.
	Bsr	N2A3Dig			-'
	Lea	PerMsg.Num(a5),a1	-.
	Moveq	#2,d1			 |- Strip zeros from 1st 2 digits.
	Bsr	NoZero			-'
	Lea	PerMsg(a5),a0		-.
	Moveq	#PerMsgL,d3		 |- Send the message and return.
	Bra	CLIRite			-'
;;;;;;;	RTS for us.
*****************************************************************************
;===========================================================================;
; Dos Subroutines							    ;
;===========================================================================;
DOS_FILSIZE	; Measure size of a file.
DOS_CLIRITE	; Write text using CLI_Hdl(a5) as output handle.
DOS_FILRITE	; Write to a file.
DOS_WRITNOR	; Open a file as new/old for writting...
DOS_FILEXIS	; Check if a file exists. Also locks the file.
DOS_FILCLOS	; Close a file.
DOS_FILOPEN	; Open a file.
DOS_FILULOK	; Unlock a file.
DOS_READARG	; ReadArgs() routine.
DOS_FREEARG	; FreeArgs() routine.
DOS_DELETEF	; Delete a file.
DOS_CHKCRTC	; Check for ^C signal and if has been pressed exit.
	Include	ASM:Source/Routines/DOS.s
;===========================================================================;
; Data Subroutines. (Number/String Handling, etc etc)                       ;
;===========================================================================;
DATA_PADZERO	; Space-Pad Zeros from start of ASCII number.
DATA_NUM2ASC	; Raw Number to ASCII conversion.
DATA_NULLLEN	; Calculate the length of a Null-Term String.
DATA_UPPACAZ	; Upper-Case.
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

	Lea	UtlName(pc),a1		Get Address of Utility.Library Name
	Moveq	#36,d0			v36 or above.
	CALEXEC	OpenLib			Open it.
	Move.l	d0,UtlBase(a5)		Store the base adr.
	Beq	Fin_3			If Failed, End.

	Lea	Welcome(pc),a0		-.
	Move.l	#WelcLen,d3		 |- Output Welcome Message
	Bsr	CLIRite			-'

	Move.l	#LineDel_Const,LineDel(a5)	Initialize line delay.

;;;;;;;	Setup any non-zero default values for switch options here (below).

	Bra	RArgNor			Parse the commandline with ReadArgs
;;;;;;;	RTS for us.

DosName	Dc.b	"dos.library",0
UtlName	Dc.b	"utility.library",0
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
	Dc.b	"This util will strip down a given /X directory listing, leaving only the",10
	Dc.b	"filenames to save you HD space, and so that dupechecks will be even quicker.",10
	Dc.b	10
	Dc.b	155,"3mRead the docs to Super-DupeCheck (v1.03 or later) for more information. ",155,"0m",10
	Dc.b	10
WelcLen	Equ	*-Welcome
	Even
*****************************************************************************
*****************************************************************************
*****************************************************************************
*****************************************************************************
ADMsg	Dc.b	10,10
	PROGNAM
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
	Move.l	UtlBase(a5),a1		-._ Close down
	CALEXEC	CloseLib		-'  utility.library
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
Big_0	BClr	#X1_InOpen,Fil_F_1(a5)	-.
	Beq.s	Big_E			 |
	Move.l	In__Hdl(a5),d1		 |_ Close Input
	CALLDOS	Close			 |  file.
	Tst.l	d0			 |
	Beq	Error			-'
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
	IFD	TEST
	Bra	Finish			End the program.
	ELSE
	Bra.s	Finish
	ENDC
Internal Lea	InterM(pc),a0
	Moveq	#InterML,d3
	Bra.s	GenAbrt
ErrHead	Dc.b	10,155,"0m"
	PROGNAM
	Dc.b	" *ABORTED*",0			For Fault() DOS Call.
ErrHedL	Equ	(*-ErrHead)-1
InterM	Dc.b	": internal error!!",10
InterML	Equ	*-InterM
	Even
*****************************************************************************
*****************************************************************************
