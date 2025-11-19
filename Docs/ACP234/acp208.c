
/*
 * DH0:TPL/ACP.c
 *
 * MACHINE GENERATED
 * Dec 03 1991 21:16:29
 */

#include "aedefines.h"
#include <exec/exec.h>
#include <dos/dos.h>
#include <dos/dosextens.h>
#include <workbench/workbench.h>
#include <workbench/startup.h>
#include <graphics/gfx.h>
#include <clib/icon_protos.h>
#include <clib/dos_protos.h>
#include <clib/exec_protos.h>
#include <clib/intuition_protos.h>
#include <clib/graphics_protos.h>
#include <clib/alib_protos.h>
#include "ACLVL.H"
#include "Semis.h"
#include "includes/date_protos.h"
#include "includes/acpcycle_protos.h"
#include "includes/IconInfo_protos.h"
#include "includes/mymenus_protos.h"
#include "includes/parse_protos.h"
#include "includes/semis_protos.h"
#include "includes/sercon_protos.h"
#include "includes/StartProcess_protos.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ACP_defs208.h"
void LoadOldConfig(void);
#define JH_CHATON 5
#define JH_CHATOFF 4
#define JH_QUIETON 7
#define JH_QUIETOFF 6
#define JH_AUTOCOMMAND 8
struct GadToolsBase *GadToolsBase=NULL;
struct IntuitionBase *IntuitionBase=NULL;
struct Library *IconBase;
int atoileft(char str[]);
struct Menu *EWinM=NULL;
void Backup(char *str,int cycle);
void Restrict(char *str);
void ShowQuiet(int i);
struct JHMessage
{
 struct Message Msg;
  char String[200];
  int Data;
  int Command;
  int NodeID;
  int LineNum;
  unsigned long signal;
  struct Process *task;
  APTR *Semi;
  APTR Filler1;
  APTR Filler2;
};
//struct JHMessage *Jhmsg;
#define JH_UPDATE 1
#define JH_DOWNLOAD 2
#define JH_UPLOAD 3
Prototype void    FreeGads(void);
Prototype Gadget *InitGads(Screen *);
Prototype void    drawborders(void);
int QuietNode[10];
ULONG BBSStack;
char StartUpLocation[200];
char PortName[]=  "AE.Master" ;
#define SOPTLOOP for(i=p.ns;i<=p.ne;i++) if(Sopt[i]!=NULL)
#define CMDLOOP for(i=p.ns;i<=p.ne;i++) if(Cmds[i]!=NULL)
struct UserData {
	char	Name[31],
		Pass[9],
		Location[30],
		PhoneNumber[13];
	USHORT	Slot_Number;
	USHORT	Sec_Status,
		Sec_Board,		/* File or Byte Ratio */
		Sec_Library,		/* Ratio              */
		Sec_Bulletin,		/* Computer Type      */
		Messages_Posted;
	ULONG	NewSinceDate,
		ConfRead1,
		ConfRead2,
		ConfRead3,
		ConfRead4,
		ConfRead5,
		ConfRead6,
		ConfRead7,
		ConfRead8,
		ConfRead9;
	char	Conference_Access[10];
	USHORT	Uploads,
		Downloads,
		ConfRJoin,
		Times_Called;
	long	Time_Last_On,
		Time_Used,
		Time_Limit,
		Time_Total;
	ULONG	Bytes_Download,
		Bytes_Upload,
		Daily_Bytes_Limit,
		Daily_Bytes_Dld;
	char	Expert;
	ULONG	ConfYM1,
		ConfYM2,
		ConfYM3,
		ConfYM4,
		ConfYM5,
		ConfYM6,
		ConfYM7,
		ConfYM8,
		ConfYM9;
	long    BeginLogCall;
	UBYTE	Protocol,
			UUCPA,
			LineLength,
			New_User;
	};
 struct UserData User_Data = {
	"User Name-------------------30",
	"Pass---8",
	"Location-------------------29",
	"800-555-1212",
	1,255,0,0,0,0,0,0,
	0L,0L,0L,0L,0L,0L,0L,0L,
	"X________",0,0,1,0,0L,0L,9600L,9600L,0L,1L,0L,0L,
	'A',0L,0L,0L,0L,0L,0L,0L,0L,0L,0L,0,0,23,0
	};


struct ColorSpec ColorSpecs[] = 
 { 
   { 0,0,0,0 },
   { 1,0xf,0x0,0x0 },
   { 2,0x0,0xf,0x0 },
   { 3,0xf,0xf,0x0 },
   { 4,0x0,0x0,0xf },
   { 5,0xf,0x0,0xf },
   { 6,0x0,0xf,0xf },
   { 7,0xf,0xf,0xf },
   { -1,0,0,0 } };
struct ColorSpec AmigaSpecs[] = 
 { 
   { 0,0,0,0 },
   { 1,0xf,0xf,0xf },
   { 2,0x0,0xf,0x0 },
   { 3,0xf,0xf,0x0 },
   { 4,0x0,0x0,0xf },
   { 5,0xf,0x0,0xf },
   { 6,0x0,0xf,0xf },
   { 7,0xf,0x0,0x0 },
   { -1,0,0,0 } };
struct ColorSpec *Colors;
struct UserKeys {
	char	UserName[31];
	long	Number;
	UBYTE New_User;
	char	Pad[19];
	};
 struct UserKeys User_Keys = {
	"User Name-------------------30",
	0L,0,"Padding---------19"
	};

int Nodes[11];
int suspend[11];
int ShowAbout=0;
int EdgeX,EdgeY;
int Width=0,Height=0;
int Theight=0;
int DrawPen = 1; 
int Chat[11];  /*** Default color for nonchat ***/
int TChat[11];
int ActiveNodes=0;
void strlim(char *,char *,int);
void LoadOldConfig(void);
#define NODECONFIG 1
#define RUNMCP 2
#define LAST_UPLOADS 1
#define LAST_DOWNLOADS 2
#define LAST_CALLERS 0
int TopOption=0;
void GetCmds(int i);
Prototype Gadget *Gad_Node_0;
Prototype Gadget *Gad_Node_1;
Prototype Gadget *Gad_Node_2;
Prototype Gadget *Gad_Node_3;
Prototype Gadget *Gad_Node_4;
Prototype Gadget *Gad_Node_5;
Prototype Gadget *Gad_Node_6;
Prototype Gadget *Gad_Node_7;
Prototype Gadget *Gad_Node_8;
Prototype Gadget *Gad_Node_9;
Prototype Gadget *Gad_Action;
Prototype Gadget *Gad_User;
Prototype Gadget *Gad_Location;
Prototype Gadget *Gad_ExitNode;
Prototype Gadget *Gad_NodeOffHook;
Prototype Gadget *Gad_InstantLogin;
Prototype Gadget *Gad_AEShell;
Prototype Gadget *Gad_ToggleChat;
Prototype Gadget *Gad_SysopLogin;
Prototype Gadget *Gad_NRAMS;
Prototype Gadget *Gad_ReserveNode;
Prototype Gadget *Gad_Accounts;
Prototype Gadget *Gad_InitModem;
Prototype Gadget *Gad_LocalLogin;
Prototype Gadget *Gad_MCP;
Prototype Gadget *Gad_NodeConfig;
Prototype Gadget *Gad_NodeChat;
Prototype Gadget *Gad_SaveWin;
Prototype Gadget *Gad_Control;
Prototype Gadget *Gad_Tops;
Prototype Gadget *Gad_TopsBox;
Prototype Gadget *Gad_Short;
Prototype List   List_Tops;

Prototype NewGadget NGAry[34];
Prototype Gadget    *EGList;
Prototype Window    *EWin;
Prototype Window    *CWin;
Prototype struct    VisualInfo *VisInfo;
struct    VisualInfo *VisInfo;
Window    *EWin=NULL;
struct Commands {
	UBYTE	AcLvl[100],
		SerDevUnit;
	char	SerDev[40],
		NEW_UserPW[15];
	long	OpeningBaud;
	BYTE	TaskPri;
	char	ConfName[9][60],
		ConfLoc[9][60],
		BBSName[41],
		BBSLoc[41],
		SysopName[41];
	UBYTE	PSAcLvl[6],
		PSRType[6],
		PSRatio[6];
	long	PSDBytes[6],
		PSTime[6];
	char	PSCnfAc[6][10],
		MInit[101],
		MReset[31],
		MRing[31],
		MAnswer[31],
		MC300[31],
		MC1200[31],
		MC2400[31],
		MC4800[31],
		MC9600[31],
		MC19200[31];
	short	NumConf;
	char	SysPass[31],
		RemotePass[31];
	USHORT	BaudTimes[10];
	char	Pad[18];
	};
