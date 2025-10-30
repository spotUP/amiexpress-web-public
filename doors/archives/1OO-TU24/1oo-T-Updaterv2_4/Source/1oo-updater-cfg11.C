/* ________________________________________________________ 
  |                                                        |
  |^-->    .--------------------------------------.    <--^|
  |--^-->  | Programm: 1oo% T-Updater Gui-config  |  <--^--|
  |-^--^-->| Version : 1.1                        |<--^--^-|
  |--^-->  | Date    : 96-10-04                   |  <--^--|
  |^-->    `--------------------------------------´    <--^|
  |________________________________________________________|
*/


//+ ----------------------- INCLUDES ---------------------

#include <proto/utility.h>
#include <proto/exec.h>
#include <proto/dos.h>
#include <clib/asl_protos.h>
#include <clib/intuition_protos.h>
#include <clib/gadtools_protos.h>
#include <intuition/intuition.h>
#include <libraries/gadtools.h>

#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include <string.h>
#include <time.h>

#include <gtlayout/gtlayout.h>
#include <tempest/t-updater.h>


//=

//+ ------------------- struct/prototypes ------------------------


struct Updater_Prefs Prefs;

struct Library          *AslBase;
struct Library          *IntuitionBase;
struct Library          *GadToolsBase;
struct Library          *GTLayoutBase;
struct LayoutHandle     *Handle;
struct FileRequester    *AslFileRequest;
struct Window           *Window;

struct Menu *WindowMenu;

UBYTE *FCLabels[] = {
   (UBYTE *)"FileID.library",
   (UBYTE *)"Filecomment",
   NULL };

STATIC UBYTE * __saveds __stdargs
ShowSIZE(struct Gadget *,LONG);


void Fehler(char *,...);
BOOL InitPrefs(void);
//void PrintPrefs(void);
BOOL ReadPrefs(void);
BOOL WritePrefs(void);
void OpenGUI(void);
BOOL FileRequester(int, char *, char *);
void CheckPath(char *);
void UpdateExampleSTR(void);
void OpenAbout(void);

//=

//+-------------------  Globalvariables  --------------------------

#define topazsize     1
#define ibmsize       2
#define topazauto     3
#define ibmauto       4
#define updatedir     5
#define tempdir       6
#define sysop         7
#define packerlha     8
#define packerlzx     9
#define packerzip    10
#define comment      11
#define filename     12
#define example_fn   13
#define m_about      50
#define m_quit       51
#define m_save       52
#define save         98
#define quit         99

char version[50]="$VER:1oo% T-Updater Config v1.1 (96-10-04)";

char temp[500];
char examplestr[32];

char ibmstring[6];
char topazstring[6];

long work;

FILE *file;                                              // FILE-Handler
char p_name[255];                                        // prefs-filename

//=

//----------------------> Modules <--------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------


//+---------------> FEHLER -> EXIT

void Fehler(char *fmt,...)
{
   va_list args;
   char s[255];
   va_start(args,fmt);
   vsprintf(s,fmt,args);
   va_end(args);

   printf("[1mError:[0m %s\n", &s[0]);
   exit(5);
}//=

//+---------------> InitPrefs

BOOL InitPrefs(void)
{
   Prefs.TOPAZSIZE=1;
   Prefs.IBMSIZE=1;
   Prefs.TOPAZAUTO=TRUE;
   Prefs.IBMAUTO=TRUE;
   strcpy(Prefs.UPDATEDIR,"Updates:");
   strcpy(Prefs.TEMPDIR,"Ram:T/");
   Prefs.SYSOP=200;
   Prefs.P_LHA=TRUE;
   Prefs.P_LZX=TRUE;
   Prefs.P_ZIP=TRUE;
   Prefs.COMMENT=1;
   strcpy(Prefs.FILENAME,"T-%b%d_%H%M");

   return(TRUE);
}

//=

