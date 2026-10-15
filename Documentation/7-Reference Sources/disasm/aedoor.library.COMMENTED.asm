****************************************************************************
* AEDoor.library v2.7 (18 May 1996) - Fully Commented Disassembly
*
* This library provides the communication layer between AmiExpress doors
* and the BBS. Doors link against this library to send/receive messages
* using the XIM protocol.
*
* CRITICAL STRUCTURES:
*
* CommHandle (allocated by createComm, size=$146/326 bytes):
*   +$00 (4) - Pointer to AEServer port (found via FindPort)
*   +$04 (4) - Pointer to DoorReplyPort (our receive port)
*   +$08 (4) - Pointer to doorMsg structure (+$46 offset into CommHandle)
*   +$0C (varies) - "AEDoorPort" + slot number string (e.g. "AEDoorPort1")
*   +$24 (34) - DoorReplyPort MsgPort structure
*     +$0F (1) - Signal bit number (from AllocSignal)
*     +$10 (4) - Task pointer (from ExecBase->ThisTask)
*     +$0A (varies) - Port name pointer (points to +$0C)
*   +$46 (varies) - doorMsg structure (XIM message)
*     +$0E (4) - Reply port pointer (DoorReplyPort)
*     +$12 (2) - Message type = $100
*     +$14 (varies) - Door name string (e.g. "AEDoorPort1")
*     +$DC (varies) - Data buffer for strings/parameters
*     +$E0 (4) - Command number (XIM typeCode)
*     +$E4 (4) - Slot number (parsed from node string)
*   +$1C (4) - Pointer to data buffer ($DC offset in doorMsg)
*   +$20 (4) - Pointer to door name string ($14 offset in doorMsg)
*
* EXEC LIBRARY FUNCTIONS USED:
****************************************************************************

* Exec.library LVO (Library Vector Offset) definitions
_LVOWait	EQU	-$13E	; Wait for signal bits
_LVOAddPort	EQU	-$162	; Add message port to system list
_LVOGetMsg	EQU	-$174	; Get message from port
_LVOFreeMem	EQU	-$D2	; Free allocated memory
_LVOCloseLibrary	EQU	-$19E	; Close a library
_LVOPutMsg	EQU	-$16E	; Send message to port
_LVORemove	EQU	-$FC	; Remove node from list
_LVOAllocSignal	EQU	-$14A	; Allocate signal bit
_LVORemPort	EQU	-$168	; Remove message port from system
_LVOOpenLibrary	EQU	-$228	; Open a library
_LVODelay	EQU	-$C6	; Wait for time period (dos.library)
_LVOAllocMem	EQU	-$C6	; Allocate memory (exec.library - DUPLICATE DEFINITION ERROR!)
_LVOFreeSignal	EQU	-$150	; Free signal bit

_LVOFindPort	EQU	-$186	; Find named message port

****************************************************************************
	SECTION	aedoorlibrary000000,CODE

****************************************************************************
* LIBRARY ENTRY POINT
* This is the program entry - returns -1 to indicate this is a library,
* not an executable program
****************************************************************************
ProgStart
	MOVEQ	#-1,D0		; Return -1 (library, not executable)
	RTS

****************************************************************************
* ROM TAG (Resident Structure)
* This structure identifies the library to the Amiga operating system
* during boot/library loading
****************************************************************************
romTag	dc.w	$4AFC		; RT_MATCHWORD - magic number identifying resident tag
	dc.l	romTag		; RT_MATCHTAG - pointer to itself
	dc.l	LAB_40C		; RT_ENDSKIP - end of code to skip for next resident
	dc.b	$80		; RT_FLAGS - RTF_AUTOINIT (auto-initialize)
	dc.b	2		; RT_VERSION - library version 2
	dc.b	9		; RT_TYPE - NT_LIBRARY (node type = library)
	dc.b	0		; RT_PRI - priority 0
	dc.l	libraruName	; RT_NAME - pointer to library name
	dc.l	libraryIdString	; RT_IDSTRING - version string
	dc.l	initStruct	; RT_INIT - auto-init structure

****************************************************************************
* LIBRARY IDENTIFICATION STRINGS
****************************************************************************
libraruName	dc.b	'AEDoor.library',0
	dc.b	'$VER: '
libraryIdString	dc.b	'AEDoorLib 2.7 (18 May 1996)',$D,$A,0
doslibrary.MSG	dc.b	'dos.library',0,0

****************************************************************************
* AUTO-INIT STRUCTURE
* Tells exec.library how to initialize this library
****************************************************************************
initStruct	dc.l	$30		; Size of library base structure
	dc.l	funcTable	; Pointer to function table
	dc.l	dataTable	; Pointer to data initialization table
	dc.l	initRoutine	; Pointer to initialization routine

