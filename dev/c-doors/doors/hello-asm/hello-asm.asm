; AmiExpress Assembly Door Example - hello-asm
; Demonstrates calling AEDoor.library from 68K assembly
; Assembles with vasm: vasmm68k_mot -Fhunk -kick1hunks -nosym -m68000

; AmigaOS Constants
ABSEXECBASE     EQU     4               ; ExecBase at absolute address 4

; exec.library LVOs (Library Vector Offsets)
LVO_OpenLibrary EQU     -552            ; 0xFDD8
LVO_CloseLibrary EQU    -414            ; 0xFE62

; AEDoor.library LVOs
LVO_Register    EQU     -132            ; 0xFF7C - PreCreateComm
LVO_WriteStr    EQU     -84             ; 0xFFAC - WriteStr
LVO_ShutDown    EQU     -138            ; 0xFF76 - PostDeleteComm

; Program Entry Point
        SECTION code,CODE

start:
        ; Save registers (Amiga convention)
        movem.l d0-d7/a0-a6,-(sp)

        ; Get ExecBase from absolute address 4
        move.l  ABSEXECBASE,a6
        move.l  a6,d0                   ; Move to data register to test
        beq.s   .exit                   ; Exit if ExecBase is NULL

        ; Open AEDoor.library
        lea     aedoor_name(pc),a1      ; Library name
        moveq   #0,d0                   ; Version 0 (any version)
        jsr     LVO_OpenLibrary(a6)     ; Call exec.library OpenLibrary
        move.l  d0,aedoor_base          ; Save AEDoor.library base
        beq.s   .exit                   ; Exit if library didn't open

        ; Register with BBS (node 1)
        move.l  aedoor_base(pc),a6      ; A6 = AEDoorBase
        moveq   #1,d0                   ; Node 1
        jsr     LVO_Register(a6)        ; Call AEDoor.library Register

        ; Display hello message
        move.l  aedoor_base(pc),a6      ; A6 = AEDoorBase
        lea     hello_msg(pc),a0        ; A0 = message text
        jsr     LVO_WriteStr(a6)        ; Call AEDoor.library WriteStr

        ; Display assembly message
        move.l  aedoor_base(pc),a6      ; A6 = AEDoorBase
        lea     asm_msg(pc),a0          ; A0 = message text
        jsr     LVO_WriteStr(a6)        ; Call AEDoor.library WriteStr

        ; Display newline
        move.l  aedoor_base(pc),a6      ; A6 = AEDoorBase
        lea     crlf(pc),a0             ; A0 = CR+LF
        jsr     LVO_WriteStr(a6)        ; Call AEDoor.library WriteStr

        ; Shutdown door
        move.l  aedoor_base(pc),a6      ; A6 = AEDoorBase
        jsr     LVO_ShutDown(a6)        ; Call AEDoor.library ShutDown

        ; Close AEDoor.library
        move.l  ABSEXECBASE,a6          ; A6 = ExecBase
        move.l  aedoor_base(pc),a1      ; A1 = library base
        jsr     LVO_CloseLibrary(a6)    ; Call exec.library CloseLibrary

.exit:
        ; Restore registers
        movem.l (sp)+,d0-d7/a0-a6

        ; Exit (return code in D0)
        moveq   #0,d0                   ; Return 0 (success)
        rts

; Data Section
        SECTION data,DATA

aedoor_base:
        dc.l    0                       ; Storage for AEDoorBase

aedoor_name:
        dc.b    'AEDoor.library',0
        EVEN

hello_msg:
        dc.b    'Hello from assembly door!',0
        EVEN

asm_msg:
        dc.b    'This is pure 68K assembly code!',0
        EVEN

crlf:
        dc.b    13,10,0                 ; CR+LF
        EVEN

        END
