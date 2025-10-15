#ifndef KC_GUI_H
#define KC_GUI_H

#include "KiLLER_CG_Standard_protos.H"
#include "KiLLER_Comment_Prefs_protos.H"
#include "KiLLER_Comment_GUI.H"

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
#include <clib/asl_protos.h>

#define EXIT_SILENTLY   0
#define EXIT_POLITELY   1
#define MEMORY_ERROR    2

#define MAIN_WINDOW		1
#define USER_WINDOW		2

#define CONFIG_VERSION	"KC11"

#define CUTCR(str)  if(strlen(str)>=1) str[strlen(str)-1] = 0x00;

/************************************************************************
  STRUCTURE DECLARATIONS <> struct general   -> General storage struct
                            struct receiver  -> Information about rec.
									 struct USER		-> /X user.data structure
									 struct user_node -> User info (selecting one)
 ************************************************************************/

struct general
{
   BYTE  gn_boardname[80];       // Name of BBS
   BYTE  gn_confname[32];        // Name of current conference
   BYTE  gn_username[32];        // Name of user who is using the door
   BYTE  gn_doorlocation[128];   // Path to location of door
   BYTE  gn_errormessage[70];    // Error message
};

struct RECEIVER
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

	USHORT rc_slotnumber;          // Slotnumber of user
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
	USHORT rc_last_user;           // Slotnumber of user who last wrote
                                 // receiver a message
};

// This structure is needed for the sorting routine
struct user_node
{
	struct Node	nn_Node;			   // System structure node

	char	Name[31];					// User name
	USHORT	Slot_Number;				// User slot number
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

/***********************************************************************
	EaseStruct DECLARATIONS <>	DeleteTwitList		-> Delete Twit List ?
										DeleteCommentList	-> Delete Comment List ?
										NoDeleteSysop		-> Can't delete sysop
 ***********************************************************************/

#ifdef KILLER_COMMENT_PREFS

struct EasyStruct NoClearList =
   {
   sizeof(struct EasyStruct),
   0,
   "KiLLER Remark",
   "        It's impossible to clear the list.\n There should always be one person to write to.",
   "OK"
   };

struct EasyStruct CouldNotOpen =
   {
   sizeof(struct EasyStruct),
   0,
   "KiLLER Error",
   " Couldn't open temporary output file! ",
   "SHiT"
   };

struct EasyStruct NoMessages =
   {
   sizeof(struct EasyStruct),
   0,
   "KiLLER Notice",
   " No messages have been written yet! ",
   "OK"
   };

struct EasyStruct ClearStats =
   {
   sizeof(struct EasyStruct),
   0,
   "KiLLER Question",
   " Clear all statistical info of this user? ",
   "YES|NO"
   };

#endif

#ifdef KILLER_CG_STANDARD

struct EasyStruct FileAlreadyExists =
   {
   sizeof(struct EasyStruct),
   0,
   "KiLLER Question",
   " Save over old preferences? ",
   "YES|NO"
   };

#endif

#ifdef KILLER_COMMENT_PREFS

   struct general    *gn_ptr  = NULL;
   struct receiver   *rc_ptr  = NULL;
   struct receiver   *rc_ptr2 = NULL;
	struct receiver_node	*rc_node = NULL;
	struct receiver_node	*rc_node2 = NULL;
	struct user_node	*unode=NULL;

   // This is what we need to read icons:
   struct Library    *IconBase=NULL;
   struct DiskObject *dobj;
   char   *tooltype, **toolarray;

	char	acp_location[128],
			bbs_location[128],
			kc_location[128],
			sysop_name[31],
			kc_viewer[128];

   struct MinList        KC_Users0List;
   struct MinList        KC_SELECT_USER1List;

#else

   extern struct general    *gn_ptr;
   extern struct receiver   *rc_ptr;
   extern struct receiver   *rc_ptr2;
	extern struct receiver_node	*rc_node;
	extern struct receiver_node	*rc_node2;
	extern struct user_node	*unode;

   // This is what we need to read icons:
   extern struct	Library    *IconBase;
   extern struct	DiskObject *dobj;
   extern char		*tooltype, **toolarray;

	extern char  acp_location[128], bbs_location[128], kc_location[128], sysop_name[31], kc_viewer[128];

   extern struct MinList        KC_Users0List;
   extern struct MinList        KC_SELECT_USER1List;

#endif



#endif
