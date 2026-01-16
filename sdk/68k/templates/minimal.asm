; ============================================================================
; Minimal AmiExpress Door Template - 68000 Assembly
; ============================================================================
;
; Build command:
;   vasmm68k_mot -Fhunkexe -kick1hunks -nosym -m68000 minimal.asm -o minimal
;
; Install:
;   mkdir -p Doors/MINIMAL
;   cp minimal Doors/MINIMAL/
;   echo "STACK=8192" > Doors/MINIMAL/minimal.info
;
; Register command (Commands/BBSCmd/MINIMAL.info):
;   BBSCMD=MINIMAL
;   TYPE=AMI
;   LOCATION=Doors/MINIMAL/minimal
;   DESCRIPTION=Minimal assembly door
;   ACCESS=0
;   MULTINODE=YES
;   PRIORITY=SAME
;
; ============================================================================

; AmigaOS Constants
ABSEXECBASE     EQU     4               ; ExecBase at absolute address 4

; exec.library LVOs (Library Vector Offsets)
LVO_OpenLibrary EQU     -552            ; OpenLibrary(libName, version)
LVO_CloseLibrary EQU    -414            ; CloseLibrary(library)

; AEDoor.library LVOs - USE ONLY TRAPPED FUNCTIONS!
; TRAPPED functions are handled by TypeScript and work correctly.
; NON-TRAPPED functions try to execute native code and WILL FAIL.
;
; TRAPPED (safe to use):
LVO_CreateComm  EQU     -30             ; Initialize communication channel
LVO_DeleteComm  EQU     -36             ; Cleanup communication channel
LVO_SendCmd     EQU     -42             ; Send command to BBS
LVO_SendStrCmd  EQU     -48             ; Send string command
LVO_SendDataCmd EQU     -54             ; Send data command
LVO_SendStrDataCmd EQU  -60             ; Send string+data command
LVO_GetData     EQU     -66             ; Get data from BBS
LVO_GetString   EQU     -72             ; Get string from BBS
LVO_Prompt      EQU     -78             ; Display prompt, get input
LVO_WriteStr    EQU     -84             ; Output text to user (A0=string)
LVO_ShowGFile   EQU     -90             ; Display graphics file
LVO_ShowFile    EQU     -96             ; Display text file
LVO_SetDT       EQU     -102            ; Set door data
LVO_GetDT       EQU     -108            ; Get door data
LVO_GetStr      EQU     -114            ; Get string input
LVO_CopyStr     EQU     -120            ; Copy string
LVO_HotKey      EQU     -126            ; Wait for hotkey
;
; NOT TRAPPED (DO NOT USE):
; LVO_PreCreateComm  EQU  -132          ; BROKEN - do not use!
; LVO_PostDeleteComm EQU  -138          ; BROKEN - do not use!

; ============================================================================
; CODE SECTION - Must use single section for -Fhunkexe
; ============================================================================
        SECTION text,CODE

start:
        ; Save all registers (Amiga convention)
        movem.l d0-d7/a0-a6,-(sp)

        ; ------------------------------------------------------------------
        ; Open AEDoor.library
        ; ------------------------------------------------------------------
        move.l  ABSEXECBASE,a6          ; A6 = ExecBase
        lea     aedoor_name(pc),a1      ; A1 = library name
        moveq   #0,d0                   ; D0 = version (0 = any)
        jsr     LVO_OpenLibrary(a6)     ; Call OpenLibrary
        move.l  d0,a5                   ; Save AEDoorBase in A5
        beq.s   .exit                   ; Exit if library didn't open

        ; ------------------------------------------------------------------
        ; Initialize communication channel (REQUIRED)
        ; ------------------------------------------------------------------
        move.l  a5,a6                   ; A6 = AEDoorBase
        jsr     LVO_CreateComm(a6)      ; Initialize comm

        ; ------------------------------------------------------------------
        ; Your door code goes here!
        ; ------------------------------------------------------------------

        ; Example: Output a message
        move.l  a5,a6                   ; A6 = AEDoorBase
        lea     hello_msg(pc),a0        ; A0 = message string
        jsr     LVO_WriteStr(a6)        ; Output to user

        ; Example: Output another message
        move.l  a5,a6
        lea     goodbye_msg(pc),a0
        jsr     LVO_WriteStr(a6)

        ; ------------------------------------------------------------------
        ; Cleanup communication channel (REQUIRED)
        ; ------------------------------------------------------------------
        move.l  a5,a6                   ; A6 = AEDoorBase
        jsr     LVO_DeleteComm(a6)      ; Cleanup comm

        ; ------------------------------------------------------------------
        ; Close AEDoor.library
        ; ------------------------------------------------------------------
        move.l  ABSEXECBASE,a6          ; A6 = ExecBase
        move.l  a5,a1                   ; A1 = AEDoorBase
        jsr     LVO_CloseLibrary(a6)    ; Close library

.exit:
        ; Restore all registers
        movem.l (sp)+,d0-d7/a0-a6

        ; Return success (0) to AmigaDOS
        moveq   #0,d0
        rts

; ============================================================================
; DATA - Strings and variables (in same section for -Fhunkexe)
; ============================================================================

aedoor_name:
        dc.b    'AEDoor.library',0
        EVEN

hello_msg:
        dc.b    13,10                   ; CR+LF
        dc.b    'Hello from assembly!',13,10
        dc.b    0
        EVEN

goodbye_msg:
        dc.b    'Goodbye!',13,10
        dc.b    13,10
        dc.b    0
        EVEN

; ============================================================================
; End of program
; ============================================================================
        END
