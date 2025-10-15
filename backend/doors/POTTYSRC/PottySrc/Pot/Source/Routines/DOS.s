; Convert all file openning etc to linked lists.
;
; <Previous file> (If null, this is the base file, use to dealloc all).
; <Next file> (If null, this is the last file).
; <Memory Size> (If null, this file has no memory attacted to it).
; <Address of Mem> (If null, this file has no memory attached to it).
; <Name Size> (If null, this file has no filename (?)).
; <Name Address> (As above) - Name should be null-termed too.
; <Handle> (If null, file isn't open).
;
; -> Add bits to std_flag to tell all new file routines:
;    1) Quit program upon error / return to caller with error.
;       (A flag set to tell it there was an error, and error# returned in
;       d0 or something)
;    2) Whether to report any errors.
;       Thus the program could try and open, say, a prefs file, and report
;       that it couldn't open it, but then continue using defaults.
;    3) Perhaps an option to report the next error with a requester instead
;       of through shell. (Obviously not for AmiExpress doors!)
;
******
**
**  Note: Although this is called "DOS", it's more "System" routines now.
**
******
**
** 27/NOV/94 - NOTE: TRIED TO ASM Page.s AND THIS PART OF THE CODE WAS **
** Causing probs...
**
** IF FileSze is defined as anything (should be in the variables' RS table)
** it appears that the DOS.s include must be done AFTERWARDS as otherwise
** loads of wierd stuff happens ("phasing errors" (???) and complaints of
** non-existant labels which are actually there...))
**
** The code that causes this to happen is marked with "SEE NOTE AT TOP"
**
** 19/APR/95 - Had similar problems with another bit of code, it seems to
** be something to do with using "IFND XXXX" or "IFD XXXX" on a block and
** then referencing XXXX within that block in some way...
** I don't understand WHY these phasing errors happen as it seems perfectly
** reasonable to do: (But this drives Devpac wild is IntName isn't defined!!)
**
**		IFND IntName
** IntName	Dc.b	"intuition.library",0
**		ENDC
**
******
**
** Perhaps the fileheader should be allocated using AllocDosObject()
** instead of just as part of the variables? (In case of change in size
** or something). (FreeDosOject() to dealloc it)
**
******
*****************************************************************************
*: AmigaDOS Subroutines ::::::::::::::::::::::::::::::::::::::::::::::::::::*
*****************************************************************************
;DOS_ERROR	; Error Message routine for most DOS calls.
;DOS_CLIRITE	; Write text using CLI_Hdl(a5) as output handle.
;DOS_FILEXIS	; Check if a file exists. Also locks the file.
;DOS_FILSIZE	; Measure size of a file.
;DOS_FILALOC	; Allocate Memory for file.
;DOS_FILDALO	; DeAllocate Memory for file.
;DOS_FILOPEN	; Open a file.
;DOS_FILCLOS	; Close a file.
;DOS_FILRITE	; Write to a file.
;DOS_FILREAD	; Read from a file.
;DOS_FILULOK	; Unlock a file.
;DOS_DOORERR	; Set to have Error output send to /X Routines
;		; May also be used by other things to check if door.
;DOS_READNOR	; Call some of above routines to read file into mem.
;DOS_WRITNOR	; Open a file as new/old for writting...
;DOS_CHKCRTC	; Check for ^C signal and if has been pressed exit.
;DOS_DELETEF	; Delete a file.
;DOS_SHORT_1	; Makes some Bsr's to Bsr.s - set if ya get warnings
;DOS_READSOM	; Read a given size a the end of the file.
;DOS_DATESTR	; Fill in date structures and strings.
;DOS_READARG	; ReadArgs() routine.
;DOS_FREEARG	; FreeArgs() routine.
;DOS_EASYREQ	; EasyRequestArg() routine.
;	INCLUDE	ASM:Source/Routines/DOS.s
*****************************************************************************

*****************************************************************************
* DOS Library Subroutines...                                                *
*****************************************************************************
* Version: 1.07 - 18-Apr-95                                                 *
* Completely changed the way libraries are openned and closed. Christ, I    *
*  feel like Joe Hodge, introducing something one version and completely    *
*  re-writting it the next (not even two months later)!!                    *
*  Libraries are now openned based on a structure in variable mem (see new  *
*  DOS_Base.s)...                                                           *
* The new lib openner features quite a good error reporting system, IMHO.   *
*- New File-Block routines still to be written.                             *
*****************************************************************************
* Version: 1.06 - 20-Feb-95                                                 *
* Libraries are now opened like file-memory is allocated.                   *
*  This means big changes to the Setup/Finish code. However, the old style  *
*  code should(?) still work fine as old routines haven't been changed.     *
* New routines: *OL* for Open-libraries, includes special OL_Error-Message. *
* ------------- EasyReq for putting up EasyRequestors...                    *
* Error routine now only included if DOS_ERROR defined as there are now     *
*               routines which do not use the "Error" routine.              *
* Error routine will not include code for reporting of filenames if FileNam *
*               variable does not exist.                                    *
*****************************************************************************
* Version: 1.05 - 16-August-1994                                            *
* Source should have no use of a6 at all! Use the CALEXEC & CALLDOS macros! *
* Note: File(De)Aloc routines still Move DosBase(a5),a6 before Returning.   *
*****************************************************************************
* Version: 1.04 -  9-August-1994                                            *
* Since Version 1.03: FileExis Changed considerably. Auto setting of Lock   *
* ------------------- bit for BigDAlo, auto waiting on file in use.         *
* ------------------- Now must have an adr to call if file doesn't exit.    *
* ------------------: No longer using Temp001(a5) for filenames, is now a   *
* ------------------- FileNam(a5) pointer for the filename. This should be  *
* ------------------- set even when conditionally branching to the error    *
* ------------------- routine.                                              *
* ------------------: FileNam(a5) should be nulled after all accessing done *
* ------------------: Includes in actual program rearranged, all new stuff  *
* ------------------- should be based around the SAmiLogv3/SDC1.02 code.    *
* ------------------: Added FilInD8 routine.                                *
* ------------------- **> NOW INCLUDES BASED ON IF SYMBOLS ARE DEFINED, NOT *
* ------------------- **> WHAT THEY'RE DEFINED AS! Only define wanted rutns *
*---------------------------------------------------------------------------*
* Version: 1.03 - (Super) PED-Pager                                         *
* Since Version 1.02: NRead Routine now retries 3 times when file in use.   *
* ------------------- **IMPORTANT** Standard file routines all set/unset    *
* ------------------- **IMPORTANT** bits for BigDAlo in case of errors etc. *
* ------------------- **IMPORTANT** BigDAlo should BSR to FilDAlo, FilClos, *
* ------------------- **IMPORTANT** and FilULok                             *
* ------------------- **IMPORTANT** All routines using the default FilePtrs *
* ------------------- **IMPORTANT** should be checked to change the bits.   *
* ------------------- **IMPORTANT** After calling FilExis, set bit manually *
* ------------------- FilWrite routine now BEQ-Error's, dunno why it didn't *
* ------------------- WRITNOR routine added.                                *
*---------------------------------------------------------------------------*
* Version: 1.02 - ^M Stripper                                               *
* Since Version 1.01: DOS_DoorError routine added.                          *
*---------------------------------------------------------------------------*
* Version: 1.01 - SAmiLog - Locker                                          *
* Since Version 1.00: Error: Now used Fault() call to write error STRING    *
* ------------------- into a buffer. (Remove old overlay, add 80byte buff)  *
* ------------------- UNlock now seperate routine. (was in FilMeas)         *
* ------------------- New Jumps added to routines...                        *
*---------------------------------------------------------------------------*
* Version: 1.00 - SNewLst                                                   *
* Since Version 0.00: N/A                                                   *
*****************************************************************************

;NOTE: Routines arranged to make all calls between routines used by NRead
;----- short addressed. (At least they were!)

;---------------------------------------------------------------------------;
;- STD_F_1 ---------------------------- Standard (Default) Access Files ----;
;---------------------------------------------------------------------------;
SF1_Locked	Equ	0	File is Locked. (Needs UnLocking)
SF1_Open	Equ	1	File is Open. (Needs Closing)
SF1_InMem	Equ	2	File is In Memory. (Needs DeAllo'ing)
SF1_NWGetS	Equ	3	Should NWrite routine set filesize?
;			Above will only work if FilMeas is enabled
SF1_ReadArgs	Equ	4	RDArgs Structure requires FreeArgs()
SF1_OpnLibErr	Equ	5	If set, one or more libs couldn't be openned.


	IFD	DOS_WRITNOR
*- OPEN WRITE (NORMAL) -*****************************************************
* NWrite:  a0          -.  Address of                                       *
* NWrite2: FileNam(a5)  |- Null-Terminated Filename                         *
* NWrite3: FileNam(a5) -'                                                   *
* -------> NWrtNFd(a5) - Address of routine to call if file doesn't exist.  *
* All:     Temp002(a5) Mode_New/Mode_Old (Mode to use if it DOES exist)     *
* >>>>>>>> It appears that Temp002(a5) is no longer used!                   *
*===========================================================================*
* Consider ALL Regs Destroyed. This routine is like a Macro for Standard    *
* EXCL-Lock(), UnLock(), Open() (New or old).                               *
* If the file doesn't exist, it will be created. If the file is in use, it  *
* will try upto 3 times before giving up to the Error routine...            *
* NOTE: File will be open after this, don't forget to close it.             *
*===========================================================================*
* If you want it to do something else if the file is not found, instead of  *
* create an empty new file, give it the routine adr in NWrtNFd(a5) and use  *
* the NWrite3 jump... (Filename MUST be in FileNam(a5) as well)....         *
*>>> If what's put into NWrtNFd(a5) is *NOT* part of a subroutine, the first*
* line apon returning to the main part of the prg is "Add #4,SP" so that the*
* next RTS doesn't return to whatever originally called this routine.    <<<*
*****************************************************************************
NWrNoNu	Move.l	a0,FileNam(a5)		Store filename for NWrite routines...
	Lea	Error3(pc),a0		-._ If old file doesn't exist,
	Move.l	a0,NWrtNFd(a5)		-'  generate an error.
	Bra.s	NWrite3

NWrite	Move.l	a0,FileNam(a5)		Filename for NWrite
NWrite2	Lea	OLogNew(pc),a0		-._ Standard is if it isn't found,
	Move.l	a0,NWrtNFd(a5)		-'  create a new one.
NWrite3	Move.l	#3,Temp004(a5)		Retry 3 times if File In Use.
NWriteJ	Move.l	FileNam(a5),d1		Filename
	Moveq	#EXCLUSIVE_LOCK,d2	WE WANT IT ALL!
	CALLDOS	Lock
	Move.l	d0,FileLok(a5)
	Bne.s	OLogOld			If Locked OK, Use OLD mode.
	Move.l	Temp004(a5),d7		# Retries Left.

	CALLDOS	IoErr			Get error return code into d0
	Cmpi.l	#ERROR_OBJECT_IN_USE,d0
	DBne	d7,OLogUse		Branch if "Object in use" & Retries>0
	Cmpi.l	#ERROR_OBJECT_NOT_FOUND,d0
	Bne	Error3			If not, Error.
	Move.l	NWrtNFd(a5),-(SP)	Load adr of routine...
	RTS				RTS to it.
OLogUse	Move.l	d7,Temp004(a5)		Store # Retries
	Move.l	#250,d1			-._ Wait
	CALLDOS	Delay			-'  5 Sec.
	Bra.s	NWriteJ			Retry.
OLogNew	Move.l	#Mode_New,d2		Else, use New mode.
	Bra.s	OLoNJmp
OLogOld	BSet	#SF1_Locked,STD_F_1(a5)	File Has Been Locked, Bit for BigDAlo
	IFD	DOS_FILSIZE
	BClr	#SF1_NWGetS,STD_F_1(a5)	If set, we shoud get the filesize.
	Beq.s	OLogGFS
	Bsr	FilMeas			(Would mess up many routines)
	ENDC
OLogGFS
	IFND	DOS_SHORT_1
	Bsr	FilULok			Unlock File. (Checks above bit yasee)
	ELSE
	Bsr.s	FilULok			Unlock File. (Checks above bit yasee)
	ENDC
	Move.l	#Mode_Old,d2		-.
	Bra.s	OLoOJmp
OLoNJmp	BClr	#SF1_NWGetS,STD_F_1(a5)	If set, we shoud get the filesize.

** \/ \/ SEE NOTE AT TOP \/ \/ **
	IFD	FileSze
	Beq.s	OLgGFS2
	Move.l	#0,FileSze(a5)		Set size to 0, new file.
OLgGFS2
	ENDC
** /\ /\ SEE NOTE AT TOP /\ /\ **

OLoOJmp	Move.l	FileNam(a5),d1		 |- Open The Log File...
	Bsr	FilOpn2			-' (RTS for us)
	Move.l	#0,FileNam(a5)		Clear Filename
	RTS
	ENDC

	IFD	DOS_FILEXIS
*= FILE EXISTS =*************************************************************
* a0 = Start of Null-Ended Filename   * NoFilRt(a5) = Routine if NOT exists *
* FileNam(a5) = (Adr FileName)        * Temp004(a5) = <TEMP>                *
*===========================================================================*
* FilExi0: Error(pc) used as error routine.  *a1* = <TEMP>                  *
*===========================================================================*
* If the file is found it'll be locked and flow will go back to after the   *
* BSR to this routine. If it doesn't, flow will go to the routine at the adr*
* in NoFilRt(a5). Normally this would be Error2 in this file.               *
* Call FilExi2 if filename already in FileNam.                              *
*>>> If what's put into NoFilRt(a5) is not on the same subroutine-level as  *
* the calling routine, the stack must be adjusted accordingly. For example, *
* when a routine calls NRead4, and NoFilRt(a5) points to part of the        *
* calling routine, (and not part of NRead4): Where NoFilRt(a5) points, the  *
* stack is changed to simulate the correct number of RTS commands           *
* (Add.l #4,SP).
*
*
* Calling Routine	FilExis
* ===============	=======
* BSR FilExis	->	Exists?
* (Exists Prt)	<-	YES = RTS
*
* (Not Exists)	<-	NO = "RTS" to (NoFilRt(a5))
*
*
* Calling Routine	NRead4			FilExis
* ===============	======			=======
* BSR NRead4	->	BSR FilExis	->	Exists?
* (File Read)	<-	Load file, RTS	<-	YES = RTS
*
* Addq.l #4,SP	<-	<This level NOT RTS'd>	NO = "RTS" to (NoFilRt(a5))
* (No Read)
*****************************************************************************
FilExi0	Lea	Error2(pc),a1		-._ Set to std error routine.
	Move.l	a1,NoFilRt(a5)		-'
FilExis	Move.l	a0,FileNam(a5)		Adr Filename into FileNam
FilExi2	Move.l	#3,Temp004(a5)		Retry 3 times if File In Use.
NRLTry	Move.l	FileNam(a5),d1		Address of Filename for Lock Call
	Moveq	#SHARED_LOCK,d2		Read (Shared) Mode
	CALLDOS	Lock			Lock File.
	Move.l	d0,FileLok(a5)		Store Lock.
	Bne.s	NRL_OK			If Locked OK, Continue as normal
	CALLDOS	IoErr			Get error return code into d0
	Move.l	Temp004(a5),d7		# Retries Left.
	Cmpi.l	#ERROR_OBJECT_IN_USE,d0
	DBne	d7,NRLIUSE		Branch if "Object in use" & Retries>0
	Move.l	d0,d1			Else...
;;OLD;;	Addq.l	#4,SP			-._ As if we RTS to the given routine.
;;;;;;;	Move.l	NoFilRt(a5),-(SP)	Load adr of routine...
	Move.l	NoFilRt(a5),(SP)
	RTS				RTS to it.
NRLIUSE	Move.l	d7,Temp004(a5)		Store # Retries
	Move.l	#250,d1			-._ Wait
	CALLDOS	Delay			-'  5 Sec.
	Bra.s	NRLTry			Retry.
NRL_OK	BSet	#SF1_Locked,STD_F_1(a5)	File Has Been Locked, Bit for BigDAlo
	RTS
	ENDC

	IFD	DOS_FILSIZE
*= FILE SIZE =***************************************************************
* FileLok(a5) - Address of Lock       * FileSze(a5) = (Size of File)        *
*****************************************************************************
FilMeas	BTst	#SF1_Locked,STD_F_1(a5)	Make sure file has been locked.
	Beq	Internal		Internal error if not.
	Move.l	FileLok(a5),d1		-.  Load Fileheader for FileLok's File
	Lea	FilHead(a5),a0		 |_ Into 260 bytes header memory
	Move.l	a0,d2			 |
	CALLDOS	Examine			-'  Using Examine Dos Call.
	Tst.l	d0
	Beq.s	Error
	Move.l	FH_Size(a5),FileSze(a5)	Store file size
FilSzeR	RTS
	ENDC

	IFD	DOS_FILOPEN
*= FILE OPEN =***************************************************************
* a0 = Point to Filename (Nulled End) * d2 = Mode [new/old]                 *
* FileHdl(a5) = (File Handle)         *                                     *
*****************************************************************************
* Call FilOpn2 if Adr Filename is in d1                                     *
*****************************************************************************
FilOpen	Move.l	a0,d1
FilOpn2	BTst	#SF1_Open,STD_F_1(a5)	-._ Generate an Error if something
	Bne	Internal		-'  was already openned & not freed
	CALLDOS	Open			-._ Open File
	Move.l	d0,FileHdl(a5)		-'  Save Handle
	Beq.s	Error			Error?
	BSet	#SF1_Open,STD_F_1(a5)	File Is Open, Bit for BigDAlo
FilORTS	RTS
	ENDC

	IFD	DOS_READNOR
*- READ FILE (NORMAL) -******************************************************
* NRead3: a0          -.  Address of                                        *
* NRead:  FileNam(a5)  |- Null-Terminated Filename                          *
* NRead4: FileNam(a5) -'                                                    *
* ------- NoFilRt(a5) - Routine to jump to if file does not exist.          *
* NRead2: FileNam(a5) - Adr NT Filename                                     *
* ------- FileLok(a5) - File Lock (MUST *NOT* BE EXCLUSIVE)                 *
*===========================================================================*
* Consider ALL Regs Destroyed. This routine is like a Macro for Standard    *
* file Exist,Allocate,Open,Read,Close.                                      *
* If Non-Exist shouldn't call ERROR, use a different set NoFilRt(a5) and    *
* then Bsr to ReadSo4. (You must also setup FileNam).                       *
* NReadSo jump is for the ReadSom routine.                                  *
*****************************************************************************
*>>> See FilExis for info on using the »» NRead4 «« part of this routine!!  *
*****************************************************************************
NRead3	Move.l	a0,FileNam(a5)
NRead	Lea	Error2(pc),a1		-._ Set to go to Error2 if the file
	Move.l	a1,NoFilRt(a5)		-'  doesn't exist.
NRead4	Bsr	FilExi2			Check existance of file. Shared Lock
NRead2	Bsr.s	FilMeas			Find File Size...
NReadSo	Bsr	FilAloc			Allocate Memory
	Move.l	FileNam(a5),d1
	Move.l	#Mode_Old,d2
	Bsr.s	FilOpn2			Open File.
	Bsr	FilULok			Unlock file.
	Bsr	FilRead			Read File into Memory!
	Bsr	FilClos			Close the file
	Move.l	#0,FileNam(a5)		Clear Filename
	RTS
	ENDC


	IFD	DOS_ERROR
*= ERROR =*******************************************************************
* ErrHead(pc) Must be the Header for the message. (Null terminated)         *
* ErrBuff(a5) Must be #ErrBuffLen bytes long buffer                         *
*****************************************************************************
* Error routine for dos.library calls - Will Finish PRG                     *
* Call Error2 if you already have the Error # in d1                         *
*****************************************************************************
Error	CALLDOS	IoErr			Get error return code
Error3	Move.l	d0,d1			Error code For Fault()
Error2	Lea	ErrHead(pc),a0		-._ Header for Err Message
	Move.l	a0,d2			-'  for Fault()
	Lea	ErrBuff(a5),a0		-._ Buffer to write to
	Move.l	a0,d3			-'  for Fault()
	Moveq	#ErrBuffLen,d4		Size of Buffer.
	CALLDOS	Fault			Put the Text in the Buffer.
	Tst.l	d0
	Beq.s	NoFault			No Chars Returned=Just finish
;;;;;;;	NOTE: This will happen if error is called when there is no problem.

	IFD	DOS_DOORERR
;					Fault returns NULL Terminated string!
	Lea	ErrBuff(a5),a0		Point to Error Text
	Bsr	Send_Message		Send it to AmiExpress
	Tst.l	FileNam(a5)		-._ If no filename currently there,
	Beq.s	NoFault			-'  don't send any more info.
	Lea	ErrMs_F(pc),a0
	Bsr	Send_String
	Move.l	FileNam(a5),a0		Write filename...
	Bsr	Send_String
	Lea	ErrMs_F(pc),a0		Write final message...
	Bsr	Send_Message
NoFault	Bra	Finish			Now finish program...
	ENDC

	IFND	DOS_DOORERR
	Lea	ErrBuff(a5),a0		Point to Error Text
	Move.l	a0,a1			-._ Point to END+1
	Add.l	d0,a1			-'  of Error Text.
	Move.b	#10,(a1)		Write a return over the NULL.
;;;;;;;	Note that Fault() returns a NULL term string, and does not count
;;;;;;;	the Null in the length it returns, so we can overwrite it.
	Move.l	d0,d3			length (returned by Fault())
	Addq.l	#1,d3			Write the return as well.
;;;;;;;	Bsr.s	CLIRite			Send It! NOT - It might call ERROR!
	Bsr.s	ErrRite

	IFD	FileNam
	Tst.l	FileNam(a5)		-._ If no filename currently there,
	Beq.s	NoFault			-'  don't send any more info.

	Lea	ErrMsgF(pc),a0
	Move.l	#ErrMsgL,d3
	Bsr.s	ErrRite

	Move.l	FileNam(a5),d2		Also write out the filename...
	Move.l	d2,a0
	Bsr	NullLen			Find it's length.
	Move.l	d0,d3			and put that into d3...
	Bsr.s	ErrRit2

	Lea	ErrMs_F(pc),a0		Write end of message.
	Move.l	#ErrMs_L,d3
	Bsr.s	ErrRite
	ENDC

NoFault	Bra	Finish			Now finish program...
ErrRite	Move.l	a0,d2
ErrRit2	Move.l	CLI_Hdl(a5),d1
	JUMPDOS	Write			RTS for us.
;;;;;;;	Cmpi.l	#-1,d0			DO NOT CHECK FOR ERROR
	ENDC

	IFD	FileNam
ErrMsgF	Dc.b	27,"[0;1m"
ErrMsgL	Equ	*-ErrMsgF
	IFD	DOS_DOORERR
	Dc.b	0
	ENDC
ErrMs_F	Dc.b	27,"[0m may be where the problem is.",10
ErrMs_L	Equ	*-ErrMs_F
	IFD	DOS_DOORERR
	Dc.b	13,0
	ENDC
	ENDC
	Even
	ENDC



	IFD	DOS_FILALOC
*= FILE ALLOCATE =***********************************************************
* FileSze(a5) - Size of File to aloc  * FileAdr(a5) = (Adr of Aloc'd mem)   *
*****************************************************************************
FilAloc	BTst	#SF1_InMem,STD_F_1(a5)	-._ Generate an Error if something
	Bne	Internal		-'  was already allocated & not freed
	Move.l	FileSze(a5),d0		-.  
	Moveq	#Memf_Public,d1		 |  Alloc <FileSze> bytes to
	CALEXEC	AllocMem		 |- Load file into. Store adr
	Move.l	d0,FileAdr(a5)		 |  as FileAdr.
	Beq	Error			-'
	Move.l	DosBase(a5),a6		...Back to Dos.library
	BSet	#SF1_InMem,STD_F_1(a5)	File Is In Memory, Bit for BigDAlo
;	Must be SET AFTER the allocation in case of error.
FilARTS	RTS
	ENDC

	IFD	DOS_FILULOK
	IFND	DOS_FILALOC
FilARTS	RTS
	ENDC
*= FILE UNLOCK =*************************************************************
* FileLok(a5) - File-Lock             *                                     *
*****************************************************************************
FilULok	BClr	#SF1_Locked,STD_F_1(a5)	File is NOT Locked, Bit for BigDAlo
	Beq.s	FilARTS			If wasn't locked to start with, RTS
	Move.l	FileLok(a5),d1		-._ Lock no longer needed,
	JUMPDOS	UnLock			-'  so unlock the file. (RTS)
	ENDC

	IFD	DOS_FILREAD
*= FILE READ =***************************************************************
* FileSze(a5) - #Bytes to Read        * FileHdl(a5) - File Handle           *
* FileAdr(a5) - Adr Memory to Read to *                                     *
*****************************************************************************
FilRead	Move.l	FileHdl(a5),d1		Gunna read from File Handle
	Move.l	FileAdr(a5),d2		Into Allocated Memory
	Move.l	FileSze(a5),d3		Gunna Read FileSze bytes
	CALLDOS	Read			Read it!
	Cmpi.l	#-1,d0
	Beq	Error			Error?
	RTS
	ENDC

	IFD	DOS_FILCLOS
*= FILE CLOSE =**************************************************************
* FileHdl(a5) = Handle of Open File    *                                    *
*****************************************************************************
FilClos	BClr	#SF1_Open,STD_F_1(a5)	File Is NOT Open, Bit for BigDAlo
	Beq.s	FilERTS			If it wasn't open to start with, RTS
	Move.l	FileHdl(a5),d1		-._ Close File.
	CALLDOS	Close			-'  (RTS for us).
	Tst.l	d0
	Beq	Error
FilERTS	RTS
	ENDC

	IFD	DOS_FILRITE
*= FILE WRITE =**************************************************************
* a0 = Start of text to be written    * d3 = # Chars to be Written          *
* FileHdl(a5) - Handle of File        *                                     *
*****************************************************************************
FilRite	Move.l	a0,d2
FilRit2	Move.l	FileHdl(a5),d1		Call here if d2 already set!
	CALLDOS	Write
	Cmpi.l	#-1,d0
	Beq	Error
	RTS
	ENDC

	IFD	DOS_CLIRITE
*= CLI WRITE =***************************************************************
* a0 = Start of text to be written    * d3 = #Chars to be Written           *
* CLI_Hdl(a5) - Handle of CLI         *                                     *
*****************************************************************************
CLIRite	Move.l	a0,d2
CLIRit2	Move.l	CLI_Hdl(a5),d1
	CALLDOS	Write			RTS for us.
	Cmpi.l	#-1,d0
	Beq	Error
	RTS
	ENDC

	IFD	DOS_FILDALO
*= FILE DEALLOCATE =*********************************************************
* FileSze(a5) = Bytes to Free         * FileAdr(a5) = Adr Space to Free     *
*****************************************************************************
FilDAlo	BClr	#SF1_InMem,STD_F_1(a5)	File Is NOT Memory, Bit for BigDAlo
	Beq.s	FilDA_R			If not in mem to start with, RTS
	Move.l	FileSze(a5),d0		Give back <FILESIZE> bytes
	Move.l	FileAdr(a5),a1		Address of already alloc'd mem
	CALEXEC	FreeMem			Free mem
	Move.l	DosBase(a5),a6		Back to Dos.Library
FilDA_R	RTS
	ENDC

	IFND	DOS_DOORERR
	IFD	DOS_CHKCRTC
*= CHECK CTRL-C =************************************************************
* Checks for if ^C has been pressed, and if so prints "***Break" and Exits  *
* Only usefull for DOS programs (i.e. not for doors)                        *
* All registers preserved. (But not CCR)                                    *
*****************************************************************************
CkCtrlC	Movem.l	d0-d7/a0-a6,-(SP)	Preserve everything.
	Moveq	#0,d0			No new signals.
	Move.l	#SIGBREAKF_CTRL_C,d1	Clear ^C Signal
	CALEXEC	SetSignal		Do it & OldSignals -> d0
	BTst	#SIGBREAKB_CTRL_C,d0	Was ^C Set?
	Beq.s	NoBreak			YES=Exit
YoBreak	Lea	BreakMs(pc),a0		-.
	Move.l	#BreakML,d3		 |- Write "***Break"
	Bsr.s	CLIRite			-'
	Bra	Finish			and then Exit the Proggy.
BreakMs	Dc.b	7,10,10,27,"[0m"
	PROGNAM
	Dc.b	": ***Break",10
BreakML	Equ	*-BreakMs
	Even
NoBreak	Movem.l	(SP)+,d0-d7/a0-a6	Restore everything.
	RTS
	ENDC
	ENDC

	IFD	DOS_READSOM
*- READ SOME OF FILE (NORMAL) -**********************************************
* ReadSo3: a0          -.  Address of                                       *
* ReadSom: FileNam(a5)  |- Null-Terminated Filename                         *
* ReadSo4: FileNam(a5) -'                                                   *
* -------- NoFilRt(a5) - Routine to jump to if file does not exist.         *
* ReadSo2: FileNam(a5) - Adr NT Filename                                    *
* -------- FileLok(a5) - File Lock (MUST *NOT* BE EXCLUSIVE)                *
* **ALL**: Temp002(a5) - Size of Chunk To Load In.                          *
***BELOW TWO NOT IMPLIMENTED - CURRENTLY LOADS THE GIVEN SIZE FROM THE EOF***
* **ALL**: Temp003(a5) - Seek() offset thing (Ie OFFSET_CURRENT/END/START)  *
* **ALL**: Temp005(a5) - Actual offset to use.                              *
*===========================================================================*
* Consider ALL Regs Destroyed. This routine is like a Macro for Standard    *
* file Exist,Allocate,Open,Read,Close.                                      *
* If Non-Exist shouldn't call ERROR, use a different set NoFilRt(a5) and    *
* then Bsr to ReadSo4. (You must also setup FileNam).                       *
*****************************************************************************
ReadSo3	Move.l	a0,FileNam(a5)
ReadSom	Lea	Error2(pc),a1		-._ Set to go to Error2 if the file
	Move.l	a1,NoFilRt(a5)		-'  doesn't exist.
ReadSo4	Bsr	FilExi2			Check existance of file. Shared Lock
ReadSo2	Bsr	FilMeas			Find File Size...
	Move.l	Temp002(a5),d7
	Cmp.l	FileSze(a5),d7		Is the file larger than what we want?
	Bgt	NReadSo			If not, load the whole thing as norm.
	Move.l	Temp002(a5),FileSze(a5)	If it IS bigger, set new filesize.
	Bsr	FilAloc			Allocate Memory for new filesize.
	Move.l	FileNam(a5),d1
	Move.l	#Mode_Old,d2
	Bsr	FilOpn2			Open File.
	Bsr	FilULok			Unlock file.

	Move.l	FileHdl(a5),d1		File Handle for Seek()
	Move.l	Temp002(a5),d2		Offset bytes...
	Neg.l	d2
	Moveq	#OFFSET_END,d3		...from the END of the file.
	CALLDOS	Seek
;	Cmpi.l	#-1,d0			-._ Removed
;	Beq	Error			-'  See Seek(),BUGS in Autodocs
	CALLDOS	IoErr			Will return 0 on Success.
	Tst.l	d0			-._ If an error was returned,
	Bne	Error			-'  branch to the error routine.

	Bsr	FilRead			Read File into Memory!
	Bsr	FilClos			Close the file
	Move.l	#0,FileNam(a5)		Clear Filename pointer
	RTS
	ENDC

	IFD	DOS_DELETEF
*= FILE DELETE =*************************************************************
* a0 = Filename to delete             * FileNam(a5) = (a0)                  *
* Temp004(a5) = <Temp>                *                                     *
*===========================================================================*
* If the file doesn't exist in the first place, error WILL NOT BE GENERATED *
*****************************************************************************
FileDel	Move.l	a0,d1
FileDe2	Move.l	d1,FileNam(a5)
FileDe3	Move.l	#3,Temp004(a5)		Retry 3 times if File In Use.
FileDeJ	Move.l	FileNam(a5),d1
	CALLDOS	DeleteFile		Delete the old file.
	Tst.l	d0
	Bne.s	FDelDon
	Move.l	Temp004(a5),d7		# Retries Left.
	CALLDOS	IoErr			Get error return code into d0
	Cmpi.l	#ERROR_OBJECT_IN_USE,d0
	DBne	d7,FDelUse		Branch if "Object in use" & Retries>0
	Cmpi.l	#ERROR_OBJECT_NOT_FOUND,d0
	Bne	Error2			Error unless it just wasn't there.
FDelDon	Move.l	#0,FileNam(a5)
	RTS
FDelUse	Move.l	d7,Temp004(a5)		Store # Retries
	Move.l	#250,d1			-._ Wait
	CALLDOS	Delay			-'  5 Sec.
	Bra.s	FileDeJ			Retry.
	ENDC

	IFD	DOS_DATESTR
*= FILL IN DATE STRUCTURES =*************************************************
FilInD8	Movem.l	d0-7/a0-6,-(SP)
	Lea	DTStruc(a5),a0		-.  (dos.library)
	Move.l	a0,d1			 |- Put Today's DateStamp into
	CALLDOS	DateStamp		-'  our DateTime Structure.
	Bra.s	D9_Skip

FilInD9	Movem.l	d0-7/a0-6,-(SP)
D9_Skip	Move.b	#FORMAT_DOS,DT_4Mat(a5)	AmigaDos Date Format ("DD-MMM-YY")
	Move.b	#0,DT_Flag(a5)		Clear All Flags.
	Lea	D8_Name(a5),a1		-._ Adr to write
	Move.l	a1,DT_Name(a5)		-'  Day-Name to.
	Lea	D8_Date(a5),a1		-._ Adr to write
	Move.l	a1,DT_Date(a5)		-'  Date to.
	Lea	D8_Time(a5),a1		-._ Adr to write
	Move.l	a1,DT_Time(a5)		-'  Time to.
	Lea	DTStruc(a5),a0		-._ Point to out DTStruc
	Move.l	a0,d1			-'  for the routine.
	CALLDOS	DateToStr		...And Call the routine.
	Tst.l	d0
	Beq	Error
	Movem.l	(SP)+,d0-7/a0-6
	RTS
	ENDC

	IFD	DOS_READARG
*= READ ARGS (NORMAL) =****************************************= 17-Sep-94 =*
* RDA_Template(pc) = Template         * RDA_Array(a5) = Array of LongWords  *
* RDA_Rtn(a5) = (Pointer to returned RDArgs structure)                      *
*===========================================================================*
* RDA_Array(a5) should be initialized to default values before calling.     *
*****************************************************************************
RArgNor	BTst	#SF1_ReadArgs,STD_F_1(a5)	-._ Generate an Error if
	Bne	Internal			-'  previous Read & no Free.
	Lea	RDA_Template(pc),a0	Template for ReadArgs()
	Move.l	a0,d1
	Lea	RDA_Array(a5),a0	Array space for ReadArgs()
	Move.l	a0,d2
	Moveq	#0,d3			Use default options for ReadArgs()
	CALLDOS	ReadArgs
	Move.l	d0,RDA_Rtn(a5)		Store returned pointer to structure.
	Beq	Error
	BSet	#SF1_ReadArgs,STD_F_1(a5)	ReadArgs done, need freeing.
FArgNDn	RTS
	ENDC

	IFD	DOS_FREEARG
*= FREE ARGS (NORMAL) =****************************************= 17-Sep-94 =*
* RDA_Rtn(a5) = Pointer to RDArgs structure returned by ReadArgs()          *
*****************************************************************************
FArgNor	BClr	#SF1_ReadArgs,STD_F_1(a5)
	Beq.s	FArgNDn			If no FreeArgs() needed, skip.
	Move.l	RDA_Rtn(a5),d1
	JUMPDOS	FreeArgs
;;;;;;;	RTS for us.
	ENDC

	IFD	DOS_EASYREQ
*= EASY REQUEST ARGS =*******************************************************
* a0 = Title text, Null-term.         * a1 = Body text, Null-term           *
* a2 = Gadget(s) text, Null-term.     * EReqRtn(a5) = (Returned Gad-number) *
* a3 = *POINTER* to IDCMP flags.      *                                     *
*===========================================================================*
* If No IDCMP flags wanted, a3 MUST be NULL.                                *
* The body text may have returns (#10), and the Gadgets should be separated *
* by "|" chars.                                                             *
* EReqRtn(a5) only written to if defined, else returned value is ignored.   *
* All registers are preserved                                               *
*****************************************************************************
EasyReq	Movem.l	d0-d7/a0-a6,-(SP)
	Bsr.s	OL_Intuition		Open intuition.library, if required.

	Move.l	#EasyStruct_Len,ES_Length(a5)	Size of structure.
	Move.l	#0,ES_Flags(a5)			No flags.
	Move.l	a0,ES_Title(a5)			-.
	Move.l	a1,ES_Body(a5)			 |- Texts given to routine.
	Move.l	a2,ES_Gadgets(a5)		-'
;-- Actual requestor -------------------------------------------------------;
	Lea	EasyStruct(a5),a1	Point to EasyRequest structure.
	Move.l	a3,a2			IDCMP flags.
	Sub.l	a0,a0			Specify default public screen.
	Move.l	a0,a3			No arguments.
	CALLINT	EasyRequestArgs		Put up the request.

	IFD	EReqRtn
	Move.l	D0,EReqRtn(a5)		Store returned number.
	ENDC

	Movem.l	(SP)+,d0-d7/a0-a6
	RTS
	ENDC


*= Open Libraries =********************************************= 15-Apr-95 =*
* Opens Libraries using the structure from the Variables Mem.               *
* Beware: this routine does not check if it has already been run!           *
* Temp001 = Stores current posn in INPUT struct.                            *
* Temp002 = Stores current posn in OUTPUT struct.                           *
*****************************************************************************
Open_Libraries
	BClr	#SF1_OpnLibErr,STD_F_1(a5)	Just in case!
	Lea	LibData_Start(pc),a0	Start of struc w/ name-ptrs and ver#s
	Move.l	a0,Temp001(a5)
	Lea	LibBases_Start(a5),a0	Start of struc to write Base-Adrs to.
	Move.l	a0,Temp002(a5)

	Bsr.s	OpnLib_MainLoop		Do the main openning routine.
	BTst	#SF1_OpnLibErr,STD_F_1(a5)	Any problems?
	Bne	OpnLib_Error			YES = Call special error rtn.
	RTS					NO  = Return.

OpnLib_MainLoop
	Move.l	Temp002(a5),a0
	Lea	LibBases_Finish(a5),a4
	Cmp.l	a4,a0			All libraries been openned?
	Blt.s	OL_Skp1
	RTS				If so, routine done.

OL_Skp1	Move.l	Temp001(a5),a0
	Lea	LibNames_Start(pc),a1	-._ Point to the name of
	Add.l	(a0)+,a1		-'  the lib to be openned.
	Move.l	(a0)+,d0		Version of lib to be openned.
	Move.l	a0,Temp001(a5)		Store updated pointer.

	CALEXEC	OpenLibrary		Attempt to open the library.

	Tst.l	d0			If failed, set flag as such.
	Bne.s	OL_Skp2
	BSet	#SF1_OpnLibErr,STD_F_1(a5)
OL_Skp2	Move.l	Temp002(a5),a0		-._ Store base adr ptr,
	Move.l	d0,(a0)+		-'  or a NULL if failed.
	Move.l	a0,Temp002(a5)		Store updated pointer.

	Bra.s	OpnLib_MainLoop		Do the rest of the struct.

;---------------------------------------------------------------------------;
; Obviously, the error routine should not rely upon any libs being open!!   ;
; Temp001(a5) will be used as a base for intuition.library                  ;
; Temp002(a5) will be used as the adr of the allocated mem for Req text.    ;
; - This routine will attempt to bring up a requester showing a list of     ;
; - which libraries couldn't be openned (including the required versions).  ;
; - An EasyRequest is be used, but v1.3 lamers don't have them, so if we    ;
; - can't open v37, a DisplayAlert will tell them they need to upgrade.     ;
;---------------------------------------------------------------------------;
OpnLib_Error_Title
	PROGNAM
	Dc.b	":",0
OpnLib_Error_Body_Header
	Dc.b	"Could not open the following libraries:",10
	Dc.b	"(Minimum version numbers shown.)",10,10,0
OpnLib_Error_Body_Header_Length Equ (*-OpnLib_Error_Body_Header)-1
OpnLib_Error_Body_Main_Length Equ 40
; 30 chars = maximum file length, + " vXX",10,0 + a bit more.
OpnLib_Error_Body_Length Equ OpnLib_Error_Body_Header_Length+(NumLibs*OpnLib_Error_Body_Main_Length)
OpnLib_Error_Gads
	Dc.b	"OK",0
	Even
;---------------------------------------------------------------------------;
OpnLib_Error
	Lea	IntName(pc),a1
	Moveq	#37,d0
	CALEXEC	OpenLibrary
	Move.l	d0,Temp001(a5)		Store base adr.
	Beq	OpnLib_Error_Error	If we can't get it, DisplayAlert 'em.

	Bsr.s	BuildLibList		Adr into Temp002(a5)

	Move.l	#EasyStruct_Len,ES_Length(a5)	Size of structure.
	Move.l	#0,ES_Flags(a5)			No flags.
	Lea	OpnLib_Error_Title(pc),a0	-.
	Move.l	a0,ES_Title(a5)			 |
	Move.l	Temp002(a5),ES_Body(a5)		 |- Texts for req.
	Lea	OpnLib_Error_Gads(pc),a0	 |
	Move.l	a0,ES_Gadgets(a5)		-'

	Lea	EasyStruct(a5),a1	Point to EasyRequest structure.
	Sub.l	a0,a0			Specify default public screen.
	Move.l	a0,a2			No IDCMP flags.
	Move.l	a0,a3			No arguments.
	Move.l	Temp001(a5),a6
	Jsr	EasyRequestArgs(a6)	Put up the request.

	Move.l	#OpnLib_Error_Body_Length,d0	-.
	Move.l	Temp002(a5),a1			 |- Deallocate Msg mem.
	CALEXEC	FreeMem				-'

OpnLib_Error__2
	Move.l	Temp001(a5),a1		-.
	CALEXEC	CloseLibrary		 |- Close intuition.library
	Bra	Finish			-'  and Finish program.
;---------------------------------------------------------------------------;
BuildLibList
	Move.l	#OpnLib_Error_Body_Length,d0	-.  Allocate
	Move.l	#Memf_Public!Memf_Clear,d1	 |_ Memory for
	CALEXEC	AllocMem			-'  Error Message.
	Move.l	d0,Temp002(a5)
	Beq.s	OpnLib_Error__2		If Allocation failed, Exit Program

	Move.l	Temp002(a5),a1		Memory to write message into...
	Lea	OpnLib_Error_Body_Header(pc),a0
	Bsr	CopyCN3			Copy it (excluding null).

	Lea	LibData_Start(pc),a2	Start of struc w/ name-ptrs and ver#s
	Lea	LibBases_Start(a5),a3	Start of struc w/ Base-Adrs.

BuildLibList_MainLoop
	Lea	LibBases_Finish(a5),a4
	Cmp.l	a4,a3			All libraries been checked?
	Blt.s	OLEBL_Skp1
	SF	-1(a1)			-._ If so, null terminate
	RTS				-'  and return completed list.
OLEBL_Skp1
	Tst.l	(a3)+			Did this lib fail to open?
	Beq.s	OLEBL_Skp2		If not, don't include in msg.
	Addq.l	#8,a2			Update the other pointer.
	Bra.s	BuildLibList_MainLoop	Check the rest of the libs.

OLEBL_Skp2
	Lea	LibNames_Start(pc),a0	-._ Point to the name of
	Add.l	(a2)+,a0		-'  the lib.
	Bsr	CopyCN3			Copy it (excluding null).
	Move.b	#" ",(a1)+		A space after it.
	Move.b	#"v",(a1)+		version...

	Move.l	(a2)+,d1		Version of lib.
	Bsr	N2A2Dig			Convert number to output.
;	Note: N2A2Dig ONLY uses d1 and a1.
	Move.b	#10,(a1)+		A return after it.

	Bra.s	BuildLibList_MainLoop
;---------------------------------------------------------------------------;
OpnLib_Error_Error
	Lea	IntName(pc),a1
	Moveq	#0,d0			ANY version, using DisplayAlert()
	CALEXEC	OpenLibrary
	Move.l	d0,Temp001(a5)		Store base adr.
	Beq	Finish			If we can't get it, just exit!

	Lea	OpnLib_Error_Msg_Header(pc),a0
	Move.l	#OpnLib_Error_Msg_Height,d1
	Moveq	#RECOVERY_ALERT,d0	Not fatal to the rest of the system.
	Move.l	Temp001(a5),a6		-._ Send display alert
	Jsr	DisplayAlert(a6)	-'

	Move.l	Temp001(a5),a1		-.
	CALEXEC	CloseLibrary		 |- Close intuition.library
	Bra	Finish			-'  and Finish program.

OpnLib_Error_Msg_Header
OpnLib_Error_Msg_Height	Equ 29
	Dc.w	15		X-coord (word)
	Dc.b	11		Y-coord (byte)
	PROGNAM
	Dc.b	":"
	SPACEEVEN	OpnLib_Error_Msg_Header
	Dc.b	0,1

	Dc.w	15
	Dc.b	20
	Dc.b	" Could not open intuition.library v37 (Kickstart 2.04) or above!"
	SPACEEVEN	OpnLib_Error_Msg_Header
	Dc.b	0,0
	Even


*= Close Libraries =*******************************************= 15-Apr-95 =*
* Closes Libraries which were openned using Open_Libraries.                 *
*****************************************************************************
Close_Libraries
	Lea	LibBases_Start(a5),a3	Start of struc w/ Base-Adrs.

CloseLibs_MainLoop
	Lea	LibBases_Finish(a5),a4
	Cmp.l	a4,a3			All libraries been checked?
	Blt.s	CLibs_Skp1
	RTS				If so, exit.
CLibs_Skp1
	Tst.l	(a3)+			Does this lib need closing?
	Beq.s	CloseLibs_MainLoop	If not, skip past it.

	Move.l	-4(a3),a1		Base pointer to a1 for CloseLib
	Move.l	#0,-4(a3)		Null the base pointer.
	Move.l	a3,-(SP)		-.
	CALEXEC	CloseLibrary		 |- Close the lib.
	Move.l	(SP)+,a3		-'
	Bra.s	CloseLibs_MainLoop	Do next library...
