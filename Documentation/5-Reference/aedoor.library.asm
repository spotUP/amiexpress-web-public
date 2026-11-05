
	INCLUDE	"exec/ports.i"
  include "exec/initializers.i"
	INCLUDE	"exec/types.i"
	INCLUDE "exec/libraries.i"
  include "exec/resident.i"
  include "exec/memory.i"
  include "exec/execbase.i"
  include "dos/dosextens.i"

  include "amix/amix.i"
  include "amix/aedoor.i"
  
  include "lvo/exec_lib.i"
  include "lvo/dos_lib.i"

	SECTION	aedoorlibrary,CODE
	MOVEQ	#-1,D0
	RTS

romTag:
	dc.w	RTC_MATCHWORD      
	dc.l	romTag
	dc.l	libEnd
	dc.b	RTF_AUTOINIT       
	dc.b	2         ;version
	dc.b	NT_LIBRARY
	dc.b	0         ;priority
	dc.l	libraryName
	dc.l	libraryIdString
	dc.l	initStruct

libraryName:
	dc.b	'AEDoor.library',0

	dc.b	'$VER: '
libraryIdString:
	dc.b	'AEDoorLib 2.7 (18 May 1996)',13,10,0

dosname:	dc.b	'dos.library',0

  even
initStruct:
	dc.l	AEDoorLib_Sizeof       ;size of required data space
	dc.l	funcTable
	dc.l	dataTable
	dc.l	initRoutine

funcTable:
	dc.w	$FFFF
	dc.w	libOpen-funcTable
	dc.w	libClose-funcTable
	dc.w	libExpunge-funcTable
	dc.w	libFunc01-funcTable
	dc.w	createComm-funcTable
	dc.w	deleteComm-funcTable
	dc.w	sendCmd-funcTable
	dc.w	sendStrCmd-funcTable
	dc.w	sendDataCmd-funcTable
	dc.w	sendStrDataCmd-funcTable
	dc.w	getData-funcTable
	dc.w	getString-funcTable
	dc.w	prompt-funcTable
	dc.w	writeStr-funcTable
	dc.w	showGFile-funcTable
	dc.w	showFile-funcTable
	dc.w	setDT-funcTable
	dc.w	getDT-funcTable
	dc.w	getStr-funcTable
	dc.w	copyStr-funcTable
	dc.w	hotKey-funcTable
	dc.w	preCreateComm-funcTable
	dc.w	postDeleteComm-funcTable
	dc.w	$FFFF

dataTable:
  INITBYTE        LH_TYPE,NT_LIBRARY
  INITLONG        LN_NAME,libraryName
  INITBYTE        LIB_FLAGS,LIBF_SUMUSED!LIBF_CHANGED
  INITWORD        LIB_VERSION,2
  INITWORD        LIB_REVISION,7
  INITLONG        LIB_IDSTRING,libraryIdString
  dc.l 0

initRoutine:
	MOVE.L	A5,-(SP)
	MOVEA.L	D0,A5
	MOVE.L	A6,AED_SysLib(A5)
	MOVE.L	A0,AED_SegList(A5)
	LEA	dosname(PC),A1
	MOVEQ	#0,D0
	JSR	_LVOOpenLibrary(A6)
	MOVE.L	D0,AED_DosLib(A5)      ;dosbase
	MOVE.L	A5,D0
	MOVEA.L	(SP)+,A5
	RTS

libOpen:
	ADDQ.W	#1,LIB_OPENCNT(A6)      ;opencount
	BCLR	#LIBB_DELEXP,LIB_FLAGS(A6)
	MOVE.L	A6,D0
	RTS

libClose:
	MOVEQ	#0,D0
	SUBQ.W	#1,LIB_OPENCNT(A6)    ;opencount
	BNE.S	noexpunge
	BTST	#LIBB_DELEXP,LIB_FLAGS(A6)
	BEQ.S	noexpunge
	BSR.W	libExpunge
