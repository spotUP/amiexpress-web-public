_LVOWait	EQU	-$13E
_LVOAddPort	EQU	-$162
_LVOGetMsg	EQU	-$174
_LVOFreeMem	EQU	-$D2
_LVOCloseLibrary	EQU	-$19E
_LVOPutMsg	EQU	-$16E
_LVORemove	EQU	-$FC
_LVOAllocSignal	EQU	-$14A
_LVORemPort	EQU	-$168
_LVOOpenLibrary	EQU	-$228
_LVODelay	EQU	-$C6
_LVOAllocMem	EQU	-$C6
_LVOFreeSignal	EQU	-$150
_LVOFindPort	EQU	-$186
****************************************************************************
	SECTION	aedoorlibrary000000,CODE
ProgStart
	MOVEQ	#-1,D0
	RTS

romTag	dc.w	$4AFC
	dc.l	romTag
	dc.l	LAB_40C
	dc.b	$80
	dc.b	2
	dc.b	9
	dc.b	0
	dc.l	libraruName
	dc.l	libraryIdString
	dc.l	initStruct
libraruName	dc.b	'AEDoor.library',0
	dc.b	'$VER: '
libraryIdString	dc.b	'AEDoorLib 2.7 (18 May 1996)',$D,$A,0
doslibrary.MSG	dc.b	'dos.library',0,0
initStruct	dc.l	$30
	dc.l	funcTable
	dc.l	dataTable
	dc.l	initRoutine
funcTable	dc.w	$FFFF
	dc.w	libOpen-funcTable
	dc.w	libClose-funcTable
	dc.w	libExpunge-funcTable
	dc.w	libFunc01-funcTable
	dc.w	createComm-funcTable
	dc.w	deleteComm-funcTable
	dc.w	libFunc04-funcTable
	dc.w	libFunc05-funcTable
	dc.w	libFunc06-funcTable
	dc.w	libFunc07-funcTable
	dc.w	libFunc08-funcTable
	dc.w	libFunc09-funcTable
	dc.w	libFunc10-funcTable
	dc.w	libFunc11-funcTable
	dc.w	libFunc12-funcTable
	dc.w	libFunc13-funcTable
	dc.w	libFunc14-funcTable
	dc.w	libFunc15-funcTable
	dc.w	libFunc16-funcTable
	dc.w	libFunc17-funcTable
	dc.w	libFunc18-funcTable
	dc.w	libFunc19-funcTable
	dc.w	libFunc20-funcTable
	dc.w	$FFFF
dataTable	dc.w	$A00C
	dc.w	$900
	dc.w	$800A
	dc.l	libraruName
	dc.w	$A00E
	dc.w	$600
	dc.w	$9014
	dc.w	2
	dc.w	$9016
	dc.w	7
	dc.w	$8018
	dc.l	libraryIdString
	dcb.w	2,0

initRoutine	MOVE.L	A5,-(SP)
	MOVEA.L	D0,A5
	MOVE.L	A6,$22(A5)
	MOVE.L	A0,$2A(A5)
	LEA	doslibrary.MSG(PC),A1
	MOVEQ	#0,D0
	JSR	_LVOOpenLibrary(A6)
	MOVE.L	D0,$26(A5)
	MOVE.L	A5,D0
	MOVEA.L	(SP)+,A5
	RTS

libOpen	ADDQ.W	#1,$20(A6)
	BCLR	#3,14(A6)
	MOVE.L	A6,D0
	RTS

libClose	MOVEQ	#0,D0
	SUBQ.W	#1,$20(A6)
	BNE.S	LAB_102
	BTST	#3,14(A6)
	BEQ.S	LAB_102
	BSR.W	libExpunge
LAB_102	RTS

libExpunge	MOVEM.L	D2/A5/A6,-(SP)
	MOVEA.L	A6,A5
	MOVEA.L	$22(A5),A6
	TST.W	$20(A5)
	BEQ.W	LAB_120
	BSET	#3,14(A5)
	MOVEQ	#0,D0
	BRA.S	LAB_146

LAB_120	MOVE.L	$2A(A5),D2
	MOVEA.L	A5,A1
	JSR	_LVORemove(A6)
	MOVEA.L	$26(A5),A1
	JSR	_LVOCloseLibrary(A6)
	MOVEQ	#0,D0
	MOVEA.L	A5,A1
	MOVE.W	$10(A5),D0
	SUBA.L	D0,A1
	ADD.W	$12(A5),D0
	JSR	_LVOFreeMem(A6)
	MOVE.L	D2,D0
LAB_146	MOVEM.L	(SP)+,D2/A5/A6
	RTS

libFunc01:
	MOVEQ	#0,D0
	RTS

