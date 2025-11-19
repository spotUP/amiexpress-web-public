
/*
 * DH0:TPL/ACP_defs.h
 *
 * MACHINE GENERATED
 * Dec 03 1991 21:16:29
 */

#include <exec/types.h>
#include <exec/lists.h>
#include <intuition/intuition.h>
#include <intuition/screens.h>
#include <intuition/gadgetclass.h>
#include <libraries/gadtools.h>
#include <clib/gadtools_protos.h>

#define NULPTR    ((void *)0L)
#define Prototype extern       /* DICE special */
typedef struct Gadget        Gadget;
typedef struct Menu          Menu;
typedef struct MenuItem      MenuItem;
typedef struct Window        Window;
typedef struct Screen        Screen;
typedef struct NewGadget     NewGadget;
typedef struct NewMenu       NewMenu;
typedef struct IntuiMessage  IMsg;
typedef struct List          MaxList;
typedef struct Node          MaxNode;
typedef struct TextFont      TextFont;
typedef struct TextAttr      TextAttr;
typedef struct MsgPort       MsgPort;
typedef struct RastPort      RastPort;
typedef struct StringInfo    StringInfo;
typedef struct FileRequester FileRequester;
typedef struct MinList       List;
typedef struct MinNode       Node;

typedef unsigned char  ubyte;
typedef unsigned short uword;
typedef unsigned long  ulong;

/* *** Window pos & size *** */
#define WLEF	  0
#define WTOP	  0
#define WWID	640
#define WHEI	200


#define GLEF_0	  5
#define GTOP_0	 24
#define GWID_0	 55
#define GHEI_0	 11

#define GLEF_1	  5
#define GTOP_1	 35
#define GWID_1	 55
#define GHEI_1	 11

#define GLEF_2	  5
#define GTOP_2	 46
#define GWID_2	 55
#define GHEI_2	 11

#define GLEF_3	  5
#define GTOP_3	 57
#define GWID_3	 55
#define GHEI_3	 11

#define GLEF_4	  5
#define GTOP_4	 68
#define GWID_4	 55
#define GHEI_4	 11

#define GLEF_5	  5
#define GTOP_5	 79
#define GWID_5	 55
#define GHEI_5	 11

#define GLEF_6	  5
#define GTOP_6	 90
#define GWID_6	 55
#define GHEI_6	 11

#define GLEF_7	  5
#define GTOP_7	 101
#define GWID_7	 55
#define GHEI_7	 11

#define GLEF_8	  5
#define GTOP_8	112
#define GWID_8	 55
#define GHEI_8	 11

#define GLEF_9	  5
#define GTOP_9	123
#define GWID_9	 55
#define GHEI_9  11

#define GLEF_Action	435
#define GTOP_Action	 12
#define GWID_Action	133
#define GHEI_Action	 11

#define GLEF_User	 67
#define GTOP_User	 12
#define GWID_User	183
#define GHEI_User	 11

/* *** Gadget Test_11 *** */
#define GLEF_Location	251
#define GTOP_Location	 12
#define GWID_Location	183
#define GHEI_Location	 11

/* *** Gadget Test_11 *** */
#define GLEF_Baud	569
#define GTOP_Baud	 12
#define GWID_Baud	 65
#define GHEI_Baud	 11

/* *** Gadget Cmds *** */
#define GLEF_ExitNode	 4
#define GTOP_ExitNode	188
#define GWID_ExitNode	109
#define GHEI_ExitNode	 10

/* *** Gadget Cmds_12 *** */
#define GLEF_NodeOffHook	114
#define GTOP_NodeOffHook	188
#define GWID_NodeOffHook	109
#define GHEI_NodeOffHook	 10

/* *** Gadget Cmds_13 *** */
#define GLEF_InstantLogin	 4
#define GTOP_InstantLogin	158
#define GWID_InstantLogin	109
#define GHEI_InstantLogin	 10

/* *** Gadget Cmds_14 *** */
#define GLEF_AEShell	 4
#define GTOP_AEShell	168
#define GWID_AEShell	109
#define GHEI_AEShell	 10

/* *** Gadget Cmds_15 *** */
#define GLEF_ToggleChat	 4
#define GTOP_ToggleChat	178
#define GWID_ToggleChat	109
#define GHEI_ToggleChat	 10

/* *** Gadget Cmds_12_16 *** */
#define GLEF_SysopLogin	 4
#define GTOP_SysopLogin	148
#define GWID_SysopLogin	109
#define GHEI_SysopLogin	 10

/* *** Gadget Disabled *** */
#define GLEF_NRAMS	224
#define GTOP_NRAMS	188
#define GWID_NRAMS	109
#define GHEI_NRAMS	 10

/* *** Gadget Cmds_12_18 *** */
#define GLEF_ReserveNode	114
#define GTOP_ReserveNode	158
#define GWID_ReserveNode	109
#define GHEI_ReserveNode	 10

/* *** Gadget Cmds_12_19 *** */
#define GLEF_Accounts	114
#define GTOP_Accounts	168
#define GWID_Accounts	109
#define GHEI_Accounts	 10

/* *** Gadget Cmds_12_20 *** */
#define GLEF_InitModem	114
#define GTOP_InitModem	178
#define GWID_InitModem	109
#define GHEI_InitModem	 10

/* *** Gadget Cmds_12_17_21 *** */
#define GLEF_LocalLogin	114
#define GTOP_LocalLogin	148
#define GWID_LocalLogin	109
#define GHEI_LocalLogin	 10