noexpunge:
	RTS

libExpunge:
	MOVEM.L	D2/A5/A6,-(SP)
	MOVEA.L	A6,A5
	MOVEA.L	AED_SysLib(A5),A6
	TST.W	LIB_OPENCNT(A5)
	BEQ.W	.1
	BSET	#LIBB_DELEXP,LIB_FLAGS(A5)
	MOVEQ	#0,D0
	BRA.S	.expungeEnd

.1:
	MOVE.L	AED_SegList(A5),D2
	MOVEA.L	A5,A1
	JSR	_LVORemove(A6)
  
	MOVEA.L	AED_DosLib(A5),A1    ;dosbase
	JSR	_LVOCloseLibrary(A6)

	MOVEQ	#0,D0
	MOVEA.L	A5,A1
	MOVE.W	LIB_NEGSIZE(A5),D0
	SUBA.L	D0,A1
	ADD.W	LIB_POSSIZE(A5),D0
	JSR	_LVOFreeMem(A6)
	MOVE.L	D2,D0
.expungeEnd:
	MOVEM.L	(SP)+,D2/A5/A6
	RTS

libFunc01:
	MOVEQ	#0,D0
	RTS

createComm:
	MOVEM.L	D1-D7/A2-A6,-(SP)
	MOVEA.L	AED_SysLib(A6),A5
	MOVEA.L	ThisTask(A5),A5
	MOVE.L	pr_Arguments(A5),D7
	MOVEA.L	A6,A5
.repeat:
	MOVEA.L	AED_SysLib(A5),A6
	MOVE.L	#326,D0
	MOVE.L	#MEMF_PUBLIC!MEMF_CLEAR,D1
	JSR	_LVOAllocMem(A6)
	TST.L	D0
	BNE.S	.memok
	MOVEA.L	AED_DosLib(A5),A6    ;dosbase
	MOVEQ	#50,D1
	PEA	.repeat(PC)
	JMP	_LVODelay(A6)

.memok:
	MOVEA.L	D0,A4
	LEA	doorPortName(PC),A0
	LEA	dif_ReplyName(A4),A1
.copyportname:
	MOVE.B	(A0)+,(A1)+
	BNE.S	.copyportname

	MOVEA.L	D7,A0   ;node address
  
	MOVE.B	(A0)+,-1(A1)  ;copy first digit node number

	CMPI.B	#"0",(A0)     ;is it two digits?
	BCS.S	.not2digits
	MOVE.B	(A0),(A1)     ;copy second node digit
.not2digits:
	LEA	dif_ReplyName(A4),A1
	JSR	_LVOFindPort(A6)
	MOVE.L	D0,dif_AEPort(A4)
	BEQ.W	deleteComm4
	LEA	replyPortName(PC),A0
	LEA	dif_ReplyName(A4),A1
.copyreplyportname:
	MOVE.B	(A0)+,(A1)+
	BNE.S	.copyreplyportname

	MOVEA.L	D7,A0   ;node address
	MOVE.B	(A0)+,-1(A1)    ;copy first digit of node number
	CMPI.B	#"0",(A0)       ;is it two digits?
	BCS.S	.not2digits_2
	MOVE.B	(A0),(A1)       ;copy second digit
.not2digits_2:

	MOVEQ	#-1,D0
	JSR	_LVOAllocSignal(A6)

	LEA	dif_Sizeof(A4),A1
	MOVE.B	D0,MP_SIGBIT(A1)
	MOVE.L	ThisTask(A6),MP_SIGTASK(A1)
	MOVE.L	A1,dif_MsgPort(A4)
	CLR.B	LN_PRI(A1)
	LEA	dif_ReplyName(A4),A0
	MOVE.L	A0,LN_NAME(A1)
	JSR	_LVOAddPort(A6)

	LEA	dif_Sizeof+MP_SIZE(A4),A2
	MOVE.L	A2,dif_Message(A4)
	MOVE.L	dif_MsgPort(A4),MN_REPLYPORT(A2)
	MOVE.W	#256,MN_LENGTH(A2)
	MOVEQ	#0,D0
	MOVEQ	#"0",D1
	MOVEA.L	D7,A0
	MOVE.B	(A0)+,D0
	SUB.B	D1,D0
	CMP.B	(A0),D1
	BCS.S	.not2digits_3
	MULU.W	#10,D0
	MOVE.B	(A0),D7
	SUB.B	D1,D7
	ADD.B	D7,D0
