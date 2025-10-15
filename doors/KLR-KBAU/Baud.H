#ifndef KILLER_BAUD_H
#define KILLER_BAUD_H

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
#include <proto/icon.h>
#include <dos.h>

/**********************
 * Ami-X Include File *
 **********************/

#include "sc:ae/doorheader.h"
#include "sc:ae/glue.h"

/*********************
 * Ami-X Definitions *
 *********************/

#define sm     sendmessage
#define hk     hotkey
#define pm     prompt
#define sf     showfile

/*******************
 * Own definitions *
 *******************/

#define CLS       "\014[2;1H"
#define CHECK		1
#define NOCHECK	0

/*************************************************************************
 STRUCTURE DECLARATIONS	: struct BAUDRATE	-> All baud information
 *************************************************************************/

struct BAUDRATE
{
	ULONG	RunningSince;			// Running since (Julian date)
	ULONG	ConnectSlow;			// All connects below 9600
	ULONG	Connect9600;			// All connects 9600
	ULONG	Connect12000;			// All connects 12000
	ULONG	Connect14400;			// You'll get the idea by now
	ULONG	Connect16800;
	ULONG	Connect19200;
	ULONG	Connect21600;
	ULONG	Connect24000;
	ULONG	Connect26400;
	ULONG	Connect28800;
   ULONG Connect31200;
	ULONG	Connect33600;			// USR rules!
	ULONG	ConnectFAST;			// All connects above 33600
	ULONG	DateSlow;				// Date/time of last connect < 9600
	ULONG	Date9600;				// Date/time of last connect 9600
	ULONG	Date12000;				// Date/time of last connect 12000
	ULONG	Date14400;				// Got it? Good.
	ULONG	Date16800;
	ULONG	Date19200;
	ULONG	Date21600;
	ULONG	Date24000;
	ULONG	Date26400;
	ULONG	Date28800;
   ULONG Date31200;
	ULONG	Date33600;
	ULONG DateFAST;
	BYTE	UserSlow[ 32 ];		// Name of last user with connect < 9600
	BYTE	User9600[ 32 ];		// Name of last user with connect 9600
	BYTE	User12000[ 32 ];		// Name of last user with connect 12000
	BYTE	User14400[ 32 ];		// You've got it by now
	BYTE	User16800[ 32 ];
	BYTE	User19200[ 32 ];
	BYTE	User21600[ 32 ];
	BYTE	User24000[ 32 ];
	BYTE	User26400[ 32 ];
	BYTE	User28800[ 32 ];
   BYTE  User31200[ 32 ];
	BYTE	User33600[ 32 ];
	BYTE	UserFAST[ 32 ];
};

struct BAUDRATE_OLD
{
	ULONG	RunningSince;			// Running since (Julian date)
	ULONG	ConnectSlow;			// All connects below 9600
	ULONG	Connect9600;			// All connects 9600
	ULONG	Connect12000;			// All connects 12000
	ULONG	Connect14400;			// You'll get the idea by now
	ULONG	Connect16800;
	ULONG	Connect19200;
	ULONG	Connect21600;
	ULONG	Connect24000;
	ULONG	Connect26400;
	ULONG	Connect28800;
   ULONG Connect31200;
	ULONG	ConnectFAST;			// All connects above 33600
	ULONG	DateSlow;				// Date/time of last connect < 9600
	ULONG	Date9600;				// Date/time of last connect 9600
	ULONG	Date12000;				// Date/time of last connect 12000
	ULONG	Date14400;				// Got it? Good.
	ULONG	Date16800;
	ULONG	Date19200;
	ULONG	Date21600;
	ULONG	Date24000;
	ULONG	Date26400;
	ULONG	Date28800;
   ULONG Date31200;
	ULONG DateFAST;
	BYTE	UserSlow[ 32 ];		// Name of last user with connect < 9600
	BYTE	User9600[ 32 ];		// Name of last user with connect 9600
	BYTE	User12000[ 32 ];		// Name of last user with connect 12000
	BYTE	User14400[ 32 ];		// You've got it by now
	BYTE	User16800[ 32 ];
	BYTE	User19200[ 32 ];
	BYTE	User21600[ 32 ];
	BYTE	User24000[ 32 ];
	BYTE	User26400[ 32 ];
	BYTE	User28800[ 32 ];
   BYTE  User31200[ 32 ];
	BYTE	UserFAST[ 32 ];
};

#endif
