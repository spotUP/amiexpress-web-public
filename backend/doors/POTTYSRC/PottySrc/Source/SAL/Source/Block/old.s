Inserts a file into the current ....
This should be made to store position to return to FormTxt of the current output
and then formtxt the given file, then return to current.
Don't forget to check for recursive use of this command!

FT_Text_File
	BClr	#F1_ExANSI,Fmt_F_1(a5)	Reset (Clear) bit for this part.
	Cmpi.b	#'"',(a0)+		Make sure there's an open-quote
	Bne	BadInput
	Move.l	a0,Temp001(a5)		Store a0 incase ANSI but no .gr

;;;;;;;	Move.l	a0,a0			Copy filename from input file...
FTxTGJm	Lea	StdBuff(a5),a1		...to the buffer...
	Move.l	#StdBuffLen-4,d7	...(which is this long -{".gr",0})...
	Move.b	#'"',d0			...and stop the copy at the quote.
	Bsr	CopyChr			<Do it!>
	Cmpi.w	#-1,d7			Did the buffer overflow?
	Beq	BadInput		Yes -> Bad Input.
	Addq.l	#1,a0			Point past the quote.
	Move.l	a0,-(SP)		Preserve input ptr after filename.

	BClr	#F1_ExANSI,Fmt_F_1(a5)	If this has been set, ".gr" already
	Bne.s	FTTG_NA			...tried, so load without it...
	BTst	#F1_NoANSI,Fmt_F_1(a5)	NoANSI On?
	Bne.s	FTTG_NA			Yes = load without ".gr"
	Move.b	#".",(a1)+		-.
	Move.b	#"g",(a1)+		 |- Else, add ".gr" to filename.
	Move.b	#"r",(a1)+		-'
	BSet	#F1_ExANSI,Fmt_F_1(a5)	If this has been set, ".gr" already
FTTG_NA	SF	(a1)+			Nullterminate the filename.

	Lea	StdBuff(a5),a0
	Move.l	a0,FileNam(a5)		For NRead4 below.
	Lea	FTTG_NF(pc),a0		-._ If the file doesn't exist
	Move.l	a0,NoFilRt(a5)		-'  jump to FTTG_NF
	Bsr	NRead4			Continue read as normal

	Move.l	(SP)+,a0		Restore input ptr after filename.
	Bsr	Restore_FT_Regs		Restore regs

	Move.l	FileAdr(a5),a2		Pointer to file to copy to output.
	Move.l	FileSze(a5),d2		Size of this file.
	Bra.s	FTTG_CJ
FTTG_Cp	Cmp.l	d6,a1			-.
	Blt.s	FTxTGr2			 |- End of block = Allocate another
	Bsr	AlocOutBlock		-'
FTxTGr2	Move.b	(a2)+,(a1)+		Copy the char...
	Addq.l	#1,d0			Increment number of chars written.
FTTG_CJ	DBra	d2,FTTG_Cp		Do all of the file...

	Movem.l	d0-1/d5-7/a0-1,-(SP)	Preserve regs
	Bsr	FilDAlo			Deallocate the loaded file.
	Movem.l	(SP)+,d0-1/d5-7/a0-1	Restore regs
	Bra	FTxtSJm			Continue with original input.

FTTG_NF	Addq.l	#8,SP			Compensate for RTS and a0.l
	BTst	#F1_ExANSI,Fmt_F_1(a5)	If this has been set, ".gr" already
	Beq	Error			If not, generate error message.
	Move.l	Temp001(a5),a0		Point back to the filename...
	Bra	FTxTGJm			Else try to load without ".gr".


*****************************************************************************
* Puts the char (a3) into the output (a1) with end chking etc.              *
*****************************************************************************
FTxCOut	Bsr	Restore_FT_Regs		Restore regs
	Cmp.l	d5,a3			Make sure (a3) is within the file.
	Bge	BadInput
	Cmp.l	d6,a1			-.
	Blt.s	FTxNor3			 |- End of block = Allocate another
	Bsr	AlocOutBlock		-'
FTxNor3	Move.b	(a3),(a1)+		Copy the char...
	Addq.l	#1,d0			Increment number of chars written.
	Bra	FTxtSJm			Continue with original input.