****************************************************************************
* FUNCTION TABLE
* Lists all library functions as offsets from funcTable
* $FFFF marks start/end of table
****************************************************************************
funcTable	dc.w	$FFFF		; Start marker
	dc.w	libOpen-funcTable	; LVO -6: Open library
	dc.w	libClose-funcTable	; LVO -12: Close library
	dc.w	libExpunge-funcTable	; LVO -18: Expunge library
	dc.w	libFunc01-funcTable	; LVO -24: Reserved (returns 0)
	dc.w	createComm-funcTable	; LVO -30: Create door communication
	dc.w	deleteComm-funcTable	; LVO -36: Delete door communication
	dc.w	libFunc04-funcTable	; LVO -42: Send command & wait
	dc.w	libFunc05-funcTable	; LVO -48: Set string data & send
	dc.w	libFunc06-funcTable	; LVO -54: Set data value & send
	dc.w	libFunc07-funcTable	; LVO -60: Set data value & send (alternate)
	dc.w	libFunc08-funcTable	; LVO -66: Get data buffer pointer
	dc.w	libFunc09-funcTable	; LVO -72: Get string buffer pointer
	dc.w	libFunc10-funcTable	; LVO -78: Send cmd 5 & check result
	dc.w	libFunc11-funcTable	; LVO -84: Send multi-line text
	dc.w	libFunc12-funcTable	; LVO -90: Send cmd 7 wrapper
	dc.w	libFunc13-funcTable	; LVO -96: Send cmd 8 wrapper
	dc.w	libFunc14-funcTable	; LVO -102: Send cmd 0
	dc.w	libFunc15-funcTable	; LVO -108: Send cmd 1
	dc.w	libFunc16-funcTable	; LVO -114: Send cmd 0 & check result
	dc.w	libFunc17-funcTable	; LVO -120: Copy string from buffer
	dc.w	libFunc18-funcTable	; LVO -126: Send cmd 6 & get char
	dc.w	libFunc19-funcTable	; LVO -132: CreateComm + DeleteComm
	dc.w	libFunc20-funcTable	; LVO -138: CreateComm + Send cmd 2 + loop
	dc.w	$FFFF		; End marker

****************************************************************************
* DATA TABLE
* Initialization values for library base structure
* Format: $xxyy where xx=operation, yy=size, followed by data
****************************************************************************
dataTable	dc.w	$A00C		; INITBYTE: ln_Type (offset $A) = NT_LIBRARY ($C)
	dc.w	$900		; INITWORD: ln_Pri (offset $9) = 0
	dc.w	$800A		; INITLONG: ln_Name (offset $8) = address
	dc.l	libraruName	;   Address of library name
	dc.w	$A00E		; INITBYTE: lib_Flags (offset $A) = LIBF_SUMUSED+LIBF_CHANGED
	dc.w	$600		; Value = 6
	dc.w	$9014		; INITWORD: lib_Version (offset $14) = 2
	dc.w	2		;   Version 2
	dc.w	$9016		; INITWORD: lib_Revision (offset $16) = 7
	dc.w	7		;   Revision 7
	dc.w	$8018		; INITLONG: lib_IdString (offset $18) = address
	dc.l	libraryIdString	;   Address of ID string
	dcb.w	2,0		; End of init table (2 zero words)

****************************************************************************
* LIBRARY INITIALIZATION ROUTINE
* Called by exec.library when library is first loaded
*
* INPUTS:
*   D0 = Library base pointer
*   A0 = Segment list pointer
*   A6 = ExecBase pointer
*
* OUTPUTS:
*   D0 = Library base pointer (or 0 on failure)
*
* This routine:
*   1. Saves ExecBase pointer at offset $22 in library base
*   2. Saves segment list at offset $2A in library base
*   3. Opens dos.library and saves pointer at offset $26
****************************************************************************
initRoutine	MOVE.L	A5,-(SP)	; Save A5
	MOVEA.L	D0,A5		; A5 = library base
	MOVE.L	A6,$22(A5)	; lib+$22 = ExecBase
	MOVE.L	A0,$2A(A5)	; lib+$2A = segment list
	LEA	doslibrary.MSG(PC),A1	; A1 = "dos.library"
	MOVEQ	#0,D0		; D0 = 0 (any version)
	JSR	_LVOOpenLibrary(A6)	; Open dos.library
	MOVE.L	D0,$26(A5)	; lib+$26 = DOSBase
	MOVE.L	A5,D0		; D0 = library base (return value)
	MOVEA.L	(SP)+,A5	; Restore A5
	RTS

****************************************************************************
* LIBRARY OPEN
* Called when a program opens AEDoor.library
*
* INPUTS:
*   A6 = AEDoor.library base
*
* OUTPUTS:
*   D0 = Library base pointer
*
* Increments open count and clears delayed expunge flag
****************************************************************************
libOpen	ADDQ.W	#1,$20(A6)	; lib_OpenCnt++ (increment open count)
	BCLR	#3,14(A6)	; Clear LIBF_DELEXP (delayed expunge flag)
	MOVE.L	A6,D0		; Return library base
	RTS

****************************************************************************
* LIBRARY CLOSE
* Called when a program closes AEDoor.library
*
* INPUTS:
*   A6 = AEDoor.library base
*
* OUTPUTS:
*   D0 = Segment list (if expunged) or 0
*
* Decrements open count. If count reaches 0 and delayed expunge is set,
* calls libExpunge to remove library from memory
****************************************************************************
libClose	MOVEQ	#0,D0		; D0 = 0 (default return)
	SUBQ.W	#1,$20(A6)	; lib_OpenCnt-- (decrement open count)
	BNE.S	LAB_102		; If still open, return
	BTST	#3,14(A6)	; Test LIBF_DELEXP (delayed expunge flag)
	BEQ.S	LAB_102		; If not set, return
	BSR.W	libExpunge	; Expunge library
