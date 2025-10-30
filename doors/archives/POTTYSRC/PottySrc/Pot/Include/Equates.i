*****************************************************************************
* Various                                                                   *
*****************************************************************************
;To put machine into NTSC:
;	Move.w	#0,$DFF1DC

EqCCR	Equ	%0000000000000100
NeCCR	Equ	%0000000000000000

;CustomBase	= $dff000	Base Address of Custom Chips

Beq_ErrorE	MACRO			Arg1 = Adr Action. (eg. "MyAction(pc)")
;					Arg2 = Ptr to Active NIB (eg. "MyNIB_Adr(a5)")
;					       or Null.
	Bne.s	BEEE_S\@		Skip if no error.
	Lea	\1,a0			-._ Setup current action from
	Move.l	a0,CAction(a5)		-'  the first argument.
	Move.l	\2,Active_NIB(a5)	Setup current NIB (filename).
	OPT O-
	Bra	ErrorE			Fatal Error.
	OPT O+
BEEE_S\@
	ENDM

MWait	Macro			Wait for Left Mouse Pressed for 1 second.
Mouse\@	Movem.l	d0-d7/a0-a6,-(SP)
	Move.l	DosBase(a5),a6
	Move.l	#50,d1		-._ Wait 1 sec.
	Jsr	Delay(a6)	-'  (This one is so the system doesn't slow)
	Btst	#6,$bfe001
	Bne.s 	Mouse\@
	Move.l	#50,d1		-._ Wait
	Jsr	Delay(a6)	-'  1 Sec.
	Movem.l	(SP)+,d0-d7/a0-a6
	Btst	#6,$bfe001
	Bne.s 	Mouse\@
	EndM

;	This macro is like EVEN, but it makes things ODDly aligned!
;	It should be called with one argument: the lable of a known EVEN
;	address (which is before the macro is used!).
ODD	MACRO
ERP\@	Equ	*-\1
	IFEQ	(((ERP\@)*10)/2)-(((ERP\@)/2)*10)
	Dc.b	0
	ENDC
	ENDM

;	This macro is like EVEN, but it inserts a space instead of a null.
;	It should be called with one argument: the lable of a known EVEN
;	address (which is before the macro is used!).
SPACEEVEN	MACRO
SEERP\@	Equ	*-\1
	IFNE	(((SEERP\@)*10)/2)-(((SEERP\@)/2)*10)
	Dc.b	" "
	ENDC
	ENDM

;	This macro is like EVEN, but for RS-Tables. It ensures an Even
;	RS counter by reserving an extra byte if it's odd.
;	Note that when reserving a long or a word in an RS-Table, DevPac
;	automatically aligns it. This is only useful for .b reserves
;	(Eg text...)
RSEven	MACRO
	IFNE	(((__RS)*10)/2)-(((__RS)/2)*10)
	Rs.b	1
	ENDC
	ENDM

CopyEm	MACRO			Copy d7 chars a0 -> a1
	Bra.s	COPE2\@
COPEM\@	Move.b	(a0)+,(a1)+
COPE2\@	DBra	d7,COPEM\@
	ENDM

CopyCN4	MACRO			Copy nullterminated including null.
CCN4\@	Move.b	(a0)+,(a1)+
	Bne.s	CCN4\@
	ENDM

SetReqDefault MACRO
	IFD	Default_Req
	BSet	#SF1_ErrorReq,STD_F_1(a5)
	ELSE
	BClr	#SF1_ErrorReq,STD_F_1(a5)
	ENDC
	ENDM


;=====================================================================================;
; NUDEL-INFO-BLOCK STRUCTURE							      ;
;=====================================================================================;
		RSReset
NIB_Next	Rs.l	1		Pointer to next NIB - Null if this is the last.
NIB_Previous	Rs.l	1		Pointer to previous NIB, Null if the first.
NIB_MemSize	Rs.l	1		Size of allocation - Null if none.
NIB_MemAdrs	Rs.l	1		Address of allocation - Null if none.
NIB_NameAdrs	Rs.l	1		Address of null-term (file)name - Null if none.
NIB_Handle	Rs.l	1		Handle if file is open - Null if not.
NIB_SizeOf	Equ	__RS
;=====================================================================================;

