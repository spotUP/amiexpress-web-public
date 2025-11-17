*=- INFO -=****************************************************************************
* Data Subroutines. (Number/String Handling, etc etc)                                 *
* Unless otherwise stated, all routines are by Leo Davidson (P0T-NOoDLE of Gods'Gift) *
*=- Notes -===========================================================================*
* o Make sure all routines using the CharCopy commands check d7 as WORD, not longword *
* o Routines using upper-case do *NOT* currently use the local.library.               *
*   (Only chars A-Z are handled, which is good enough for the jobs it's used for).    *
*=- To Do -===========================================================================*
* o Use IFGT or similar to define how much of the ascii->number routine is included.  *
* o The random number routines need sorting out.                                      *
*=- History -=========================================================================*
* o Version 2.00                                                                      *
*   Ancient history deleted.                                                          *
***************************************************************************************


***************************************************************************************
*: Data Handling Subroutines :::::::::::::::::::::::::::::::::::::::::::::::::::::::::*
***************************************************************************************
;DATA_CMP_NUL	; Compare Two Null-Term strings.
;DATA_SR_FACS	; Serach, Forwards, Case Sensitive - String, Till ADR
;DATA_SR_BACS	; Serach, Backwards, Case Sensitiv - String, Till ADR
;DATA_SR_EITH	; Search, Forwards, Case Sensitive - 1 of 2 Bytes.
;DATA_SR_AdrB	; Search, Forwards, Case Sensitive - Byte, Till ADR
;DATA_SRBAdrB	; Serach, Backwards, Case Sensitiv - Byte, Till ADR
;DATA_UPPACAZ	; Upper-Case.
;DATA_UPPA_NT	; Upper-Case NullTerm data.
;DATA_JOINNT	; Join two null-terminated strings.
;DATA_CHARCOP	; Copy x chars with specified terminator.
;DATA_CHARCOPNL	; Copy x chars with Null-Term and specified terminator.
;DATA_CHARCNT	; Copy x chars with Null-Term
;DATA_COPYCN2	; Copy x chars with Null-Term, don't copy Null.
;DATA_COPYCN3	; Copy chars with Null-Term, don't copy Null, no Length
;DATA_CPYDUAL	; Copy x chars with two specified terminators
;DATA_WRCHARS	; Write specied char x times.
;DATA_SPAOVER	; Overlay output with (space) padding.
;DATA_N2AAuto	; Automatically selects the needed NUM2ASC routine.
;DATA_NUM2ASC	; Raw Number to ASCII conversion.
;DATA_N2ASCFT	; Raw Number to ASCII conversion, to Format-Text Blocks.
;DATA_AS2NUNT	; ASCII to Raw Number conversion, expansion for NT data.
;DATA_ASC2NUM	; ASCII to Raw Number conversion.
;DATA_TIMECON	; Time Convertion routine (ASCII HH:MM -> Raw Minutes).
;DATA_PADZERO	; Space-Pad Zeros from start of ASCII number.
;DATA_DQUOTER	; De-Quoter (Nulls 1st found Quote) for #-1 Term String.
;DATA_EXPLODE	; Imploder Decrunch.
;DATA_NULLLEN	; Calculate the length of a Null-Term String.
;DATA_RNDBYTE	; Generate a BYTE sized random number.
;DATA_RNDWORD	; Generate a WORD sized random number.
;DATA_RNDLEPP	; Generate a WORD sized random number (by Andrew Leppard)
;DATA_NUWRAND	; "New" Random Number (Word) Routines.
;DATA_RAWDOFMT	; RawDoFmt() routine.
;	INCLUDE	ASM:Source/Routines/Data.s
;=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=;
	IFD	DATA_CMP_NUL
*= COMPARE NULL TERMINATED =*************************************************
* (a0) = Start of 1st String to cmp   * (a1) = Start of 2nd String to cmp   *
*===========================================================================*
* After BSRing this routine: BEQ to routine for if they are the same, or,   *
* -------------------------- BNE to routine for if they are not the same.   *
*****************************************************************************
NCmp	Cmpm.b	(a0)+,(a1)+		Compare the two bytes.
	Bne.s	NCmp_NE			If not equal, Branch.
;;;;;;; *THE BRANCH TO NCmp_NE **MUST** BE DONE AS A BNE!!*
	Tst.b	-1(a0)			Did we just check two nulls?
	Bne.s	NCmp			If not, Check the next bytes...
NCmp_NE	RTS
	ENDC

	IFD	DATA_SR_FACS
*= SEARCH FORWARDS, CASE SENSITIVE, TILL ADR =*******************************
* a0 - Start of area to be searched   * a1 = <Preserve a0>       (-Varies-) *
* a2 - String to search for, NULL end * a3 = <Preserve a2>       (-Varies-) *
* d3 = (Gap Area » Searched)          * d4 = <Temp>              (-Varies-) *
* d6 - Adr to stop searching at.      *                                     *
*===========================================================================*
* If d6 reached before a2 found then d3 returns #-1                         *
*****************************************************************************
SAdrStr	Move.l	a0,a1			Preserve a0 pointer
	Move.l	a2,a3			Preserve a2 pointer
	Moveq.l	#0,d4			Clear for length of searched.
SSALoop	Tst.b	(a3)			Are we at the end of the compare?
	Beq.s	SSAFond			Yes=End part.
	Cmp.l	d6,a1			If past end of search area,
	Bge.s	SSANotF			end search.
	Cmpm.b	(a1)+,(a3)+		Check The letter.
	Beq.s	SSAFdCh			Match=Increment both counters.
	Move.l	a2,a3			Reset a3 to start of searched.
	Sub.l	d4,a1			Rechechk Chars *IMPORTANT*
;					Without, partial matches followed
;					by the real thing would not find it!
	Moveq.l	#0,d4			Reset "Length" of searched to 0.
	Bra.s	SSALoop			Loop it.
SSAFdCh	Addq.l	#1,d4			Add one to length of searched
	Bra.s	SSALoop			Loop it.
SSANotF	Moveq.l	#-1,d3			String not found: Negative # in d3
	RTS
SSAFond	Move.l	a1,d3			To be returned in d3...
	Sub.l	a0,d3			-._ Get length from Start of search to
	Sub.l	d4,d3			-'  start of Searched.
	RTS
	ENDC

	IFD	DATA_SR_EITH
*= SEARCH - FORWARDS - CASE SENSITIVE - FOR EITHER SPECIFIED BYTES =*********
* d0 - First Byte to end search on   * a0 - Start of Search area            *
* d1 - Second Byte to end search on  * a1 = <Preserves a0>                  *
* d3 = (Length a0 -> (d0) or (d1))   *                                      *
*===========================================================================*
* After BSRing this routine: BEQ to routine for if the First (d0) is Found  *
* -------------------------- BNE to routine for if the Secnd (d1) is Found  *
*****************************************************************************
SR_Eith	Moveq	#0,d3			Clear d3 ready for count.
	Move.l	a0,a1			Preserve a0
SR_ELop	Cmp.b	(a1),d0			-.
	Beq.s	SR_ED0E			 |_ If either byte found,
	Cmp.b	(a1)+,d1		 |  the job is done.
	Beq.s	SR_ED1E			-'
	Addq.l	#1,d3			Increment Distance counter
	Bra.s	SR_ELop			Check the next Byte.
SR_ED0E	Move	#EqCCR,CCR		d0 Was found. (Set Z CCR "Equal")
	RTS				Return
SR_ED1E	Move	#NeCCR,CCR		d1 Was found. (Clear Z CCR "NotEq")
	RTS				Return
	ENDC

	IFD	DATA_SR_BACS
*= SEARCH - BACKWARDS - CASE SENSITIVE - TILL ADR =**************************
* a0 - End+1 of area to be searched   * a1 = <Preserve a0>       (-Varies-) *
* a2 - Backwards String to search for * a3 = <Preserve a2>       (-Varies-) *
*    \_ Null-Terminate it.            * d4 = <Temp>              (-Varies-) *
* d6 - Adr to Stop Searching at.      * d7 = <Temp>                         *
* d3 = (Length from End of            *                                     *
*    \_ area to Start Search String)  *                                     *
*===========================================================================*
* If d6 reached before a2 found then d3 returns #-1                         *
*****************************************************************************
SBaStAd	Move.l	a0,a1			Preserve a0 pointer
	Move.l	a2,a3			Preserve a2 pointer
	Moveq.l	#0,d4			Clear for length of searched.
SBSALop	Tst.b	(a3)			Found all of the Search string?
	Beq.s	SBSAFnd			Yes=End part.
	Move.b	-(a1),d7
	Cmp.l	d6,a1			-._ If at "END" (Top) of search area,
	Ble.s	SBSANot			-'  not found.
	Cmp.b	(a3)+,d7		Check the letter with string.
	Beq.s	SBSAFCh			Match=Increment both counters.
	Move.l	a2,a3			Reset a3 to start of searched.
	Add.l	d4,a1			Rechechk Chars *IMPORTANT*
;					Without, partial matches followed
;					by the real thing would not find it!
;					Rem: When checking backwards, ADD!
	Moveq	#0,d4			Reset "Length" of searched to 0.
	Bra.s	SBSALop			Loop it.
SBSAFCh	Addq.l	#1,d4			Add one to length of searched
	Bra.s	SBSALop			Loop it.
SBSANot	Moveq.l	#-1,d3			String not found: #-1 in d3
	RTS
SBSAFnd	Move.l	a0,d3			-._ Get Length from String to end of
	Sub.l	a1,d3			-'  file. (Add d4 for end of string.)
	RTS
	ENDC

	IFD	DATA_SR_AdrB
*= SEARCH, FORWARDS, CASE SENSITIVE FOR BYTE, TILL ADR =*********************
* d0 - Byte to search for.           * d3 = (Length a0»byte, or #-1)        *
* a0 - Area to search in.            * a1 = <Preserve a0>                   *
* d6 - Adr to stop searching at.     *                                      *
*****************************************************************************
SAdrByt	Move.l	a0,a1			Preserve a0
	Bra.s	SAdBJmp
SAdBLop	Cmp.b	(a1)+,d0		Check for the char...
	Beq.s	SAdBFnd
SAdBJmp	Cmp.l	d6,a0			-._ If not past the end of area,
	Blt.s	SAdBLop			-'  then continue the search.
SAdBNot	Moveq	#-1,d3			Else, NOT FOUND.
	RTS
SAdBFnd	Move.l	a1,d3			To be returned in d3...
	Sub.l	a0,d3			Get length from Start to Found.
	RTS
	ENDC

	IFD	DATA_SRBAdrB
*= SEARCH, BACKWARDS, CASE SENSITIVE FOR BYTE, TILL ADR =********************
* d0 - Byte to search for.           * d3 = (Length a0»byte, or #-1)        *
* a0 - End+1 Area to search in.      * a1 = <Preserve a0>                   *
* d6 - Adr to stop searching at.     *                                      *
*****************************************************************************
SBAdByt	Move.l	a0,a1			Preserve a0
	Bra.s	SBABJmp
SBABLop	Cmp.b	-(a1),d0		Check for the char...
	Beq.s	SBABFnd
SBABJmp	Cmp.l	d6,a0			-._ If not past the end of area,
	Bge.s	SBABLop			-'  then continue the search.
SBABNot	Moveq	#-1,d3			Else, NOT FOUND.
	RTS
SBABFnd	Move.l	a0,d3			To be returned in d3...
	Sub.l	a1,d3			Get length from Start to Found.
	RTS
	ENDC

	IFD	DATA_UPPACAZ
*= UPPER =*******************************************************************
* a2 = Adr Start Text (End+1)        * d0 = Len Text to uppdercase          *
* d1 = <Temp>                 (#"a") * d2 = <Temp>                   (#"z") *
*****************************************************************************
Upper	Move.b	#"a",d1			-._ For faster
	Move.b	#"z",d2			-'  Upper Case
	Bra.s	UpperJM
UpperMA	Cmp.b	(a2)+,d1		-.
	Bgt.s	UpperJM			 |_ If not a lowercase ASCII letter,
	Cmp.b	-1(a2),d2		 |  leave it alone.
	Blt.s	UpperJM			-'
	Sub.b	#32,-1(a2)		Convert to UpperCase
UpperJM	Dbra	d0,UpperMA		Do x number of letters
	RTS
	ENDC

	IFD	DATA_UPPA_NT
*= UPPER - NULL TERMINATED  =************************************************
* a2 = Adr Start Text (End+1)        *                                      *
* d1 = <Temp>                 (#"a") * d2 = <Temp>                   (#"z") *
*****************************************************************************
UperNul	Move.b	#"a",d1			-._ For faster
	Move.b	#"z",d2			-'  Upper Case
UperNLo	Tst.b	(a2)+			Null Terminator? (End of Text)
	Beq.s	UperNuD			Yes=Done...
	Cmp.b	-1(a2),d1		-.
	Bgt.s	UperNLo			 |_ If not a lowercase ASCII letter,
	Cmp.b	-1(a2),d2		 |  leave it alone.
	Blt.s	UperNLo			-'
	Sub.b	#32,-1(a2)		Convert to UpperCase
	Bra.s	UperNLo			Do all letters
UperNuD	RTS
	ENDC

	IFD	DATA_CHARCOP
*= COPY CHARS TERMINATED =***************************************************
* a0 = Start (End) Source String     * a1 = Start (End+1) Destin Area       *
* d7 = Max Length for Dest   (below) * d0 - Chr to End Copy on (not copied) *
*===========================================================================*
* Branch to CopyChr                                                         *
* Special version for Null-Term data below.                                 *
* d7.w returns (#-1) if the destination is filled. If it is not filled,     *
* d7.w returns the remaining length of the buffer. ***d7 RETURNS IN A WORD***
*****************************************************************************
CopChrL	Cmp.b	(a0),d0			End Char?
	Beq.s	CopyDon			Yes=Copy Done
	Move.b	(a0)+,(a1)+		Else, Copy until end of destin.
CopyChr	Dbra	d7,CopChrL
CopyDon	Rts
	ENDC


	IFD	DATA_CHARCOPNL
*= Copy Null-term, w/ Stop Character =*********************************= 12-Aug-1995 =*
*  Inputs: a0 - Null-term Source String, which _may_ have d0.b char in it.	      *
*          a1 - Destination buffer						      *
*          d7 - Length for Destinatin buffer					      *
*        d0.b - Chr to End Copy on if found before the null (not copied)	      *
* Outputs: a1 - Remainder of destination buffer.				      *
*        d7.w - Remaining length of destination buffer. *** RETURNS AS WORD-SIZE! *** *
*=====================================================================================*
*   Notes: Branch to "CopyChr_Null"						      *
*        : The resultant string will always be null-terminated.			      *
*        : "Buffer_Overflow" is called AUTOMATICALLY on error.			      *
*        : d7 returns a word-size number.					      *
***************************************************************************************
CopyChr_Null
	DBra	d7,CopyChr_Null_Loop
	Bra.s	Buffer_Overflow		Buffer overflow error if it filled.
CopyChr_Null_Loop
	Cmp.b	(a0),d0			End Char?
	Beq.s	CopyDo0_AS		Yes=Copy Done
	Move.b	(a0)+,(a1)+		Else, Copy until end of destin.
	DBeq	d7,CopyChr_Null_Loop
	Bne.s	Buffer_Overflow		Buffer overflow error if it filled.
	RTS
CopyDo0_AS
	SF	(a1)			Null-terminate the string.
	RTS
	ENDC


	IFD	DATA_JOINNT
*= Join Null-Term =****************************************************= 18-Aug-1995 =*
*  Inputs: (a0) - First half of string to join together, and buffer to write into.    *
*	   d7.w - Length of (a0) buffer.					      *
*	   (a1) - Second half of string to join together.			      *
* Outputs: A joined, null-terminated string.					      *
*	   d7.w - Remaining length of (a0) buffer.				      *
*   Notes: Call the Join_NT label.						      *
*	 : d7 returns a WORD sized number.					      *
*	 : Buffer_Overflow is handled automatically.				      *
***************************************************************************************
JNT_Lp1	Tst.b	(a0)+			-.
Join_NT	DBeq	d7,JNT_Lp1		 |_ Find the end of the string and update
	Bne.s	Buffer_Overflow		 |  the remaining length of the buffer.
	Subq.l	#1,a0			-'

	DBra	d7,JNT_Lp2
	Bra.s	Buffer_Overflow
JNT_Lp2	Move.b	(a1)+,(a0)+		Copy the next char
	DBeq	d7,JNT_Lp2		Copy 'till end of dest or null reached
	Bne.s	Buffer_Overflow
	RTS
	ENDC


	IFD	DATA_CHARCNT
*= COPY CHARS NULL TERMINATED =**********************************************
* a0 = Start (End) Source String     * a1 = Start (End+1) Destin Space      *
* d7 = Max Length for Dest   (below) *                                      *
*===========================================================================*
* Branch to CopyCNT                                                         *
* The Null WILL be copied (unless the Dest overflows)                       *
* d7.w returns (#-1) if the destination is filled. If it is not filled,     *
* d7.w returns the remaining length of the buffer. ***d7 RETURNS IN A WORD***
*****************************************************************************
CopyNTJ	Move.b	(a0)+,(a1)+		Copy the next char
	DBeq	d7,CopyNTJ		Copy till end of dest or null reached
	RTS
CopyCNT	DBra	d7,CopyNTJ		Incase eq set before calling.
	RTS
	ENDC

	IFD	DATA_COPYCN2
*= COPY CHARS NULL TERMINATED, DO NOT WRITE THE NULL =***********************
* a0 - Null Terminated Source data.   * a1 - Destination Area               *
* d7 = Max Length for Dest      (#-1) *                                     *
*===========================================================================*
* Branch to CopyCN2                                                         *
*****************************************************************************
CCN2_L	Tst.b	(a0)			End of String?
	Beq.s	WrMNT2D			YES = Done.
	Move.b	(a0)+,(a1)+		Write Memory...
CopyCN2	DBra	d7,CCN2_L		Write more...
WrMNT2D	RTS
	ENDC

	IFD	DATA_COPYCN3
*= COPY CHARS NULL TERMINATED, DO NOT WRITE THE NULL, NO LENGTH CHECK =******
* a0 - Null Terminated Source data.   * a1 - Destination Area               *
*****************************************************************************
CopyCN3	Tst.b	(a0)			End of String?
	Beq.s	CpyCN3D			YES = Done.
	Move.b	(a0)+,(a1)+		Write Memory...
	Bra.s	CopyCN3			Write more...
CpyCN3D	RTS
	ENDC

*= >>MACRO<< = Copy x bytes =************************************************
;CopyEm	MACRO
;	Bra.s	COPE2\@
;COPEM\@	Move.b	(a0)+,(a1)+
;COPE2\@	DBra	d7,COPEM\@
;	ENDC

*= >>MACRO<< = Copy NULL Term INCLUDING NULL, NO LENGTH CHECK =**************
;CopyCN4	MACRO			MOVED TO EQUATES
;CCN4\@	Move.b	(a0)+,(a1)+
;	Bne.s	CCN4\@
;	ENDM

	IFD	DATA_CPYDUAL
*= COPY DUAL BYTE TERMINATOR =***********************************************
* a0 = Start (End) Source String     * a1 = Start (End) Destin String       *
* d0 - Chr to End Copy on (not copy) * d1 - Chr to Enb Copy on (not copied) *
*===========================================================================*
* After BSRing this routine: BEQ to routine for if the First (d0) is Found  *
* -------------------------- BNE to routine for if the Secnd (d1) is Found  *
*****************************************************************************
CpyDual	Cmp.b	(a0),d0			End Char?
	Beq.s	CopyDo0			Yes=Copy Done
	Cmp.b	(a0),d1			End Char?
	Beq.s	CopyDo1			Yes=Copy Done
	Move.b	(a0)+,(a1)+		Else, Copy until end of destin.
	Bra.s	Copy_Dual
CopyDo0	Move	#EqCCR,CCR		d0 Was found. (Set Z CCR "Equal")
	RTS
CopyDo1	Move	#NeCCR,CCR		d1 Was found. (Clear Z CCR "NotEq")
	RTS
	ENDC

	IFND	DATA_SPAOVER
	IFD	DATA_WRCHARS
*= WRITE x CHARS =***********************************************************
* d0 = Char to Write                  * a1 = Start (end+1) Destination Area *
*                                     * d1 = Length of above          (#-1) *
*****************************************************************************
SO_L2	Move.b	d0,(a1)+		Write Fill-Pad Char
OC_XXCh	DBra	d1,SO_L2		Do till Dest Full
	RTS
	ENDC
	ENDC

	IFD	DATA_SPAOVER
*= OVERLAY OUTPUT, AUTO SPACE PAD =******************************************
* a1 = Start (end+1) Destination      * a0 = Start (end+1) Source String    *
* d1 = Length of Above                * d3 - Length of above                *
* d0 = Char to Fill remainder of dest *                                     *
*===========================================================================*
* SpaOver puts a space into d0                                              *
*****************************************************************************
SpaOver	Move.b	#" ",d0			Space Pad
XXXOver	Cmp.l	d3,d1			-.  If string is longer than the
	Bge.s	SO_J2			 |- overlay, only do length(overlay)
	Move.l	d1,d3			-'  chars. Else do length(string)
SO_J2	Sub.l	d3,d1			Difference length(overlay|string)
	Bra.s	SO_J3
SO_L1	Move.b	(a0)+,(a1)+		Copy this byte...
SO_J3	DBra	d3,SO_L1		Do till all chars written
	Bra.s	SO_J1			Pad any chars remaining.
SO_L2	Move.b	d0,(a1)+		Write Fill-Pad Char
OC_XXCh
SO_J1	DBra	d1,SO_L2		Do till Dest Full
	RTS
	ENDC

	IFD	DATA_N2AAuto
*= NUMBER » ASCII, AUTOMATIC ROUTINE JUMPER TYPE THING =*********************
* Regs = {As for NUMBER » ASCII}      *                                     *
*****************************************************************************
N2AAuto	Cmpi.l	#9,d1			-._ Branch if
	Ble	N2A1Dig			-'  one digit
	Cmpi.l	#99,d1			-._ Branch if
	Ble	N2A2Dig			-'  two digits
	Cmpi.l	#999,d1			-._ Branch if
	Ble.s	N2A3Dig			-'  three digits
	Cmpi.l	#9999,d1		-._ Branch if
	Ble.s	N2A4Dig			-'  four digits
	Cmpi.l	#99999,d1		-._ Branch if
	Ble.s	N2A5Dig			-'  five digits
	Cmpi.l	#999999,d1		-._ Branch if
	Ble.s	N2A6Dig			-'  six digits
	Cmpi.l	#9999999,d1
	Ble.s	N2A7Dig
	Move.b	#"[",(a1)+
	Move.b	#"B",(a1)+
	Move.b	#"I",(a1)+
	Move.b	#"G",(a1)+
	Move.b	#"]",(a1)+
	RTS
	ENDC

	IFD	DATA_NUM2ASC
*= NUMBER » ASCII =**********************************************************
* d1 = Input NUMBER (#0)              * d2 = [Div6+ Only] <Temp>            *
* a1 = Start of ASCII output (end+1)  *                                     *
*===========================================================================*
* Call the routine depending on how many Digits the number has              *
*****************************************************************************
N2A7Dig	Moveq	#-1,d2			Clear D2 for # of 1000 thous.
N2A7Loo	Addq.b	#1,d2			Add 1 to # of 1000 thous.
	Sub.l	#1000000,d1		Take 1000thou from the number
	Bpl.s	N2A7Loo			Branch if number is still +ve
N2A7End	Add.l	#1000000,d1		Make it +ve again.
	Add.b	#$30,d2			Make number in d2 Ascii
	Move.b	d2,(a1)+		Write it!

N2A6Dig	Moveq	#-1,d2			Clear D2 for # of 100 thous.
N2A6Loo	Addq.b	#1,d2			Add 1 to # of 100 thous.
	Sub.l	#100000,d1		Take 100 from the number
	Bpl.s	N2A6Loo			Branch if number is still +ve
N2A6End	Add.l	#100000,d1		Make it +ve again.
	Add.b	#$30,d2			Make number in d2 Ascii
	Move.b	d2,(a1)+		Write it!

N2A5Dig	Divu.w	#10000,d1
	Bsr.s	N2A1Dig
N2A4Dig	Divu.w	#1000,d1		How many thousands?
	Bsr.s	N2A1Dig			Turn into ascii
N2A3Dig	Divu.w	#100,d1			How many hundreds?
	Bsr.s	N2A1Dig			Turn into ascii
N2A2Dig	Divu.w	#10,d1			How many tens?
	Opt	O-			-.
	Bsr	N2A1Dig			 |- Do NOT convert to short branch!!
	Opt	O+			-'
N2A1Dig	Add.b	#$30,d1			Convert
	Move.b	d1,(a1)+		Move byte into string
	Swap	d1			Swap for remainder
	And.l	#$FFFF,d1		Clear High Word
	RTS
	ENDC


	IFD	DATA_N2ASCFT
*= NUMBER » ASCII for Format-Text, JUMPER for below routine =****************
* As for the below routine, but sets up D4 and fixes output of "0".         *
* The desired routine should be LEA'd into A2                               *
*===========================================================================*
* e.g.	Move.l	#1234567,d2		Nº to convert.                      *
*	Lea	NAB7Dig(pc),a2		7 Digit Number.                     *
*	Bsr	NABJump			Convert it.                         *
*****************************************************************************
NABJump	Moveq	#0,d4			Clear d4 for Pad-Zero routine.
	Jsr	(a2)			Jump to the wanted subroutine.
	Cmpi.b	#" ",-1(a1)		Was the last digit a space?
	Bne.s	NABJJmp			NOPE = All'swell just return.
	Move.b	#"0",-1(a1)		Else Nº was zero, correct it.
NABJJmp	RTS

*= NUMBER » ASCII for Format-Text, with auto Pad-Zero =**********************
* d4 = MUST BE CLEARED BEFORE CALLING *  d0 - Nº Chars written.             *
* d2 = Input NUMBER (#0)              * (a1) = Current possition in block.  *
* d3 = [Div6+ Only] <Temp>            * (d6) - End of output-block.         *
*===========================================================================*
* Normally this routine should be called by the above Jumper routine.       *
* Call the routine depending on how many Digits the number has.             *
* Remember to clear d4 before calling. Unless Pad-Zero is not wanted, in    *
*  which case bit 0 should be set before calling.                           *
*****************************************************************************
NAB7Dig	Moveq	#-1,d3			Clear d2 for Nº 1000 thousands.
NAB7Loo	Addq.b	#1,d3			Increment Nº of 1000 thousands found.
	Sub.l	#1000000,d2		Take 1000 thousand from the number,
	Bpl.s	NAB7Loo			Do again if number is still +ve.
	Add.l	#1000000,d2		Get the correct remainder.
	Exg.l	d2,d3			Give the output subroutine the digit.
	Bsr.s	NAB1Dig			Output the digit.
	Move.l	d3,d2			Move number to be used over digit.
NAB6Dig	Moveq	#-1,d3			Clear d2 for Nº 100 thousands.
NAB6Loo	Addq.b	#1,d3			Increment Nº of 100 thousands found.
	Sub.l	#100000,d2		Take 100 thousand from the number,
	Bpl.s	NAB6Loo			Do again if number is still +ve.
	Add.l	#100000,d2		Get the correct remainder.
	Exg.l	d2,d3			Give the output subroutine the digit.
	Bsr.s	NAB1Dig			Output the digit.
	Move.l	d3,d2			Move number to be used over digit.
NAB5Dig	Divu	#10000,d2		How many 10 thousands?
	Bsr.s	NAB1Dig
NAB4Dig	Divu	#1000,d2		How many thousands?
	Bsr.s	NAB1Dig
NAB3Dig	Divu	#100,d2			How many 100s?
	Bsr.s	NAB1Dig
NAB2Dig	Divu	#10,d2			How many 10s?
	OPT	O-
	Bsr	NAB1Dig
	OPT	O+
NAB1Dig	BTst	#0,d4			Has the 1st real digit been written?
	Bne.s	NABRDig			YES = Don't check this for #0 then.
	Tst.b	d2			Is this digit zero?
	Beq.s	NABZero			YES = Pad it with a space.
	BSet	#0,d4			Set bit as 1st real digit written.
NABRDig	Add.b	#$30,d2			ELSE... Convert number to ASCII digit
	Cmp.l	d6,a1			-.
	Blt.s	NABNor1			 |- End of block = Allocate another
	Bsr	AlocOutBlock		-'
NABNor1	Move.b	d2,(a1)+		Write the digit.
	Addq.l	#1,d0			Increment Nº output chars.
	Swap	d2			Swap for remainder,
	And.l	#$FFFF,d2		and clear unwanted high word.
	RTS

NABZero	Cmp.l	d6,a1			-.
	Blt.s	NABNorZ			 |- End of block = Allocate another
	Bsr	AlocOutBlock		-'
NABNorZ	Move.b	#" ",(a1)+		Write the space.
	Addq.l	#1,d0			Increment Nº chars written.
	Swap	d2			Swap for remainder,
	And.l	#$FFFF,d2		and clear unwanted high word.
	RTS
	ENDC


	IFD	DATA_ASC2NUM
	IFD	DATA_AS2NUNT
*= ASCII » NUMBER, NULL TERM =***********************************************
* a0 = Start (End+1) of ASCII number  * d0 = <Temp> (Return Number)         *
* Regs = {And those of Asc2Num below} *                                     *
*****************************************************************************
As2NuNT	Move.l	a0,a1			Preserve point to ASCII number.
	Moveq	#-1,d2			-.
CountDL	Addq.l	#1,d2			 |_ Count the number
	Tst.b	(a1)+			 |  of digits.
	Bne.s	CountDL			-'
;;;;;;;	Bra	Asc2Num			Raw Number -> d0
	ENDC

; [This space is part of the ASCII » NUMBER include!]
;;;;;;;	If a routine must be added here, remember to remove the ;'s before the
;;;;;;;	above "Bra	Asc2Num" !!!

*= ASCII » NUMBER =**********************************************************
* a0 = Start (End+1) of ASCII number  * d0 = <Temp> (Return Number)         *
* d1 = <Temp> (#0)                    * d2 = No. digits (#-1)               *
*                                     * d7 = <Temp>                         *
* {When changing this routine, keep in mind the Hrs2Min routine below}      *
*****************************************************************************
Asc2Num	Moveq	#0,d0			-._ ready for conversion
	Moveq	#0,d1			-'  (Clear for .b moves)
	Bra.s	A2NJmp1			Do x number of digits.
A2NMain	Move.b	(a0)+,d1		Get the next digit
	Sub.b	#$30,d1			Ascii » Number
	Asl.l	#1,D0			-.
	Move.l	D0,D7			 |_ Long-Word Multiply
	Asl.l	#2,D0			 |  Old Number by 10.
	Add.l	D7,D0			-'
	Add.l	d1,d0			Add the new number
A2NJmp1	DBra	d2,A2NMain		Do till all digits done.
	RTS

; [This space is part of the ASCII » NUMBER include!]

	IFD	DATA_TIMECON
*= TIME CONVERTER =************************************************************
* a0 = Start (end) of HH:MM (ASCII)    * d0 = (Number of mins)                *
* AND {those used in Asc2Num routine}  *                                      *
*******************************************************************************
Hrs2Min	Moveq	#2,d2			2 Digits to convert
	Bsr.s	Asc2Num			Convert HH(ASCII) to a Raw Number
	Mulu.w	#60,d0			Convert Hours to Minutes
	Move.l	d0,-(SP)		Preserve d0

	Addq.l	#1,a0			Point to MM (Skip the ":")
	Moveq	#2,d2			2 Digits to convert
	Bsr.s	Asc2Num			Convert MM(ASCII) to a Raw Number
	Add.l	(SP)+,d0		Add the hours and mins together
	RTS
	ENDC
	ENDC


	IFD	DATA_PADZERO
*= PAD ZEROS =***************************************************************
* a1 = Start (End+1) of ASCII number   * d1 = No. Digits to do. (#-1)       *
*                                      *      Usually #Digits-1, so that if *
*                                      *      the #=0 it's not cleared.     *
*===========================================================================*
* BSR to NoZero                                                             *
*****************************************************************************
NoZeroL	Cmpi.b	#"0",(a1)		Is this a 0?
	Bne.s	Zerod			No! End routine.
	Move.b	#" ",(a1)+		Space the 0
NoZero	DBra	d1,NoZeroL		Do x Digits.
Zerod	RTS
	ENDC

	IFD	DATA_DQUOTER
*= FILE NAME DEQUOTER =******************************************************
* a0 = Start (End+1) of Filename      *                                     *
*===========================================================================*
* Nulls the 1st Quote (") it finds. For CommandLine Use                     *
*****************************************************************************
** Should use registers instead of immediate data... Find out what regs are
** free by whatever programs use this routine and use them.
****
DQuoter	Cmpi.b	#$22,(a0)		Is this the Quote?
	Beq.s	GotQuot			Yes=Null it and return
	Cmpi.b	#10,(a0)+		Is this the end of the command line?
	Beq	InvaTex			Yes=Invalid Commandline
	Bra.s	DQuoter			Noo=Check Next letter
GotQuot	Move.b	#0,(a0)+		Null the Quote & Point past it
	RTS
	ENDC

	IFD	DATA_EXPLODE
*= EXPLODE IMPLODER-CRUNCHED DATA =*******= Written by Albert J. Brouwer =**
* a0 = Start of Crunched data file AND memory to Explode into!             *
* The memory must be the size of the UNCRUNCHED data, and on an even adr!  *
****************************************************************************
ExplodeData	movem.l	d2-d5/a2-a4,-(sp)
		move.l	a0,a3
		move.l	a0,a4
		cmp.l	#'IMP!',(a0)+
		bne.s	Explode012
		add.l	(a0)+,a4
		add.l	(a0)+,a3
		move.l	a3,a2
		move.l	(a2)+,-(a0)
		move.l	(a2)+,-(a0)
		move.l	(a2)+,-(a0)
		move.l	(a2)+,d2
		move.w	(a2)+,d3
		bmi.s	Explode00D
		subq.l	#1,a3
Explode00D	lea	-28(sp),sp
		move.l	a7,a1
		moveq	#6,d0
Explode00E	move.l	(a2)+,(a1)+
		dbra	d0,Explode00E
		move.l	a7,a1
		moveq	#0,d4
Explode00F	tst.l	d2
		beq.s	Explode011
Explode010	move.b	-(a3),-(a4)
		subq.l	#1,d2
		bne.s	Explode010
Explode011	cmp.l	a4,a0
		bcs.s	Explode014
		lea	28(sp),sp
		moveq	#-1,d0
		cmp.l	a3,a0
		beq.s	Explode013
Explode012	moveq	#0,d0
Explode013	movem.l	(sp)+,d2-d5/a2-a4
		move.l	d0,d0
		rts
Explode014	add.b	d3,d3
		bne.s	Explode015
		move.b	-(a3),d3
		addx.b	d3,d3
Explode015	bcc.s	Explode021
		add.b	d3,d3
		bne.s	Explode016
		move.b	-(a3),d3
		addx.b	d3,d3
Explode016	bcc.s	Explode020
		add.b	d3,d3
		bne.s	Explode017
		move.b	-(a3),d3
		addx.b	d3,d3
Explode017	bcc.s	Explode01F
		add.b	d3,d3
		bne.s	Explode018
		move.b	-(a3),d3
		addx.b	d3,d3
Explode018	bcc.s	Explode01E
		add.b	d3,d3
		bne.s	Explode019
		move.b	-(a3),d3
		addx.b	d3,d3
Explode019	bcc.s	Explode01a
		move.b	-(a3),d4
		moveq	#3,d0
		bra.s	Explode022
Explode01a	add.b	d3,d3
		bne.s	Explode01B
		move.b	-(a3),d3
		addx.b	d3,d3
Explode01B	addx.b	d4,d4
		add.b	d3,d3
		bne.s	Explode01C
		move.b	-(a3),d3
		addx.b	d3,d3
Explode01C	addx.b	d4,d4
		add.b	d3,d3
		bne.s	Explode01D
		move.b	-(a3),d3
		addx.b	d3,d3
Explode01D	addx.b	d4,d4
		addq.b	#6,d4
		moveq	#3,d0
		bra.s	Explode022
Explode01E	moveq	#5,d4
		moveq	#3,d0
		bra.s	Explode022
Explode01F	moveq	#4,d4
		moveq	#2,d0
		bra.s	Explode022
Explode020	moveq	#3,d4
		moveq	#1,d0
		bra.s	Explode022
Explode021	moveq	#2,d4
		moveq	#0,d0
Explode022	moveq	#0,d5
		move.w	d0,d1
		add.b	d3,d3
		bne.s	Explode023
		move.b	-(a3),d3
		addx.b	d3,d3
Explode023	bcc.s	Explode026
		add.b	d3,d3
		bne.s	Explode024
		move.b	-(a3),d3
		addx.b	d3,d3
Explode024	bcc.s	Explode025
		move.b	Explode030(pc,d0.w),d5
		addq.b	#8,d0
		bra.s	Explode026
Explode025	moveq	#2,d5
		addq.b	#4,d0
Explode026	move.b	Explode031(pc,d0.w),d0
Explode027	add.b	d3,d3
		bne.s	Explode028
		move.b	-(a3),d3
		addx.b	d3,d3
Explode028	addx.w	d2,d2
		subq.b	#1,d0
		bne.s	Explode027
		add.w	d5,d2
		moveq	#0,d5
		move.l	d5,a2
		move.w	d1,d0
		add.b	d3,d3
		bne.s	Explode029
		move.b	-(a3),d3
		addx.b	d3,d3
Explode029	bcc.s	Explode02C
		add.w	d1,d1
		add.b	d3,d3
		bne.s	Explode02a
		move.b	-(a3),d3
		addx.b	d3,d3
Explode02a	bcc.s	Explode02B
		move.w	8(a1,d1.w),a2
		addq.b	#8,d0
		bra.s	Explode02C
Explode02B	move.w	(a1,d1.w),a2
		addq.b	#4,d0
Explode02C	move.b	16(a1,d0.w),d0
Explode02D	add.b	d3,d3
		bne.s	Explode02E
		move.b	-(a3),d3
		addx.b	d3,d3
Explode02E	addx.l	d5,d5
		subq.b	#1,d0
		bne.s	Explode02D
		addq.l	#1,a2
		add.l	d5,a2
		add.l	a4,a2
Explode02F	move.b	-(a2),-(a4)
		subq.b	#1,d4
		bne.s	Explode02F
		bra	Explode00F
Explode030	dc.w	$060a,$0a12
Explode031	dc.b	1,1,1,1,2,3,3,4,4,5,7,14
	ENDC

	IFD	DATA_NULLLEN
*= NULL-TERMATED LENGTH CALCULATOR =***********************************= 18-Aug-1995 =*
*  Inputs: (a0) - Start of null-terminated string to count.			      *
* Outputs: (a0) - The null-terminator of the counted string.			      *
*           d0  - Length of the string, excluding the null.			      *
*   Notes: Guaranteed not to alter any registers apart from a0/d0 in the future.      *
***************************************************************************************
NullLen	Moveq	#-1,d0			Reset Length to ZERO, -1
NullLeL	Addq.l	#1,d0			Add 1 to number of chars...
	Tst.b	(a0)+			Is this a Null?
	Bne.s	NullLeL			Nope, Keep counting...
	Subq.l	#1,a0			Point back to the null.
	RTS
	ENDC

	IFD	DATA_RNDBYTE
	IFD	DATA_RNDWORD
*= RANDOM (WORD-SIZE) =******************************************************
* d5 - Maximum+1 [From 0 -> 65536]    * d3 = ("Rnd"# [From 0 -> Maximum])   *
* {And as for RndByte Routine Below}  *                                     *
*****************************************************************************
RndWord	Move.l	#256,d0
	Bsr.s	RndByte			Get a # from $00-$FF
	Move.l	d1,d3
	Asl.l	#8,d3			Shift into upper word.
	Bsr.s	RndByte			Another from $00-$FF
	Add.l	d1,d3			Move into lower word.
	
	Mulu.w	d5,d3			Out of <d5>...
	Lsr.l	#8,d3			...not $FFFF
	Lsr.l	#8,d3
	RTS
	ENDC
;
;	THIS SPACE IS PART OF THE RNDBYTE INCLUDE
;
*= RANDOM (BYTE-SIZE) =******************************************************
* d0 - Maximum+1 [From 0 -> 256]      * d1 = ("Rnd"# [From 0 -> Maximum])   *
* d2 = <Temp>                         *                                     *
*****************************************************************************
RndByte	Movem.l	d0/d3-d7/a0-a4/a6,-(SP)	-.
;;;;;;;	Move.l	DosBase(a5),a6		 |
	Lea	DTStruc(a5),a0		 |_ Put DateStamp into  
	Move.l	a0,d1			 |  the DateTime Structure.
	CALLDOS	DateStamp		 |
	Movem.l	(SP)+,d0/d3-d7/a0-a4/a6	-'
	Move.b	DT_Days+3(a5),d2
	Add.b	d2,d2
	Eor.b	#$A1,d2
	Move.b	DT_Mins+3(a5),d1
	Eor.b	#$F9,d1
	Add.b	d2,d1
	Dc.b	$D2,$39,$00,$DF,$F0,$07	(Add.b	$dff007,d1)
	Move.b	DT_Tiks+3(a5),d2
	Add.b	d2,d2
	Eor.b	d2,d1
	Dc.b	$D2,$39,$00,$DF,$F0,$07	(Add.b	$dff007,d1)
	Dc.b	$D2,$39,$00,$DF,$F0,$06	(Add.b	$dff006,d1)
	And.l	#$FF,d1			Clear any junk from previous uses.
	Mulu.w	d0,d1			Out of <d0>...
	Lsr.w	#8,d1			...not 256
	RTS
	ENDC

	IFD	DATA_RNDLEPP
*= RANDOM (WORD-SIZE) =*****************************=- by Andrew Leppard -=**
* d5 - Maximum+1 [From 1 -> 65536]    * d3 = ("Rnd"# [From 0 -> Maximum])   *
* d2 = <TEMP>                         *                                     *
*****************************************************************************
* I found and modified this source hoping for a better random-number        *
* routine than my own, however, it appears that MY RNDWORD is more random   *
* than this one (actually, I think mine is not as crap as I thought!)...    *
* Based on 10000 repeated calls to each routine for 0-20, this one seems to *
* consistantly return twice as much of certain numbers than others, while   *
* mine is more or less evenly distributed, without a greatly noticable bias *
* towards any number. However, I don't know if it's a fair test, perhaps    *
* when the time between each execution of the routine is so similar it      *
* becomes less random... His certainly uses more seeds than mine...         *
*****************************************************************************
RndLepp	Movem.l	d0-1/d4/d6-d7/a0-a6,-(SP)	-.
	Lea	DTStruc(a5),a0			 |  Put DateStamp into  
	Move.l	a0,d1				 |- the DateTime Structure.
	CALLDOS	DateStamp			 |
	Movem.l	(SP)+,d0-1/d4/d6-d7/a0-a6	-'

	Clr.l	d3
	Clr.l	d2

	Move.b	$bfe400,d3		;CIA-A Timer A: Lo
	Move.b	$bfd600,d2		;CIA-B Timer B: Lo
	Eor.l	d2,d3
	Move.b	$bfd400,d2		;CIA-B Timer A: Lo
	And.l	#%11111,d2
	Rol.l	d2,d3
	Move.b	$bfe7000,d2		;CIA-A Timer B: Lo
	Ror.l	d2,d3

	Move.w	$dff004,d2		;Raster screen pos
	Eor.w	d2,d3
	Move.w	$dff006,d2		;Raster screen pos
	Eor.w	d2,d3
	Move.l	DT_Tiks(a5),d2		;AmigaDATE!
	Eor.l	d2,d3
	Move.l	DT_Mins(a5),d2
	Eor.l	d2,d3
	Move.l	DT_Days(a5),d2
	Eor.l	d2,d3
	Move.l	d3,d2
	Swap	d2			;use 2nd word as another rnd source
	Eor.w	d2,d3

;;;;;;;	Addq.l	#1,d5			P0T: Now expects Max+1, not Max
	Mulu.w	d5,d3			-.               (Max+1)
	Divu.w	#65535,d3		 |- Multiply by  -------
	And.l	#$0000FFFF,d3		-'                65535

	Cmp.l	d3,d5			-.
	Bne.s	RNDLEPJ			 |- If = Max+1, Set to Max
	Subq.l	#1,d3			-'
RNDLEPJ	RTS
	ENDC


	IFD	DATA_NUWRAND
*****************************************************************************
* Generate a "random" seed-word for the Random Number routine.		    *
*===========================================================================*
* Note: This routine uses the system time and thus will not work very well  *
* ----- for people who don't have a set clock.				    *
*===========================================================================*
* Consider all registers destroyed.					    *
*****************************************************************************
RndSeed
	Lea	DTStruc(a5),a0		-.
	Move.l	a0,d1			 |- Set DateTime Structure.
	CALLDOS	DateStamp		-'

	Move.w	DT_Days+2(a5),d0
	Mulu.w	#24*60,d0		Days -> Minutes.
	Add.w	DT_Mins+2(a5),d0
	Mulu.w	#60,d0			Minutes -> Seconds.

	Add.w	DT_Tiks+2(a5),d0

;	Move.w	DT_Tiks+2(a5),d1
;	Divu.w	#50,d1			Ticks -> Seconds.
;	Add.w	d1,d0			Total seconds since 1978.

	Move.w	d0,-(SP)		-.
	CALLGFX	VBeamPos		 |- Add Vertical Beam
	Mulu.w	#64,d0			 |
	Add.w	(SP)+,d0		-'

	And.l	#$FFFF,d0		Clear upper word.
	Cmpi.l	#32768,d0		-.
	Ble.s	RndSeed_Skp1		 |- If over 32768, half.
	Lsr.l	#1,d0			-'
RndSeed_Skp1
	Move.w	d0,WordSeed(a5)		Store seed for later.
	RTS
*****************************************************************************
* Get next "random" number in sequence generated by the seed value.	    *
*****************************************************************************
* d7.w = (NewSeed)		      *    WordSeed.w = Seed, (NewSeed)     *
*===========================================================================*
* With thanks to Christopher Jennings, u9303286@muss.cis.mcmaster.ca        *
*****************************************************************************
NextSeed
	Move.w	WordSeed(a5),d7
	Mulu.w	#5,d7
	Add.l	#12479,d7	Any odd number here will generate a diff. sequence
	Divu.w	#32768,d7
	Clr	d7
	Swap	d7
	Move.w	d7,WordSeed(a5)
	RTS
*****************************************************************************
* Call NextSeed, and then return a result within a given range.		    *
*****************************************************************************
* d0.w = Maximum number               * WordSeed.w = Seed, (NewSeed)        *
* d7.w = Number (#0 to d0.w-1)        *                                     *
*****************************************************************************
RangeSeed
	Bsr.s	NextSeed
	Mulu.w	d0,d7			-._ Out of do,
	Divu.w	#32768,d7		-'  not 32768 (= 2^15).
	And.l	#$FFFF,d7
	RTS

	ENDC


	IFD	DATA_RAWDOFMT
*= NudelRawDoFmt =*****************************************************= 11-Aug-1995 =*
*  Inputs: a0 - Null-term Input string containing % commands etc.		      *
*	   a1 - Datastream.							      *
*	   RDF_Adrs(a5) - Address of Output-buffer.				      *
*	   RDF_Size(a5) - Size of Output-buffer.				      *
* Outputs: Formatted null-term string at where a3 used to point.		      *
***************************************************************************************
NudelRawDoFmt
	Lea	NudelRawDoFmt_Proc(pc),a2	Procedure to call for each char.
	Move.l	a5,a3				Preserve a3 (not touched by RawDoFmt()
	N_CallExec	RawDoFmt
	Tst.l	RDF_Size(a5)			-._ If the buffer overflowed,
	Ble	Buffer_Overflow			-'  print fatal error message.
	RTS

NudelRawDoFmt_Proc
	Tst.l	RDF_Size(a3)			-._ If the buffer if full, do
	Ble.s	NudelRawDoFmt_Skip		-'  not write any more into it.
	Move.l	a3,-(SP)			Preserve a3
	Move.l	RDF_Adrs(a3),a3			Get adrs to write out to.
	Move.b	d0,(a3)				Output the next character.
	Move.l	(SP)+,a3			Preserve a3
	Addq.l	#1,RDF_Adrs(a3)			Update adrs to write to.
	Subq.l	#1,RDF_Size(a3)			Update the remaining length.
NudelRawDoFmt_Skip
	RTS
	ENDC
