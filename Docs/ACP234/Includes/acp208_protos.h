/* Prototypes for functions defined in
acp208.c
 */


#ifndef __NOPROTO

#ifndef __PROTO
#define __PROTO(a) a
#endif

#else
#ifndef __PROTO
#define __PROTO(a) ()

#endif
#endif


extern struct GadToolsBase *GadToolsBase;

extern struct IntuitionBase *IntuitionBase;

extern struct Library *IconBase;

extern struct Menu *EWinM;

extern int QuietNode[];

extern char StartUpLocation[];

extern char PortName[];

extern struct UserData User_Data;

extern struct ColorSpec ColorSpecs[];

extern struct ColorSpec AmigaSpecs[];

extern struct ColorSpec *Colors;

extern struct UserKeys User_Keys;

extern int Nodes[];

extern int suspend[];

extern int ShowAbout;

extern int EdgeX;

extern int EdgeY;

extern int Width;

extern int Height;

extern int Theight;

extern int DrawPen;

extern int Chat[];

extern int TChat[];

extern int ActiveNodes;

extern int TopOption;

extern struct VisualInfo *VisInfo;

extern Window *EWin;

extern int BM[];

extern struct BUTTON Buttons[];

extern struct Commands *Cmds[];

extern struct StartOption *Sopt[];

extern char ValError[];

extern struct NewMenu *EWinMenu;

extern int Button;

extern int ButtonID;

extern BOOL ShortUp;

extern UBYTE SetOriText[][];

extern struct ACPMessage *msg;

extern struct ACPMessage *cpymsg;

extern long signals;

extern struct MsgPort *mp;

extern struct GfxBase *GfxBase;

extern BOOL ACPError;

extern int Control;

extern int Short;

extern char Blank[];

extern struct User Users[];

extern NewGadget NGAry[];

extern Gadget *Gad_Node_0;

extern Gadget *Gad_Node_1;

extern Gadget *Gad_Node_2;

extern Gadget *Gad_Node_3;

extern Gadget *Gad_Node_4;

extern Gadget *Gad_Node_5;

extern Gadget *Gad_Node_6;

extern Gadget *Gad_Node_7;

extern Gadget *Gad_Node_8;

extern Gadget *Gad_Node_9;

extern Gadget *Gad_Action;

extern Gadget *Gad_User;

extern Gadget *Gad_Location;

extern Gadget *Gad_Baud;

extern Gadget *Gad_ExitNode;

extern Gadget *Gad_NodeOffHook;

extern Gadget *Gad_InstantLogin;

extern Gadget *Gad_AEShell;

extern Gadget *Gad_ToggleChat;

extern Gadget *Gad_SysopLogin;

extern Gadget *Gad_NRAMS;

extern Gadget *Gad_ReserveNode;

extern Gadget *Gad_Accounts;

extern Gadget *Gad_InitModem;

extern Gadget *Gad_LocalLogin;

extern Gadget *Gad_MCP;

extern Gadget *Gad_NodeConfig;

extern Gadget *Gad_NodeChat;

extern Gadget *Gad_SaveWin;

extern Gadget *Gad_Flip;

extern Gadget *Gad_Control;

extern Gadget *Gad_Tops;

extern Gadget *Gad_TopsBox;

extern Gadget *Gad_Short;

extern char *StatAry_Tops[];

extern char **Ary_Tops;

extern Gadget *EGList;

Gadget * InitGads __PROTO((Screen *));

extern int ALine;

extern WORD DIM[];

extern long MasterSig;

extern Screen *Scr;

extern Gadget *gadgets;

extern char StartNode[][];

extern BOOL NodeIdle[];

extern BOOL StartUp;

extern BOOL ZipOn;

extern int notDone;

extern BOOL Down[];

extern UBYTE PublicName[];

extern UWORD Pens[];

int main __PROTO((int , char **));

void CheckMasterSig __PROTO((long ));

void drawborders __PROTO((void));

void FreeGads __PROTO((void));

void OpenMaster __PROTO((void));

void ShutDownMaster __PROTO((void));

void UpdateNode __PROTO((char *, char *, char *, char *, int ));

void HandleEditGadget __PROTO((IMsg *, short ));

void DoButton __PROTO((int , int ));

int Nutton __PROTO((int ));

extern struct ScreenPref Pref;

void LoadScreen __PROTO((void));

void ScreenSave __PROTO((void));

void CallNode __PROTO((int , int ));

void ShowNodes __PROTO((void));

void ClearUsers __PROTO((void));

void DoControl __PROTO((int ));

void ReadStartUp __PROTO((char *));

int CheckConfigNode __PROTO((char *));

void sr __PROTO((char *));

void SetTheGads __PROTO((void));

void ToggleGads __PROTO((void));

void GetCmds __PROTO((int ));

int Validate __PROTO((void));

int TLock __PROTO((char *));

void strlim __PROTO((char *, char *, int ));

void strleft __PROTO((char *, char *));

int atoileft __PROTO((char *));

void ShowQuiet __PROTO((int ));

void Restrict __PROTO((char *));

void Backup __PROTO((char *, int ));