.not2digits_3:
	MOVE.L	D0,JHM_NodeID(A2)

	LEA	dif_ReplyName(A4),A0
	LEA	JHM_String(A2),A1
.copyreplyname:
	MOVE.B	(A0)+,(A1)+
	BNE.S	.copyreplyname

	MOVEA.L	dif_Message(A4),A1
	LEA	JHM_Data(A1),A0
	MOVE.L	A0,dif_Data(A4)

	LEA	JHM_String(A1),A0
	MOVE.L	A0,dif_String(A4)
	MOVEA.L	A4,A1
	MOVEQ	#JH_REGISTER,D0
	MOVEA.L	A5,A6
	BSR.W	sendCmd
	MOVE.L	A4,D0
	MOVEM.L	(SP)+,D1-D7/A2-A6
	RTS

deleteComm:
	MOVEM.L	D1-D7/A2-A6,-(SP)
deleteComm2:
	MOVEQ	#JH_SHUTDOWN,D0
	BSR.W	sendCmd
deleteComm3:
	MOVEA.L	A6,A5
	MOVEA.L	A1,A4
	MOVEA.L	AED_SysLib(A5),A6
	MOVEA.L	dif_MsgPort(A4),A1
	JSR	_LVORemPort(A6)

	MOVEA.L	dif_MsgPort(A5),A1
	MOVE.B	MP_SIGBIT(A1),D0
	JSR	_LVOFreeSignal(A6)
deleteComm4:
	MOVEA.L	A4,A1
	MOVE.L	#326,D0
	JSR	_LVOFreeMem(A6)
	MOVEQ	#0,D0
	MOVEM.L	(SP)+,D1-D7/A2-A6
	RTS

sendDataCmd:
	MOVEM.L	A1/A4/A6,-(SP)
	MOVEA.L	A1,A4
	MOVEA.L	dif_Message(A4),A1
	MOVE.L	D1,JHM_Data(A1)
	BRA.S	sendCmd2

sendStrDataCmd:
	MOVEM.L	A1/A4/A6,-(SP)
	MOVEA.L	A1,A4
	MOVEA.L	dif_Message(A4),A1
	MOVE.L	D1,JHM_Data(A1)
	BRA.S	sendStrCmd2

sendStrCmd:
	MOVEM.L	A1/A4/A6,-(SP)
	MOVEA.L	A1,A4
	MOVEA.L	dif_Message(A4),A1
sendStrCmd2:
	LEA	JHM_String(A1),A1
	MOVE.L	A0,D1
	BEQ.S	.nulstr
	MOVE.W	#198,D1
.copystr:
	MOVE.B	(A0)+,(A1)+
	DBEQ	D1,.copystr
.nulstr:
	CLR.B	(A1)
	BRA.S	sendCmd2

sendCmd:
	MOVEM.L	A1/A4/A6,-(SP)
	MOVEA.L	A1,A4
sendCmd2:
	MOVEA.L	dif_AEPort(A4),A0
	MOVEA.L	dif_Message(A4),A1
	MOVE.L	D0,JHM_Command(A1)

	MOVEA.L	AED_SysLib(A6),A6
	JSR	_LVOPutMsg(A6)
	MOVEA.L	dif_MsgPort(A4),A0
	MOVEQ	#0,D1
	MOVE.B	MP_SIGBIT(A0),D1
	MOVEQ	#1,D0
	ASL.L	D1,D0
	JSR	_LVOWait(A6)
	MOVEA.L	dif_MsgPort(A4),A0
	JSR	_LVOGetMsg(A6)
	MOVEM.L	(SP)+,A1/A4/A6
	RTS

