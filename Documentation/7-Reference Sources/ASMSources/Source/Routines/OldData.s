;DATA_SR_F_CS	; Search, Forwards, Case Sensitive - String or byte.
;DATA_SR_F_CI	; Search, Forwards, Not Case Sens  - String or byte.
;DATA_SR_B_CI	; Search, Backwards, Not Case Sens - String or byte.
;DATA_SR_B_CS	; Search, Backwards, Case Sensitiv - String or byte.
;DATA_SR_BytF	; Search, Forwards, Case Sensitive - Byte, For Dist.
;DATA_SR_FBCS	; Search, Forwards, Case Sensitive - String, For Dist.
;DATA_REVERSE	; Reverse a string of given length (mirror image).



	IFD	DATA_SR_F_CS
*= SEARCH FORWARDS, CASE SENSITIVE =*****************************************
* a0 - Start of area to be searched   * a1 = <Preserve a0>       (-Varies-) *
* a2 - String to search for, NULL end * a3 = <Preserve a2>       (-Varies-) *
* d3 = (Gap Area » Searched)          * d4 = <Temp>              (-Varies-) *
* d5 - Byte to End/Abort search on.   *                                     *
*===========================================================================*
* If d5 found before a2 then d3 returns #-1                                 *
*****************************************************************************
SEARCH	Move.l	a0,a1			Preserve a0 pointer
	Move.l	a2,a3			Preserve a2 pointer
	Moveq.l	#0,d4			Clear for length of searched.
LWFLoop	Tst.b	(a3)			Are we at the end of the compaire?
	Beq.s	LWFindE			Yes=End part.
	Cmp.b	(a1),d5			Is this char the end chararcter.
	Beq.s	LWFindN			Yes=Return -1.
	Cmpm.b	(a1)+,(a3)+		Check The letter.
	Beq.s	LWFind1			Match=Increment both counters.
	Move.l	a2,a3			Reset a3 to start of searched.
	Sub.l	d4,a1			Rechechk Chars *IMPORTANT*
;					Without, partial matches followed
;					by the real thing would not find it!
	Moveq.l	#0,d4			Reset "Length" of searched to 0.
	Bra.s	LWFLoop			Loop it.
LWFind1	Addq.l	#1,d4			Add one to length of searched
	Bra.s	LWFLoop			Loop it.
LWFindN	Moveq.l	#-1,d3			String not found: Negative # in d3
	RTS
LWFindE	Move.l	a1,d3			To be returned in d3...
	Sub.l	a0,d3			-._ Get length from Start of search to
	Sub.l	d4,d3			-'  start of Searched.
	RTS
	ENDC



	IFD	DATA_SR_F_CI
