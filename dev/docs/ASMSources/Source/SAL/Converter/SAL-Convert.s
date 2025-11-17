* Don't forget to make it read in Super-TopCPS storage files! *

*****************************************************************************
* .----------------------..-----------------------------------------------. *
* | ----Super AmiLog---- || Source/Binary (C)1992-4 P0T-NOoDLE of AnTHRoX | *
* | MultiNode Compatable || Original AmiLog (C)1991 Retaliator of AnTHRoX | *
* | /X Last Callers Util || Original Design       Pot-Noodle & Retaliator | *
* `----------------------'`-----------------------------------------------' *
*****************************************************************************
TEST	; Test version?     (Debug-Labels, Files In Ram, CommandLine, Etc)
CHNAME	; Change output filename to "Temp:SAmiLog.Store" ?

TSTCMDL	MACRO	; NOTE: run "SAL-Convert -ß" to have the test commandline used.
	Dc.b	'Temp:Storage_v2',10
	ENDM

VERSION	MACRO
	dc.b "b1.00"
	ENDM
REVDATE	MACRO
	dc.b "20 June 1994"
	ENDM
RELNUMB	MACRO
	dc.b "0"
	ENDM
BETANUM	MACRO
	dc.b	"ß00"
	ENDM
PROGNAM	MACRO
	dc.b	"SAL-Converter"
	ENDM
******************************************************************************
	Include	Asm:Include/Equates
	Opt	D-			Debug info OFF
	Section	SALConverter,Code	Assemble to Public Mem
	IFD	TEST			-.
	Opt	D+			 |_ If In Test-Mode
	Opt	hcln			 |  Debug info ON
	ENDC				-'
******************************************************************************
	Bra	ProgBeg
VerStr	Dc.b	"$VER: "		-.
	PROGNAM				 |
	Dc.b	" "			 |
ActVer	VERSION				 |
	Dc.b	" ("			 |- For 2.0+ Version Command
	REVDATE				 |
	Dc.b	")",10,0		-'
	Include	ASM:Source/SAL/SAL-Convert.i
	Even
	IFD	TEST
TCMDTXT	TSTCMDL
TCMDLEN	Equ	*-TCMDTXT
	ENDC
	IFD	CHNAME
CHNam	Dc.b	"Temp:SAmiLog.Store",0
CHNamL	Equ	*-CHNam
	Endc
DosName	Dc.b	"dos.library",0
	EVEN
