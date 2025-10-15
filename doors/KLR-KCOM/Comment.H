#ifndef KILLER_COMMENT_H
#define KILLER_COMMENT_H

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
#include <libraries/dos.h>
#include <libraries/dosextens.h>
#include <proto/dos.h>
#include <pragmas/dos_pragmas.h>
#include <pragmas/exec_pragmas.h>
#include <stat.h>
#include <proto/icon.h>
#include <error.h>
#include <dos.h>
#include <workbench/startup.h>
#include <intuition/intuition.h>
#include <intuition/classes.h>
#include <intuition/classusr.h>
#include <intuition/imageclass.h>
#include <intuition/gadgetclass.h>
#include <libraries/gadtools.h>
#include <graphics/displayinfo.h>
#include <graphics/gfxbase.h>
#include <clib/exec_protos.h>
#include <clib/intuition_protos.h>
#include <clib/exec_protos.h>
#include <clib/dos_protos.h>
#include <clib/gadtools_protos.h>
#include <clib/graphics_protos.h>
#include <clib/utility_protos.h>
#include <math.h>

/**********************
 * Ami-X Include File *
 **********************/

#include "sc:ae/doorheader.h"
#include "sc:ae/glue.h"

/*******************
 * Program Include *
 *******************/

#include "Comment_protos.h"
#include "Comment_Disc_protos.h"
#include "Comment_Init_protos.h"
#include "Comment_Select_protos.h"
#include "Comment_Routines_protos.h"
#include "Comment_Stats_protos.h"
#include "Comment_Header_protos.h"

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

//#define MAX_ON_SCREEN	6

#define EXIT_SILENTLY   0
#define MEMORY_ERROR    1
#define EXIT_REGULAR_C  2
#define GENERAL_ERROR	3
#define LEAVE_COMMENT	4

#define STRICT_COMPARE	0
#define FLEX_COMPARE		1

#define CONFIG_VERSION	"KC11"

#define CUTCR(str)  if(strlen(str)>=1) str[strlen(str)-1] = 0x00;

/************************************************************************
  STRUCTURE DECLARATIONS <> struct general   -> General storage struct
                            struct receiver  -> Information about rec.
									 struct USER		-> /X user.data structure
 ************************************************************************/

struct general
{
   BYTE  gn_boardname[80];       // Name of BBS
   BYTE  gn_confname[32];        // Name of current conference
   BYTE  gn_username[32];        // Name of user who is using the door
   BYTE  gn_doorlocation[128];   // Path to location of door
   BYTE  gn_errormessage[70];    // Error message
	BYTE	gn_header[ 200 ];			// Path to header file
	int	gn_total_users;		   // How many lines per use on-screen?
	int	gn_view_access;			// Minimum access level for viewing
	                              // the commentistics
};
	
struct receiver
{
	USHORT rc_slotnumber;         // Slotnumber of user
	BYTE  rc_knownas[32];         // Comment alias of receiver
	BYTE  rc_info[80];				// Info line about receiver
	BYTE  rc_comments[128];			// Location of comment list
                                 // 0x00 = No Comment(s)
	USHORT rc_min_acs;				// Min. access level that a user
	                              // needs to even see this commenteer
	
	long  rc_msg_received;        // Number of messages received
	long  rc_last_msg;            // Date of last messages written to
                                 // receiver
	USHORT rc_last_user;          // Slotnumber of user who last wrote
                                 // receiver a message
};

struct receiver_node
{
	struct Node	nn_Node;			   // System structure node

	USHORT rc_slotnumber;         // Slotnumber of user
   BYTE  rc_realname[32];        // Users's real name
	BYTE  rc_knownas[32];         // Comment alias of receiver
	BYTE  rc_info[80];				// Info line about receiver

	BYTE  rc_comments[128];			// Location of comment list
                                 // 0x00 = No Comment(s)
	USHORT rc_min_acs;				// Min. access level that a user
	                              // needs to even see this commenteer

	long  rc_msg_received;        // Number of messages received
	long  rc_last_msg;            // Date of last messages written to
                                 // receiver
	USHORT rc_last_user;          // Slotnumber of user who last wrote
                                 // receiver a message
	USHORT rc_number;					// Number of user in list on screen
};

struct USER 
{
   char    Name[31],Pass[9],Location[30],PhoneNumber[13];
   USHORT  Slot_Number;
   USHORT  Sec_Status, RatioType, Ratio, CompType, Messages_Posted;
   ULONG   NewSinceDate, CRCPassword, ConfRead2, ConfRead3;
   UWORD   vote_yesno;
   UWORD   voted;
   UWORD   reserved;
   UWORD   Area;
   UWORD   XferProtocol, Filler2;
   UWORD   Lcfiles, BadFiles; 
   ULONG   AccountDate;
   UWORD   ScreenType, EditorType;
   char    Conference_Access[10];
   USHORT  Uploads, Downloads, ConfRJoin, Times_Called;
   long    Time_Last_On, Time_Used, Time_Limit, Time_Total;
   ULONG   Bytes_Download, Bytes_Upload, Daily_Bytes_Limit, Daily_Bytes_Dld;
   char    Expert;
   /* Note ConfYM = the last msg you actually read, ConfRead is the same ?? */
   ULONG   ConfYM1, ConfYM2, ConfYM3, ConfYM4, ConfYM5, ConfYM6, ConfYM7,
           ConfYM8, ConfYM9;
   long    BeginLogCall;
   UBYTE   Protocol, UUCPA, LineLength, New_User;
};

#ifdef KILLER_COMMENT_MAIN
   struct general    	*gn_ptr  = NULL;
	struct receiver_node	*rc_node = NULL;

   // This is what we need to read icons:
   struct Library    *IconBase=NULL;
   struct DiskObject *dobj;
   char   *tooltype, **toolarray;

	UBYTE VER[]="$VER: KiLLER-Comment 1.4.2 (21-Dec-95)";

	char  bbs_location[128];
	BOOL	line_separator = FALSE;

	int	MAX_ON_SCREEN;

	struct MinList        KC_Users0List;

#else

   extern struct general    *gn_ptr;
	extern struct receiver_node	*rc_node;

   // This is what we need to read icons:
   extern struct	Library    *IconBase;
   extern struct	DiskObject *dobj;
   extern char		*tooltype, **toolarray;

	extern char	bbs_location[128];
	extern BOOL	line_separator;

	extern int	MAX_ON_SCREEN;

   extern struct MinList        KC_Users0List;

#endif
