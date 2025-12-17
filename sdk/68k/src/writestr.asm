; AEDoor.library function wrappers for vbcc

        section code,code
        xdef _WriteStr
        xdef _Register_Asm
        xdef _ShutDown_Asm

; void WriteStr(char *text, struct Library *AEDoorBase)
_WriteStr:
        move.l  4(sp),a0        ; Get text parameter
        move.l  8(sp),a6        ; Get AEDoorBase parameter
        jsr     -84(a6)         ; Call WriteStr (LVO -84)
        rts

; void Register_Asm(int node, struct Library *AEDoorBase)
_Register_Asm:
        move.l  4(sp),d0        ; Get node parameter
        move.l  8(sp),a6        ; Get AEDoorBase parameter
        jsr     -30(a6)         ; Call Register (LVO -30)
        rts

; void ShutDown_Asm(struct Library *AEDoorBase)
_ShutDown_Asm:
        move.l  4(sp),a6        ; Get AEDoorBase parameter
        jsr     -36(a6)         ; Call ShutDown (LVO -36)
        rts

        end