//+---------------> PrintPrefs
/*
void PrintPrefs(void)
{
printf("Topazsize: %d\n", Prefs.TOPAZSIZE);
printf("IBM size : %d\n", Prefs.IBMSIZE);
printf("Topazauto: %d\n", Prefs.TOPAZAUTO);
printf("IBM auto : %d\n", Prefs.IBMAUTO);
printf("Updatedir: %s\n", Prefs.UPDATEDIR);
printf("Tempdir  : %s\n", Prefs.TEMPDIR);
printf("Sysop    : %d\n", Prefs.SYSOP);
printf("PackerLHA: %d\n", Prefs.P_LHA);
printf("PackerLZX: %d\n", Prefs.P_LZX);
printf("PackerZIP: %d\n", Prefs.P_ZIP);
printf("Comment  : %d\n", Prefs.COMMENT);
printf("Filename : %s\n", Prefs.FILENAME);
printf("-----------------------------\n");
}
*/
//=

//+---------------> ReadPrefs

BOOL ReadPrefs(void)
{
   if ((file = fopen (p_name,"r")) == (FILE *) NULL)
      {
      if(!InitPrefs()) return(FALSE);
      }
   else
      {
      fread(&Prefs,sizeof(Prefs),1,file);
      fclose(file);
      }
   return(TRUE);
}

//=

//+---------------> WritePrefs

BOOL WritePrefs(void)
{
   if ((file = fopen (p_name,"w+")) == (FILE *) NULL) return(FALSE);
   else
      {
      fwrite(&Prefs,sizeof(Prefs),1,file);
      fclose(file);
      }
   return(TRUE);
}

//=

//+---------------> OpenGUI

