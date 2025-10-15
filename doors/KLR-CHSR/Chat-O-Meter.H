#ifndef COM_H
#define COM_H

#include <time.h>
#include <exec/exec.h>
#include <proto/exec.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <proto/exec.h>
#include <dos/dos.h>
#include <exec/types.h>
#include <exec/execbase.h>
#include <exec/nodes.h>
#include <exec/lists.h>
#include <exec/libraries.h>
#include <exec/ports.h>
#include <exec/interrupts.h>
#include <exec/io.h>
#include <exec/memory.h>
#include <ctype.h>
#include <clib/exec_protos.h>
#include <clib/dos_protos.h>
#include <pragmas/dos_pragmas.h>
#include <pragmas/exec_pragmas.h>
#include <pragmas/utility_pragmas.h>
#include <proto/icon.h>
#include <dos.h>
#include <utility/date.h>
#include <clib/utility_protos.h>

/**********************
 * Ami-X Include File *
 **********************/

#include "sc:ae/doorheader.h"
#include "sc:ae/glue.h"

#include "Chat-O-Meter_protos.h"
#include "Chat-O-Meter_Top_protos.h"
#include "Chat-O-Meter_Log_protos.h"

/*********************
 * Ami-X Definitions *
 *********************/

#define sm     sendmessage
#define hk     hotkey
#define pm     prompt
#define sf     showfile
#define co		ConOnly

/*******************
 * Own definitions *
 *******************/

#define CLS       "\014[2;1H"

/******************
 * Data Structure *
 ******************/

struct COMDATA
{
	ULONG	Chats;					// Number of chats
	ULONG	TimeChatted;			// Total time chatted in seconds
	ULONG Time[ 10 ];				// # of seconds per chat
	ULONG	Date[ 10 ];				// Dates of all the chats
	char	User[ 10 ][ 22 ];		// Names of all chatters
};

struct CHATTOP
{
	ULONG	Time;						// Total chat time
	ULONG	Chats;					// Total number of chats
};

struct TODAY_DATA
{
	UWORD tt_RecTime;				// "Today" record in seconds (should not exceed
										// 122400 (total number of seconds/day) ).
	UWORD	tt_RecChats;			// Number of chats of the "Today" record
	UWORD	tt_RecDay;				// Day value of "today" record
	UWORD	tt_RecMonth;			// Month value of "today" record
	UWORD	tt_RecYear;				// Year value of "today" record

	UWORD	tt_Time;					// Number of seconds chatted today (current)
	UWORD	tt_Chats;				// Number of chats held today (current)
	UWORD	tt_Day;					// Day value of "today"
	UWORD	tt_Month;				// Month value of "today"
	UWORD	tt_Year;					// Year value of "today"
};

struct CHAT_LOG
{
	/* When searching through a log, we take the starting time (which is
	 * a julian Date) as the primary date. That means, if we are looking
	 * for all the chats on 29-Jun-95, we would match that date only against
	 * the date in cl_Start.
	 */
	ULONG		cl_Start;				// Started chat at  : [Start]
	ULONG		cl_End;					// Ended chat at    : [End]
	USHORT	cl_Slotnumber;			// Chatted with user: [Slot #] (User.Data)
};

#endif