***************************************************************************************
* Rexx Sys Lib library								      *
***************************************************************************************
CALLREX MACRO
	Move.l	RexBase(a5),a6
	Jsr	\1(a6)
	ENDM
JUMPREX	MACRO
	Move.l	RexBase(a5),a6
	Jmp	\1(a6)
	ENDM
;-------------------------------------------------------------------------------------;
CreateArgstring	= -126
DeleteArgstring	= -132
LengthArgstring	= -138
CreateRexxMsg	= -144
DeleteRexxMsg	= -150
ClearRexxMsg	= -156
FillRexxMsg	= -162
IsRexxMsg	= -168
LockRexxBase	= -450
UnlockRexxBase	= -456
***************************************************************************************
* Graphics library								      *
***************************************************************************************
CALLGFX MACRO
	Move.l	GfxBase(a5),a6
	Jsr	\1(a6)
	ENDM
JUMPGFX	MACRO
	Move.l	GfxBase(a5),a6
	Jmp	\1(a6)
	ENDM
;---------------------------------------------------------------------------;
VBeamPos	= -384
*****************************************************************************
* Utility library							    *
*****************************************************************************
UDivMod32	= -156		Does NOT require a6 to be library base.
UMult32		= -144		Does NOT require a6 to be library base.
*****************************************************************************
* Intuition library                                                          *
*****************************************************************************
CALLINT	MACRO
	Move.l	IntBase(a5),a6
	Jsr	\1(a6)
	ENDM
JUMPINT	MACRO
	Move.l	IntBase(a5),a6
	Jmp	\1(a6)
	ENDM
;---------------------------------------------------------------------------;
DisplayAlert	= -90
DisplayBeep	= -96
EasyRequestArgs	= -588
;---------------------------------------------------------------------------;
ALERT_TYPE	EQU	$80000000
RECOVERY_ALERT	EQU	$00000000	; the system can recover from this 
DEADEND_ALERT 	EQU	$80000000	; no recovery possible, this is it 
*****************************************************************************
* Icon library                                                              *
*****************************************************************************
CALLICN	MACRO
	Move.l	IcnBase(a5),a6
	Jsr	\1(a6)
	ENDM
;---------------------------------------------------------------------------;
GetDiskObject	= -78
FreeDiskObject	= -90
FindToolType	= -96
;---------------------------------------------------------------------------;
; Gadget structure (See Intuition.i)
;---------------------------------------------------------------------------;
		RSReset
gg_NextGadget		Rs.l	1
gg_LeftEdge		Rs.w	1
gg_TopEdge		Rs.w	1
gg_Width		Rs.w	1
gg_Height		Rs.w	1
gg_Flags		Rs.w	1
gg_Activation		Rs.w	1
gg_GadgetType		Rs.w	1
gg_GadgetRender		Rs.l	1
gg_SelectRender		Rs.l	1
gg_GadgetText		Rs.l	1
gg_MutualExclude	Rs.l	1
gg_SpecialInfo		Rs.l	1
gg_GadgetID		Rs.w	1
gg_UserData		Rs.l	1
gg_SIZEOF		Equ	__RS
;---------------------------------------------------------------------------;
; DiskObject structure (See Workbench.i)
;---------------------------------------------------------------------------;
		RSReset
do_Magic	Rs.w	1
do_Version	Rs.w	1
do_Gadget	Rs.b	gg_SIZEOF
do_Type		Rs.b	1
do_PAD_BYTE	Rs.b	1
do_DefaultTool	Rs.l	1
do_ToolTypes	Rs.l	1
do_CurrentX	Rs.l	1
do_CurrentY	Rs.l	1
do_DrawerData	Rs.l	1
do_ToolWindow	Rs.l	1
do_StackSize	Rs.l	1
do_SIZEOF	Equ	__RS
*****************************************************************************
* Exec library                                                              *
*****************************************************************************
CALEXEC	MACRO
	Move.l	(ExecBase).w,a6
	Jsr	\1(a6)
	ENDM
JMPEXEC	MACRO
	Move.l	(ExecBase).w,a6
	Jmp	\1(a6)
