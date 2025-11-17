; definable callerslog path (aquarius)

; Way to support segregation of access levels: different storage files for
; different access ranges...! (Stops EG level 4 logging on and only 3 users
; of the 20 in teh storage having level 4 or less and thus not getting a last
; TEN callers...

*****************************************************************************
* .----------------------..-----------------------------------------------. *
* |   Super-AmiLog III   || (C)1992-4 Leo Davidson (P0T-NOoDLE / Anthrox) | *
* `----------------------'`-----------------------------------------------' *
*****************************************************************************
; Original AmiLog: (C)1991 Retaliator of Anthrox (Code & Additional design) ;
;                          P0T-NOoDLE of Anthrox (Design)		    ;
;=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=;
;= Assembly Options:							   =;
;=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=;
TEST	; Include Debug-Labels, Files In RAM, Beta-CommandLine, Etc
;USUM	; CoderName/VersionNumber Checksum? (when off RELNUMBER = BETA)
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
BlockOutSize = 5120		; Size of blocks for building outputs.
;BlockOutSize = 4		; (For testing the allocation routines)
BlockAloSize = BlockOutSize+4 	; Size of actual allocated blocks.
				; +4 bytes = LW Pointer to next block/NULL.
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
; Commands to include:							    ;
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
CMDC	; Clear Command?
CMDU	; Update Command?
;CMDS	; Strip Command?
CMDO	; Output Command?
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
VERSION	MACRO
	dc.b "v3.00"
	ENDM
REVDATE	MACRO
	dc.b "10-Oct-94"
	ENDM
RELNUMB	MACRO
	dc.b "6"
;	V3.00 will be release 6.
	ENDM
BETANUM	MACRO
	dc.b	"B00"
	ENDM
PROGNAM	MACRO
	dc.b	"Super-AmiLog"
	ENDM
******************************************************************************
	Include	Asm:Include/Constants.i
	Opt	D-			Debug info OFF
	Section	Super_AmiLog,Code	Assemble to Public Mem
	IFD	TEST			-.
	Opt	D+			 |_ If In Test-Mode
	Opt	hcln			 |  Debug info ON
	ENDC				-'
*****************************************************************************
ProgBeg	Bsr	Setup			Allocate Mem and initialize stuff.
	IFD	CMDC
	Bsr	OppyC			Clear Storage-File Command.
	ENDC
	IFD	CMDU
	Bsr	OppyU			Update Command.
	ENDC
	IFD	CMDS
	Bsr	OppyS			Strip MiniCallerslog Command.
	ENDC
	IFD	CMDO
	Bsr	OppyOa			Output Command ANSI.
	Bsr	OppyOn			Output Command Non-ANSI.
	ENDC
	Bra	AllDone			Finish normally, dealloc everything.
*****************************************************************************
;===========================================================================;
; Dos Subroutines							    ;
;===========================================================================;
DOS_CLIRITE	; Write text using CLI_Hdl(a5) as output handle.
DOS_FILEXIS	; Check if a file exists. Also locks the file.
DOS_FILSIZE	; Measure size of a file.
DOS_FILALOC	; Allocate Memory for file.
DOS_FILDALO	; DeAllocate Memory for file.
DOS_FILOPEN	; Open a file.
DOS_FILCLOS	; Close a file.
DOS_FILRITE	; Write to a file.
DOS_FILREAD	; Read from a file.
DOS_FILULOK	; Unlock a File.
DOS_ERROR  	; Call after an error to write error text to Cli.
DOS_READNOR	; Call some of above routines to read file into mem.
DOS_WRITNOR	; Open a file as new/old for writting...
DOS_CHKCRTC	; Check for ^C signal and if has been pressed exit.
DOS_DELETEF	; Delete a file.
DOS_READSOM	; Read a given size a the end of the file.
DOS_DATESTR	; Fill in date structures and strings.
DOS_READARG	; ReadArgs() routine.
DOS_FREEARG	; FreeArgs() routine.
	Include	ASM:Source/Routines/DOS.s
;===========================================================================;
; Data Subroutines. (Number/String Handling, etc etc)                       ;
;===========================================================================;
DATA_SR_FACS	; Serach, Forwards, Case Sensitive - String, Till ADR
DATA_SR_BACS	; Serach, Backwards, Case Sensitiv - String, Till ADR
DATA_SR_EITH	; Search, Forwards, Case Sensitive - 1 of 2 Bytes.
DATA_SR_AdrB	; Search, Forwards, Case Sensitive - Byte, Till ADR
DATA_SRBAdrB	; Serach, Backwards, Case Sensitiv - Byte, Till ADR
DATA_UPPACAZ	; Upper-Case.
DATA_SPAOVER	; Overlay output with (space) padding.
DATA_N2AAuto	; Automatically selects the needed NUM2ASC routine.
DATA_NUM2ASC	; Raw Number to ASCII conversion.
DATA_N2ASCFT	; Raw Number to ASCII conversion, to Format-Text Blocks.
DATA_ASC2NUM	; ASCII to Raw Number conversion.
DATA_TIMECON	; Time Convertion routine (ASCII HH:MM -> Raw Minutes).
DATA_PADZERO	; Space-Pad Zeros from start of ASCII number.
DATA_NULLLEN	; Calculate the length of a Null-Term String.
DATA_RNDBYTE	; Generate a BYTE sized random number.
DATA_RNDWORD	; Generate a WORD sized random number.
DATA_CHARCOP	; Copy x chars with specified terminator.
	Include	ASM:Source/Routines/Data.s
;===========================================================================;
	Include	ASM:Source/SAL/Source/SAmiLog.Constants
	Include	ASM:Source/SAL/Source/SAmiLog.Routines
	Include	ASM:Source/SAL/Source/Block/SAmiLog.Block.Main
	IFD	CMDC
	Include	ASM:Source/SAL/Source/Commands/SAmiLog.Command_C
	ENDC
	IFD	CMDO
	Include	ASM:Source/SAL/Source/Commands/SAmiLog.Command_O
	ENDC
	IFD	CMDS
	Include	ASM:Source/SAL/Source/Commands/SAmiLog.Command_S
	ENDC
	IFD	CMDU
	Include	ASM:Source/SAL/Source/Commands/SAmiLog.Command_U
	ENDC
	END				That's it!