/* *** Gadget Cmds_12_17_22 *** */
#define GLEF_MCP	224
#define GTOP_MCP    148
#define GWID_MCP	109
#define GHEI_MCP	 10

/* *** Gadget Cmds_12_17_23 *** */
#define GLEF_NodeConfig	224
#define GTOP_NodeConfig	158
#define GWID_NodeConfig	109
#define GHEI_NodeConfig	 10

/* *** Gadget NodeChat *** */
#define GLEF_NodeChat	224
#define GTOP_NodeChat	168
#define GWID_NodeChat	109
#define GHEI_NodeChat	 10

/* *** Gadget Cmds_12_17_25 *** */
#define GLEF_SaveWin	224
#define GTOP_SaveWin	178
#define GWID_SaveWin	109
#define GHEI_SaveWin	 10

#define GLEF_Flip	 4
#define GTOP_Flip	137
#define GWID_Flip	14
#define GHEI_Flip	  10

/* *** Gadget CommandStat_26 *** */
#define GLEF_Control	 19
#define GTOP_Control	137
#define GWID_Control	314
#define GHEI_Control	  10

/* *** Gadget Tops *** */
#define GLEF_Tops	335
#define GTOP_Tops	136
#define GWID_Tops	300
#define GHEI_Tops	 12

/* *** Gadget Short *** */
#define GLEF_Short	 10
#define GTOP_Short	 12
#define GWID_Short	 37
#define GHEI_Short	  9


/* *** BevelBox Stats *** */
#define BLEF_0	 66
#define BTOP_0	 24
#define BWID_0	569
#define BHEI_0	110

/* *** BevelBox Tops *** */
#define BLEF_TopsBox	335
#define BTOP_TopsBox	148
#define BWID_TopsBox	300
#define BHEI_TopsBox	 50



#define GAD_SysopLogin	 0
#define GAD_InstantLogin	 1
#define GAD_AEShell	      2
#define GAD_ToggleChat	 3
#define GAD_ExitNode	 4
#define GAD_LocalLogin	 5
#define GAD_ReserveNode	 6
#define GAD_Accounts	 7
#define GAD_InitModem	 8
#define GAD_NodeOffHook	 9
#define GAD_MCP	      10
#define GAD_NodeConfig	 11
#define GAD_NodeChat	 12
#define GAD_SaveWin	 13
#define GAD_NRAMS	 14
#define GAD_Flip     15
#define GAD_Control	 16
#define GAD_Action	      17
#define GAD_User	      18
#define GAD_Location	 19
#define GAD_Baud          20
#define GAD_Tops	 21
#define GAD_TopsBox  22
#define GAD_Short    23
#define GAD_Node_0	       24
#define GAD_Node_1	       25
#define GAD_Node_2	       26
#define GAD_Node_3	       27
#define GAD_Node_4	       28
#define GAD_Node_5	       29
#define GAD_Node_6	       30
#define GAD_Node_7	       31
#define GAD_Node_8	       32
#define GAD_Node_9	       33
#define ALLGADS	 34

#define NG_Node_0	     (NGAry + GAD_Node_0)
#define NG_Node_1	     (NGAry + GAD_Node_1)
#define NG_Node_2	     (NGAry + GAD_Node_2)
#define NG_Node_3	     (NGAry + GAD_Node_3)
#define NG_Node_4	     (NGAry + GAD_Node_4)
#define NG_Node_5	     (NGAry + GAD_Node_5)
#define NG_Node_6	     (NGAry + GAD_Node_6)
#define NG_Node_7	     (NGAry + GAD_Node_7)
#define NG_Node_8	     (NGAry + GAD_Node_8)
#define NG_Node_9	     (NGAry + GAD_Node_9)
#define NG_Action	     (NGAry + GAD_Action)
#define NG_User	     (NGAry + GAD_User)
#define NG_Location	     (NGAry + GAD_Location)
#define NG_Baud          (NGAry + GAD_Baud)
#define NG_ExitNode	     (NGAry + GAD_ExitNode)
#define NG_NodeOffHook	(NGAry + GAD_NodeOffHook)
#define NG_InstantLogin	(NGAry + GAD_InstantLogin)
#define NG_AEShell	     (NGAry + GAD_AEShell)
#define NG_ToggleChat	(NGAry + GAD_ToggleChat)
#define NG_SysopLogin	(NGAry + GAD_SysopLogin)
#define NG_NRAMS	     (NGAry + GAD_NRAMS)
#define NG_ReserveNode	(NGAry + GAD_ReserveNode)
#define NG_Accounts	     (NGAry + GAD_Accounts)
#define NG_InitModem	(NGAry + GAD_InitModem)
#define NG_LocalLogin	(NGAry + GAD_LocalLogin)
#define NG_MCP	          (NGAry + GAD_MCP)
#define NG_NodeConfig	(NGAry + GAD_NodeConfig)
#define NG_NodeChat	     (NGAry + GAD_NodeChat)
#define NG_SaveWin	     (NGAry + GAD_SaveWin)
#define NG_Flip          (NGAry + GAD_Flip)
#define NG_Control	     (NGAry + GAD_Control)
#define NG_Tops	     (NGAry + GAD_Tops)
#define NG_TopsBox       (NGAry + GAD_TopsBox)
#define NG_Short	     (NGAry + GAD_Short)