LAB_102	RTS

****************************************************************************
* LIBRARY EXPUNGE
* Removes library from memory if possible
*
* INPUTS:
*   A6 = AEDoor.library base
*
* OUTPUTS:
*   D0 = Segment list (if expunged) or 0
*
* Can only expunge if lib_OpenCnt is 0. Otherwise sets delayed expunge flag
****************************************************************************
libExpunge	MOVEM.L	D2/A5/A6,-(SP)	; Save registers
	MOVEA.L	A6,A5		; A5 = library base
	MOVEA.L	$22(A5),A6	; A6 = ExecBase
	TST.W	$20(A5)		; Check lib_OpenCnt
	BEQ.W	LAB_120		; If 0, can expunge
	BSET	#3,14(A5)	; Set LIBF_DELEXP (delayed expunge)
	MOVEQ	#0,D0		; Return 0 (not expunged)
	BRA.S	LAB_146

LAB_120	MOVE.L	$2A(A5),D2	; D2 = segment list (return value)
	MOVEA.L	A5,A1		; A1 = library node
	JSR	_LVORemove(A6)	; Remove from library list
	MOVEA.L	$26(A5),A1	; A1 = DOSBase
	JSR	_LVOCloseLibrary(A6)	; Close dos.library
	MOVEQ	#0,D0		; D0 = 0
	MOVEA.L	A5,A1		; A1 = library base
	MOVE.W	$10(A5),D0	; D0 = lib_NegSize
	SUBA.L	D0,A1		; A1 = start of library memory
	ADD.W	$12(A5),D0	; D0 = total size (NegSize + PosSize)
	JSR	_LVOFreeMem(A6)	; Free library memory
	MOVE.L	D2,D0		; D0 = segment list
LAB_146	MOVEM.L	(SP)+,D2/A5/A6	; Restore registers
	RTS

****************************************************************************
* LVO -24: RESERVED FUNCTION
* Returns 0 (does nothing)
****************************************************************************
libFunc01:
	MOVEQ	#0,D0
	RTS

