*****************************************************************************
* Door Routines for interfacing with AmiExpress BBS                         *
*****************************************************************************
* From now on, used IFD's instead of IFNE's...                              *
*****************************************************************************
* Version: 1.03 - 15-August-1994                                            *
* Since Version 1.02: Added Send_Ami_Long                                   *
* ------------------- Added Send_Ami_Long_EOL                               *
* ------------------- Added Send_Clog                                       *
*---------------------------------------------------------------------------*
* Version: 1.02 - Super-Dupe-Check                                          *
* Since Version 1.01: Send_Ami_Message: Does NOT use command in d0, it must *
* -------------------                   be moved to JH_Command(a5) instead. *
*---------------------------------------------------------------------------*
* Version: 1.01 - ^M Stripper                                               *
* Since Version 1.00: Added DOOR_SENDMSG                                    *
*---------------------------------------------------------------------------*
* Version: 1.00 - Door Base                                                 *
* Since Version 0.00: N/A                                                   *
*****************************************************************************
;NOTE: Standard required routines (Sent_Ami_Msg and Str_2_Ami) ALWAYS used) *
;DOOR_PROMPT	; Send prompt and get 1 char from the user.
;DOOR_SENDSTR	; Send String to the user.
;DOOR_SENDMSG	; Send String to the user, CR/LF
;DOOR_SENDLNG	; Send Strings longer than 199 chars, w/ CR/LF.
;DOOR_SNDLEOL	; Send Strings longer than 199 chars, convert CR -> CR + LF.
;DOOR_SDE_CLR	; If set, Send_Long_EOL will strip ^L chars.
;DOOR_SENDCLG	; Send String to callerslog.
;	INCLUDE	ASM:Source/Routines/Doors.s

*= SEND AMI MSG =************************************************************
* MsgStru(a5) = /X Message structure setup with details of command to do.   *
* a6 = ExecBase                                                             *
* Assume that all regs destroyed                                            *
*****************************************************************************
Send_Ami_Message
;;;;;;;	Move.l	#0,JH_LineNum(a5)	(When In Rome...)
	Lea	MsgStru(a5),a1		-.
	Move.l	AmiPort(a5),a0		 |- Send Message to /X Port
	CALEXEC	PutMsg			-'
	Move.l	OurPort(a5),a0		-._ Wait for a Message to
	CALEXEC	WaitPort		-'  our Port (From /X Port)
	Move.l	OurPort(a5),a0		-.  Read the message sent to
	JMPEXEC	GetMsg			-'  us from the /X Port.
*= STR-2-AMI =***************************************************************
* (a0) = Start (End) String           * d7 = <Temp>                         *
* (a1) = (End JH_String)              * JH_String(a5) = (String)            *
*****************************************************************************
* Copies string from A0 to JH_String                                        *
* String must be Null Terminated, Max 200 Chars (Inc Null)                  *
*---------------------------------------------------------------------------*
* Call CopyJHS to copy JH_StringLen (=200) nullterm from a0 -> a1           *
*****************************************************************************
String_To_Ami
	Lea	JH_String(a5),a1	Point to JH_String
CopyJHS	Move.l	#JH_StringLen-2,d7	Write 200 Chars Max -1bdr,(-1 Null)
S2AXLop	Move.b	(a0)+,(a1)+		Copy This Char
	DBeq	d7,S2AXLop		Copy Until MaxChars/Null Reached
	SF	(a1)+			Make sure string is null terminated
;;;;;;;					Above in case maxchars reached.
	RTS

	IFD	DOOR_SENDSTR
*= SEND STRING =*************************************************************
* a0 = Adr Text to send (200 Chars, Null Terminated)                        *
*****************************************************************************
Send_String
	Bsr.s	String_To_Ami		Put string into 200 char /X Buffer
SS_2	Move.l	#AX_READIT,JH_Data(a5)	-.
	Move.l	#JH_WRITE,JH_Command(a5) |- Tell /X to Send it to the User
	Bra.s	Send_Ami_Message	-'
;;;;;;;	RTS for us.
	ENDC

	IFD	DOOR_SENDMSG
*= SEND MESSAGE =************************************************************
* a0 = Adr Text to send (200 Chars, Null Terminated)                        *
*****************************************************************************
Send_Message
	Bsr.s	String_To_Ami		Put string into 200 char /X Buffer
SM_2	Move.l	#1,JH_Data(a5)		Send CR/LF combination.
	Move.l	#JH_SM,JH_Command(a5)	Send-Message Command
	Bra.s	Send_Ami_Message	Tell /X to do it!
