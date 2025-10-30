	IFND	LIBRARIES_AEDOOR_I
LIBRARIES_AEDOOR_I SET	1
**	$Filename: libraries/aedoor.i $
**	$Release: 1.14 Includes, V1.0 $
**	$Revision: 1.00 $
**	$Date: 94/01/05 $
**
**	Standard asm header for AEDoor Library
**
**	(C) Copyright 1992-1994 Sintax Development, Inc.
**	    All Rights Reserved
**

	IFND	EXEC_TYPES_I
	INCLUDE	"exec/types.i"
	ENDC
	IFND  EXEC_LIBRARIES_I
	INCLUDE "exec/libraries.i"
	ENDC

AEDOORNAME	MACRO
		DC.B	'AEDoor.library',0
		ENDM


* Library function definitions

_LVOCreateComm		EQU	-30
_LVODeleteComm		EQU	-36
_LVOSendCmd		EQU	-42
_LVOSendStrCmd		EQU	-48
_LVOSendDataCmd		EQU	-54
_LVOSendStrDataCmd	EQU	-60
_LVOGetData		EQU	-66
_LVOGetString		EQU	-72
_LVOPrompt		EQU	-78
_LVOWriteStr		EQU	-84
_LVOShowGFile		EQU	-90
_LVOShowFile		EQU	-96
_LVOSetDT		EQU	-102
_LVOGetDT		EQU	-108
_LVOGetStr		EQU	-114
_LVOCopyStr		EQU	-120
_LVOHotKey		EQU	-126
_LVOPreCreateComm	EQU	-132
_LVOPostDeleteComm	EQU	-138


* AEDoor library node structure
* At present, there aren't any fields that are for external use. So please
* don't use/change any of these fields!

 STRUCTURE AEDoorLib,LIB_SIZE
    APTR   AED_SysLib		* PRIVATE pointer to exec library base
    APTR   AED_DosLib		* PRIVATE pointer to dos library base
    APTR   AED_SegList		* PRIVATE pointer to our segment list
    UBYTE  AED_Flags
    UBYTE  AED_pad
*
* REMOVED in version V1.14, but this shouldn't give you any problems since
*                           it was private anyways!
*
*    STRUCT AED_dif,10*4	* PRIVATE fields used by the multi door
*    				* option of the library. NEVER USE THIS!
    LABEL  AEDoorLib_Sizeof


* Door InterFace structure, used to hold all the info needed to communicate
* with ami express from the active door

 STRUCTURE DIFace,0
   APTR   dif_AEPort		; Ptr to AEDoorPortX to send msg to
   APTR   dif_MsgPort		; Ptr to our DoorReplyPort to receive msg
   APTR	  dif_Message		; Ptr to an initialized AMiX door message
   STRUCT dif_ReplyName,16	; Our 'DoorReplyPortX' name
   APTR   dif_Data              ; Ptr to JHM_Data field
   APTR   dif_String            ; Ptr to JHM_String field
   LABEL  dif_Sizeof		; DIFace

	ENDC	; LIBRARIES_AEDOOR_I
