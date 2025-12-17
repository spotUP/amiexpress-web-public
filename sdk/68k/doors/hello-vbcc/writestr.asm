; AEDoor.library WriteStr wrapper for vbcc
; void WriteStr(char *text, struct Library *AEDoorBase)

        section code,code

        xdef _WriteStr

_WriteStr:
        move.l  4(sp),a0        ; Get text parameter
        move.l  8(sp),a6        ; Get AEDoorBase parameter
        jsr     -84(a6)         ; Call WriteStr (LVO -84)
        rts

        end