;;;;;;;	RTS done for us.
	ENDM
;---------------------------------------------------------------------------;
ExecBase	=  $4
;---------------------------------------------------------------------------;
Alert		= -108
Allocate	= -186
AllocMem	= -198
AllocPooled	= -708
CloseLib	= -414
CloseLibrary	= -414
CreateMsgPort	= -666
CreatePool	= -696
Deallocate	= -192
DeleteMsgPort	= -672
DeletePool	= -702
FindPort	= -390
Forbid		= -132
FreeMem		= -210
FreePooled	= -714
GetMsg		= -372
OpenLib		= -552
OpenLibrary	= -552
Permit		= -138
PutMsg		= -366
SetFunction	= -420
SetSignal	= -306
WaitPort	= -384
;---------------------------------------------------------------------------;
Memf_Public 	= 1		-.
Memf_Chip	= 2		 |_ For
Memf_Fast	= 4		 |  AllocMem()
Memf_Clear	= (1<<16)	-'
*****************************************************************************
* DOS Library                                                               *
*****************************************************************************
CALLDOS	MACRO
	Move.l	DosBase(a5),a6
	JSR	\1(a6)
	ENDM
JUMPDOS	MACRO
	Move.l	DosBase(a5),a6
	Jmp	\1(a6)
;;;;;;;	RTS done for us.
	ENDM
;---------------------------------------------------------------------------;
Close		= -36
DeleteFile	= -72
DateStamp	= -192
DateToStr	= -744
Delay		= -198
Examine		= -102
Fault		= -468
SetVar		= -900
GetVar		= -906
IoErr		= -132
Execute		= -222
CreateDir	= -120
Lock		= -84
Open		= -30
;OpenFromLock	= -378		*Don't use, 'coz it doesn't work on old HDs*
Input		= -54
OutPut		= -60
PutStr		= -948
Read		= -42
Seek		= -66
SetIoErr	= -462
SetProgramDir	= -594
StrToDate	= -750
UnLock		= -90
Write		= -48
SetComment	= -180
FGets		= -336
Flush		= -360
ReadArgs	= -798
FreeArgs	= -858
SetProtection	= -186
;---------------------------------------------------------------------------;
* These are the return codes used by convention by AmigaDOS commands
* See FAILAT and IF for relevance to EXECUTE files
RETURN_OK	= 0				/* No problems, success */
RETURN_WARN	= 5				/* A warning only */
RETURN_ERROR	= 10				/* Something wrong */
RETURN_FAIL	= 20			/* Complete or severe failure*/

* definitions of flags passed to GetVar()/SetVar()/DeleteVar()
* bit defs to be OR'ed with the type:
* item will be treated as a single line of text unless BINARY_VAR is used
GVF_GLOBAL_ONLY		= $100
GVF_LOCAL_ONLY		= $200
GVB_BINARY_VAR		= $400		/* treat variable as binary */
GVB_DONT_NULL_TERM	= $800		/* only with GVF_BINARY_VAR */

* this is only supported in >= V39 dos.  V37 dos ignores this.
* this causes SetVar to affect ENVARC: as well as ENV:.
GVB_SAVE_VAR		= $1000		/* only with GVF_GLOBAL_VAR */

* Bit numbers within FH_Protection
FIBB_SCRIPT		= 6	/* program is a script (execute) file */
FIBB_PURE		= 5	/* program is reentrant and rexecutable */
FIBB_ARCHIVE		= 4	/* cleared whenever file is changed */
FIBB_READ		= 3	/* ignored by old filesystem */
FIBB_WRITE		= 2	/* ignored by old filesystem */
FIBB_EXECUTE		= 1	/* ignored by system, used by Shell */
FIBB_DELETE		= 0	/* prevent file from being deleted */

* Bit numbers that signal you that a user has issued a break
SIGBREAKB_CTRL_C	= 12
SIGBREAKB_CTRL_D	= 13
SIGBREAKB_CTRL_E	= 14
SIGBREAKB_CTRL_F	= 15
* Bit fields that signal you that a user has issued a break
* for example:	 if (SetSignal(0,0) & SIGBREAKF_CTRL_C) cleanup_and_exit();
SIGBREAKF_CTRL_C	= (1<<SIGBREAKB_CTRL_C)
SIGBREAKF_CTRL_D	= (1<<SIGBREAKB_CTRL_D)
SIGBREAKF_CTRL_E	= (1<<SIGBREAKB_CTRL_E)
SIGBREAKF_CTRL_F	= (1<<SIGBREAKB_CTRL_F)