createComm:
	MOVEM.L	D1-D7/A2-A6,-(SP)
	MOVEA.L	$22(A6),A5
	MOVEA.L	$114(A5),A5
	MOVE.L	$CC(A5),D7
	MOVEA.L	A6,A5
LAB_162	MOVEA.L	$22(A5),A6
	MOVE.L	#$146,D0
	MOVE.L	#$10001,D1
	JSR	_LVOAllocMem(A6)
	TST.L	D0
	BNE.S	LAB_188
	MOVEA.L	$26(A5),A6
	MOVEQ	#$32,D1
	PEA	LAB_162(PC)
	JMP	_LVODelay(A6)

LAB_188	MOVEA.L	D0,A4
	LEA	LAB_3F2(PC),A0
	LEA	12(A4),A1
LAB_192	MOVE.B	(A0)+,(A1)+
	BNE.S	LAB_192
	MOVEA.L	D7,A0
	MOVE.B	(A0)+,-1(A1)
	CMPI.B	#$30,(A0)
	BCS.S	LAB_1A4
	MOVE.B	(A0),(A1)
LAB_1A4	LEA	12(A4),A1
	JSR	_LVOFindPort(A6)
	MOVE.L	D0,0(A4)
	BEQ.W	LAB_27E
	LEA	LAB_3FD(PC),A0
	LEA	12(A4),A1
LAB_1BC	MOVE.B	(A0)+,(A1)+
	BNE.S	LAB_1BC
	MOVEA.L	D7,A0
	MOVE.B	(A0)+,-1(A1)
	CMPI.B	#$30,(A0)
	BCS.S	LAB_1CE
	MOVE.B	(A0),(A1)
LAB_1CE	MOVEQ	#-1,D0
	JSR	_LVOAllocSignal(A6)
	LEA	$24(A4),A1
	MOVE.B	D0,15(A1)
	MOVE.L	$114(A6),$10(A1)
	MOVE.L	A1,4(A4)
	CLR.B	9(A1)
	LEA	12(A4),A0
	MOVE.L	A0,10(A1)
	JSR	_LVOAddPort(A6)
	LEA	$46(A4),A2
	MOVE.L	A2,8(A4)
	MOVE.L	4(A4),14(A2)
	MOVE.W	#$100,$12(A2)
	MOVEQ	#0,D0
	MOVEQ	#$30,D1
	MOVEA.L	D7,A0
	MOVE.B	(A0)+,D0
	SUB.B	D1,D0
	CMP.B	(A0),D1
	BCS.S	LAB_222
	MULU.W	#10,D0
	MOVE.B	(A0),D7
	SUB.B	D1,D7
	ADD.B	D7,D0
LAB_222	MOVE.L	D0,$E4(A2)
	LEA	12(A4),A0
	LEA	$14(A2),A1
LAB_22E	MOVE.B	(A0)+,(A1)+
	BNE.S	LAB_22E
	MOVEA.L	8(A4),A1
	LEA	$DC(A1),A0
	MOVE.L	A0,$1C(A4)
	LEA	$14(A1),A0
	MOVE.L	A0,$20(A4)
	MOVEA.L	A4,A1
	MOVEQ	#1,D0
	MOVEA.L	A5,A6
	BSR.W	libFunc04
	MOVE.L	A4,D0
	MOVEM.L	(SP)+,D1-D7/A2-A6
	RTS

deleteComm:
	MOVEM.L	D1-D7/A2-A6,-(SP)
LAB_25C	MOVEQ	#2,D0
	BSR.W	libFunc04
LAB_262	MOVEA.L	A6,A5
	MOVEA.L	A1,A4
	MOVEA.L	$22(A5),A6
	MOVEA.L	4(A4),A1
	JSR	_LVORemPort(A6)
	MOVEA.L	4(A5),A1
	MOVE.B	15(A1),D0
	JSR	_LVOFreeSignal(A6)
LAB_27E	MOVEA.L	A4,A1
	MOVE.L	#$146,D0
	JSR	_LVOFreeMem(A6)
	MOVEQ	#0,D0
	MOVEM.L	(SP)+,D1-D7/A2-A6
	RTS

libFunc06:
	MOVEM.L	A1/A4/A6,-(SP)
	MOVEA.L	A1,A4
	MOVEA.L	8(A4),A1
	MOVE.L	D1,$DC(A1)
	BRA.S	LAB_2D8

libFunc07:
	MOVEM.L	A1/A4/A6,-(SP)
	MOVEA.L	A1,A4
	MOVEA.L	8(A4),A1
	MOVE.L	D1,$DC(A1)
	BRA.S	LAB_2BC