void OpenGUI(void)
{
   if(Handle = LT_CreateHandleTags(NULL,
      LAHN_AutoActivate,FALSE,
   TAG_DONE))
   {
      LT_New(Handle,
         LA_Type,      VERTICAL_KIND,  /* A vertical group. */
      TAG_DONE);
         {
         LT_New(Handle,
            LA_Type,      VERTICAL_KIND,  /* A vertical group. */
            LA_LabelText, "Logolength",        /* Group title text. */
         TAG_DONE);
            {
            LT_New(Handle,
               LA_Type,       HORIZONTAL_KIND,
            TAG_DONE);
               {
               LT_New(Handle,
                  LA_Type,       LEVEL_KIND,
                  LA_LabelText,  "IBM",
                  LA_Chars,      20,
                  LA_LabelChars, 5,
                  LA_ID,         ibmsize,
                  GTSL_Min,      1,
                  GTSL_Max,      99,
                  LAVL_Level,    Prefs.IBMSIZE,
                  GA_Disabled,   Prefs.IBMAUTO,
               TAG_DONE);

               LT_New(Handle,
                  LA_Type,       CHECKBOX_KIND,
                  LA_LabelText,  "Auto",
                  LA_ID,         ibmauto,
                  GTCB_Checked,  Prefs.IBMAUTO,
               TAG_DONE);

               LT_New(Handle, LA_Type, END_KIND, TAG_DONE);    /* This ends the current group. */
               }

            LT_New(Handle,
               LA_Type,       HORIZONTAL_KIND,
            TAG_DONE);
               {
               LT_New(Handle,
                  LA_Type,       LEVEL_KIND,
                  LA_LabelText,  "Topaz",
                  LA_Chars,      20,
                  LA_LabelChars, 5,
                  LA_ID,         topazsize,
                  GTSL_Min,1,
                  GTSL_Max,99,
                  LAVL_Level,    Prefs.TOPAZSIZE,
                  GA_Disabled,   Prefs.TOPAZAUTO,
               TAG_DONE);

               LT_New(Handle,
                  LA_Type,       CHECKBOX_KIND,
                  LA_LabelText,  "Auto",
                  LA_ID,         topazauto,
                  GTCB_Checked,  Prefs.TOPAZAUTO,
               TAG_DONE);

               LT_New(Handle, LA_Type, END_KIND, TAG_DONE);    /* This ends the current group. */
               }

            LT_New(Handle, LA_Type, END_KIND, TAG_DONE);    /* This ends the current group. */
            }

         LT_New(Handle,
            LA_Type, VERTICAL_KIND,
            LA_LabelText, "Pathes",        /* Group title text. */
         TAG_DONE);
            {
            LT_New(Handle,
               LA_Type,          STRING_KIND,
               LA_LabelText,     "Update-Dir",
               LA_ID,            updatedir,
               LA_Chars,         35,
               LAST_Picker,      TRUE,
               GTST_String,      Prefs.UPDATEDIR,
            TAG_DONE);

            LT_New(Handle,
               LA_Type,          STRING_KIND,
               LA_LabelText,     "Temp-Dir",
               LA_ID,            tempdir,
               LA_Chars,         35,
               LAST_Picker,      TRUE,
               GTST_String,      Prefs.TEMPDIR,
            TAG_DONE);

            LT_New(Handle, LA_Type, END_KIND, TAG_DONE);    /* This ends the current group. */
            }

         LT_New(Handle,
            LA_Type,      VERTICAL_KIND,  /* A vertical group. */
            LA_LabelText, "Misc",        /* Group title text. */
         TAG_DONE);
            {
            LT_New(Handle,
               LA_Type,             HORIZONTAL_KIND,
            TAG_DONE);
               {
               LT_New(Handle,
                  LA_Type,          STRING_KIND,
                  LA_LabelText,     "Filename",
                  LA_ID,            filename,
                  LA_Chars,         15,
                  LA_LabelChars,    1,
                  GTST_String,      Prefs.FILENAME,
               TAG_DONE);

               LT_New(Handle,
                  LA_Type,          TEXT_KIND,
                  LA_LabelText,     "Example:",
                  LA_LabelPlace,    PLACE_RIGHT,
               TAG_DONE);

               LT_New(Handle,
                  LA_Type,          TEXT_KIND,
                  LA_ID,            example_fn,
                  LA_LabelChars,    0,
                  LA_Chars,         15,
                  GTTX_Text,        examplestr,
                  GTTX_Border,      TRUE,
                  GTTX_Justification,GTJ_LEFT,
               TAG_DONE);

               LT_New(Handle, LA_Type, END_KIND, TAG_DONE);
               }

           LT_New(Handle,
               LA_Type,             HORIZONTAL_KIND,
               LAGR_Spread,         TRUE,
               LAGR_SameSize,       TRUE,
            TAG_DONE);
               {
               LT_New(Handle,
                  LA_Type,          TEXT_KIND,
                  LA_LabelText,     "Enable Packer(s):",
               TAG_DONE);

               LT_New(Handle,
                  LA_Type,          CHECKBOX_KIND,
                  LA_LabelText,     "LHA",
                  LA_ID,            packerlha,
                  GTCB_Checked,     Prefs.P_LHA,
               TAG_DONE);

               LT_New(Handle,
                  LA_Type,          CHECKBOX_KIND,
                  LA_LabelText,     "LZX",
                  LA_ID,            packerlzx,
                  GTCB_Checked,     Prefs.P_LZX,
               TAG_DONE);

               LT_New(Handle,
                  LA_Type,          CHECKBOX_KIND,
                  LA_LabelText,     "ZIP",
                  LA_ID,            packerzip,
                  GTCB_Checked,     Prefs.P_ZIP,
               TAG_DONE);

               LT_New(Handle, LA_Type, END_KIND, TAG_DONE);
               }

            LT_New(Handle,
               LA_Type,      VERTICAL_KIND,  /* A vertical group. */
            TAG_DONE);
               {
               LT_New(Handle,
                  LA_Type,          LEVEL_KIND,
                  LA_LabelText,     "Sysop-Commands",
                  LA_ID,            sysop,
                  LA_Chars,         20,
                  GTSL_Min,         1,
                  GTSL_Max,         255,
                  LAVL_Level,       Prefs.SYSOP,
               TAG_DONE);

               LT_New(Handle,
                  LA_Type,          CYCLE_KIND,
                  LA_LabelText,     "Commenttype",
                  LA_ID,            comment,
                  GTCY_Labels,      FCLabels,
                  GTCY_Active,      Prefs.COMMENT,
               TAG_DONE);

               LT_New(Handle, LA_Type, END_KIND, TAG_DONE);    /* This ends the current group. */
               }

            LT_New(Handle, LA_Type, END_KIND, TAG_DONE);
            }

         LT_New(Handle,
            LA_Type,          HORIZONTAL_KIND,
            LAGR_SameSize,    TRUE,
            LAGR_Spread,      TRUE,
         TAG_DONE);
            {
            LT_New(Handle,
               LA_Type,       BUTTON_KIND,
               LA_LabelText,  "Save",
               LA_Chars,      10,
               LA_ID,         save,
               LABT_ReturnKey,TRUE,
               LABT_DefaultCorrection, TRUE,
            TAG_DONE);

            LT_New(Handle,
               LA_Type,       BUTTON_KIND,
               LA_LabelText,  "Quit",
               LA_Chars,      10,
               LA_ID,         quit,
               LABT_EscKey,   TRUE,
               LABT_DefaultCorrection, TRUE,
            TAG_DONE);

            LT_New(Handle, LA_Type, END_KIND, TAG_DONE);
            }

         LT_New(Handle, LA_Type, END_KIND, TAG_DONE);    /* This ends the current group. */
         }

      WindowMenu = LT_NewMenuTags(
         LAMN_LayoutHandle, Handle,
         LAMN_TitleText,   "Project",
            LAMN_ItemText, "?\0About...",
            LAMN_KeyText,  "?",
            LAMN_UserData, m_about,
            LAMN_ItemText, NM_BARLABEL,
            LAMN_ItemText, "s\0Save",
            LAMN_KeyText,  "s",
            LAMN_UserData, m_save,
            LAMN_ItemText, NM_BARLABEL,
            LAMN_ItemText, "q\0Quit",
            LAMN_KeyText,  "q",
            LAMN_UserData, m_quit,
         TAG_DONE);

      if(Window = LT_Build(Handle,
        LAWN_Zoom,      TRUE,
        LAWN_BelowMouse,TRUE,
        LAWN_Title,     "1oo% T-Updater Config (c) Anti-g/1oo%/BB",
        LAWN_IDCMP,     IDCMP_CLOSEWINDOW | IDCMP_MENUPICK,
        WA_CloseGadget, TRUE,
        WA_DepthGadget, TRUE,
        WA_DragBar,     TRUE,
        WA_Activate,    TRUE,
        WA_NewLookMenus,TRUE,
        TAG_DONE))
         {
         struct IntuiMessage *Message;
         ULONG                MsgQualifier,
                              MsgClass;
         UWORD                MsgCode;
         struct Gadget       *MsgGadget;
         BOOL                 Done = FALSE;

         if(WindowMenu) SetMenuStrip(Window, WindowMenu);
         LT_ShowWindow(Handle, TRUE);

         do
            {
            WaitPort(Window->UserPort);

            while(Message = GT_GetIMsg(Window->UserPort))
               {
               MsgClass     = Message->Class;
               MsgCode      = Message->Code;
               MsgQualifier = Message->Qualifier;
               MsgGadget    = Message->IAddress;

               GT_ReplyIMsg(Message);

               LT_HandleInput(Handle,MsgQualifier,&MsgClass,&MsgCode,&MsgGadget);

               switch(MsgClass)
                  {
                  case IDCMP_CLOSEWINDOW:

                     Done = TRUE;
                     break;

                  case IDCMP_GADGETUP:

                     switch(MsgGadget->GadgetID)
                        {
                        case ibmsize:
                           Prefs.IBMSIZE = LT_GetAttributesA(Handle, ibmsize, NULL);
                           break;

                        case topazsize:
                           Prefs.TOPAZSIZE = LT_GetAttributesA(Handle, topazsize, NULL);
                           break;

                        case ibmauto:
                           Prefs.IBMAUTO = LT_GetAttributesA(Handle, ibmauto, NULL);
                           if (Prefs.IBMAUTO)
                              {
                              LT_SetAttributes(Handle,ibmsize,GA_Disabled,TRUE,TAG_DONE);
                              }
                           else
                              {
                              LT_SetAttributes(Handle,ibmsize,GA_Disabled,FALSE,TAG_DONE);
                              }
                           break;

                        case topazauto:
                           Prefs.TOPAZAUTO = LT_GetAttributesA(Handle, topazauto, NULL);
                           if (Prefs.TOPAZAUTO)
                              {
                              LT_SetAttributes(Handle,topazsize,GA_Disabled,TRUE,TAG_DONE);
                              }
                           else
                              {
                              LT_SetAttributes(Handle,topazsize,GA_Disabled,FALSE,TAG_DONE);
                              }
                           break;

                        case tempdir:
                           work = LT_GetAttributesA(Handle, tempdir, NULL);
                           strncpy(Prefs.TEMPDIR,(char *)work,MaxPathlength);
                           break;

                        case updatedir:
                           work = LT_GetAttributesA(Handle, updatedir, NULL);
                           strncpy(Prefs.UPDATEDIR,(char *)work,MaxPathlength);
                           break;

                        case sysop:
                           Prefs.SYSOP = LT_GetAttributesA(Handle, sysop, NULL);
                           break;

                        case comment:
                           Prefs.COMMENT = LT_GetAttributesA(Handle, comment, NULL);
                           break;

                        case packerlha:
                           Prefs.P_LHA = LT_GetAttributesA(Handle, packerlha, NULL);
                           break;

                        case packerlzx:
                           Prefs.P_LZX = LT_GetAttributesA(Handle, packerlzx, NULL);
                           break;

                        case packerzip:
                           Prefs.P_ZIP = LT_GetAttributesA(Handle, packerzip, NULL);
                           break;

                        case filename:
                           work = LT_GetAttributesA(Handle, filename, NULL);
                           strncpy(Prefs.FILENAME,(char *)work,35);
                           UpdateExampleSTR();
                           LT_SetAttributes(Handle,example_fn,GTTX_Text,examplestr,TAG_DONE);
                           break;

                        case quit:
                           Done = TRUE;
                           break;

                        case save:
                           if ( !WritePrefs() )
                              {
                              LT_DeleteHandle(Handle);
                              CloseLibrary(GTLayoutBase);
                              CloseLibrary(GadToolsBase);
                              CloseLibrary(IntuitionBase);
                              Fehler("Can't write %s",p_name);
                              }
                           Done = TRUE;
                           break;
                        }
                     break;

                  case IDCMP_MENUPICK:
                     while(MsgCode != MENUNULL)
                        {
                        struct  MenuItem        *MItem = ItemAddress(WindowMenu, MsgCode);
                        switch((int)GTMENUITEM_USERDATA(MItem))
                           {
                           case    m_about:
                              OpenAbout();
                              break;

                           case    m_save:
                              if ( !WritePrefs() )
                                 {
                                 LT_DeleteHandle(Handle);
                                 CloseLibrary(GTLayoutBase);
                                 CloseLibrary(GadToolsBase);
                                 CloseLibrary(IntuitionBase);
                                 Fehler("Can't write %s",p_name);
                                 }
                              Done = TRUE;
                              break;

                           case    m_quit:
                              Done = TRUE;
                              break;
                           }
                        MsgCode = MItem->NextSelect;
                        }

                  case IDCMP_IDCMPUPDATE:

                     switch(MsgGadget->GadgetID)
                        {
                        case tempdir:
                           if(FileRequester(1,temp,Prefs.TEMPDIR)) strncpy(Prefs.TEMPDIR,temp,MaxPathlength);
                           LT_SetAttributes(Handle,tempdir,GTST_String,Prefs.TEMPDIR,TAG_DONE);
                           break;

                        case updatedir:
                           if(FileRequester(1,temp,Prefs.UPDATEDIR)) strncpy(Prefs.UPDATEDIR,temp,MaxPathlength);
                           LT_SetAttributes(Handle,updatedir,GTST_String,Prefs.UPDATEDIR,TAG_DONE);
                           break;
                        }
                  }
               }
            }
         while(!Done);
      }

      LT_DeleteHandle(Handle);
   }
}