****************************************************************************
* LVO -30: CREATE COMMUNICATION HANDLE (PreCreateComm)
*
* This is THE CRITICAL FUNCTION that doors call first to establish
* communication with the BBS (AEServer).
*
* INPUTS:
*   A6 = AEDoor.library base
*   (Uses pr_CLI->cli_CommandName from caller's process for slot number)
*
* OUTPUTS:
*   D0 = CommHandle pointer (or 0 on failure)
*
* ALGORITHM:
*   1. Get slot number from caller's process (pr_CLI->cli_CommandName)
*   2. Allocate $146 bytes for CommHandle structure
*   3. Build "AEDoorPort" + slot# string
*   4. Find BBS's AEServer port via FindPort()
*   5. Create "DoorReplyPort" + slot# for receiving replies
*   6. Allocate signal bit for reply notification
*   7. Initialize doorMsg structure with slot info
*   8. Send initial registration message (cmd 1)
*   9. Return CommHandle pointer
*
* CRITICAL: The slot number comes from pr_CLI->cli_CommandName, which
* the BBS sets when launching the door. This is how doors know which
* node they're running on.
****************************************************************************
createComm:
	MOVEM.L	D1-D7/A2-A6,-(SP)	; Save all registers
	MOVEA.L	$22(A6),A5	; A5 = ExecBase (from lib+$22)
	MOVEA.L	$114(A5),A5	; A5 = ThisTask (current process)
	MOVE.L	$CC(A5),D7	; D7 = pr_CLI (CLI structure pointer)
	MOVEA.L	A6,A5		; A5 = AEDoor.library base

****************************************************************************
* MEMORY ALLOCATION LOOP
* Allocates $146 bytes with retry on failure
****************************************************************************
LAB_162	MOVEA.L	$22(A5),A6	; A6 = ExecBase
	MOVE.L	#$146,D0	; D0 = 326 bytes (CommHandle size)
	MOVE.L	#$10001,D1	; D1 = MEMF_PUBLIC | MEMF_CLEAR
	JSR	_LVOAllocMem(A6)	; Allocate memory
	TST.L	D0		; Success?
	BNE.S	LAB_188		; Yes, continue
	MOVEA.L	$26(A5),A6	; A6 = DOSBase
	MOVEQ	#$32,D1		; D1 = 50 (ticks, 1 second)
	PEA	LAB_162(PC)	; Return address (retry)
	JMP	_LVODelay(A6)	; Delay and retry

****************************************************************************
* BUILD "AEDoorPort" + SLOT# STRING
* Result: "AEDoorPort1" or "AEDoorPort12" at offset +$0C in CommHandle
****************************************************************************
LAB_188	MOVEA.L	D0,A4		; A4 = CommHandle
	LEA	LAB_3F2(PC),A0	; A0 = "AEDoorPort" template
	LEA	12(A4),A1	; A1 = CommHandle+$0C (name buffer)
LAB_192	MOVE.B	(A0)+,(A1)+	; Copy "AEDoorPort"
	BNE.S	LAB_192		; Until null terminator
	MOVEA.L	D7,A0		; A0 = pr_CLI (CLI structure)
	MOVE.B	(A0)+,-1(A1)	; A0 = cli_CommandName (BSTR), copy first digit
	CMPI.B	#$30,(A0)	; Check if second char is '0'-'9'
	BCS.S	LAB_1A4		; No, single digit slot
	MOVE.B	(A0),(A1)	; Yes, copy second digit (two-digit slot)

****************************************************************************
* FIND AESERVER PORT
* The BBS creates "AEServer" port at startup. All doors communicate via this.
****************************************************************************
LAB_1A4	LEA	12(A4),A1	; A1 = "AEDoorPort#" string
	JSR	_LVOFindPort(A6)	; Find AEServer port
	MOVE.L	D0,0(A4)	; CommHandle+$00 = AEServer port pointer
	BEQ.W	LAB_27E		; If not found, cleanup and fail

****************************************************************************
* BUILD "DoorReplyPort" + SLOT# STRING
* Result: "DoorReplyPort1" at offset +$0C in CommHandle (overwrites previous)
****************************************************************************
	LEA	LAB_3FD(PC),A0	; A0 = "DoorReplyPort" template
	LEA	12(A4),A1	; A1 = CommHandle+$0C (reuse buffer)
LAB_1BC	MOVE.B	(A0)+,(A1)+	; Copy "DoorReplyPort"
	BNE.S	LAB_1BC		; Until null terminator
	MOVEA.L	D7,A0		; A0 = pr_CLI
	MOVE.B	(A0)+,-1(A1)	; Copy first digit
	CMPI.B	#$30,(A0)	; Check if two digits
	BCS.S	LAB_1CE		; No, single digit
	MOVE.B	(A0),(A1)	; Yes, copy second digit

****************************************************************************
* CREATE REPLY PORT (MsgPort structure at CommHandle+$24)
* This port receives replies from AEServer
****************************************************************************
LAB_1CE	MOVEQ	#-1,D0		; D0 = -1 (any free signal)
	JSR	_LVOAllocSignal(A6)	; Allocate signal bit
	LEA	$24(A4),A1	; A1 = CommHandle+$24 (MsgPort)
	MOVE.B	D0,15(A1)	; mp_SigBit = signal bit number
	MOVE.L	$114(A6),$10(A1)	; mp_SigTask = ThisTask
	MOVE.L	A1,4(A4)	; CommHandle+$04 = DoorReplyPort pointer
	CLR.B	9(A1)		; mp_Flags = 0 (PA_SIGNAL)
	LEA	12(A4),A0	; A0 = "DoorReplyPort#" string
	MOVE.L	A0,10(A1)	; mp_Node.ln_Name = port name
	JSR	_LVOAddPort(A6)	; Add port to system

****************************************************************************
* INITIALIZE DOORMSG STRUCTURE (at CommHandle+$46)
* This message is sent to AEServer for all XIM commands
****************************************************************************
	LEA	$46(A4),A2	; A2 = CommHandle+$46 (doorMsg)
	MOVE.L	A2,8(A4)	; CommHandle+$08 = doorMsg pointer
	MOVE.L	4(A4),14(A2)	; msg_ReplyPort = DoorReplyPort
	MOVE.W	#$100,$12(A2)	; msg_Type = $100 (custom message type)

****************************************************************************
* PARSE SLOT NUMBER FROM CLI COMMAND NAME
* Converts "1" or "12" to integer and stores at doorMsg+$E4
****************************************************************************
	MOVEQ	#0,D0		; D0 = 0
	MOVEQ	#$30,D1		; D1 = '0' (ASCII offset)
	MOVEA.L	D7,A0		; A0 = pr_CLI
	MOVE.B	(A0)+,D0	; D0 = first digit char
	SUB.B	D1,D0		; D0 = first digit value
	CMP.B	(A0),D1		; Check if second char is digit
	BCS.S	LAB_222		; No, single digit
	MULU.W	#10,D0		; D0 *= 10
	MOVE.B	(A0),D7		; D7 = second digit char
	SUB.B	D1,D7		; D7 = second digit value
	ADD.B	D7,D0		; D0 = (first*10) + second
LAB_222	MOVE.L	D0,$E4(A2)	; doorMsg+$E4 = slot number

****************************************************************************
* COPY PORT NAME TO DOORMSG
* Stores "DoorReplyPort#" at doorMsg+$14
****************************************************************************
	LEA	12(A4),A0	; A0 = "DoorReplyPort#" string
	LEA	$14(A2),A1	; A1 = doorMsg+$14 (name buffer)
LAB_22E	MOVE.B	(A0)+,(A1)+	; Copy port name
	BNE.S	LAB_22E		; Until null terminator

****************************************************************************
* SET UP CONVENIENCE POINTERS
* CommHandle+$1C = pointer to data buffer (doorMsg+$DC)
* CommHandle+$20 = pointer to name string (doorMsg+$14)
****************************************************************************
	MOVEA.L	8(A4),A1	; A1 = doorMsg
	LEA	$DC(A1),A0	; A0 = doorMsg+$DC (data buffer)
	MOVE.L	A0,$1C(A4)	; CommHandle+$1C = data buffer pointer
	LEA	$14(A1),A0	; A0 = doorMsg+$14 (name string)
	MOVE.L	A0,$20(A4)	; CommHandle+$20 = name string pointer

****************************************************************************
* SEND INITIAL REGISTRATION MESSAGE (XIM Command 1 = JH_REGISTER)
* This tells the BBS that the door is ready to communicate
****************************************************************************
	MOVEA.L	A4,A1		; A1 = CommHandle
	MOVEQ	#1,D0		; D0 = 1 (JH_REGISTER command)
	MOVEA.L	A5,A6		; A6 = AEDoor.library base
	BSR.W	libFunc04	; Send command and wait for reply

	MOVE.L	A4,D0		; D0 = CommHandle (return value)
	MOVEM.L	(SP)+,D1-D7/A2-A6	; Restore registers
	RTS

****************************************************************************
* LVO -36: DELETE COMMUNICATION HANDLE (PostDeleteComm)
*
* Tears down door communication and frees all resources
*
* INPUTS:
*   A1 = CommHandle pointer
*   A6 = AEDoor.library base
*
* ALGORITHM:
*   1. Send command 2 (unregister/cleanup)
*   2. Remove DoorReplyPort from system
*   3. Free signal bit
*   4. Free CommHandle memory
****************************************************************************
deleteComm:
	MOVEM.L	D1-D7/A2-A6,-(SP)	; Save registers
LAB_25C	MOVEQ	#2,D0		; D0 = 2 (cleanup command)
	BSR.W	libFunc04	; Send command
LAB_262	MOVEA.L	A6,A5		; A5 = library base
	MOVEA.L	A1,A4		; A4 = CommHandle
	MOVEA.L	$22(A5),A6	; A6 = ExecBase
	MOVEA.L	4(A4),A1	; A1 = DoorReplyPort
	JSR	_LVORemPort(A6)	; Remove port from system
	MOVEA.L	4(A5),A1	; A1 = DoorReplyPort (WRONG! Should be 4(A4))
	MOVE.B	15(A1),D0	; D0 = signal bit number
	JSR	_LVOFreeSignal(A6)	; Free signal bit
LAB_27E	MOVEA.L	A4,A1		; A1 = CommHandle
	MOVE.L	#$146,D0	; D0 = 326 bytes
	JSR	_LVOFreeMem(A6)	; Free memory
	MOVEQ	#0,D0		; Return 0
	MOVEM.L	(SP)+,D1-D7/A2-A6	; Restore registers
	RTS

****************************************************************************
* LVO -54: SET DATA VALUE AND SEND (variant A)
*
* Sets doorMsg+$DC to D1 value and sends command
*
* INPUTS:
*   A1 = CommHandle
*   D1 = Data value to set at doorMsg+$DC
*   (D0 assumed to be set before calling)
*
* Used for commands that need a numeric parameter
****************************************************************************
libFunc06:
	MOVEM.L	A1/A4/A6,-(SP)	; Save registers
	MOVEA.L	A1,A4		; A4 = CommHandle
	MOVEA.L	8(A4),A1	; A1 = doorMsg
	MOVE.L	D1,$DC(A1)	; doorMsg+$DC = data value
	BRA.S	LAB_2D8		; Send command

****************************************************************************
* LVO -60: SET DATA VALUE AND SEND (variant B)
*
* Same as libFunc06 but with different code path
* Sets doorMsg+$DC to D1 value and sends command
*
* INPUTS:
*   A1 = CommHandle
*   D1 = Data value
*   D0 = Command number
****************************************************************************
libFunc07:
	MOVEM.L	A1/A4/A6,-(SP)	; Save registers
	MOVEA.L	A1,A4		; A4 = CommHandle
	MOVEA.L	8(A4),A1	; A1 = doorMsg
	MOVE.L	D1,$DC(A1)	; doorMsg+$DC = data value
	BRA.S	LAB_2BC		; Continue to string setter

****************************************************************************
* LVO -48: SET STRING DATA AND SEND
*
* Copies string from A0 to doorMsg+$14 and sends command
*
* INPUTS:
*   A1 = CommHandle
*   A0 = String pointer (or 0 for empty)
*   D0 = Command number (set before calling)
*
* Used for commands that send text strings (file names, user input, etc.)
****************************************************************************
libFunc05:
	MOVEM.L	A1/A4/A6,-(SP)	; Save registers
	MOVEA.L	A1,A4		; A4 = CommHandle
	MOVEA.L	8(A4),A1	; A1 = doorMsg
LAB_2BC	LEA	$14(A1),A1	; A1 = doorMsg+$14 (string buffer)
	MOVE.L	A0,D1		; D1 = string pointer
	BEQ.S	LAB_2CE		; If null, skip copy
	MOVE.W	#$C6,D1		; D1 = 198 (max string length)
LAB_2C8	MOVE.B	(A0)+,(A1)+	; Copy byte
	DBEQ	D1,LAB_2C8	; Loop until null or count exhausted
LAB_2CE	CLR.B	(A1)		; Ensure null termination
	BRA.S	LAB_2D8		; Send command

****************************************************************************
* LVO -42: SEND COMMAND AND WAIT FOR REPLY
*
* This is THE CORE COMMUNICATION FUNCTION. All XIM protocol messages
* go through this function.
*
* INPUTS:
*   A1 = CommHandle
*   D0 = Command number (XIM typeCode)
*   A6 = AEDoor.library base
*
* ALGORITHM:
*   1. Set doorMsg+$E0 = command number
*   2. Send doorMsg to AEServer via PutMsg()
*   3. Wait for signal (reply notification)
*   4. Get reply message via GetMsg()
*   5. Return (caller examines doorMsg for result)
*
* CRITICAL: This implements synchronous request/reply protocol.
* Door BLOCKS waiting for BBS response. This is why doors can't
* do anything else while waiting for BBS.
****************************************************************************
libFunc04:
	MOVEM.L	A1/A4/A6,-(SP)	; Save registers
	MOVEA.L	A1,A4		; A4 = CommHandle
LAB_2D8	MOVEA.L	0(A4),A0	; A0 = AEServer port
	MOVEA.L	8(A4),A1	; A1 = doorMsg
	MOVE.L	D0,$E0(A1)	; doorMsg+$E0 = command number (XIM typeCode)
	MOVEA.L	$22(A6),A6	; A6 = ExecBase
	JSR	_LVOPutMsg(A6)	; Send message to AEServer

	MOVEA.L	4(A4),A0	; A0 = DoorReplyPort
	MOVEQ	#0,D1		; D1 = 0
	MOVE.B	15(A0),D1	; D1 = signal bit number
	MOVEQ	#1,D0		; D0 = 1
	ASL.L	D1,D0		; D0 = 1 << signal_bit (signal mask)
	JSR	_LVOWait(A6)	; Wait for signal (BLOCKS HERE!)

	MOVEA.L	4(A4),A0	; A0 = DoorReplyPort
	JSR	_LVOGetMsg(A6)	; Get reply message
	MOVEM.L	(SP)+,A1/A4/A6	; Restore registers
	RTS

****************************************************************************
* LVO -66: GET DATA BUFFER POINTER
*
* Returns pointer to data buffer (doorMsg+$DC)
*
* INPUTS:
*   A1 = CommHandle
*
* OUTPUTS:
*   D0 = Pointer to data buffer
*
* Used to read numeric results from BBS responses
****************************************************************************
libFunc08:
	MOVE.L	$1C(A1),D0	; D0 = CommHandle+$1C (data buffer pointer)
	RTS

****************************************************************************
* LVO -72: GET STRING BUFFER POINTER
*
* Returns pointer to string buffer (doorMsg+$14)
*
* INPUTS:
*   A1 = CommHandle
*
* OUTPUTS:
*   D0 = Pointer to string buffer
*
* Used to read string results from BBS responses
****************************************************************************
libFunc09:
	MOVE.L	$20(A1),D0	; D0 = CommHandle+$20 (string buffer pointer)
	RTS

****************************************************************************
* LVO -78: SEND COMMAND 5 AND CHECK RESULT
*
* Sends command 5 and checks if result is -1 (error)
*
* INPUTS:
*   A1 = CommHandle
*
* OUTPUTS:
*   D0 = String buffer pointer (if success) or 0 (if error)
*
* Returns 0 if data buffer contains -1, otherwise returns string buffer
****************************************************************************
libFunc10:
	MOVEQ	#5,D0		; D0 = 5 (command number)
	BSR.S	libFunc07	; Send command
	MOVEA.L	$1C(A1),A0	; A0 = data buffer pointer
	MOVEQ	#-1,D0		; D0 = -1
	CMP.L	(A0),D0		; Check if data buffer = -1
	BEQ.S	LAB_32C		; Yes, return 0 (error)
	MOVE.L	$20(A1),D0	; D0 = string buffer pointer (success)
	RTS

LAB_32C	MOVEQ	#0,D0		; D0 = 0 (error)
	RTS

****************************************************************************
* LVO -84: SEND MULTI-LINE TEXT
*
* Sends text string, breaking into 199-byte chunks if necessary.
* Used for displaying long messages to user.
*
* INPUTS:
*   A1 = CommHandle
*   A0 = Text string pointer
*   D1 = Flags (bit 0: 1=final chunk, 0=more coming)
*
* ALGORITHM:
*   1. Copy up to 199 bytes to string buffer
*   2. If string fits in 199 bytes, send with D1 flag
*   3. If string exceeds 199 bytes, send chunk with D1=0, repeat
*
* This implements pagination for long text output
****************************************************************************
libFunc11:
	MOVEM.L	D7/A3/A4,-(SP)	; Save registers
	MOVEA.L	A1,A4		; A4 = CommHandle
	MOVEQ	#1,D7		; D7 = 1
	AND.B	D1,D7		; D7 = D1 & 1 (preserve final flag)
	MOVEA.L	A0,A3		; A3 = text string pointer

LAB_33C	MOVEA.L	A4,A1		; A1 = CommHandle
	MOVE.W	#$C6,D0		; D0 = 198 (max chunk size)
	MOVEA.L	$20(A4),A0	; A0 = string buffer (doorMsg+$14)
LAB_346	MOVE.B	(A3)+,(A0)+	; Copy byte from text
	DBEQ	D0,LAB_346	; Loop until null or 199 bytes
	BEQ.S	LAB_35A		; If null terminator found, send final chunk
	CLR.B	(A0)		; Null terminate chunk
	MOVEQ	#4,D0		; D0 = 4 (send command)
	MOVEQ	#0,D1		; D1 = 0 (not final chunk)
	BSR.W	libFunc06	; Send chunk
	BRA.S	LAB_33C		; Continue with next chunk

LAB_35A	MOVEQ	#4,D0		; D0 = 4 (send command)
	MOVE.L	D7,D1		; D1 = final flag
	BSR.W	libFunc06	; Send final chunk
	MOVEM.L	(SP)+,D7/A3/A4	; Restore registers
	RTS

****************************************************************************
* UNREACHABLE CODE (never called directly)
* Alternative entry for command 4
****************************************************************************
	MOVEQ	#4,D0
	BRA.W	libFunc07

****************************************************************************
* LVO -90: SEND COMMAND 7 (wrapper)
*
* Convenience wrapper: sends command 7 with string from A0
*
* INPUTS:
*   A1 = CommHandle
*   A0 = String pointer
****************************************************************************
libFunc12:
	MOVEQ	#7,D0		; D0 = 7
	BRA.W	libFunc05	; Set string and send

****************************************************************************
* LVO -96: SEND COMMAND 8 (wrapper)
*
* Convenience wrapper: sends command 8 with string from A0
*
* INPUTS:
*   A1 = CommHandle
*   A0 = String pointer
****************************************************************************
libFunc13:
	MOVEQ	#8,D0		; D0 = 8
	BRA.W	libFunc05	; Set string and send

****************************************************************************
* LVO -102: SEND COMMAND 0
*
* Sends command 0 with D1=0
*
* INPUTS:
*   A1 = CommHandle
****************************************************************************
libFunc14:
	MOVEQ	#0,D1		; D1 = 0
	BRA.W	libFunc07	; Set data and send

****************************************************************************
* LVO -108: SEND COMMAND 1
*
* Sends command 1 with D1=1
*
* INPUTS:
*   A1 = CommHandle
****************************************************************************
libFunc15:
	MOVEQ	#1,D1		; D1 = 1
	BRA.W	libFunc07	; Set data and send

****************************************************************************
* LVO -114: SEND COMMAND 0 AND CHECK RESULT
*
* Sends command 0 and checks if result is -1 (error)
*
* INPUTS:
*   A1 = CommHandle
*
* OUTPUTS:
*   D0 = String buffer pointer (if success) or 0 (if error)
****************************************************************************
libFunc16:
	MOVEQ	#0,D0		; D0 = 0 (command number)
	BSR.W	libFunc07	; Send command
	MOVEA.L	$1C(A1),A0	; A0 = data buffer pointer
	MOVEQ	#-1,D0		; D0 = -1
	CMP.L	(A0),D0		; Check if data buffer = -1
	BEQ.S	LAB_39C		; Yes, return 0 (error)
	MOVE.L	$20(A1),D0	; D0 = string buffer pointer (success)
	RTS

LAB_39C	MOVEQ	#0,D0		; D0 = 0 (error)
	RTS

****************************************************************************
* LVO -120: COPY STRING FROM BUFFER
*
* Copies string from doorMsg+$14 to user-provided buffer
*
* INPUTS:
*   A1 = CommHandle
*   A0 = Destination buffer pointer
*
* Copies up to 199 bytes plus null terminator
****************************************************************************
libFunc17:
	MOVE.L	A1,-(SP)	; Save A1
	MOVEA.L	$20(A1),A1	; A1 = string buffer (doorMsg+$14)
	MOVE.W	#$C6,D0		; D0 = 198 (max copy length)
LAB_3AA	MOVE.B	(A1)+,(A0)+	; Copy byte
	DBEQ	D0,LAB_3AA	; Loop until null or 199 bytes
	CLR.B	(A0)		; Ensure null termination
	MOVEA.L	(SP)+,A1	; Restore A1
	RTS

****************************************************************************
* LVO -126: SEND COMMAND 6 AND GET CHARACTER
*
* Sends command 6 (get hotkey) and returns character
*
* INPUTS:
*   A1 = CommHandle
*   A0 = Prompt string pointer
*
* OUTPUTS:
*   D0 = Character code (or 0 if error, D1=0)
*   D1 = 0 if error, non-zero if success
*
* Used for JH_HK (hotkey input) - reads single keypress from user
****************************************************************************
libFunc18:
	MOVEQ	#6,D0		; D0 = 6 (JH_HK command)
	BSR.W	libFunc05	; Set string (prompt) and send
	MOVEA.L	$1C(A1),A0	; A0 = data buffer pointer
	MOVE.L	(A0),D0		; D0 = result value
	BMI.S	LAB_3CE		; If negative, error
	MOVEA.L	$20(A1),A0	; A0 = string buffer pointer
	MOVEQ	#0,D0		; D0 = 0
	MOVE.B	(A0),D0		; D0 = first character
	MOVEQ	#0,D1		; D1 = 0 (should be non-zero for success - BUG?)
LAB_3CE	RTS

****************************************************************************
* LVO -132: CREATE COMM, DELETE COMM (one-shot wrapper)
*
* Creates CommHandle, then immediately deletes it
* Useful for one-time door operations
*
* INPUTS:
*   A6 = AEDoor.library base
*
* This seems like a testing/diagnostic function
****************************************************************************
libFunc19:
	MOVEM.L	D1-D7/A2-A6,-(SP)	; Save registers
	BSR.W	createComm	; Create CommHandle
	MOVEA.L	D0,A1		; A1 = CommHandle
	BRA.W	LAB_262		; Jump to deleteComm cleanup

****************************************************************************
* LVO -138: CREATE COMM, SEND COMMAND 2, DELETE COMM (looping wrapper)
*
* Creates CommHandle, sends command 2, then deletes it in a loop
*
* INPUTS:
*   A6 = AEDoor.library base
*
* This sets up a loop that will retry via LAB_25C
****************************************************************************
libFunc20:
	MOVEM.L	D1-D7/A2-A6,-(SP)	; Save registers
	BSR.W	createComm	; Create CommHandle
	MOVEA.L	D0,A1		; A1 = CommHandle
	MOVEQ	#2,D0		; D0 = 2 (command number)
	PEA	LAB_25C(PC)	; Return address (retry loop)
	BRA.W	libFunc04	; Send command

****************************************************************************
* STRING CONSTANTS
****************************************************************************
LAB_3F2	dc.b	'AEDoorPort',0		; Template for door port name
LAB_3FD	dc.b	'DoorReplyPort',0,0	; Template for reply port name

****************************************************************************
* END MARKER
****************************************************************************
LAB_40C
	end

****************************************************************************
* SUMMARY OF LIBRARY FUNCTIONS (by LVO offset)
****************************************************************************
*
* LVO -6  (libOpen):      Open library (increment use count)
* LVO -12 (libClose):     Close library (decrement use count, maybe expunge)
* LVO -18 (libExpunge):   Remove library from memory
* LVO -24 (libFunc01):    Reserved (returns 0)
* LVO -30 (createComm):   Create door communication handle
* LVO -36 (deleteComm):   Delete door communication handle
* LVO -42 (libFunc04):    Send command D0 and wait for reply
* LVO -48 (libFunc05):    Set string A0, send command D0
* LVO -54 (libFunc06):    Set data D1, send command D0
* LVO -60 (libFunc07):    Set data D1, send command D0 (alternate)
* LVO -66 (libFunc08):    Get data buffer pointer
* LVO -72 (libFunc09):    Get string buffer pointer
* LVO -78 (libFunc10):    Send cmd 5, return string or 0 if error
* LVO -84 (libFunc11):    Send multi-line text (paginated)
* LVO -90 (libFunc12):    Send cmd 7 with string A0
* LVO -96 (libFunc13):    Send cmd 8 with string A0
* LVO -102 (libFunc14):   Send cmd 0 with D1=0
* LVO -108 (libFunc15):   Send cmd 1 with D1=1
* LVO -114 (libFunc16):   Send cmd 0, return string or 0 if error
* LVO -120 (libFunc17):   Copy string from buffer to A0
* LVO -126 (libFunc18):   Send cmd 6 (get hotkey), return char in D0
* LVO -132 (libFunc19):   Create+Delete comm (one-shot)
* LVO -138 (libFunc20):   Create comm, send cmd 2, loop
*
****************************************************************************

****************************************************************************
* CRITICAL INSIGHTS FOR EMULATION
****************************************************************************
*
* 1. SLOT NUMBER DETECTION:
*    - Doors get their node/slot number from pr_CLI->cli_CommandName
*    - This is set by the BBS when launching the door via Execute() or System()
*    - The slot number becomes part of the port names: "AEDoorPort1", "DoorReplyPort1"
*
* 2. COMMHANDLE STRUCTURE ($146 bytes):
*    +$00: Pointer to AEServer port (found via FindPort)
*    +$04: Pointer to DoorReplyPort (created by library)
*    +$08: Pointer to doorMsg structure
*    +$0C: Port name buffer ("AEDoorPort#" then "DoorReplyPort#")
*    +$1C: Cached pointer to data buffer (doorMsg+$DC)
*    +$20: Cached pointer to string buffer (doorMsg+$14)
*    +$24: MsgPort structure for DoorReplyPort
*    +$46: doorMsg structure (sent to AEServer)
*
* 3. DOORMSG STRUCTURE:
*    +$0E: Reply port pointer (DoorReplyPort)
*    +$12: Message type ($100)
*    +$14: String buffer (200+ bytes for strings)
*    +$DC: Data buffer (numeric parameters/results)
*    +$E0: Command number (XIM typeCode)
*    +$E4: Slot number
*
* 4. SYNCHRONOUS PROTOCOL:
*    - Every command is request/reply
*    - Door sends message via PutMsg()
*    - Door waits via Wait() for signal
*    - BBS processes command and ReplyMsg()
*    - Door receives reply via GetMsg()
*    - Door examines result in doorMsg buffers
*
* 5. COMMAND NUMBERS MAP TO XIM:
*    - Command 1 = JH_REGISTER (initial registration)
*    - Command 2 = cleanup/unregister
*    - Command 4 = send text output
*    - Command 5 = various queries
*    - Command 6 = JH_HK (get hotkey)
*    - Command 7/8 = other XIM commands
*
* 6. BUGS IN LIBRARY:
*    - Line 223: Uses 4(A5) instead of 4(A4) - wrong base register!
*    - Line 375: D1 should be non-zero on success but is set to 0
*    - Line 12: AllocMem LVO wrong (conflicts with Delay LVO)
*
* 7. EMULATION REQUIREMENTS:
*    - Must emulate pr_CLI->cli_CommandName with node number
*    - Must provide FindPort("AEServer") that returns our fake port
*    - Must emulate AddPort() to register DoorReplyPort
*    - Must emulate PutMsg/GetMsg/Wait/Signal for message passing
*    - Must map command numbers to XIM protocol handlers
*
****************************************************************************