libFunc05:
	MOVEM.L	A1/A4/A6,-(SP)
	MOVEA.L	A1,A4
	MOVEA.L	8(A4),A1
LAB_2BC	LEA	$14(A1),A1
	MOVE.L	A0,D1
	BEQ.S	LAB_2CE
	MOVE.W	#$C6,D1
LAB_2C8	MOVE.B	(A0)+,(A1)+
	DBEQ	D1,LAB_2C8
LAB_2CE	CLR.B	(A1)
	BRA.S	LAB_2D8

libFunc04:
	MOVEM.L	A1/A4/A6,-(SP)
	MOVEA.L	A1,A4
LAB_2D8	MOVEA.L	0(A4),A0
	MOVEA.L	8(A4),A1
	MOVE.L	D0,$E0(A1)
	MOVEA.L	$22(A6),A6
	JSR	_LVOPutMsg(A6)
	MOVEA.L	4(A4),A0
	MOVEQ	#0,D1
	MOVE.B	15(A0),D1
	MOVEQ	#1,D0
	ASL.L	D1,D0
	JSR	_LVOWait(A6)
	MOVEA.L	4(A4),A0
	JSR	_LVOGetMsg(A6)
	MOVEM.L	(SP)+,A1/A4/A6
	RTS

libFunc08:
	MOVE.L	$1C(A1),D0
	RTS

libFunc09:
	MOVE.L	$20(A1),D0
	RTS

libFunc10:
	MOVEQ	#5,D0
	BSR.S	libFunc07
	MOVEA.L	$1C(A1),A0
	MOVEQ	#-1,D0
	CMP.L	(A0),D0
	BEQ.S	LAB_32C
	MOVE.L	$20(A1),D0
	RTS

LAB_32C	MOVEQ	#0,D0
	RTS

libFunc11:
	MOVEM.L	D7/A3/A4,-(SP)
	MOVEA.L	A1,A4
	MOVEQ	#1,D7
	AND.B	D1,D7
	MOVEA.L	A0,A3
LAB_33C	MOVEA.L	A4,A1
	MOVE.W	#$C6,D0
	MOVEA.L	$20(A4),A0
LAB_346	MOVE.B	(A3)+,(A0)+
	DBEQ	D0,LAB_346
	BEQ.S	LAB_35A
	CLR.B	(A0)
	MOVEQ	#4,D0
	MOVEQ	#0,D1
	BSR.W	libFunc06
	BRA.S	LAB_33C

LAB_35A	MOVEQ	#4,D0
	MOVE.L	D7,D1
	BSR.W	libFunc06
	MOVEM.L	(SP)+,D7/A3/A4
	RTS

	MOVEQ	#4,D0
	BRA.W	libFunc07

libFunc12:
	MOVEQ	#7,D0
	BRA.W	libFunc05

libFunc13:
	MOVEQ	#8,D0
	BRA.W	libFunc05

libFunc14:
	MOVEQ	#0,D1
	BRA.W	libFunc07

libFunc15:
	MOVEQ	#1,D1
	BRA.W	libFunc07

libFunc16:
	MOVEQ	#0,D0
	BSR.W	libFunc07
	MOVEA.L	$1C(A1),A0
	MOVEQ	#-1,D0
	CMP.L	(A0),D0
	BEQ.S	LAB_39C
	MOVE.L	$20(A1),D0
	RTS

LAB_39C	MOVEQ	#0,D0
	RTS

libFunc17:
	MOVE.L	A1,-(SP)
	MOVEA.L	$20(A1),A1
	MOVE.W	#$C6,D0
LAB_3AA	MOVE.B	(A1)+,(A0)+
	DBEQ	D0,LAB_3AA
	CLR.B	(A0)
	MOVEA.L	(SP)+,A1
	RTS

libFunc18:
	MOVEQ	#6,D0
	BSR.W	libFunc05
	MOVEA.L	$1C(A1),A0
	MOVE.L	(A0),D0
	BMI.S	LAB_3CE
	MOVEA.L	$20(A1),A0
	MOVEQ	#0,D0
	MOVE.B	(A0),D0
	MOVEQ	#0,D1
LAB_3CE	RTS

libFunc19:
	MOVEM.L	D1-D7/A2-A6,-(SP)
	BSR.W	createComm
	MOVEA.L	D0,A1
	BRA.W	LAB_262

libFunc20:
	MOVEM.L	D1-D7/A2-A6,-(SP)
	BSR.W	createComm
	MOVEA.L	D0,A1
	MOVEQ	#2,D0
	PEA	LAB_25C(PC)
	BRA.W	libFunc04

LAB_3F2	dc.b	'AEDoorPort',0
LAB_3FD	dc.b	'DoorReplyPort',0,0
LAB_40C
	end
