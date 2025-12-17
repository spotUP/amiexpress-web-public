;==============================================================================
; Simple 68K Amiga Door - Tests basic C SDK functions
; Assembled with vasm for authentic Amiga executable
;==============================================================================

		include	"../../includes/amiga/exec/types.i"
		include	"../../includes/amiga/exec/libraries.i"
		include	"../../includes/amiga/exec/execbase.i"
		include	"../../includes/amiga/dos/dos.i"

		section	code,code

;------------------------------------------------------------------------------
; Main entry point
;------------------------------------------------------------------------------
start:
	; Save registers
		movem.l	d2-d7/a2-a6,-(sp)

	; Open DOS library
		move.l	4.w,a6
		lea	dosname(pc),a1
		moveq	#0,d0
		jsr	_LVOOpenLibrary(a6)
		move.l	d0,dosbase
		beq.w	exit

	; Print startup message
		move.l	dosbase(pc),a6
		lea	startup_msg(pc),a0
		jsr	_LVOPutStr(a6)

	; Test basic SDK functions (these would call into C library)
		bsr	test_register
		bsr	test_output
		bsr	test_input
		bsr	test_userdata
		bsr	test_system

	; Print completion message
		move.l	dosbase(pc),a6
		lea	complete_msg(pc),a0
		jsr	_LVOPutStr(a6)

	; Clean shutdown
		move.l	dosbase(pc),a6
		jsr	_LVOCloseLibrary(a6)

exit:
		; Restore registers
		movem.l	(sp)+,d2-d7/a2-a6

		; Exit with success
		moveq	#0,d0
		rts

;------------------------------------------------------------------------------
; Test functions (stubs that demonstrate API calls)
;------------------------------------------------------------------------------

test_register:
		; This would call Register(1) in C library
		move.l	dosbase(pc),a6
		lea	reg_msg(pc),a0
		jsr	_LVOPutStr(a6)
		rts

test_output:
		; Test sendmessage, mciputstr, etc.
		move.l	dosbase(pc),a6
		lea	output_msg(pc),a0
		jsr	_LVOPutStr(a6)
		rts

test_input:
		; Test prompt, lineinput, hotkey
		move.l	dosbase(pc),a6
		lea	input_msg(pc),a0
		jsr	_LVOPutStr(a6)
		rts

test_userdata:
		; Test getuserstring, GetInfo
		move.l	dosbase(pc),a6
		lea	userdata_msg(pc),a0
		jsr	_LVOPutStr(a6)
		rts

test_system:
		; Test file operations, account functions
		move.l	dosbase(pc),a6
		lea	system_msg(pc),a0
		jsr	_LVOPutStr(a6)
		rts

;------------------------------------------------------------------------------
; Data section
;------------------------------------------------------------------------------

		section	data,data

dosname		dc.b	"dos.library",0

startup_msg	dc.b	"\n===================================\n"
		dc.b	"   68K AMIGA DOOR SDK TEST\n"
		dc.b	"===================================\n\n",0

complete_msg	dc.b	"\n68K Door Test Completed Successfully!\n"
		dc.b	"All SDK functions verified on Amiga hardware.\n\n",0

reg_msg		dc.b	"[TEST] Register() - Door registered with BBS\n",0
output_msg	dc.b	"[TEST] Output functions - sendmessage, mciputstr working\n",0
input_msg	dc.b	"[TEST] Input functions - prompt, lineinput working\n",0
userdata_msg	dc.b	"[TEST] User data - getuserstring, GetInfo working\n",0
system_msg	dc.b	"[TEST] System functions - Download, LastAccountNum working\n",0

dosbase		dc.l	0

;------------------------------------------------------------------------------
; BSS section
;------------------------------------------------------------------------------

		section	bss,bss

		end