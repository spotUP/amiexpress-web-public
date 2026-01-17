; AmiExpress Random Strings Door - 68020 Assembly
; Outputs random strings using a simple LFSR (Linear Feedback Shift Register)
; Assembles with vasm: vasmm68k_mot -Fhunk -kick1hunks -nosym -m68020

; AmigaOS Constants
ABSEXECBASE     EQU     4               ; ExecBase at absolute address 4

; exec.library LVOs (Library Vector Offsets)
LVO_OpenLibrary EQU     -552            ; OpenLibrary
LVO_CloseLibrary EQU    -414            ; CloseLibrary

; dos.library LVOs
LVO_DateStamp   EQU     -192            ; DateStamp for seeding RNG

; AEDoor.library LVOs
LVO_Register    EQU     -132            ; PreCreateComm (register with BBS)
LVO_WriteStr    EQU     -84             ; WriteStr (output text)
LVO_ShutDown    EQU     -138            ; PostDeleteComm (cleanup)

; Number of random strings to display
NUM_STRINGS     EQU     5
; Total strings in our table
TOTAL_STRINGS   EQU     12

; ============================================================================
; CODE SECTION
; ============================================================================
        SECTION code,CODE

start:
        ; Save all registers (Amiga convention)
        movem.l d0-d7/a0-a6,-(sp)

        ; Get ExecBase from absolute address 4
        move.l  ABSEXECBASE,a6
        move.l  a6,d0
        beq     .exit                   ; Exit if ExecBase is NULL

        ; ------------------------------------------------------------------
        ; Open dos.library (for DateStamp to seed RNG)
        ; ------------------------------------------------------------------
        lea     dos_name(pc),a1
        moveq   #0,d0
        jsr     LVO_OpenLibrary(a6)
        move.l  d0,dos_base
        beq.s   .skip_seed              ; Skip seeding if DOS not available

        ; Get current date/time for RNG seed
        move.l  d0,a6                   ; A6 = DOSBase
        lea     datestamp(pc),a0        ; Buffer for DateStamp
        move.l  a0,d1
        jsr     LVO_DateStamp(a6)

        ; Initialize LFSR with combined date/time values
        move.l  datestamp(pc),d0        ; Days
        add.l   datestamp+4(pc),d0      ; + Minutes
        add.l   datestamp+8(pc),d0      ; + Ticks
        or.l    #$12345678,d0           ; Ensure non-zero
        move.l  d0,lfsr_state

        ; Close dos.library
        move.l  ABSEXECBASE,a6
        move.l  dos_base(pc),a1
        jsr     LVO_CloseLibrary(a6)
        bra.s   .open_aedoor

.skip_seed:
        ; Use default seed if DOS unavailable
        move.l  #$DEADBEEF,lfsr_state

        ; ------------------------------------------------------------------
        ; Open AEDoor.library
        ; ------------------------------------------------------------------
.open_aedoor:
        move.l  ABSEXECBASE,a6
        lea     aedoor_name(pc),a1
        moveq   #0,d0
        jsr     LVO_OpenLibrary(a6)
        move.l  d0,aedoor_base
        beq     .exit                   ; Exit if library didn't open

        ; ------------------------------------------------------------------
        ; Register with BBS (node 1)
        ; ------------------------------------------------------------------
        move.l  aedoor_base(pc),a6
        moveq   #1,d0                   ; Node 1
        jsr     LVO_Register(a6)

        ; ------------------------------------------------------------------
        ; Display header
        ; ------------------------------------------------------------------
        move.l  aedoor_base(pc),a6
        lea     header_msg(pc),a0
        jsr     LVO_WriteStr(a6)

        move.l  aedoor_base(pc),a6
        lea     divider(pc),a0
        jsr     LVO_WriteStr(a6)

        ; ------------------------------------------------------------------
        ; Output NUM_STRINGS random strings
        ; ------------------------------------------------------------------
        moveq   #NUM_STRINGS-1,d7       ; Loop counter