getData:
	MOVE.L	dif_Data(A1),D0
	RTS

getString:
	MOVE.L	dif_String(A1),D0
	RTS

prompt:
	MOVEQ	#JH_PM,D0
	BSR.S	sendStrDataCmd
	MOVEA.L	dif_Data(A1),A0
	MOVEQ	#-1,D0
	CMP.L	(A0),D0
	BEQ.S	.nostr
	MOVE.L	dif_String(A1),D0
	RTS

.nostr:
	MOVEQ	#0,D0
	RTS

writeStr:
	MOVEM.L	D7/A3/A4,-(SP)
	MOVEA.L	A1,A4
	MOVEQ	#1,D7
	AND.B	D1,D7
	MOVEA.L	A0,A3
.nextline	MOVEA.L	A4,A1
	MOVE.W	#198,D0
	MOVEA.L	dif_String(A4),A0
.copy:
	MOVE.B	(A3)+,(A0)+
	DBEQ	D0,.copy
	BEQ.S	.done
	CLR.B	(A0)
	MOVEQ	#JH_SM,D0
	MOVEQ	#0,D1
	BSR.W	sendDataCmd
	BRA.S	.nextline

.done:
	MOVEQ	#JH_SM,D0
	MOVE.L	D7,D1
	BSR.W	sendDataCmd
	MOVEM.L	(SP)+,D7/A3/A4
	RTS

	MOVEQ	#JH_SM,D0
	BRA.W	sendStrDataCmd

showGFile:
	MOVEQ	#JH_SG,D0
	BRA.W	sendStrCmd

showFile:
	MOVEQ	#JH_SF,D0
	BRA.W	sendStrCmd

setDT:
	MOVEQ	#0,D1
	BRA.W	sendStrDataCmd

getDT:
	MOVEQ	#1,D1
	BRA.W	sendStrDataCmd

getStr:
	MOVEQ	#0,D0
	BSR.W	sendStrDataCmd
	MOVEA.L	dif_Data(A1),A0
	MOVEQ	#-1,D0
	CMP.L	(A0),D0
	BEQ.S	.nostr
	MOVE.L	dif_String(A1),D0
	RTS

.nostr:
	MOVEQ	#0,D0
	RTS

copyStr:
	MOVE.L	A1,-(SP)
	MOVEA.L	dif_String(A1),A1
	MOVE.W	#198,D0
.copy:
	MOVE.B	(A1)+,(A0)+
	DBEQ	D0,.copy
	CLR.B	(A0)
	MOVEA.L	(SP)+,A1
	RTS

hotKey:
	MOVEQ	#6,D0
	BSR.W	sendStrCmd
	MOVEA.L	dif_Data(A1),A0
	MOVE.L	(A0),D0
	BMI.S	.exit
	MOVEA.L	dif_String(A1),A0
	MOVEQ	#0,D0
	MOVE.B	(A0),D0
	MOVEQ	#0,D1
.exit:
	RTS

preCreateComm:
	MOVEM.L	D1-D7/A2-A6,-(SP)
	BSR.W	createComm
	MOVEA.L	D0,A1
	BRA.W	deleteComm3

postDeleteComm:
	MOVEM.L	D1-D7/A2-A6,-(SP)
	BSR.W	createComm
	MOVEA.L	D0,A1
	MOVEQ	#JH_SHUTDOWN,D0
	PEA	deleteComm2(PC)
	BRA.W	sendCmd

doorPortName:
	dc.b	'AEDoorPort',0
replyPortName:
	dc.b	'DoorReplyPort',0
  even
libEnd
	end