ProgBeg	Movem.l	d0/a0,-(SP)		Preserve CommandLine Length/Adr
;===========================================================================;
; For residence, allocate memory for anything that'll change, and null it   ;
;===========================================================================;
	Move.l	#LENVARS,d0			-.  Allocate
	Move.l	#Memf_Public!Memf_Clear,d1	 |_ Memory for
	Move.l	(ExecBase).w,a6			 |  Variables and
	Jsr	AllocMem(a6)			-'  Overlays.
	Move.l	d0,a5			Put variable/overlay address into A5
	Tst.l	d0			(Moves to a* don't set CCR).
	Beq	Fin_1			If Allocation failed, Exit Program
	IFD	LENOVER
	Lea	NULLEND(a5),a0		-.
	Lea	Over00(pc),a1		 |  Copy Overlay
	Move.l	#(LENOVER/2)-1,d0	 |- Backings onto
OverPrL	Move.w	(a1)+,(a0)+		 |  Overlay Space (word moves)
	DBra	d0,OverPrL		-'
	ENDC
;===========================================================================;
	Movem.l	(SP)+,d0/a0		Restore CommandLine Length/Adr
	Move.l	a0,CommAdd(a5)		Store Commandline Address
	Move.l	d0,CommLen(a5)		Store Length of Commandline
	Move.l	a7,StarStk(a5)		Store Stack Pointer
;;;;;;;	Move.l	(ExecBase).w,a6		Point to ExecBase for OpenLib
	Lea	DosName(pc),a1		Get Address of Dos.Library Name
	Moveq	#36,d0			DOS v36 or Higher Required
	Jsr	OpenLib(a6)		Open Dos.Library (exec v36 req)
	Move.l	d0,DosBase(a5)		Store Address of Dos.Library
	Beq	Fin_2			If OpenLib failed, end Program
	Move.l	d0,a6			Point to Dos.Library for future use.
	Jsr	OutPut(a6)		-._ Get output Handle
	Move.l	d0,CLI_Hdl(a5)		-'  (CLI window or whatever)
*****************************************************************************
* Remove Spaces from Start Of commandline.                                  *
*****************************************************************************
	IFD	TEST
;;;;;;;	This could cause enforcer hits for v.short commandlines, but doesn't
;;;;;;;	matter because it's only for beta testing purposes.
	Move.l	CommAdd(a5),a0		-.
	Cmpi.b	#"-",(a0)+		 |
	Bne.s	CmdLine			 |
	Cmpi.b	#"ß",(a0)		 |- Skip unless beta-commandline...
	Bne.s	CmdLine			-'
	Lea	TCMDTXT(pc),a0		-.
	Move.l	a0,CommAdd(a5)		 |- Else setup the beta-commandline.
	Move.l	#TCMDLEN,CommLen(a5)	-'
	ENDC
CmdLine	Move.l	CommAdd(a5),a0		Get Command line address
Spaze	Cmpi.b	#" ",(a0)+		Is this Char a space?
	Bne.s	NoSpaze			Nope. Continue Program
	Subq.l	#1,CommLen(a5)		Take one from commandline length.
	Bra.s	Spaze			Check next char.
NoSpaze	Subq.l	#1,a0			Point Back to The Non-Space char
	Move.l	a0,CommAdd(a5)		Store new Command line address
Wetern	Add.l	CommLen(a5),a0		Point to End of CommandLine
	Cmpi.b	#10,-1(a0)		Make sure CommandLine is return'd
	Bne	InvaTex			Invalid CommandLine, Show Help Text.
	SF	-1(a0)			Null-terminate the commandline...
*****************************************************************************
* Check Commandline. If its 1 char output help text.                        *
*****************************************************************************
	Move.l	CommLen(a5),d1		Checking CommandLength
	Cmpi.l	#1,d1			Compair em.
	Ble	HelpTex			If No Commandline show Help Text.

	Move.l	CommAdd(a5),a2
	Cmpi.b	#"?",(a2)		Did they enter "?"?
	Beq	HelpTex			Yes = Send Help Text.

	Lea	HelTex(pc),a0		-.
	Moveq	#HeadLen,d3		 |- Output Welcome Message
	Bsr	CLIRite			-'
*****************************************************************************
* Parse the commandline as the filename to be used.                         *
*****************************************************************************
COMMAIN	Move.l	CommAdd(a5),a0		-._ Read file using name given on
	Bsr	NRead3			-'  the commandline.

	IFD	CHNAME
	Lea	CHNam(pc),a0
	Move.l	a0,CommAdd(a5)
	Move.l	#CHNamL,CommLen(a5)
	ENDC

	Bra.s	DoVer_X
;---------------------------------------------------------------------------;
;- Make sure this thing is a SAmiLog storage file (any version) ------------;
;---------------------------------------------------------------------------;
VerSt_X	Dc.b	"*SAL",0		ALL Versions start with this.
	Even
DoVer_X	Move.l	FileAdr(a5),a0		Point to the file.
	Move.l	a0,d6			-._ End+1 of file.
	Add.l	FileSze(a5),d6		-'  (Where to stop searching).
	Lea	VerSt_X(pc),a2		Gunna search for "*SAL"
	Bsr	SAdrStr			Search for it.
; It should be at the start of the file, => offset = 0
	Tst.l	d3			Is the offset 0?
	Bne	Bad_vX			NO = Bad File!
	Bra.s	DoVer_1
;---------------------------------------------------------------------------;
;- Routine for Storage-File v001 (SAmiLog v1.xx) ---------------------------;
;---------------------------------------------------------------------------;
v1_S_Vers	Dc.b	"*SALv001",0	Vers string for v001
		Even
DoVer_1	Move.l	FileAdr(a5),a0		Point to the file.
	Move.l	a0,d6			-._ End+1 of file.
	Add.l	FileSze(a5),d6		-'  (Where to stop searching).
	Lea	v1_S_Vers(pc),a2	Gunna search for "*SALv001"
	Bsr	SAdrStr			Search for it.
; It should be at the start of the file, => offset = 0
	Tst.l	d3			Is the offset 0?
	Beq	Bad_v1			YES = Say v001 not supported!
	Bra	DoVer_2
;---------------------------------------------------------------------------;
;- Routine for Storage-File v002 (SAmiLog v2.xx) ---------------------------;
;---------------------------------------------------------------------------;
*	Check filesize. BAD = Send invalid message, EXIT.
*	Convert all stuff into a v003 storage file.
*	Save the file, dealoc everything.
*	Start the util again w/ same commandline so new file is loaded.
v002LoadM	Dc.b	10,"Storage file is v002 (SAmiLog v2.xx)...",10,10
v002LoadL	Equ	*-v002LoadM
v002ConvM	Dc.b	10,"...Converting v002 file to v003 (SAmiLog v3.xx)..."
v002ConvL	Equ	*-v002ConvM
v002DoneM	Dc.b	10," ...Done!",10,10
v002DoneL	Equ	*-v002DoneM
		Even
*---------------------------------------------------------------------------*
* v002 -> v003 Day Converter                                                *
*---------------------------------------------------------------------------*
c23CDay	Move.l	v2_SD_Date(a0),v3_SD_Date(a1)

	Move.l	v2_SD_Date(a0),DT_Days(a5)	Days since 1978
	Bsr	FilInD9			Convert to strings in D8_xxxx
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
	Lea	D8_Name(a5),a2		-.
	Lea	v3_SD_DayName(a1),a3	 |
	Move.b	(a2)+,(a3)+		 |- Write 3 letter day name.
	Move.b	(a2)+,(a3)+		 |
	Move.b	(a2)+,(a3)+		-'
	SF	(a3)+			Nullterm it.
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
	Moveq	#8,d7			-.
	Lea	D8_Date(a5),a2		 |_ Put it date into the struct.
	Lea	v3_SD_AsciiDate(a1),a3	 |
c23DmD8	Move.b	(a2)+,(a3)+		 |
	DBra	d7,c23DmD8		-'
	SF	(a3)+			Nullterm it.
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
	Move.w	v2_SD_Calls(a0),v3_SD_Calls(a1)
	Move.l	v2_SD_UpKBytes(a0),v3_SD_UpKBytes(a1)
	Move.w	v2_SD_UpFiles(a0),v3_SD_UpFiles(a1)
	Move.w	v2_SD_UpFails(a0),v3_SD_UpFails(a1)
	Move.l	v2_SD_DnKBytes(a0),v3_SD_DnKBytes(a1)
	Move.w	v2_SD_DnFiles(a0),v3_SD_DnFiles(a1)
	Move.w	v2_SD_DnFails(a0),v3_SD_DnFails(a1)
	Move.l	v2_SD_UsedMins(a0),v3_SD_UsedMins(a1)
	Move.w	v2_SD_NewUsers(a0),v3_SD_NewUsers(a1)
	Move.w	v2_SD_Hacks(a0),v3_SD_Hacks(a1)
	Move.w	v2_SD_Drops(a0),v3_SD_Drops(a1)
	Move.w	v2_SD_Pages(a0),v3_SD_Pages(a1)
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
;;;;;;;	Leave all hour info blank.
	RTS
*****************************************************************************
DoVer_2	Move.l	FileAdr(a5),a0		Point to the file.
	Move.l	a0,d6			-._ End+1 of file.
	Add.l	FileSze(a5),d6		-'  (Where to stop searching).
	Lea	v2_S_Vers(pc),a2	Gunna search for "*SALv002"
	Bsr	SAdrStr			Search for it.
; It should be at the start of the file, => offset = 0
	Tst.l	d3			Is the offset 0?
	Bne	DoVer_3			Nope = Check for v003
	Lea	v002LoadM(pc),a0	-.
	Moveq	#v002LoadL,d3		 |_ Send message that v002
	Move.l	DosBase(a5),a6		 |  file loaded.
	Bsr	CLIRite			-'
	Cmpi.l	#v2_S_Size,FileSze(a5)	-._ If wrong filesize,
	Bne	Bad_v2			-'  say invalid v002 file!
;-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-;
; The conversion routine itself (v002 -> v003)				    ;
;-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-;
	Lea	v002ConvM(pc),a0	-.
	Moveq	#v002ConvL,d3		 |_ Say converting v002
;;;;;;;	Move.l	DosBase(a5),a6		 |  to v003!
	Bsr	CLIRite			-'

	Move.l	FileAdr(a5),a4		Adr of Input file into a4.
;:::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::;
;:: MAKE SURE NOTHING TOUCHES a4 WITHOUT REPLACING IT!!!!! :::::::::::::::::;
;:::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::;
	Lea	v3_StorFil(a5),a1	Point to StorFile in Pre-Aloc'd Mem
;;;;;;;	We can assume that it is already cleared.
	Move.l	v3_S_Vers(pc),(a1)+		-._ Version
	Move.l	v3_S_Vers+4(pc),(a1)+		-'  String.
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
	Move.l	v2_SX_Clear_Date(a4),DT_Days(a5)	Clear days since 1978
	Bsr	FilInD9			Convert to string in D8_Date
	Moveq	#8,d7			-.
	Lea	D8_Date(a5),a0		 |_ Put it date into the struct.
c23ClD8	Move.b	(a0)+,(a1)+		 |
	DBra	d7,c23ClD8		-'
	SF	(a1)+			Nullterm it.
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
	Moveq	#4,d6			5 Filenames to write. (-1dbra)
c23CXF2	Lea	v3_STD_Filename_String(pc),a0	"Blank" filename...
	Moveq	#(v3_STD_Filename_Length/2)-1,d7	and it's length (words,-1)
c23CXF1	Move.w	(a0)+,(a1)+
	DBra	d7,c23CXF1
	DBra	d6,c23CXF2
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
	Lea	v2_SD0_Base(a4),a0	Point to 1st day struct (v002).
	Lea	V3_SD0_Base(a5),a1	Point to 1st day struct (v003).
	Bsr	c23CDay			Convert v002 -> v003
	Lea	v2_SD1_Base(a4),a0
	Lea	v3_SD1_Base(a5),a1
	Bsr	c23CDay
	Lea	v2_SD2_Base(a4),a0
	Lea	v3_SD2_Base(a5),a1
	Bsr	c23CDay
	Lea	v2_SD3_Base(a4),a0
	Lea	v3_SD3_Base(a5),a1
	Bsr	c23CDay
	Lea	v2_SD4_Base(a4),a0
	Lea	v3_SD4_Base(a5),a1
	Bsr	c23CDay
	Lea	v2_SD5_Base(a4),a0
	Lea	v3_SD5_Base(a5),a1
	Bsr	c23CDay
	Lea	v2_SD6_Base(a4),a0
	Lea	v3_SD6_Base(a5),a1
	Bsr	c23CDay
	Lea	v2_SD7_Base(a4),a0
	Lea	v3_SD7_Base(a5),a1
	Bsr	c23CDay
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;

	Bra.s	c23_Write

	Move.w	v2_SR_Calls(a4),v3_SR_Calls(a5)
	Move.l	v2_SR_Calls_D(a4),DT_Days(a5)	Days since 1978
	Lea	v3_SR_Calls_D(a1),a3	Where to put it.
	Bsr	c23RD8C

*---------------------------------------------------------------------------*
* v002 -> v003 Record Date Converter                                        *
*---------------------------------------------------------------------------*
; DT_Days(a5) Days Sinse 1978       ; (a3) Output "DDD, DD-MMM-YY",0,0
c23RD8C	Bsr	FilInD9			Convert to strings in D8_xxxx
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
	Lea	D8_Name(a5),a2		-.
	Move.b	(a2)+,(a3)+		 |- Write 3 letter day name.
	Move.b	(a2)+,(a3)+		 |
	Move.b	(a2)+,(a3)+		-'
	Move.b	#",",(a3)+		-._ "DDD, "
	Move.b	#" ",(a3)+		-'
;- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -;
	Moveq	#8,d7			-.
	Lea	D8_Date(a5),a2		 |_ Put it date into the struct.
c23RmD8	Move.b	(a2)+,(a3)+		 |
	DBra	d7,c23RmD8		-'
	SF	(a3)+			Nullterm it.
	SF	(a3)+			(Even)
	RTS






;-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-;
c23_Write
	Move.l	CommAdd(a5),a0		Filename.
	Bsr	FileDel			Delete old file if there.
;;;;;;;	If for some reason they run more than one copy of SAmiLog, or just one
;;;;;;;	copy with the "-C" command after "-O" or "-U", the FileDel call will
;;;;;;; fail after 15 seconds because the storage file will be locked...
;;;;;;; BTW: FileDel just incase the storage file gets smaller (or someone
;;;;;;;	re-installs an older version after running a newer one or whatever.

	Move.l	CommAdd(a5),a0		Filename.
	Move.l	#Mode_New,d2
	Bsr	FilOpen
	Move.l	#v3_S_Size,d3		Length of Storage file.
	Lea	v3_StorFil(a5),a0	Get address
	Bsr	FilRite			Write File
	Bsr	FilClos			Close file
;-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-;
	Lea	v002DoneM(pc),a0	-.
	Moveq	#v002DoneL,d3		 |_ Say converted!
;;;;;;;	Move.l	DosBase(a5),a6		 |  v002 to v003
	Bsr	CLIRite			-'
	Bra	Finish
;---------------------------------------------------------------------------;
;- Routine for Storage-File v003 (SAmiLog v3.xx) ---------------------------;
;---------------------------------------------------------------------------;
v003LoadM	Dc.b	10,"Storage file is v003 (SAmiLog v3.xx)",10,10
		Dc.b	"This is the highest version supported by this converter,",10
		Dc.b	"so there's nothing else to do!",10,10
		Dc.b	"Thank you for using SAmiLog!",10
		Dc.b	"                Look out for more utilities from Gods'Gift!",10,10
v003LoadL	Equ	*-v003LoadM
		Even
DoVer_3	Move.l	FileAdr(a5),a0		Point to the file.
	Move.l	a0,d6			-._ End+1 of file.
	Add.l	FileSze(a5),d6		-'  (Where to stop searching).
	Lea	v3_S_Vers(pc),a2	Gunna search for "*SALv003"
	Bsr	SAdrStr			Search for it.
; It should be at the start of the file, => offset = 0
	Tst.l	d3			Is the offset 0?
	Bne	Bad_vF			No = Future version!
; Reached here => v003 storage file loaded.
	Lea	v003LoadM(pc),a0	-.
	Move.l	#v003LoadL,d3		 |_ Send message that v003
	Move.l	DosBase(a5),a6		 |  file loaded.
	Bsr	CLIRite			-'
	Bra.s	AllDone			Dealloc & Finish.
;---------------------------------------------------------------------------;
*****************************************************************************
*: Commonly Used (Sub-?)Routines (Semi-Macros??) :::::::::::::::::::::::::::*
*****************************************************************************
;---------------------------------------------------------------------------;
ADMsg	Dc.b	"SAL-Convert: All done!.",10
ADMsgL	Equ	*-ADMsg
	Even
AllDone	Move.l	DosBase(a5),a6
	Lea	ADMsg(pc),a0
	Moveq	#ADMsgL,d3
	Bsr	CLIRite
*=- FINISH -=****************************************************************
* Close Everything Down, Return Memory Etc to System and End Program        *
*****************************************************************************
Finish
	IFD	TEST
	Move.l	DosBase(a5),a6
	Lea	RTN_Msg(pc),a0
	Move.l	#RTN_Len,d3
	Bsr	CLIRite
	Bra.s	RTN_End
RTN_Msg	Dc.b	"*** Finish routine run. ***",10
RTN_Len	Equ	*-RTN_Msg
	Even
RTN_End
	ENDC
; FilDAlo sets exec for itself, then dos for Clos,Ulok
	Bsr	FilDAlo			Make sure default file is unallocd.
	Bsr	FilClos			Make sure default file is closed.
	Bsr	FilULok			Make sure default file is unlocked.
	Move.l	(ExecBase).w,a6
	Move.l	DosBase(a5),a1		-._ Close down
	Jsr	CloseLib(a6)		-'  dos.library
Fin_2	Move.l	StarStk(a5),a7		Ignore all Branches
	Move.l	(ExecBase).w,a6		(In case Fin_2 called)
	Move.l	#LENVARS,d0		-.
	Move.l	a5,a1			 |- Unallocate Variables/Overlays
	Jsr	FreeMem(a6)		-'
	Moveq	#RETURN_OK,d0		No Error return code to dos
Fin_1	RTS				End Program
*- ERROR MESSAGES -**********************************************************
* HELP TEXTS AND ERROR MESSAGES                                             *
*****************************************************************************
GenAbrt	Movem.l	d3/a0,-(SP)
	Move.l	DosBase(a5),a6		Using Dos for CLI output...
	Lea	ErrHead(pc),a0		General header for Abort messages...
	Moveq	#ErrHedL,d3		Length of above.
	Bsr	CLIRite			Send it to them.
	Movem.l	(SP)+,d3/a0
GenAbt2	Bsr	CLIRite			Send msg from calling routine.
	Bra.s	Finish			End the program.
Internal Lea	InterM(pc),a0
	Moveq	#InterML,d3
	Bra.s	GenAbrt
InvaTex	Lea	InvaM(pc),a0
	Moveq	#InvaML,d3
	Bra.s	GenAbrt
HelpTex	Lea	HelTex(pc),a0
	Move.l	#HelTexL,d3
	Move.l	DosBase(a5),a6
	Bra.s	GenAbt2
Bad_vX	Lea	BadvXM(pc),a0
	Moveq	#BadvXL,d3
	Bra.s	GenAbrt
Bad_vF	Lea	BadvFM(pc),a0
	Move.l	#BadvFL,d3
	Bra.s	GenAbrt
Bad_v1	Lea	Badv1M(pc),a0
	Move.l	#Badv1L,d3
	Bra.s	GenAbrt
Bad_v2	Lea	Badv2M(pc),a0
	Move.l	#Badv2L,d3
	Bra.s	GenAbrt
BadvXM	Dc.b	": file has no SAmiLog Storage-File Header!",10
BadvXL	Equ	*-BadvXM
BadvFM	Dc.b	": Storage file from unsupported version of SAmiLog!",10
	Dc.b	10
	Dc.b	"This converter will only recognise storage files with from versions",10
	Dc.b	"1.xx, 2.xx, and 3.xx, of SAmiLog.",10
	Dc.b	10
	Dc.b	"If you are using a newer version of SAmiLog, you will need to get",10
	Dc.b	"an updated version of this program (provided one has been written!)",10
	Dc.b	10
	Dc.b	"Please read the history text for your version of SAmiLog for information",10
	Dc.b	"on what you should do to convert your storage file.",10
	Dc.b	10
BadvFL	Equ	*-BadvFM
Badv1M	Dc.b	": Storage file is from SAmiLog v1.xx!",10,10
	Dc.b	" SAmiLog v1.xx storage files are NOT converted by this program;",10
	Dc.b	"There is little point seeing as there is not record-data in them.",10,10
	Dc.b	" If you are upgrading to SAmiLog v3.xx from v1.xx, the best thing",10
	Dc.b	"to do is simply clear a new storage file. You will only lose the",10
	Dc.b	"info about today and yesterday, which is no great loss!",10,10
	Dc.b	"To clear a new file, install SAmiLog v3.xx, goto a CLI, and type:",10,10
	Dc.b	"SAmiLog -C",10,10
Badv1L	Equ	*-Badv1M
Badv2M	Dc.b	": Storage file is the wrong size!!",10,10
	Dc.b	" This file has a version 2 header but must have been screwed up in",10
	Dc.b	"some way!! - There is nothing much that can be done with it!",10,10
	Dc.b	" The best thing to do is to clear a new storage file, as your old",10
	Dc.b	"one is of no use anyway!",10,10
	Dc.b	"To clear a new file, install SAmiLog v3.xx, goto a CLI, and type:",10,10
	Dc.b	"SAmiLog -C",10,10
Badv2L	Equ	*-Badv2M
ErrHead	Dc.b	10,155,"0mSAL-Convert *ABORTED*",0	For Fault() DOS Call.
ErrHedL	Equ	(*-ErrHead)-1
InterM	Dc.b	": internal error!!",10
InterML	Equ	*-InterM
InvaM	Dc.b	": bad commandline!",10
InvaML	Equ	*-InvaM
HelTex	Dc.b	10,155,"32;1mSAL-Convert "
	VERSION
	Dc.b	" ",155,"0m[",155,"33m"
	IFND	USUM
	Dc.b	"REL-"
	RELNUMB
	Dc.b	" "
	BETANUM
	ENDC
	IFD	USUM
	Dc.b	"RELEASE "
	RELNUMBER
	ENDC
	Dc.b	155,"0m] ",155,"32m- ",155,"33m©1994 P0T-NOoDLE of ANTHR0X.",155,"0m",10
HeadLen	Equ	*-HelTex
	Dc.b	155,"0mWritten entirely in 680x0 ASSEMBLER.",10
	Dc.b	155,"0mSuper-AmiLog Support Utlitiy:",10
	Dc.b	155,"0mConverts Super-AmiLog v2.xx storage files to v3.00 format.",10
	Dc.b	10
	Dc.b	155,"0mConverted files will retain all your old records and caller data,",10
	Dc.b	155,"0mbut will obviously not have any records for any of the new features",10
	Dc.b	155,"0moffered by version three.",10
	Dc.b	10
	Dc.b	155,'32mSAL-Convert ',155,'0m<',155,'33mFILENAME',155,'0m>',155,'22C',155,'0mConvert <FILENAME>.',10
	Dc.b	10
	Dc.b	155,"0mEg: ",155,"32;43m SAL-Convert S:SAmiLog.Store ",10
	Dc.b	10
	Dc.b	155,"0mNOTE: The ENTIRE commandline is used as the filename, so don't put any",10
	Dc.b	155,"0m----- spaces on the end, or anything silly like that.",10
	Dc.b	10
	Dc.b	155,"0mNOTE: The file you give will be overwritten with the converted version...",10
	Dc.b	155,"0m----- It's a good idea to first make a backup of your old storage file in",10
	Dc.b	155,"0m----- case something goes wrong, or you decide to go back to your old",10
	Dc.b	155,"0m----- version of Super-AmiLog.",10
	Dc.b	10
	Dc.b	155,"0mFor more info refer to the Super-AmiLog v3.xx docs.",10
	Dc.b	10
HelTexL	Equ	*-HelTex
	Even
;===========================================================================;
;---------------------------------------------------------------------------;
*****************************************************************************
*: Sub Routines ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::*
*****************************************************************************
;---------------------------------------------------------------------------;
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
;DOS_CHKCRTC	; Check for ^C signal and if has been pressed exit.
DOS_DELETEF	; Delete a file.
;DOS_READSOM	; Read a given size a the end of the file.
DOS_DATESTR	; Fill in date structures and strings.
	Include	ASM:Source/Routines/DOS.s
;===========================================================================;
; Data Subroutines. (Number/String Handling, etc etc)                       ;
;===========================================================================;
DATA_SR_FACS	; Serach, Forwards, Case Sensitive - String, Till ADR
DATA_SPAOVER	; Overlay output with (space) padding.
DATA_NUM2ASC	; Raw Number to ASCII conversion.
DATA_PADZERO	; Space-Pad Zeros from start of ASCII number.
DATA_NULLLEN	; Calculate the length of a Null-Term String.
	Include	ASM:Source/Routines/Data.s
;===========================================================================;
	End				That's it!