*= SEARCH FORWARDS, CASE IN-SENSITIVE =**************************************
* a0 - Start of area to be searched   * a1 = <Preserve a0>       (-Varies-) *
* a2 - String to search for           * a3 = <Preserve a2>       (-Varies-) *
*    \_UpperCase AND Null-Terminated  * d4 = <Temp>              (-Varies-) *
* d3 = (Gap Area » Searched)          * d5 - Byte to End/Abort search on.   *
* d6 = <Temp>                  (#"z") *                                     *
*===========================================================================*
* If d5 found before a2 then d3 returns #-1                                 *
* **IMPORTANT** Currently, this WILL uppercase the area of search!!!        *
*****************************************************************************
SEARCH_FWD_NOCASE
	Move.l	a0,a1			Preserve a0 pointer
	Move.l	a2,a3			Preserve a2 pointer
	Moveq.l	#0,d4			Clear for length of searched.
	Move.b	#"a",d3			-._ For faster
	Move.b	#"z",d6			-'  UpperCase
SFNLoop	Tst.b	(a3)			Are we at the end of the compaire?
	Beq.s	SFN_End			Yes=End part.
	Cmp.b	(a1),d5			Is this char the end chararcter.
	Beq.s	SFN_Neg			Yes=Return -1.
	Cmp.b	(a1),d3			-.
	Bgt.s	SFN_UpD			 |
	Cmp.b	(a1),d6			 |- Uppercase
	Blt.s	SFN_UpD			 |
	Sub.b	#32,(a1)		-'
SFN_UpD	Cmpm.b	(a1)+,(a3)+		Check The letter.
	Beq.s	SFN_1			Match=Increment both counters.
	Move.l	a2,a3			Reset a3 to start of searched.
	Sub.l	d4,a1			Rechechk Chars *IMPORTANT*
;					Without, partial matches followed
;					by the real thing would not find it!
	Moveq.l	#0,d4			Reset "Length" of searched to 0.
	Bra.s	SFNLoop			Loop it.
SFN_1	Addq.l	#1,d4			Add one to length of searched
	Bra.s	SFNLoop			Loop it.
SFN_Neg	Moveq.l	#-1,d3			String not found: Negative # in d3
	RTS
SFN_End	Move.l	a1,d3			To be returned in d3...
	Suba.l	a0,d3			-._ Get length from Start of search to
	Suba.l	d4,d3			-'  start of Searched.
	RTS
	ENDC


	IFD	DATA_SR_B_CI
*= SEARCH - BACKWARDS - CASE IN-SENSITIVE =**********************************
* a0 - End+1 of area to be searched   * a1 = <Preserve a0>       (-Varies-) *
* a2 - Backwards String to search for * a3 = <Preserve a2>       (-Varies-) *
*    \_Null-Terminate it. UpperCaseIt * d4 = <Temp>              (-Varies-) *
* d5 - Byte to End/Abort search on.   * d0 = <Temp>                         *
* d3 = (Length from End of            * d6 = <Temp>                  (#"z") *
*    \_ area to Start Search String)  *                                     *
*===========================================================================*
* If d5 found before a2 then d3 returns #-1                                 *
*****************************************************************************
SEARCH_BACK
	Move.l	a0,a1			Preserve a0 pointer
	Move.l	a2,a3			Preserve a2 pointer
	Moveq.l	#0,d4			Clear for length of searched.
	Move.b	#"a",d3			-._ For faster
	Move.b	#"z",d6			-'  UpperCase
SRBLoop	Tst.b	(a3)			Found all of the Search string?
	Beq.s	SRBackE			Yes=End part.
	Cmp.b	(a1),d5			At the end of the Search area?
	Beq.s	SRBackN			Yes=Return #-1.
	Move.b	-(a1),d0		Get letter
	Cmp.b	d0,d3			-.
	Bgt.s	SRDonUp			 |
	Cmp.b	d0,d6			 |- Uppercase
	Blt.s	SRDonUp			 |
	Sub.b	#32,d0			-'
SRDonUp	Cmp.b	(a3)+,d0		Check the letter with string.
	Beq.s	SRBack1			Match=Increment both counters.
	Move.l	a2,a3			Reset a3 to start of searched.
	Add.l	d4,a1			Rechechk Chars *IMPORTANT*
;					Without, partial matches followed
;					by the real thing would not find it!
;					Rem: When checking backwards, ADD!
	Moveq.l	#0,d4			Reset "Length" of searched to 0.
	Bra.s	SRBLoop			Loop it.
SRBack1	Addq.l	#1,d4			Add one to length of searched
	Bra.s	SRBLoop			Loop it.
SRBackN	Moveq.l	#-1,d3			String not found: #-1 in d3
	RTS
SRBackE	Move.l	a0,d3			-._ Get Length from String to end of
	Sub.l	a1,d3			-'  file. (Add d4 for end of string.)
	RTS
	ENDC


	IFD	DATA_SR_B_CS
*= SEARCH - BACKWARDS - CASE SENSITIVE =*************************************
* a0 - End+1 of area to be searched   * a1 = <Preserve a0>       (-Varies-) *
* a2 - Backwards String to search for * a3 = <Preserve a2>       (-Varies-) *
*    \_ Null-Terminate it.            * d4 = <Temp>              (-Varies-) *
* d5 - Byte to End/Abort search on.   * d0 = <Temp>                         *
* d3 = (Length from End of            *                                     *
*    \_ area to Start Search String)  *                                     *
*===========================================================================*
* If d5 found before a2 then d3 returns #-1                                 *
*****************************************************************************
SEARCH_BACK_CASE
	Move.l	a0,a1			Preserve a0 pointer
	Move.l	a2,a3			Preserve a2 pointer
	Moveq.l	#0,d4			Clear for length of searched.
SRBCLop	Tst.b	(a3)			Found all of the Search string?
	Beq.s	SRBCckE			Yes=End part.
	Move.b	-(a1),d0
	Cmp.b	d0,d5			At the end of the Search area?
	Beq.s	SRBCckN			Yes=Return #-1.
	Cmp.b	(a3)+,d0		Check the letter with string.
	Beq.s	SRBCck1			Match=Increment both counters.
	Move.l	a2,a3			Reset a3 to start of searched.
	Add.l	d4,a1			Rechechk Chars *IMPORTANT*
;					Without, partial matches followed
;					by the real thing would not find it!
;					Rem: When checking backwards, ADD!
	Moveq.l	#0,d4			Reset "Length" of searched to 0.
	Bra.s	SRBCLop			Loop it.
SRBCck1	Addq.l	#1,d4			Add one to length of searched
	Bra.s	SRBCLop			Loop it.
SRBCckN	Moveq.l	#-1,d3			String not found: #-1 in d3
	RTS
SRBCckE	Move.l	a0,d3			-._ Get Length from String to end of
	Sub.l	a1,d3			-'  file. (Add d4 for end of string.)
	RTS
	ENDC


	IFD	DATA_SR_BytF
*= SEARCH, FORWARDS, CASE SENSITIVE FOR BYTE, FOR DISTANCE =*****************
* d0 - Byte to search for.           * d3 = (Length a0»byte, or #-1)        *
* a0 - Area to search in.            * a1 = <Preserve a0>                   *
* d6 - Length of above.              * d7 = <Preserve d6>                   *
*****************************************************************************
SRBytFw	Move.l	a0,a1			-._ Preserve
	Move.l	d6,d7			-'  'em
	Bra.s	SrBBJmp
SrBBLop	Cmp.b	(a1)+,d0		Check the char.
SrBBJmp	DBeq	d7,SrBBLop		If not found, Check the next char.
	Beq.s	SrBBFnd			If found, setup d3.
	Moveq	#-1,d3			If all chars checked, not found.
	RTS
SrBBFnd	Move.l	a1,d3			To be returned in d3...
	Sub.l	a0,d3			Get length from Start to Found.
	RTS
	ENDC


	IFD	DATA_REVERSE
*= REVERSE STRING (MIRROR IMAGE) =*******************************************
* (a0) = Start (Middle) of String     * (a1) = <TEMP> (Middle of String)    *
* d0 = Length of String (#-1)         * d1 = <TEMP> (Ltr near mid of str)   *
*****************************************************************************
* Note that afterwards (a0) and (a1) may or may not differ, depending on if *
* the string is of odd length or not. (I think; not important, so not chkd) *
*****************************************************************************
Reverse	Move.l	a0,a1			-._ Point to end+1
	Add.l	d0,a1			-'  of string in a1
	Asr.l	#1,d0			Divide length by 2. (no remainder)
	Bra.s	Rev_Jmp
RevLoop	Move.b	(a0)+,d1		-.
	Move.b	-(a1),-1(a0)		 |- Swap the two letters
	Move.b	d1,(a1)			-'
Rev_Jmp	DBra	d0,RevLoop
	RTS
	ENDC


	IFD	DATA_SR_FBCS
*= SEARCH FORWARDS, CASE IN-SENSITIVE, FOR DISTANCE =************************
* a0 - Start of area to be searched   * a1 = <Preserve a0>       (-Varies-) *
* d0 = Length of above.               *                                     *
* a2 - NullTerm String to search for. * a3 = <Preserve a2>       (-Varies-) *
* d4 = <Temp>              (-Varies-) * d3 = (Gap Area » Searched or #-1)   *
*===========================================================================*
* If d5 found before a2 then d3 returns #-1                                 *
*****************************************************************************
SR_Bnds	Move.l	a0,a1			Preserve a0 pointer
	Move.l	a2,a3			Preserve a2 pointer
	Moveq.l	#0,d4			Clear for length of searched.
	Bra.s	SRBLoop
SRBLpJm	Tst.b	(a3)			Are we at the end of the compare?
	Beq.s	SRBFond			Yes=End part.
	Cmpm.b	(a1)+,(a3)+		Check The letter.
	Beq.s	SRBF1Ch			Match=Increment both counters.
	Move.l	a2,a3			Reset a3 to start of searched.
	Sub.l	d4,a1			Rechechk Chars *IMPORTANT*
;					Without, partial matches followed
;					by the real thing would not find it!
	Moveq.l	#0,d4			Reset "Length" of searched to 0.
SRBLoop	DBra	d0,SRBLpJm		Check next char.
	Moveq.l	#-1,d3			If entire area searched, not found.
	RTS

SRBF1Ch	Addq.l	#1,d4			Add one to length of searched
	Bra.s	SRBLoop			Loop it.
SRBFond	Move.l	a1,d3			To be returned in d3...
	Sub.l	a0,d3			-._ Get length from Start of search to
	Sub.l	d4,d3			-'  start of Searched.
	RTS
	ENDC
