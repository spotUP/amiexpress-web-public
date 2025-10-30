	OPT	USER,W-

**
**	$Filename: Example.s $
**	$Release: 0.1 $
**	$Revision: 1.00 $
**	$Date: 92/09/17 $
**
**	Simple example showing how to use the library
**

	INCLUDE	exec/types.i
	INCLUDE	exec/exec_lib.i
	INCLUDE	exec/nodes.i
	INCLUDE	exec/ports.i
	INCLUDE	exec/memory.i
	INCLUDE	amix/amix.i
	INCLUDE	amix/aedoor.i

Start:
	move.b	(a0),d7
	move.l	$4.w,a6
	moveq	#0,d0
	lea	_AEDoorLib(PC),a1
	jsr	_LVOOpenLibrary(a6)
	lea	_AEDBase(PC),a0
	move.l	d0,(a0)


	move.b	d7,d0			;Get Node Numba!
	move.l	_AEDBase(PC),a6
	jsr	_LVOCreateComm(a6)
	lea	_DIF(PC),a0
	move.l	d0,(a0)


	lea	MyString(PC),a0
	moveq	#NOLF,d1
	move.l	_DIF(PC),a1
	jsr	_LVOWriteStr(a6)

	move.l	#JH_SYSOP,d0		;Get SYSOP name
	jsr	_LVOSendCmd(a6)		;JHM_String will contain the name

	move.l	#JH_WRITE,d0		;Don't overwrite string so that we can
	jsr	_LVOSendCmd(a6)		;use SendCmd() instead of WriteStr()


	lea	Done(PC),a0
	moveq	#LF,d1
	move.l	_DIF(PC),a1
	jsr	_LVOWriteStr(a6)

	move.l	_DIF(PC),a1
	jsr	_LVODeleteComm(a6)

	move.l	a6,a1
	move.l	$4.w,a6
	jsr	_LVOCloseLibrary(a6)
	moveq	#0,d0
	rts

_AEDoorLib:	dc.b	'AEDoor.library',0
_AEDBase:	dc.l	0
_DIF:		dc.l	0

MyString:	dc.b	"Sysop name is ",0
Done:		dc.b	10,13,"Done.",0