//=

//+ OpenAbout

void OpenAbout(void)
{

int retval;
struct Window       *reqwindow;
struct Window       *BuildEasyRequest();

struct EasyStruct aboutreq =
   {
   sizeof (struct EasyStruct), 0,
   "About",
   "1oo%% T-Updater Config v1.1 (96-10-04)\nwritten by Anti-g of 1oo%%/Bad Brothers\n\nSpecial thanks go to:\nJupiter8 for the example source\nOlaf `Olsen' Barthel for the gtlayout.library\nSwen K. Stullich for helping me with some problems",
   "OK"
   };

   LT_LockWindow(Window);

   reqwindow = BuildEasyRequest( NULL, &aboutreq, 0L, 50 );

   while ( (retval=SysReqHandler( reqwindow, NULL, TRUE ) ) == -2 )
      {
      ;
      }
   FreeSysRequest( reqwindow );

   LT_UnlockWindow(Window);
}

//=

//+ Request

BOOL FileRequester(int type, char *Result, char *Drawer)
{

   BOOL all_ok=FALSE;
   long Flags=0;
   char Titel[20];
   BOOL Drawerflag;

   if (type==0)
      {
      strcpy(Titel,"Select File");
      Drawerflag=FALSE;
      }
   else
      {
      strcpy(Titel,"Select Directory");
      Drawerflag=TRUE;
      }

   Flags |= FIL1F_NOFILES;

   if(AslFileRequest = (struct FileRequester *)AllocAslRequestTags(ASL_FileRequest,
         ASLFR_Window,        Window,
         ASLFR_TitleText,     Titel,
         ASLFR_InitialDrawer, Drawer,
         ASLFR_DrawersOnly,   Drawerflag,
         ASLFR_RejectIcons,   TRUE,
         ASLFR_RejectPattern, TRUE,
         ASLFR_Flags2,        Flags))
      {
      LT_LockWindow(Window);
      if(AslRequest(AslFileRequest,NULL))
         {
         if(type==0)
            {
            if(AslFileRequest -> fr_NumArgs == 0)
               {
               strncpy(Result, AslFileRequest -> fr_File,MaxPathlength);
               all_ok=TRUE;
               }
            }
         else
            {
            if(AslFileRequest -> fr_NumArgs == 0)
               {
               strncpy(Result, AslFileRequest -> fr_Drawer,MaxPathlength);
               all_ok=TRUE;
               }
            }
         }
      FreeAslRequest(AslFileRequest);
      }

   LT_UnlockWindow(Window);

   return(all_ok);
}