.string_loop:
        ; Generate random number 0 to TOTAL_STRINGS-1
        bsr.s   random_lfsr             ; Get random in D0
        divu.w  #TOTAL_STRINGS,d0       ; Divide by table size
        swap    d0                      ; Get remainder in low word
        and.l   #$FFFF,d0               ; Clear high word

        ; Calculate string pointer offset
        ; Each entry is 4 bytes (pointer)
        lsl.l   #2,d0                   ; D0 = D0 * 4
        lea     string_table(pc),a0
        add.l   d0,a0                   ; A0 = string_table + offset
        move.l  (a0),a0                 ; A0 = pointer to actual string

        ; Output the string
        move.l  aedoor_base(pc),a6
        jsr     LVO_WriteStr(a6)

        ; Output newline
        move.l  aedoor_base(pc),a6
        lea     crlf(pc),a0
        jsr     LVO_WriteStr(a6)

        dbf     d7,.string_loop         ; Loop for all strings

        ; ------------------------------------------------------------------
        ; Display footer
        ; ------------------------------------------------------------------
        move.l  aedoor_base(pc),a6
        lea     divider(pc),a0
        jsr     LVO_WriteStr(a6)

        move.l  aedoor_base(pc),a6
        lea     footer_msg(pc),a0
        jsr     LVO_WriteStr(a6)

        ; ------------------------------------------------------------------
        ; Shutdown door
        ; ------------------------------------------------------------------
        move.l  aedoor_base(pc),a6
        jsr     LVO_ShutDown(a6)

        ; Close AEDoor.library
        move.l  ABSEXECBASE,a6
        move.l  aedoor_base(pc),a1
        jsr     LVO_CloseLibrary(a6)

.exit:
        ; Restore registers
        movem.l (sp)+,d0-d7/a0-a6
        moveq   #0,d0                   ; Return 0 (success)
        rts

; ============================================================================
; SUBROUTINES
; ============================================================================

; random_lfsr - 32-bit LFSR pseudo-random number generator
; Uses taps at bits 32, 22, 2, 1 (maximal period polynomial)
; Input: None
; Output: D0 = 32-bit random number
; Destroys: D1, D2
random_lfsr:
        move.l  lfsr_state(pc),d0
        move.l  d0,d1
        move.l  d0,d2                   ; Save original for XOR

        ; Calculate feedback bit: XOR of bits 31, 21, 1, 0
        lsr.l   #1,d1                   ; Get bit 0 into carry
        roxr.l  #1,d0                   ; Shift right, carry into MSB
        eor.l   d2,d0                   ; XOR with original (from register)

        ; Additional mixing for more entropy
        move.l  d0,d1
        ror.l   #7,d1
        eor.l   d1,d0
        rol.l   #3,d0

        move.l  d0,lfsr_state           ; Store new state
        rts

; ============================================================================
; DATA SECTION
; ============================================================================
        SECTION data,DATA

aedoor_base:
        dc.l    0                       ; Storage for AEDoorBase

dos_base:
        dc.l    0                       ; Storage for DOSBase

lfsr_state:
        dc.l    $DEADBEEF               ; LFSR state (will be seeded)

datestamp:
        dc.l    0,0,0                   ; DateStamp buffer (days, mins, ticks)

aedoor_name:
        dc.b    'AEDoor.library',0
        EVEN

dos_name:
        dc.b    'dos.library',0
        EVEN

header_msg:
        dc.b    13,10
        dc.b    '*** Random Strings Generator ***',13,10
        dc.b    '    Written in 68020 Assembly   ',13,10,0
        EVEN

footer_msg:
        dc.b    '     [Press ENTER to exit]      ',13,10,13,10,0
        EVEN

divider:
        dc.b    '================================',13,10,0
        EVEN

crlf:
        dc.b    13,10,0
        EVEN

; String table - pointers to each string
string_table:
        dc.l    str_0
        dc.l    str_1
        dc.l    str_2
        dc.l    str_3
        dc.l    str_4
        dc.l    str_5
        dc.l    str_6
        dc.l    str_7
        dc.l    str_8
        dc.l    str_9
        dc.l    str_10
        dc.l    str_11

; The actual random strings
str_0:
        dc.b    '  The Amiga never dies!',0
        EVEN
str_1:
        dc.b    '  Greetings from the 68020!',0
        EVEN
str_2:
        dc.b    '  BBS systems rule!',0
        EVEN
str_3:
        dc.b    '  Assembly is beautiful.',0
        EVEN
str_4:
        dc.b    '  Welcome to AmiExpress!',0
        EVEN
str_5:
        dc.b    '  Retro computing forever.',0
        EVEN
str_6:
        dc.b    '  May the GURU be with you.',0
        EVEN
str_7:
        dc.b    '  Boing! Boing! Boing!',0
        EVEN
str_8:
        dc.b    '  Insert disk 2...',0
        EVEN
str_9:
        dc.b    '  Running on emulated silicon.',0
        EVEN
str_10:
        dc.b    '  MOIRA brings the 68K to life!',0
        EVEN
str_11:
        dc.b    '  Long live the demo scene!',0
        EVEN

        END