* For DateToStr() (For placement into DateTime-Structures)
FORMAT_DOS	= 0		dd-mmm-yy (AmigaDOS Format)
FORMAT_INT	= 1		yy-mm-dd  (International)
FORMAT_USA	= 2		mm-dd-yy  (American)
FORMAT_CDN	= 3		dd-mm-yy  (Canadian)
;FORMAT_DEF	= ?		Default format for Locale. (2.1+)
* For Seek()
OFFSET_BEGINNING	= -1
OFFSET_CURRENT		= 0
OFFSET_END		= 1
* For Open()
Mode_Old	= 1005
Mode_New	= 1006
;Mode_ReadWrite	= 1004		*Don't use it, coz it doesn't work on MY HD!*
* For Lock()
SHARED_LOCK	= -2
EXCLUSIVE_LOCK	= -1
* Errors from IoErr(), etc.
ERROR_NO_FREE_STORE		  EQU  103
ERROR_TASK_TABLE_FULL		  EQU  105
ERROR_BAD_TEMPLATE		  EQU  114
ERROR_BAD_NUMBER		  EQU  115
ERROR_REQUIRED_ARG_MISSING	  EQU  116
ERROR_KEY_NEEDS_ARG		  EQU  117
ERROR_TOO_MANY_ARGS		  EQU  118
ERROR_UNMATCHED_QUOTES		  EQU  119
ERROR_LINE_TOO_LONG		  EQU  120
ERROR_FILE_NOT_OBJECT		  EQU  121
ERROR_INVALID_RESIDENT_LIBRARY	  EQU  122
ERROR_NO_DEFAULT_DIR		  EQU  201
ERROR_OBJECT_IN_USE		  EQU  202
ERROR_OBJECT_EXISTS		  EQU  203
ERROR_DIR_NOT_FOUND		  EQU  204
ERROR_OBJECT_NOT_FOUND		  EQU  205
ERROR_BAD_STREAM_NAME		  EQU  206
ERROR_OBJECT_TOO_LARGE		  EQU  207
ERROR_ACTION_NOT_KNOWN		  EQU  209
ERROR_INVALID_COMPONENT_NAME	  EQU  210
ERROR_INVALID_LOCK		  EQU  211
ERROR_OBJECT_WRONG_TYPE		  EQU  212
ERROR_DISK_NOT_VALIDATED	  EQU  213
ERROR_DISK_WRITE_PROTECTED	  EQU  214
ERROR_RENAME_ACROSS_DEVICES	  EQU  215
ERROR_DIRECTORY_NOT_EMPTY	  EQU  216
ERROR_TOO_MANY_LEVELS		  EQU  217
ERROR_DEVICE_NOT_MOUNTED	  EQU  218
ERROR_SEEK_ERROR		  EQU  219
ERROR_COMMENT_TOO_BIG		  EQU  220
ERROR_DISK_FULL			  EQU  221
ERROR_DELETE_PROTECTED		  EQU  222
ERROR_WRITE_PROTECTED		  EQU  223
ERROR_READ_PROTECTED		  EQU  224
ERROR_NOT_A_DOS_DISK		  EQU  225
ERROR_NO_DISK			  EQU  226
ERROR_NO_MORE_ENTRIES		  EQU  232
* added for 1.4
ERROR_IS_SOFT_LINK		  EQU  233
ERROR_OBJECT_LINKED		  EQU  234
ERROR_BAD_HUNK			  EQU  235
ERROR_NOT_IMPLEMENTED		  EQU  236
ERROR_RECORD_NOT_LOCKED		  EQU  240
ERROR_LOCK_COLLISION		  EQU  241
ERROR_LOCK_TIMEOUT		  EQU  242
ERROR_UNLOCK_ERROR		  EQU  243
* error codes 303-305 are defined in dosasl.i