//=

//+ Checkpath

void CheckPath(char *Drawer)
{
   if ( (Drawer[strlen(Drawer)-1]!=':') && (strlen(Drawer)!=0) ) strcat(Drawer,"/");
}

//=

//+ UpdateExampleSTR
void UpdateExampleSTR(void)
{
   long t;
   struct tm *TM;

   time(&t);
   TM = gmtime(&t);
   strftime(examplestr, 31, Prefs.FILENAME,TM);
}
//=

/*-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//------------------------------> M A I N ! <----------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
*/

//+------------------------------> M A I N ! <----------------------------------

int main(int argc,char *argv[])
{

   stcgfp(temp,argv[0]);
   CheckPath(temp);
   strncpy(p_name,temp,MaxPathlength);          // prefs-filename
   strcat(p_name,"T-Updater.prefs");             // prefs-filename

   if( !ReadPrefs() ) Fehler("Can't open/create prefs");

//PrintPrefs();
   UpdateExampleSTR();

   if ((AslBase = OpenLibrary("asl.library", 37)) != NULL)
      {
      if ((IntuitionBase = OpenLibrary("intuition.library", 37)) != NULL)
         {
         if ((GadToolsBase = OpenLibrary("gadtools.library", 37)) != NULL)
            {
            if ((GTLayoutBase = OpenLibrary("gtlayout.library", 16)) != NULL)
               {
               OpenGUI();
               CloseLibrary(GTLayoutBase);
               }
            else
               puts("[1mError[0m: Couldn't open gtlayout.library v16+!");

            CloseLibrary(GadToolsBase);
            }
         CloseLibrary(IntuitionBase);
         }
      CloseLibrary(AslBase);
      }
}


//=

//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//--------------------------> M A I N    E N D! <------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------


