; Simple Amiga 68K Door - Tests C SDK Functions
; Assembled with vasm for Amiga hunk format

		include	"exec/types.i"
		include	"exec/libraries.i"
		include	"exec/execbase.i"
		include	"dos/dos.i"

		section	code,code

start:
	; Open DOS library
		move.l	4.w,a6
		lea	dosname,a1
		moveq	#0,d0
		jsr	_LVOOpenLibrary(a6)
		move.l	d0,dosbase
		beq.w	exit

	; Register with BBS (call CreateComm equivalent)
	; For now, just print a message
		move.l	dosbase,a6
		lea	message,a0
		jsr	_LVOPutStr(a6)

	; Test some basic functions
		jsr	test_output
		jsr	test_input

	; Clean shutdown
		move.l	dosbase,a6
		jsr	_LVOCloseLibrary(a6)

exit:
		moveq	#0,d0
		rts

test_output:
		move.l	dosbase,a6
		lea	msg_output,a0
		jsr	_LVOPutStr(a6)
		rts

test_input:
		move.l	dosbase,a6
		lea	msg_input,a0
		jsr	_LVOPutStr(a6)
		rts

		section	data,data

dosname		dc.b	"dos.library",0
message		dc.b	"Hello from 68K Amiga Door!",10,0
msg_output	dc.b	"Testing output functions...",10,0
msg_input	dc.b	"Testing input functions...",10,0

dosbase		dc.l	0

		end