;;;;;;;	RTS for us.
	ENDC

	IFD	DOOR_PROMPT
*= PROMPT =******************************************************************
* a0 - Prompt Text (NullTerm)         * JH_String(a5) - Returned Char.      *
* Send Prompt and get one char from the user (into JH_String)               *
*****************************************************************************
Prompt	Bsr.s	String_To_Ami		Prompt Text » Msg Structure
Prompt2	Move.l	#JH_HK,JH_Command(a5)	-._ Get a Char...
	Bsr.s	Send_Ami_Message	-'  from the user
	Cmpi.l	#-1,JH_Data(a5)		-._ If User has lost carrier,
	Beq	Finish			-'  Exit the Door
	RTS
	ENDC


	IFD	DOOR_SENDLNG
*= SEND LONG =***************************************************************
* a0 = Text to send.                  *                                     *
*****************************************************************************
* Consider all registers destroyed.                                         *
*****************************************************************************
Send_Ami_Long
	Lea	JH_String(a5),a1	Text is to go into the /X msgport.
	Move.l	#JH_StringLen-2,d7	Max length = 200 chars -1dbra,-1null
S2AXLLp	Move.b	(a0)+,(a1)+		Copy a char.
	DBeq	d7,S2AXLLp		Copy till buffer full, or end of str.
	Beq.s	SM_2			End of string = Send it, and done.
;;;;;;;	Else, send this, and continue at same point.
	SF	(a1)			Null terminated the buffer.
	Move.l	a0,-(SP)		Preserve current position.
	Bsr.s	SS_2			Send the string.
	Move.l	(SP)+,a0		Restore current position.
	Bra.s	Send_Ami_Long		Keep on sending.
	ENDC

	IFD	DOOR_SNDLEOL
*= SEND LONG w/ CR -> CR/LF conversion =*************************************
* a0 = Text to send.                  * d7 = <TEMP>                         *
* a1 = <TEMP>                         * a6 = ExecBase                       *
* d6 = <TEMP>                         * d5 = <TEMP if DOOR_SENDCLG set>     *
*****************************************************************************
* Consider all registers destroyed.
*****************************************************************************
Send_Ami_Long_EOL
	Move.b	#10,d6			Return char into reg for speed.
	IFD	DOOR_SDE_CLR
	Move.b	#12,d5			Clear screen char into reg for speed.
	ENDC
	Lea	JH_String(a5),a1	Text is to go into the /X msgport.
	Move.l	#JH_StringLen-2,d7	Max length = 200 chars -1dbra,-1null
S2AXLL2
	IFD	DOOR_SDE_CLR
	Cmp.b	(a0),d5			Is this a clear screen char?
	Beq.s	S2AEClr			Yes = strip.
	ENDC
	Cmp.b	(a0),d6			Is this a return?
	Beq.s	S2AERtn			Yes = convert to CR/LF
	Move.b	(a0)+,(a1)+		Copy a char.
	DBeq	d7,S2AXLL2		Copy till buffer full, or end of str.
	Beq.s	SM_2			End of string = Send it, and done.
;;;;;;;	Else, send this, and continue at same point.
	SF	(a1)			Null terminated the buffer.
	Move.l	a0,-(SP)		Preserve current position.
	Bsr.s	SS_2			Send the string.
	Move.l	(SP)+,a0		Restore current position.
	Bra.s	Send_Ami_Long_EOL	Keep on sending.
S2AERtn	Addq.l	#1,a0			Point past the return.
	Move.l	a0,-(SP)
	SF	(a1)			Null terminate the buffer.
	Bsr.s	SM_2			Send buffer with CR/LF on end.
	Move.l	(SP)+,a0
	Bra.s	Send_Ami_Long_EOL	Keep on sending.
	IFD	DOOR_SDE_CLR
S2AEClr	Addq.l	#1,a0			Point past the char.
	Bra.s	S2AXLL2			Continue with the string.
	ENDC
	ENDC

	IFD	DOOR_SENDCLG
*= SEND MESSAGE TO CALLERSLOG =**********************************************
* a0 = Adr Text to send (200 Chars, Null Terminated)                        *
*****************************************************************************
Send_Ami_Clog
	Bsr.s	String_To_Ami		Nullterm String at a0 to JH_String.
	Move.l	#BB_CALLERSLOG,JH_Command(a5)	-.
	Move.l	#AX_WRITEIT,JH_Data(a5)		 |- Send to Callerslog.
	Bra	Send_Ami_Message		-'
;;;;;;;	RTS for us.
	ENDC