int BM[20];
struct StartOption
{
  SHORT LeftEdge;
  SHORT TopEdge;
  SHORT Width;
  SHORT Height;
  int BitPlanes;
  BOOL StatBar;
  BOOL Interlace;
  BOOL DupeCheck;
  BOOL QLogon;
  BOOL TakeCredits;
  BOOL SeenIt;
  BOOL TrapDoor;
  BOOL Iconify;
  BOOL RadBoogie;
  BOOL A2232;
  BOOL Toggles[20];
  char Logoff[80];
  char ShutDown[80];
  char CycleLock[80];
  char RamPen[80];
  char BBSConfig[80];
  char FilesNot[80];
  char UserData[80];
  char UserKey[80];
  char OffHook[80];
  char PubScreen[80];
  APTR MasterSemi;
  APTR SingleSemi;
};

struct BUTTON
{
  char Text[100];
  char Command[100];
  BOOL Type;
} Buttons[20];

struct Commands *Cmds[11];
struct StartOption *Sopt[11];
char ValError[100];
int Validate(void);
int TLock(char *str);
void strleft(char *str,char *str1);
#define VALERROR  else { strcpy(ValError,temp); return(0); }
#define FILEERROR { strcpy(ValError,temp); return(0); }

struct NewMenu *EWinMenu;

int Button=FALSE;
int ButtonID=-1; /**** Nutton to be processed when Node Button is selected*/
BOOL ShortUp=FALSE;
UBYTE SetOriText[15][100];/** Original Text for 15 control buttons **/
 
struct ACPMessage
{
  struct Message Msg;
  char User[50];
  char Location[50];
  char Action[50];
  char Baud[10];
  int Data;
  int Command;
  int Node;
  int LineNum;
  struct Commands *Cmds;
  struct StartOption *Sopt;
} *msg,*cpymsg;

long signals=NULL;
char mybbslocation[40];
struct MsgPort *mp;
struct GfxBase *GfxBase=NULL;
BOOL ACPError=FALSE;
void OpenMaster(void); /*** Opens Intereface to AmiExpress ***/
void ShutDownMaster(void); /*** Closes Interface to AmiExpress ***/
void HandleEditGadget(IMsg *im,short ig); /** HandleRoutine for control gadgets ***/
void CallNode(int node,int); /** Send message to AEServer port for specific node ***/
void UpdateNode(char *name,char *location,char *action,char *baud,int node);
int CheckConfigNode(char str[]);

void ShowNodes(void); /** shows users on nodes every refresh **/
void ClearUsers(void);/** Initialize various variables **/
void LoadScreen(void);/** load coordinates for screen when powering up **/
void ScreenSave(void);/** Save window coordinates **/
void ReadStartUp(void); /** Read ACP.Startup from the S: directory **/
void DoControl(int node); /** Implement gadgets **/
void CheckMasterSig(long signals); /** Check for signal from nodes **/
void sr(char *str); /** Strips ascii values less than 33 from trailing strings **/
void SetTheGads(void); /** Set default text for the gadgets **/
void DoButton(int B,int node); /** Do Custom buttons or nuttons **/
void ToggleGads(); /** Toggle 15 control gadgets between custom gadgets **/ 

int Control = 0; /** Control Button to process **/
int Short=0;/** Set Short screen to off **/

char Blank[]=  "                                                                    ";

struct User
{
  char User[50];
  char Location[50];
  char Action[50];
  char Baud[10];
  int Active;
  int action;
};

struct User Users[10]; /*** structure to hold node info for each node ***/

NewGadget NGAry[34] = {
 
   {
    GLEF_SysopLogin, GTOP_SysopLogin, GWID_SysopLogin, GHEI_SysopLogin,
    "Sysop Login",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_SysopLogin,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_InstantLogin, GTOP_InstantLogin, GWID_InstantLogin, GHEI_InstantLogin,
    "Instant Login",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_InstantLogin,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
{
    GLEF_AEShell, GTOP_AEShell, GWID_AEShell, GHEI_AEShell,
    "AEShell",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_AEShell,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
 {
    GLEF_ToggleChat, GTOP_ToggleChat, GWID_ToggleChat, GHEI_ToggleChat,
    "Toggle Chat",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_ToggleChat,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
{
    GLEF_ExitNode, GTOP_ExitNode, GWID_ExitNode, GHEI_ExitNode,
    "Exit Node",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_ExitNode,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
{
    GLEF_LocalLogin, GTOP_LocalLogin, GWID_LocalLogin, GHEI_LocalLogin,
    "Local Login",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_LocalLogin,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
{
    GLEF_ReserveNode, GTOP_ReserveNode, GWID_ReserveNode, GHEI_ReserveNode,
    "Reserve Node",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_ReserveNode,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  
{
    GLEF_Accounts, GTOP_Accounts, GWID_Accounts, GHEI_Accounts,
    "Accounts",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_Accounts,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_InitModem, GTOP_InitModem, GWID_InitModem, GHEI_InitModem,
    "Init Modem",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_InitModem,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
 {
    GLEF_NodeOffHook, GTOP_NodeOffHook, GWID_NodeOffHook, GHEI_NodeOffHook,
    "Node(offhook)",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_NodeOffHook,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_MCP, GTOP_MCP, GWID_MCP, GHEI_MCP,
    "Quiet Node",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_MCP,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_NodeConfig, GTOP_NodeConfig, GWID_NodeConfig, GHEI_NodeConfig,
    "Config Node",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_NodeConfig,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_NodeChat, GTOP_NodeChat, GWID_NodeChat, GHEI_NodeChat,
    "Node Chat",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_NodeChat,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_SaveWin, GTOP_SaveWin, GWID_SaveWin, GHEI_SaveWin,
    "Save Win",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_SaveWin,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
{
    GLEF_NRAMS, GTOP_NRAMS, GWID_NRAMS, GHEI_NRAMS,
    "Set NRAMS",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_NRAMS,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_Flip, GTOP_Flip, GWID_Flip, GHEI_Flip,
    "X",
    NULPTR,
    GAD_Flip,
    PLACETEXT_IN | NG_HIGHLABEL,
    NULPTR,
    NULPTR,
  },
  {
    GLEF_Control, GTOP_Control, GWID_Control, GHEI_Control,
    "Ami Express Master Control",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_Control,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
 {
    GLEF_Action, GTOP_Action, GWID_Action, GHEI_Action,
    "Action",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_Action,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_User, GTOP_User, GWID_User, GHEI_User,
    "User",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_User,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_Location, GTOP_Location, GWID_Location, GHEI_Location,
    "Location",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_Location,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_Baud, GTOP_Baud, GWID_Baud, GHEI_Baud,
    "Baud",
     NULPTR,
     GAD_Baud,
     PLACETEXT_IN | NG_HIGHLABEL,
     NULPTR,
     NULPTR,
  },
 
  {
    GLEF_Tops, GTOP_Tops, GWID_Tops, GHEI_Tops,
    NULPTR,		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_Tops,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    BLEF_TopsBox, BTOP_TopsBox, BWID_TopsBox, BHEI_TopsBox,
    NULPTR,		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_TopsBox,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
{
    GLEF_Short, GTOP_Short, GWID_Short, GHEI_Short,
    "/X",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_Short,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
 {
    GLEF_0, GTOP_0, GWID_0, GHEI_0,
    "Node 0",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_Node_0,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_1, GTOP_1, GWID_1, GHEI_1,
    "Node 1",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_Node_1,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_2, GTOP_2, GWID_2, GHEI_2,
    "Node 2",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_Node_2,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_3, GTOP_3, GWID_3, GHEI_3,
    "Node 3",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_Node_3,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_4, GTOP_4, GWID_4, GHEI_4,
    "Node 4",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_Node_4,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_5, GTOP_5, GWID_5, GHEI_5,
    "Node 5",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_Node_5,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_6, GTOP_6, GWID_6, GHEI_6,
    "Node 6",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_Node_6,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_7, GTOP_7, GWID_7, GHEI_7,
    "Node 7",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_Node_7,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_8, GTOP_8, GWID_8, GHEI_8,
    "Node 8",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_Node_8,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
  {
    GLEF_9, GTOP_9, GWID_9, GHEI_9,
    "Node 9",		/* UBYTE	*ng_GadgetText	*/
    NULPTR,		/* struct TextAttr *ng_TextAttr	*/
    GAD_Node_9,	/* UWORD	ng_GadgetID	*/
    PLACETEXT_IN | NG_HIGHLABEL,	/* ULONG	ng_Flags	*/
    NULPTR,		/* APTR  	ng_VisualInfo	*/
    NULPTR,		/* APTR  	ng_UserData	*/
  },
};

Gadget *Gad_Node_0;

Gadget *Gad_Node_1;

Gadget *Gad_Node_2;

Gadget *Gad_Node_3;

Gadget *Gad_Node_4;

Gadget *Gad_Node_5;

Gadget *Gad_Node_6;

Gadget *Gad_Node_7;

Gadget *Gad_Node_8;

Gadget *Gad_Node_9;

Gadget *Gad_Action;

Gadget *Gad_User;

Gadget *Gad_Location;

Gadget *Gad_Baud;

Gadget *Gad_ExitNode;

Gadget *Gad_NodeOffHook;

Gadget *Gad_InstantLogin;

Gadget *Gad_AEShell;

Gadget *Gad_ToggleChat;

Gadget *Gad_SysopLogin;

Gadget *Gad_NRAMS;

Gadget *Gad_ReserveNode;

Gadget *Gad_Accounts;

Gadget *Gad_InitModem;

Gadget *Gad_LocalLogin;

Gadget *Gad_MCP;

Gadget *Gad_NodeConfig;

Gadget *Gad_NodeChat;

Gadget *Gad_SaveWin;

Gadget *Gad_Flip;

Gadget *Gad_Control;

Gadget *Gad_Tops;

Gadget *Gad_TopsBox;
Gadget *Gad_Short;
char   *StatAry_Tops[] = {
  "Last Five Callers",
  "Last Five Uploads",
  "Last Five Downloads",
  
  NULPTR
};
char **Ary_Tops	= StatAry_Tops;

Gadget *EGList;

/* ***** InitGads ***** */
Gadget *
InitGads(Scr)
  Screen *Scr;
{
  Gadget *gad;
  short i;
  static BOOL again=FALSE;
  NewGadget *ng;
  EGList = NULPTR;
  if(!again)
  {
    if ((VisInfo = GetVisualInfo(Scr, TAG_END)) == NULL)
    return(NULPTR);

  for (i = 0, ng = NGAry;
       i < sizeof(NGAry)/sizeof(NGAry[0]);
       ++i, ++ng)
  {
    ng->ng_VisualInfo = VisInfo;
    ng->ng_TextAttr   = Scr->Font;
  }
  }
  if ((gad = CreateContext(&EGList)) == NULL)
    return(NULPTR);
  

  Gad_Action	= gad = 
	CreateGadget(    TEXT_KIND, gad, NG_Action,
	GTTX_Border,       2,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  Gad_User	= gad = 
	CreateGadget(    TEXT_KIND, gad, NG_User,
	GTTX_Border,       2,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  Gad_Location	= gad = 
	CreateGadget(    TEXT_KIND, gad, NG_Location,
	GTTX_Border,       2,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);
  
  Gad_Baud = gad = 
     CreateGadget(    TEXT_KIND, gad, NG_Baud,
     GTTX_Border,       2,
     TAG_END);
  
  if(gad==NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_ExitNode].ng_TopEdge +=-110+(Theight*11);
  Gad_ExitNode	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_ExitNode, 
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_NodeOffHook].ng_TopEdge +=-110+(Theight*11);
  Gad_NodeOffHook	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_NodeOffHook, 
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_InstantLogin].ng_TopEdge +=-110+(Theight*11);
  Gad_InstantLogin	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_InstantLogin,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_AEShell].ng_TopEdge +=-110+(Theight*11);
  Gad_AEShell	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_AEShell, 
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_ToggleChat].ng_TopEdge +=-110+(Theight*11);
  Gad_ToggleChat	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_ToggleChat,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_SysopLogin].ng_TopEdge +=-110+(Theight*11);
  Gad_SysopLogin	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_SysopLogin,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_NRAMS].ng_TopEdge +=-110+(Theight*11);
  Gad_NRAMS	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_NRAMS, 
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_ReserveNode].ng_TopEdge +=-110+(Theight*11);
  Gad_ReserveNode	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_ReserveNode, 
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_Accounts].ng_TopEdge +=-110+(Theight*11);
  Gad_Accounts	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_Accounts,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_InitModem].ng_TopEdge +=-110+(Theight*11);
  Gad_InitModem	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_InitModem, 
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_LocalLogin].ng_TopEdge +=-110+(Theight*11);
  Gad_LocalLogin	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_LocalLogin,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_MCP].ng_TopEdge +=-110+(Theight*11);
  Gad_MCP	= gad = 	CreateGadget(  BUTTON_KIND, gad, NG_MCP, 
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_NodeConfig].ng_TopEdge +=-110+(Theight*11);
  Gad_NodeConfig	= gad = 	CreateGadget(  BUTTON_KIND, gad, NG_NodeConfig, 
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_NodeChat].ng_TopEdge +=-110+(Theight*11);
  Gad_NodeChat	= gad = 	CreateGadget(  BUTTON_KIND, gad, NG_NodeChat,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_SaveWin].ng_TopEdge +=-110+(Theight*11);
  Gad_SaveWin	= gad = 	CreateGadget(  BUTTON_KIND, gad, NG_SaveWin,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_Flip].ng_TopEdge += -110+(Theight*11);
   Gad_Flip= gad = CreateGadget( BUTTON_KIND, gad, NG_Flip,
     GTTX_Border,       2,
     TAG_END);

   if(gad ==NULL)
     return(NULPTR);

  if(!again)NGAry[GAD_Control].ng_TopEdge +=-110+(Theight*11);
  Gad_Control	= gad = 	CreateGadget(    BUTTON_KIND, gad, NG_Control,
	GTTX_Border,       2,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_Tops].ng_TopEdge +=-110+(Theight*11);
  Gad_Tops	= gad = 	CreateGadget(   CYCLE_KIND, gad, NG_Tops,
	GTCY_Labels,       Ary_Tops,
	GTCY_Active,       TopOption,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  if(!again)NGAry[GAD_TopsBox].ng_TopEdge +=-110+(Theight*11);
  Gad_TopsBox	= gad = 	CreateGadget(    BUTTON_KIND, gad, NG_TopsBox,
	GTTX_Border,       2,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

Gad_Short	= gad = 	CreateGadget(  BUTTON_KIND, gad, NG_Short,
	TAG_END);

  if (gad == NULL)
    return(NULL);
if(Nodes[0])
  {
    Gad_Node_0	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_Node_0,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

  }
if(Nodes[1])
{
  Gad_Node_1	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_Node_1,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

}
if(Nodes[2])
{
  Gad_Node_2	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_Node_2,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

}
if(Nodes[3])
{
  Gad_Node_3	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_Node_3,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

}
if(Nodes[4])
{
  Gad_Node_4	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_Node_4,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

}
if(Nodes[5])
{
  Gad_Node_5	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_Node_5,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

}
if(Nodes[6])
{
  Gad_Node_6	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_Node_6,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

}
if(Nodes[7])
{
  Gad_Node_7	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_Node_7,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

}
if(Nodes[8])
{
  Gad_Node_8	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_Node_8,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

}
if(Nodes[9])
{
  Gad_Node_9	= gad = 
	CreateGadget(  BUTTON_KIND, gad, NG_Node_9,
	TAG_END);

  if (gad == NULL)
    return(NULPTR);

}
 
  again=TRUE;
  return(EGList);
}
int ALine=0;
WORD DIM[5]= { 1,1,270,11 }; /*** Dimensions of ZIP window default ***/
/*  main function to test gadgets  */
long MasterSig; /*** storage for our ports address ***/
Screen *Scr; /*** Pointer to our screen ***/
Gadget *gadgets;
char StartNode[11][80];/*** Node startup scripts ***/
BOOL NodeIdle[11];
BOOL StartUp=FALSE;/*** Set startup scripts to none ***/
BOOL ZipOn=FALSE;/*** Turn ZIPPED window off ***/ 
int notDone=1;
BOOL Down[11];
UBYTE PublicName[200];
UWORD Pens[9];
extern char *MyVerStr;
extern void myrequest(char *s);
int DoMultiCom;
int
main(int argc, char *argv[])
{
  MenuItem *ALZMENU;
  MenuItem *ALZMENU2;
  
  BPTR olddir;
  struct WBStartup *argmsg;
  struct WBArg *wb_arg;
  struct AppMessage *appmsg;
  char IconStartName[200];
  LONG ktr;
  int newscreen=0;
  struct Screen *tempscreen;
  ULONG ScreenModeID;
  IMsg *im;
  int num;
  char Version[200];
  long WindowSig; 
  int i;
  strcpy(mybbslocation,"");
  strcpy(PublicName,"");
  strcpy(StartUpLocation,"S:ACP.STARTUP");
  Colors=(struct ColorSpec *)&AmigaSpecs;
  Pens[DETAILPEN]=3;
  Pens[BLOCKPEN]=4;
  Pens[TEXTPEN]=6; 
  Pens[SHINEPEN]=1;
  Pens[SHADOWPEN]=0;
  Pens[FILLPEN]=4;
  Pens[FILLTEXTPEN]=3;
  Pens[BACKGROUNDPEN]=4;
  Pens[HIGHLIGHTTEXTPEN]=7;
  

  IntuitionBase=(struct IntuitionBase *)OpenLibrary("intuition.library",0L);
  GadToolsBase=(struct GadToolsBase *)OpenLibrary("gadtools.library",0L);
  IconBase=OpenLibrary("icon.library",0L);
  GfxBase=(struct GfxBase *)OpenLibrary("graphics.library",0L);

 
  if(argc==0)
  {
    argmsg=(struct WBStartup *)argv;
    wb_arg=argmsg->sm_ArgList;
    for(ktr=0;ktr<argmsg->sm_NumArgs; ktr++,wb_arg++)
    {
      if(NULL!=wb_arg->wa_Lock)
      {  olddir=CurrentDir(wb_arg->wa_Lock); strcpy(IconStartName,wb_arg->wa_Name);
         CurrentDir(olddir);
      }
    }
  
  }
  else {  if(argc==2) strcpy(StartUpLocation,argv[1]); sr(StartUpLocation); }
    for(i=0;i<10;i++)
    {  
      Chat[i]=1;
      Down[i]=FALSE;
      TChat[i]=0;
      Cmds[i]=NULL;
      Sopt[i]=NULL;
      Nodes[i]=0;
      QuietNode[i]=0;
    }
   
    if(!FindPort("AE.Master"))
    {
      OpenMaster();
      ClearUsers();
      InitCycles();
      DoMultiCom=0;
      ReadStartUp();
      
      if(ACPError)
      {
        ShutDownMaster();
        goto TheEnd;
      }
      if(!Validate())
      {
        ShutDownMaster();
        goto TheEnd;
      }
      Theight +=1;
      EdgeX=WLEF; EdgeY=WTOP; Width=WWID; Height=WHEI;
      Height +=-110 +(Theight*11);
      LoadScreen();
  
      msg=(struct ACPMessage *)AllocMem(sizeof(struct ACPMessage),MEMF_PUBLIC|MEMF_CLEAR);
      if(PublicName[0]=='\0') Scr=(Screen *)LockPubScreen(NULL);
      else
      {
        Scr=(Screen *)LockPubScreen(PublicName);
        if(Scr==NULL) 
        { 
          tempscreen=LockPubScreen(NULL);
          ScreenModeID=GetVPModeID(&(tempscreen->ViewPort));
          newscreen=1; 
          if(Colors!=(struct ColorSpec *)&AmigaSpecs)
          {
            Pens[SHINEPEN]=7;
          }
          Scr=OpenScreenTags(NULL,SA_Left,0,SA_Top,0,SA_Width,tempscreen->Width,SA_Height,tempscreen->Height,SA_Depth,3,
                        SA_Title,PublicName,SA_Colors,Colors,
                        SA_Pens,&Pens,SA_Type,PUBLICSCREEN,SA_PubName,PublicName,
                        SA_DisplayID,ScreenModeID,SA_Overscan,OSCAN_TEXT);
          UnlockPubScreen(NULL,tempscreen);

        }
      }
      if (Scr)
      {

        if(ZipOn) { i=DIM[2]; DIM[2]=Width; Width=i;
                i=DIM[3]; DIM[3]=Height; Height=i;
                i=DIM[0]; DIM[0]=EdgeX; EdgeX=i;
                i=DIM[1]; DIM[1]=EdgeY; EdgeY=i; }
        if (gadgets = InitGads(Scr))
        {
          EWinM=CreateMenus(EWinMenu,GTMN_FrontPen,1,TAG_DONE);

          i=0;
          ALZMENU2=EWinM->FirstItem;  
          while (i++!=4) {
            ALZMENU=ALZMENU2->SubItem;
            while (ALZMENU) {
              ALZMENU->Flags=(ALZMENU->Flags|HIGHNONE);         
              ALZMENU=ALZMENU->NextItem;                        
            }
            ALZMENU2=ALZMENU2->NextItem;
          }
          sprintf(Version,"AmiExpress Server %s, by \"Joseph Hodge\"",MyVerStr);
          LayoutMenus(EWinM,VisInfo,TAG_DONE);
          EWin = (Window *)OpenWindowTags(NULL,
             WA_Flags,     WFLG_DRAGBAR|
                           WFLG_DEPTHGADGET|
                           WFLG_CLOSEGADGET|
                           WFLG_NOCAREREFRESH|
                           WFLG_SMART_REFRESH|
                           WFLG_REPORTMOUSE,

             WA_IDCMP,     LISTVIEWIDCMP|
                           IDCMP_NEWSIZE|
                           IDCMP_MENUPICK|
                           IDCMP_VANILLAKEY|
                           IDCMP_RAWKEY|
                           IDCMP_GADGETUP|
                           IDCMP_CHANGEWINDOW|
                           IDCMP_REFRESHWINDOW|
                           IDCMP_CLOSEWINDOW ,
             WA_Left,      EdgeX,
             WA_Top,       EdgeY,
             WA_DetailPen, !newscreen ? 1:4,
             WA_BlockPen,  !newscreen ? 2:Pens[HIGHLIGHTTEXTPEN],
             WA_Width,     Width,
             WA_Height,    Height,
             WA_Title,     Version,
             WA_MinWidth,  270,
             WA_MinHeight, 11,
             WA_MaxWidth,  ~0,
             WA_MaxHeight, ~0,
             WA_Zoom, (APTR)&DIM,
             WA_AutoAdjust, 1,
             WA_PubScreen, PublicName[0]=='\0' ? NULL:Scr,
             WA_PubScreenFallBack, 1,
             WA_Gadgets,   gadgets,
             TAG_END );
      
          SetMenuStrip(EWin,EWinM);
          SetTheGads();
          if(PublicName[0]=='\0')
          {
             UnlockPubScreen(NULL,Scr);
        
          }else PubScreenStatus(Scr,0L);
          if (EWin)
          {
            drawborders();
            notDone = 1;
        
            GT_RefreshWindow(EWin, NULL);
            WindowSig= (1L<< EWin->UserPort->mp_SigBit);
            MasterSig= (1L<< mp->mp_SigBit);
            if(StartUp)
            {
              for(i=0;i<10;i++)
              {
                if(StartNode[i][0]!='\0')
                {
                  SetAPen(EWin->RPort,TChat[i]);
                  Move(EWin->RPort,64,26+(i*11));
                  Draw(EWin->RPort,64,26+(i*11)+6);
                  Move(EWin->RPort,63,26+(i*11));
                  Draw(EWin->RPort,63,26+(i*11)+6);
                  Move(EWin->RPort,62,26+(i*11));
                  Draw(EWin->RPort,62,26+(i*11)+6);
                  Move(EWin->RPort,61,26+(i*11));
                  Draw(EWin->RPort,61,26+(i*11)+6); 
                  if(!NodeIdle[i]){
                    if(StartProcess(&StartNode[i][0],BBSStack)) ActiveNodes +=1;}
                }
              }
            }
            while (notDone)
            {
              signals=Wait(MasterSig | WindowSig);
              if(signals&WindowSig)
                while (im = GT_GetIMsg(EWin->UserPort))
                {
                  switch (im->Class)
                  {
                    case IDCMP_CLOSEWINDOW:
                         if(!ActiveNodes){ notDone=0; break; }
                    for(i=0;i<9;i++)
                    {
                      if(StartNode[i][0]!='\0')
                      {
                        if(Users[i].action==22 && !Down[i]) { Control=SV_NODEOFFHOOK;
                                             Down[i]=TRUE;DoControl(i);}
                      else if(Users[i].action!=24) notDone=1; 
                    }
                  }
                   
                 break;
                 
            case IDCMP_REFRESHWINDOW:
            case IDCMP_CHANGEWINDOW:
              GT_BeginRefresh(EWin);
              GT_EndRefresh(EWin, TRUE);
                drawborders();
                switch(TopOption)
                {
                  case LAST_CALLERS:ShowLastUser(EWin);break;
                  case LAST_UPLOADS:ShowLastUploads(EWin);break;
                  case LAST_DOWNLOADS:ShowLastDownloads(EWin);break;
                }
                for(i=0;i<=9;i++)
                {
                   if(StartNode[i][0]!='\0')
                   {
                    SetAPen(EWin->RPort,TChat[i]);
                    Move(EWin->RPort,64,26+(i*11));
                    Draw(EWin->RPort,64,26+(i*11)+6);
                    Move(EWin->RPort,63,26+(i*11));
                    Draw(EWin->RPort,63,26+(i*11)+6);
                    Move(EWin->RPort,62,26+(i*11));
                    Draw(EWin->RPort,62,26+(i*11)+6);
                    Move(EWin->RPort,61,26+(i*11));
                    Draw(EWin->RPort,61,26+(i*11)+6); 
                   }
                 }
                ShowNodes();
              break;
            case GADGETDOWN:
            case GADGETUP:
                 HandleEditGadget(im,0); break;
            case MENUPICK:
                 if(MENUNUM(im->Code)==1)
                 {
                   i=Button; Button=0;
                   HandleEditGadget(NULL,GAD_SysopLogin+ITEMNUM(im->Code));
                   HandleEditGadget(NULL,GAD_Node_0+SUBNUM(im->Code));
                   Button=i;
                 }
                 if(MENUNUM(im->Code)==2)
                 {
                   num=ITEMNUM(im->Code);
                   i=Button; Button=1;
                   HandleEditGadget(NULL,GAD_SysopLogin+BM[num]);
                   if(Buttons[BM[num]].Type)HandleEditGadget(NULL,GAD_Node_0+SUBNUM(im->Code));
                   Button=i;
                 }
                    
            default:
              break;
            }
            GT_ReplyIMsg(im);
          }
          CheckMasterSig(signals);
        }
        ShutDownMaster();
        if(EWin->MenuStrip)
        {
            ClearMenuStrip(EWin);
            MaddRem();
        }
       
       CloseWindow(EWin);
      }
    }
    FreeGads();
    if(PublicName[0]!='\0')
    {
      if(Scr=LockPubScreen(PublicName))
      {
        Forbid();
        UnlockPubScreen(NULL,Scr);
        CloseScreen(Scr);
        Permit();
      }
    }
   }
  
  
  FreeMem(msg,sizeof(struct ACPMessage));
  
TheEnd:
  if(DoMultiCom)ShutDownSemis();
  for(i=0;i<10;i++)
  {
    if(Cmds[i]!=NULL)
      FreeMem(Cmds[i],sizeof(struct Commands));
    if(Sopt[i]!=NULL)
      FreeMem(Sopt[i],sizeof(struct StartOption));
  }
  }else  myrequest("ACP is already running.");

  CloseLibrary((struct Library *)GfxBase);
  CloseLibrary(IconBase);
  CloseLibrary((struct Library *)GadToolsBase);
  CloseLibrary((struct Library *)IntuitionBase);
  if(argc!=0) exit(0);
} 
  
 
void CheckMasterSig(long signals)
{
   char temp[100], temp1[10];int i;
   if(signals&&MasterSig)
   {
   while((cpymsg=(struct ACPMessage *)GetMsg((struct MsgPort *)mp)))             
   {
     if(cpymsg->Command==SV_START)
     {
       strcpy(cpymsg->User,mybbslocation);
       cpymsg->Cmds=(struct Commands *)Cmds[cpymsg->Node];
       cpymsg->Sopt=(struct StartOption *)Sopt[cpymsg->Node];
     }
     CopyMem(cpymsg,msg,sizeof(struct ACPMessage));
     ReplyMsg((struct Message *)cpymsg);
     switch(msg->Command)
     {
       case JH_UPDATE:
            UpdateNode(msg->User,msg->Location,msg->Action,msg->Baud,msg->Node);
            if(ShowAbout) { ShowNodes(); ShowAbout=0; }
            break;
       case JH_DOWNLOAD:
            RegLastDownloads(msg->User,msg->Node);
            sprintf(temp,"DL: %s",msg->User); sprintf(temp1,"%d",SV_NEWMSG);
            UpdateNode(temp,msg->Location,temp1,msg->Baud,msg->Node);
            if(ShowAbout) { ShowNodes(); ShowAbout=0;}
            break;
       case JH_UPLOAD:
            RegLastUploads(msg->User,msg->Node);
            sprintf(temp,"UL: %s",msg->User); sprintf(temp1,"%d",SV_NEWMSG);
            UpdateNode(temp,msg->Location,temp1,msg->Baud,msg->Node);
          
            if(ShowAbout) { ShowNodes(); ShowAbout=0;}
            break;
       case JH_CHATON: TChat[msg->Node]=1;
            SetAPen(EWin->RPort,TChat[msg->Node]);
                    Move(EWin->RPort,64,26+(msg->Node*11));
                    Draw(EWin->RPort,64,26+(msg->Node*11)+6);
                    Move(EWin->RPort,63,26+(msg->Node*11));
                    Draw(EWin->RPort,63,26+(msg->Node*11)+6);
                    Move(EWin->RPort,62,26+(msg->Node*11));
                    Draw(EWin->RPort,62,26+(msg->Node*11)+6);
                    Move(EWin->RPort,61,26+(msg->Node*11));
                    Draw(EWin->RPort,61,26+(msg->Node*11)+6); 
            break;
       case JH_CHATOFF: TChat[msg->Node]=0;
            SetAPen(EWin->RPort,TChat[msg->Node]);
                    Move(EWin->RPort,64,26+(msg->Node*11));
                    Draw(EWin->RPort,64,26+(msg->Node*11)+6);
                    Move(EWin->RPort,63,26+(msg->Node*11));
                    Draw(EWin->RPort,63,26+(msg->Node*11)+6);
                    Move(EWin->RPort,62,26+(msg->Node*11));
                    Draw(EWin->RPort,62,26+(msg->Node*11)+6);
                    Move(EWin->RPort,61,26+(msg->Node*11));
                    Draw(EWin->RPort,61,26+(msg->Node*11)+6); 
            break;
       case JH_QUIETON: QuietNode[msg->Node]=1; 
            ShowQuiet(msg->Node); break;
       case JH_QUIETOFF: QuietNode[msg->Node]=0; ShowQuiet(msg->Node); break;
       case JH_AUTOCOMMAND:
            i=Button;
            if(msg->Data<20)
            {
               Button=0; Control=0;
               if(msg->Data >=0)HandleEditGadget(NULL,GAD_SysopLogin+msg->Data);
               HandleEditGadget(NULL,GAD_Node_0+msg->Node);
            }
            else
            {
               Button=1;
               msg->Data -=20; Control=0;
               HandleEditGadget(NULL,GAD_SysopLogin+BM[msg->Data]);
                 if(Buttons[BM[msg->Data]].Type)HandleEditGadget(NULL,GAD_Node_0+msg->Node);
            }
           Button=i;
           break;
     }
   }
   }
             
}

/* ***** Do BevelBorders ***** */
void
drawborders(void)
{
/* *** Stats *** */
  DrawBevelBox(EWin->RPort, BLEF_0, BTOP_0, BWID_0, BHEI_0 -110 +(Theight*11),
	GT_VisualInfo, VisInfo,
	TAG_END);
}

/* ***** Free the Gadlist and return ***** */
void
FreeGads(void)
{
  FreeGadgets(EGList);
  if (VisInfo)
    FreeVisualInfo(VisInfo);
  VisInfo = NULL;
  EGList  = NULL;
}

//*******************************************************************
// OpenMaster - This function opens a port for the nodes to interact
//********************************************************************
void OpenMaster(void)
{
  mp=(struct MsgPort *)CreatePort(PortName,0L);
}

//*******************************************************************
//  ShutDownMaster - This function removes our Master port insuring
//  that there is no pending messages first
//*******************************************************************
void ShutDownMaster(void)
{
   while((cpymsg=(struct ACPMessage *)GetMsg((struct MsgPort *)mp)))             
   {
     CopyMem(cpymsg,msg,sizeof(struct ACPMessage));
     ReplyMsg((struct Message *)cpymsg);
   }
      DeletePort((struct MsgPort *)mp);
}

//*******************************************************************
// UpdateNode - This function determines what a user is doing based
// on input from the nodes. Then it updates the Node data
//*******************************************************************
void UpdateNode(char *name,char *location,char *action,char *baud,int node)
{
   char Action[50];
    strcpy(Action,"");
   switch(atoi(action))
   {
     case 0: strcpy(Action,"Idle            ");break;
     case 1: strcpy(Action,"Downloading     ");break;
     case 2: strcpy(Action,"Uploading       ");break;
     case 3: strcpy(Action,"Module          ");break;
     case 4: strcpy(Action,"Read/Write  Mail");break;
     case 5: strcpy(Action,"Reviewing Stats ");break;
     case 6: strcpy(Action,"Account Editing ");break;
     case 7: strcpy(Action,"Zooming Mail    ");break;
     case 8: strcpy(Action,"View Dir files  ");break;
     case 9: strcpy(Action,"Reading Bulletin");break;
     case 10:strcpy(Action,"Viewing a file  ");break;
     case 11:strcpy(Action,"Account Sequence");break;
     case 12:strcpy(Action,"Logging off     ");break;
     case 13:strcpy(Action,"Sysop Commands  ");break;
     case 14:strcpy(Action,"Dropped to Shell");break;
     case 15:strcpy(Action,"Using Emacs     ");break;
     case 16:strcpy(Action,"Joining a Conf. ");break;
     case 17:strcpy(Action,"Chatting        ");Chat[node]=1;break;
     case 18:strcpy(Action,"Reseting Node   ");break;
     case 19:strcpy(Action,"Requesting Chat ");Chat[node]=2;break;
     case 20:strcpy(Action,"Connecting      ");break;
     case 21:strcpy(Action,"Logging on      ");break;
     case 22:strcpy(Action,"Awaiting Connect");Chat[node]=1;break;
     case 23:strcpy(Action,"Scanning Mail   ");break;
     case 24:strcpy(Action,"Node Inactive   ");ActiveNodes -=1;
     /*if(ActiveNodes==0) notDone=0;*/break;
     case 25:strcpy(Action,"MultiNode Chat  ");break;
     case 26:strcpy(Action,"BBS Suspended   ");break;
     case 27:strcpy(Action,"Reserve for User");break;
     case SV_AESHELL:
             strcpy(Action,"Entered AEShell ");break;
     case SV_NEWMSG:
             strcpy(Action,name); break;
   }
   DrawPen=Chat[node];if(QuietNode[node]) DrawPen=3;
     SetAPen(EWin->RPort,DrawPen);
   if(atoi(action)!=SV_NEWMSG)
   {
      Move(EWin->RPort,69,32+(node*11));
      Text(EWin->RPort,"                              ",22);
      Move(EWin->RPort,253,32+(node*11));
      Text(EWin->RPort,"                              ",23);
   }
      Move(EWin->RPort,437,32+(node*11));
      Text(EWin->RPort,"                ",16);
   SetAPen(EWin->RPort,DrawPen);
    if(atoi(action)!=SV_NEWMSG)
    {
   Move(EWin->RPort,69,32+(node*11));
   Text(EWin->RPort,name,strlen(name)>22?22:strlen(name));
   Move(EWin->RPort,255,32+(node*11));
   Text(EWin->RPort,location,strlen(location)>22?22:strlen(location));
   Move(EWin->RPort,580,32+(node*11));
   Text(EWin->RPort,baud,5);
   }
   Move(EWin->RPort,439,32+(node*11));

 if(atoi(action)==26) suspend[node]=1; else suspend[node]=0;
 Text(EWin->RPort,Action,strlen(Action)>16?16:strlen(Action));
 if(atoi(action)!=SV_NEWMSG)
 {
  strcpy(Users[node].User,name);
  strcpy(Users[node].Location,location);
 }
 strcpy(Users[node].Action,Action);
 strcpy(Users[node].Baud,baud);
 Users[node].Active=1;
 if(atoi(action)==27) Users[node].action=22; else Users[node].action=atoi(action);
 if(Users[node].action==21){ RegLastUser(Users[node].User,node); 
   switch(TopOption)
   {
     case LAST_CALLERS:ShowLastUser(EWin);break;
     case LAST_UPLOADS:ShowLastUploads(EWin);break;
     case LAST_DOWNLOADS:ShowLastDownloads(EWin);break;
   } }
  
   
}

//***********************************************************************
// HandleEditGadget - This function determines what actions should take
// place when a gadget is selected from the ACP screen
//***********************************************************************
void HandleEditGadget(IMsg *im,short ig)
{
   short id;
   if(im!=NULL)
   id = ((Gadget *)im->IAddress)->GadgetID;
   else id=ig;
   switch(id)
   {
     case GAD_Node_0:if(suspend[0] && ButtonID<0) break;if(Control || ButtonID>=0) DoControl(0); else CallNode(0,SV_UNICONIFY); break;
     case GAD_Node_1:if(suspend[1] && ButtonID<0) break;if(Control || ButtonID>=0) DoControl(1); else CallNode(1,SV_UNICONIFY); break;
     case GAD_Node_2:if(suspend[2] && ButtonID<0) break;if(Control || ButtonID>=0) DoControl(2); else CallNode(2,SV_UNICONIFY); break;
     case GAD_Node_3:if(suspend[3] && ButtonID<0) break;if(Control || ButtonID>=0) DoControl(3); else CallNode(3,SV_UNICONIFY); break;
     case GAD_Node_4:if(suspend[4] && ButtonID<0) break;if(Control || ButtonID>=0) DoControl(4); else CallNode(4,SV_UNICONIFY); break;
     case GAD_Node_5:if(suspend[5] && ButtonID<0) break;if(Control || ButtonID>=0) DoControl(5); else CallNode(5,SV_UNICONIFY); break;
     case GAD_Node_6:if(suspend[6] && ButtonID<0) break;if(Control || ButtonID>=0) DoControl(6); else CallNode(6,SV_UNICONIFY); break;
     case GAD_Node_7:if(suspend[7] && ButtonID<0) break;if(Control || ButtonID>=0) DoControl(7); else CallNode(7,SV_UNICONIFY); break;
     case GAD_Node_8:if(suspend[8] && ButtonID<0) break;if(Control || ButtonID>=0) DoControl(8); else CallNode(8,SV_UNICONIFY); break;
     case GAD_Node_9:if(suspend[9] && ButtonID<0) break;if(Control || ButtonID>=0) DoControl(9); else CallNode(9,SV_UNICONIFY); break;
    case GAD_NRAMS:
         if(Button){ if(!Nutton(14))DoButton(14,0); break;}
         if(Control) Control=0; else Control=SV_SETNRAMS;
         break;
    case GAD_SaveWin:
         if(Button){ if(!Nutton(13))DoButton(13,0); break;}
         ScreenSave(); break;
    case GAD_NodeConfig:
         if(Button){ if(!Nutton(11))DoButton(11,0); break;}
         if(Control) Control=0; else Control=NODECONFIG; break;
    case GAD_MCP: 
         if(Button){ if(!Nutton(10))DoButton(10,0); break; }
         if(Control) Control=0; else Control=SV_QUIETNODE;
         break;
    case GAD_SysopLogin:
         if(Button){ if(!Nutton(0))DoButton(0,0); break; }
         if(Control) Control=0; else Control=SV_SYSOPLOG; break;
    case GAD_LocalLogin:
         if(Button){ if(!Nutton(5))DoButton(5,0); break;}
         if(Control) Control=0; else Control=SV_LOCALLOG; break;
    case GAD_Accounts:
         if(Button){ if(!Nutton(7))DoButton(7,0); break;}
         if(Control) Control=0; else Control=SV_ACCOUNTS; break;
    case GAD_NodeChat:
         if(Button){ if(!Nutton(12))DoButton(12,0); break;}
         if(Control) Control=0; else Control=SV_CHAT; break;
    case GAD_ExitNode:
         if(Button){ if(!Nutton(4))DoButton(4,0); break; }
         if(Control) Control=0; else Control=SV_EXITNODE; break;
    case GAD_NodeOffHook:
         if(Button){ if(!Nutton(9))DoButton(9,0); break; }
         if(Control) Control=0; else Control=SV_NODEOFFHOOK; break;
    case GAD_InitModem:
         if(Button){ if(!Nutton(8))DoButton(8,0); break;}
         if(Control) Control=0; else Control=SV_INITMODEM; break;
    case GAD_InstantLogin:
         if(Button){ if(!Nutton(1))DoButton(1,0); break;}
         if(Control) Control=0; else Control=SV_INSTANT; break;
    case GAD_ReserveNode:
         if(Button){ if(!Nutton(6))DoButton(6,0); break; }
         if(Control) Control=0;else Control=SV_RESERVE; break;
    case GAD_Short:
         if(!ShortUp)
         {
           
           if(!Short) 
           { 

            SizeWindow(EWin,0,-63);
            MoveWindow(EWin,0,63);
            Short=1;
           }
           else {
           Short=0;MoveWindow(EWin,0,-63);SizeWindow(EWin,0,63);
           }
         }
         else
         {
           if(!Short)
           {
             SizeWindow(EWin,0,-63);
             Short=1;
           }
           else
           {
             Short=0; SizeWindow(EWin,0,63);
           }
         }
         break;
    case GAD_AEShell:
         if(Button){ if(!Nutton(2))DoButton(2,0); break; }
         if(Control) Control=0;else Control=SV_AESHELL; break;  
    case GAD_ToggleChat:
         if(Button){ if(!Nutton(3))DoButton(3,0); break; }
         if(Control) Control=0;else Control=SV_CHATTOGGLE; break;
    case GAD_Tops: TopOption++; if(TopOption>2) TopOption=0; 
         switch(TopOption)
         {
           case LAST_CALLERS: ShowLastUser(EWin);break;
           case LAST_DOWNLOADS: ShowLastDownloads(EWin); break;
           case LAST_UPLOADS: ShowLastUploads(EWin);break;
         }break;
    case GAD_TopsBox:
         if(Control) { Control=0; 
         switch(TopOption)
         {
           case LAST_CALLERS:ShowLastUser(EWin); break;
           case LAST_UPLOADS:ShowLastUploads(EWin); break;
           case LAST_DOWNLOADS:ShowLastDownloads(EWin);
         }}else Control=SV_TOPS; break;
    case GAD_Control:
         ToggleGads(); break;
   }
}

//*********************************************************************
// DoButton - Determines if the button is a NUTTON and acts accordingly
//*********************************************************************
void DoButton(int B,int node)
{
   char string[200];
   if(Buttons[B].Type)
   {
     sprintf(string,"%s %d",Buttons[B].Command,node);
     Execute(string,NULL,NULL);
     ButtonID=-1; //tells us that there is no custom buttons pending
     return;
   }     
   Execute(Buttons[B].Command,NULL,NULL);
}

//*********************************************************************
// Nutton - This determines what type of custom button was seleced
// returns 1 if it is a Nutton otherwise it retunes a 0
//*********************************************************************
int Nutton(int B)
{
  if(Buttons[B].Type)
  {
    ButtonID=B; return(1);
  }
  return(0);
}
struct ScreenPref
{
  SHORT Left;
  SHORT Top;
  SHORT Width;
  SHORT Height;
  SHORT Nodes;
  //WORD Zoom[5];
} Pref;

void LoadScreen(void)
{
  BPTR fi;
  register int i;
  register int nodes=0;
  fi=Open("S:ACP.config",MODE_OLDFILE);
  if(fi==NULL) return;
  FRead(fi,(APTR)&Pref,sizeof(struct ScreenPref),1);
  Close(fi);
  for(i=0;i<9;i++) { if(Nodes[i]) nodes++; }
  if(Pref.Nodes!=nodes) return;
  EdgeX=Pref.Left;
  EdgeY=Pref.Top;
  Width=Pref.Width;
  Height=Pref.Height;
 
  //DIM[0]=Pref.Zoom[0];
  //DIM[1]=Pref.Zoom[1];
  //DIM[2]=Pref.Zoom[2];
  //DIM[3]=Pref.Zoom[3];


}

void ScreenSave(void)
{
  BPTR fi;
  register int i;
  register int nodes=0;
  Pref.Top=EWin->TopEdge;
  Pref.Left=EWin->LeftEdge;
  Pref.Height=EWin->Height;
  Pref.Width=EWin->Width;
  for(i=0;i<9;i++){ if(Nodes[i]) nodes++; }
  Pref.Nodes=nodes;
  //Pref.Zoom[0]=DIM[0];
  //Pref.Zoom[1]=DIM[1];
  //Pref.Zoom[2]=DIM[2];
  //Pref.Zoom[3]=DIM[3];
  fi=Open("S:ACP.config",MODE_NEWFILE);
  Write(fi,(APTR)&Pref,sizeof(struct ScreenPref));
  Close(fi);

}

//*********************************************************************
// CallNode - This function opens a port to a nodes AEServer and tries
// to send a msg to the node and waits on a reply
//*********************************************************************
void CallNode(int node,int Code)
{
   char Response[100];
   sprintf(Response,"AmiExpress_Node.%d",node);
   if(!FindPort(Response))
   {
     if(StartNode[node][0]!='\0')
     {
       //ActiveNodes +=1; Down[node]=FALSE;
       if(StartProcess(&StartNode[node][0],BBSStack)) { ActiveNodes +=1; Down[node]=FALSE; }
       //Execute(StartNode[node],NULL,NULL);
       return;
     }
   }
   if(Register(node))
   {
      getuserstring(Response,Code);
   }
}      

//*********************************************************************
// ShowNodes - This function will refresh the node activity portion of
// the window
//*********************************************************************
void ShowNodes(void)
{
  register int i;
  for(i=0;i<Theight;i++)
  {
     if(QuietNode[i]) SetAPen(EWin->RPort,3);
     else SetAPen(EWin->RPort,1);
     Move(EWin->RPort,69,32+(i*11)) ;
     Text(EWin->RPort,Blank,strlen(Blank));
     
     if(Users[i].Active)
     {
       Move(EWin->RPort,69,32+(i*11));

Text(EWin->RPort,Users[i].User,strlen(Users[i].User)>22?22:strlen(Users[i].User));
       Move(EWin->RPort,255,32+(i*11));

Text(EWin->RPort,Users[i].Location,strlen(Users[i].Location)>22?22:strlen(Users[i].Location));
       Move(EWin->RPort,439,32+(i*11));

Text(EWin->RPort,Users[i].Action,strlen(Users[i].Action)>16?16:strlen(Users[i].Action));
  
       Move(EWin->RPort,580,32+(i*11));
Text(EWin->RPort,Users[i].Baud,5);

     }   
  }
}

//*********************************************************************
// ClearUsers - initialize all the User storage
//*********************************************************************
void ClearUsers(void)
{
  register int i;
  for(i=0;i<9;i++)
  {
     strcpy(Users[i].User,"");
     strcpy(Users[i].Location,"");
     strcpy(Users[i].Action,"");
     strcpy(Users[i].Baud,"     ");
     Users[i].Active=0;
  }
}

//********************************************************************
// DoControl - executes the buttons
//********************************************************************
void DoControl(int node)
{
  char cmd[200]; /*** temporary storage for misc ***/
  int cd; /*** stores the current node action ***/
  if(ButtonID>=0 && Button)
  {
     DoButton(ButtonID,node);
     return;
  }
  switch(Control)
  {
    case NODECONFIG:
         sprintf(cmd,"run >nil: bbs:config bbs:config%d",node);
         Execute(cmd,NULL,NULL); break;
         break;
    case RUNMCP:
         sprintf(cmd,"run >nil: bbs:utils/mcp.script");
         Execute(cmd,NULL,NULL); break;
    case SV_SETNRAMS:
     if(Users[node].action==22){ CallNode(node,SV_SETNRAMS);}
     else DisplayBeep(Scr); break;
    case SV_SYSOPLOG:
     if(Users[node].action==22){ CallNode(node,SV_SYSOPLOG);}
     else DisplayBeep(Scr);break;
    case SV_LOCALLOG:
     if(Users[node].action==22){ CallNode(node,SV_LOCALLOG);}
     else DisplayBeep(Scr);break;
    case SV_ACCOUNTS:
     if(Users[node].action==22){ CallNode(node,SV_ACCOUNTS);}
     else DisplayBeep(Scr);break;
    case SV_EXITNODE:
     if(Users[node].action==22){ CallNode(node,SV_EXITNODE); }
     else DisplayBeep(Scr);break;
    case SV_NODEOFFHOOK:
     if(Users[node].action==22){ CallNode(node,SV_NODEOFFHOOK);}
     else DisplayBeep(Scr);break;
    case SV_RESERVE:
     if(Users[node].action==22){ CallNode(node,SV_RESERVE); }
     else DisplayBeep(Scr); break;
    case SV_CHAT: cd=Users[node].action;
     if(cd!=26 && cd!=1 && cd!=2 && cd!=11 && cd!=12 && cd!=15 && cd!=18 && cd!=20 &&
        cd!=21 && cd!=22 && cd!=24)
     { CallNode(node,SV_CHAT);}
     else DisplayBeep(Scr); break;
    case SV_INITMODEM:
     if(Users[node].action==22){ CallNode(node,SV_INITMODEM); } 
     else DisplayBeep(Scr);break;
    case SV_INSTANT:
     if(Users[node].action==22){ CallNode(node,SV_INSTANT); }
     else DisplayBeep(Scr); break;
    case SV_AESHELL:
     if(Users[node].action==22){ 
                                 CallNode(node,SV_AESHELL);
                               } else DisplayBeep(Scr); break;
    case SV_CHATTOGGLE: cd=Users[node].action;
      if(cd!=24 && cd!=26)
      {
       /* if(TChat[node]) TChat[node]=0; else TChat[node]=1;
        SetAPen(EWin->RPort,TChat[node]);
        Move(EWin->RPort,64,26+(node*11));
        Draw(EWin->RPort,64,26+(node*11)+6);
        Move(EWin->RPort,63,26+(node*11));
        Draw(EWin->RPort,63,26+(node*11)+6);
        Move(EWin->RPort,62,26+(node*11));
        Draw(EWin->RPort,62,26+(node*11)+6);
        Move(EWin->RPort,61,26+(node*11));
        Draw(EWin->RPort,61,26+(node*11)+6);*/
        CallNode(node,SV_CHATTOGGLE); break;
      }else DisplayBeep(Scr);
        break;
    case SV_QUIETNODE: cd=Users[node].action;
         if(cd!=24 && cd!=26)CallNode(node,SV_QUIETNODE);
         else DisplayBeep(Scr); break;
    case SV_TOPS:
      switch(TopOption)
      {
        case LAST_CALLERS:ShowNdLastUser(EWin,node);break;
        case LAST_UPLOADS:ShowNdLastUploads(EWin,node);break;
        case LAST_DOWNLOADS:ShowNdLastDownloads(EWin,node);break;
      } break;
   }
  Control = 0;
}

void ReadStartUp(void)
{
  FILE *fi;
  char image[200];
  char im2[200];
  register int i;
  int nodes;
  int j;
 BBSStack=60000L;
  for(i=0;i<9;i++)
  {
    strcpy(StartNode[i],"");
    NodeIdle[i]=0;
  }
  for(i=0;i<17;i++)
  {
    strcpy(Buttons[i].Text,"");
    strcpy(Buttons[i].Command,"");
  }
  
  DoMultiCom=1; CreateSemaphores();
  fi=fopen(StartUpLocation,"r");
  if(fi==NULL)
  {
    return;
  }
  while(fgets(image,100,fi)!=NULL)
  {
    ALine +=1;
    sr(image);
    if(!strnicmp(image,"PUBLICSCREEN",12))
    {
      strleft(PublicName,&image[12]);
      continue;
    }
    
    if(!strnicmp(image,"NUMBER_OF_NODES",15))
    {
      j=0; nodes=atoileft(&image[15]);
      while(j<nodes)
      { GetCmds(j);if(Theight<j) Theight=j;Nodes[j]=1;Cmds[j]->AcLvl[NODE_NUMBER]=j; j++;}
      continue;
    }
    if(CheckConfigNode(image)) continue;
    if(!strcmp(image,"ICONIFY"))
    { ZipOn=TRUE; continue; }
    if(!strnicmp(image,"ITop",4))
    {
      DIM[1]=atoileft(&image[4]);
      continue;
    }
    if(!strnicmp(image,"ILeft",5))
    {
      DIM[0]=atoileft(&image[5]);
      continue;
    }
    if(!strnicmp(image,"LOADCONFIG",10))
    {
       
       LoadOldConfig(); continue;
    }
    if(!strnicmp(image,"StartNode",9))
    {
      StartUp=TRUE;
      strcpy(&StartNode[image[9]-'0'][0],&image[12]);
      continue;
    }
    
    if(!strnicmp(image,"Acp_Priority",12))
    {
      SetTaskPri(FindTask(0),atoileft(&image[12]));
      continue;
    }
    if(!strnicmp(image,"Button",6))
    {
      j=atoi(&image[6]); 
      if(j>0 && j<16)
      {
        strcpy(Buttons[j-1].Command,&image[24]);
        image[23]='\0';
        sr(image);
        strcpy(Buttons[j-1].Text,&image[10]);
        Buttons[j-1].Type=FALSE;
      }
    }
    if(!strnicmp(image,"GEOGRAPHIC_LOCATION",19))
    {
       strcpy(mybbslocation,&image[19]);
       continue;
    }
    if(!strnicmp(image,"Nutton",6))
    {
      j=atoi(&image[6]); 
      if(j>0 && j<16)
      {
        strcpy(Buttons[j-1].Command,&image[24]);
        image[23]='\0';
        sr(image);
        strcpy(Buttons[j-1].Text,&image[10]);
        Buttons[j-1].Type=TRUE;
      }
    }
    if(!strnicmp(image,"SHORTUP",7))
    {
      ShortUp=TRUE;
    }
    if(!strnicmp(image,"SHORTDOWN",9))
    {
      ShortUp=FALSE;
    }
  }
  fclose(fi);
  for(i=0;i<nodes;i++)
  {
   if(Sopt[i]->PubScreen[0]=='\0') sprintf(Sopt[i]->PubScreen,"%sNode%d/",Cmds[i]->BBSLoc,i);
  }
CreateCustomMenus(nodes);
}

  
void sr(char *str)
{
  register int i;
  i=strlen(str)-1;
  while(i)
  {
    if(*(str+i)<=32) *(str+i)='\0'; else break;
    i--;
  }
}

void SetTheGads(void)
{
  register int i; 
  static int j=0;
  static BOOL Set=FALSE;
  if(!j)
 {
strcpy(SetOriText[0],"Sysop Login");
strcpy(SetOriText[1],"Instant Login");
strcpy(SetOriText[2],"AEShell");
strcpy(SetOriText[3],"Toggle Chat");
strcpy(SetOriText[4],"Exit Node");
strcpy(SetOriText[5],"Local Login");
strcpy(SetOriText[6],"Reserve Node");
strcpy(SetOriText[7],"Accounts");
strcpy(SetOriText[8],"Init Modem");
strcpy(SetOriText[9],"Node(offhook)");
strcpy(SetOriText[10],"Quiet Node");
strcpy(SetOriText[11],"Config Node");
strcpy(SetOriText[12],"Node Chat");
strcpy(SetOriText[13],"Save Win");
strcpy(SetOriText[14],"Set NRAMS");
    j=1;
    return;
  }
  
  for(i=0;i<15;i++) // was 14
  {
    if(!Set){NGAry[i].ng_GadgetText=(STRPTR)&Buttons[i].Text; Button=1;}

    else { Button=0; ButtonID=-1; NGAry[i].ng_GadgetText=(STRPTR)&SetOriText[i];}
  }
  if(Set) Set=FALSE; else Set=TRUE;
}

void ToggleGads(void)
{
                     RemoveGList(EWin,gadgets,-1);                     
                     FreeGadgets(gadgets);
                     SetTheGads();
                     
                     gadgets=InitGads(Scr);
                     AddGList (EWin, gadgets, -1, -1, NULL);
                     
                     RefreshGList(Gad_ExitNode, EWin, NULL, (UWORD)15);
                     GT_RefreshWindow (EWin, NULL);
 /*switch(TopOption)
                {
                  case LAST_CALLERS:ShowLastUser(EWin);break;
                  case LAST_UPLOADS:ShowLastUploads(EWin);break;
                  case LAST_DOWNLOADS:ShowLastDownloads(EWin);break;
                }
 */
}

void GetCmds(int i)
{
  int j;
  extern struct MultiPort *SemiNodes;
  Cmds[i]=(struct Commands *)AllocMem(sizeof(struct Commands),MEMF_PUBLIC|MEMF_CLEAR);
  Sopt[i]=(struct StartOption *)AllocMem(sizeof(struct StartOption),MEMF_PUBLIC|MEMF_CLEAR);
  Sopt[i]->LeftEdge=0;
  Sopt[i]->TopEdge=0;
  Sopt[i]->Width=640;
  Sopt[i]->Height=200;
  Sopt[i]->BitPlanes=3;
  Sopt[i]->StatBar=FALSE;
  Sopt[i]->Interlace=FALSE;
  Sopt[i]->DupeCheck=FALSE;
  Sopt[i]->QLogon=FALSE;
  Sopt[i]->TakeCredits=FALSE;
  Sopt[i]->SeenIt=FALSE;
  Sopt[i]->TrapDoor=FALSE;
  Sopt[i]->Iconify=TRUE;
  Sopt[i]->RadBoogie=255;
  Sopt[i]->A2232=FALSE;
for(j=0;j<19;j++)
  {
    Sopt[i]->Toggles[j]=FALSE; }
    Sopt[i]->Toggles[13]=1;
    Sopt[i]->Toggles[14]=1;
  if(DoMultiCom)
  {
    ObtainSemaphore((struct SignalSemaphore *)SemiNodes);
  Sopt[i]->MasterSemi=SemiNodes;
  Sopt[i]->SingleSemi=SemiNodes->MyNode[i].s;
  ReleaseSemaphore((struct SignalSemaphore *)SemiNodes); Sopt[i]->Toggles[10]=TRUE;
  } else { Sopt[i]->MasterSemi=NULL; Sopt[i]->SingleSemi=NULL; }

  
  strcpy(Sopt[i]->CycleLock,"");
  strcpy(Sopt[i]->Logoff,"");
  strcpy(Sopt[i]->ShutDown,"");
  strcpy(Sopt[i]->RamPen,"");
  strcpy(Sopt[i]->BBSConfig,"");
  strcpy(Sopt[i]->FilesNot,"");
  strcpy(Sopt[i]->UserData,"");
  strcpy(Sopt[i]->UserKey,"");
  strcpy(Sopt[i]->OffHook,"");
  strcpy(Sopt[i]->PubScreen,"");
}

int Validate(void)
{
  register int i;
  for(i=0;i<10;i++)
  {
    if(Cmds[i]!=NULL)
    {
      if(Cmds[i]->AcLvl[DEFAULT_CHAT_ON]) TChat[i]=1;
    }
  }
    
  return(1);
}
     
#define ACCESS_READ -2
int TLock(char *str)
{
  long lock;
  if(lock=Lock(str,ACCESS_READ))
  {
    UnLock(lock); return(1);
  }
  return(0);
}

void strlim(char *str1,char *str2,int limit)
{
  register int i;
  if(strlen(str2)>limit)
  {
    ACPError=TRUE;
  }
  for(i=0;i<limit;i++)
  {
    if(*(str2)=='\0') break;
    *(str1+i)=*(str2+i);
  }
}

void strleft(char *str,char *str1)
{
   register int i=0,j=0;
   while(*(str1+i)==' ') i++;
   while(*(str1+i)!='\0'){ *(str+j)=*(str1+i); i++; j++; }
   *(str+j)='\0';
}
int atoileft(char str[])
{
  register int i=0;
  while(str[i]==' ') i++;
  return(atoi(&str[i]));
}

void ShowQuiet(int i)
{
   if(QuietNode[i]) SetAPen(EWin->RPort,3);
     else SetAPen(EWin->RPort,1);
     Move(EWin->RPort,69,32+(i*11)) ;
     Text(EWin->RPort,Blank,strlen(Blank));
       Move(EWin->RPort,69,32+(i*11));
Text(EWin->RPort,Users[i].User,strlen(Users[i].User)>22?22:strlen(Users[i].User));
       Move(EWin->RPort,255,32+(i*11));

Text(EWin->RPort,Users[i].Location,strlen(Users[i].Location)>22?22:strlen(Users[i].Location));
       Move(EWin->RPort,439,32+(i*11));

Text(EWin->RPort,Users[i].Action,strlen(Users[i].Action)>16?16:strlen(Users[i].Action));
       Move(EWin->RPort,580,32+(i*11));
Text(EWin->RPort,Users[i].Baud,5);
}    
#include "Restrict.h"
void LoadOldConfig(void)
{
  FILE *fi;
  register int i;
  char FileName[200];
  for(i=0;i<10;i++)
  {
    if(Cmds[i]!=NULL)
    {
      sprintf(FileName,"BBS:Config%d",i);
      fi=fopen(FileName,"rb");
      if(fi==NULL)
      {
        printf("Error, can't open %s\n",FileName);
        ACPError=TRUE;
      }
      else { fread((APTR)Cmds[i],sizeof(struct Commands),1,fi);fclose(fi);}
    }
  }
}
