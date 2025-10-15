/* ________________________________________________________ 
  |                                                        |
  |^-->    .--------------------------------------.    <--^|
  |--^-->  | Programm: =T= Join Gui-config        |  <--^--|
  |-^--^-->| Version : 1.1                        |<--^--^-|
  |--^-->  | Date    : 97-07-02                   |  <--^--|
  |^-->    `--------------------------------------´    <--^|
  |________________________________________________________|
*/


//+ ----------------------- INCLUDES ---------------------

#include <proto/utility.h>
#include <proto/exec.h>
#include <proto/dos.h>
#include <clib/intuition_protos.h>
#include <clib/gadtools_protos.h>
#include <intuition/intuition.h>
#include <libraries/gadtools.h>

#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include <string.h>

#include <gtlayout/gtlayout.h>
#include <tempest/t-join.h>


//=

//+ ------------------- struct/prototypes ------------------------


struct Join_Prefs Prefs;

struct Library *IntuitionBase;
struct Library *GadToolsBase;
struct Library *GTLayoutBase;
struct LayoutHandle *Handle;
struct Window *Window;

struct Menu *WindowMenu;

void Fehler(char *,...);
BOOL InitPrefs(void);
void OpenAbout(void);
void OpenGUI(void);
BOOL ReadPrefs(void);
BOOL WritePrefs(void);

//=

//+-------------------  Globalvariables  --------------------------

#define topazsize     1
#define ibmsize       2
#define infobar       3
#define ansibar       4
#define numerical     5
#define showconf0     6
#define externaldesc  7
#define externalnames 8
#define output        9
#define ibmauto       10
#define topazauto     11
#define quit          12
#define save          13
#define m_about      995
#define m_quit       996
#define m_save       997

static UBYTE *VersTag ="$VER:1oo% =T= Join Config 1.1 (97-07-02)";    // VERSION-String

char temp[500];

char ibmstring[6];
char topazstring[6];

FILE *file;                                              // FILE-Handler
char p_name[100];                                        // prefs-filename

//=

//----------------------> Modules <--------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------


//+ FEHLER -> EXIT

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

//+ InitPrefs

BOOL InitPrefs(void)
{
   Prefs.TOPAZSIZE=1;
   Prefs.IBMSIZE=1;
   Prefs.TOPAZAUTO=TRUE;
   Prefs.IBMAUTO=TRUE;
   Prefs.INFOBAR=TRUE;
   Prefs.ANSIBAR=TRUE;
   Prefs.NUMERICAL=TRUE;
   Prefs.SHOWCONF0=FALSE;
   Prefs.EXTERNALDESC=FALSE;
   Prefs.EXTERNALNAMES=FALSE;
   Prefs.OUTPUT=2;

   return(TRUE);
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
   "1oo%% =T= Join Config v1.1 (97-07-02)\nwritten by Anti-g of 1oo%%\n\nSpecial thanks go to:\nJupiter8 for the example source\nOlaf `Olsen' Barthel for the gtlayout.library\nSwen K. Stullich for helping me with some problems",
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

//+ OpenGUI

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
            LA_LabelText, "Flags",        /* Group title text. */
         TAG_DONE);
            {

            LT_New(Handle,
               LA_Type,       HORIZONTAL_KIND,
            TAG_DONE);
               {
               LT_New(Handle,
                  LA_Type,       CHECKBOX_KIND,
                  LA_LabelText,  "Numerical",
                  LA_LabelChars, 15,
                  LA_ID,         numerical,
                  GTCB_Checked,  Prefs.NUMERICAL,
               TAG_DONE);

               LT_New(Handle,
                  LA_Type,       CHECKBOX_KIND,
                  LA_LabelText,  "Show Conf 0",
                  LA_LabelChars, 15,
                  LA_ID,         showconf0,
                  GTCB_Checked,  Prefs.SHOWCONF0,
               TAG_DONE);

               LT_New(Handle, LA_Type, END_KIND, TAG_DONE);    /* This ends the current group. */
               }

            LT_New(Handle,
               LA_Type,       HORIZONTAL_KIND,
            TAG_DONE);
               {
               LT_New(Handle,
                  LA_Type,       CHECKBOX_KIND,
                  LA_LabelText,  "Infobar",
                  LA_LabelChars, 15,
                  LA_ID,         infobar,
                  GTCB_Checked,  Prefs.INFOBAR,
               TAG_DONE);

               LT_New(Handle,
                  LA_Type,       CHECKBOX_KIND,
                  LA_LabelText,  "ANSI Bar",
                  LA_LabelChars, 15,
                  LA_ID,         ansibar,
                  GTCB_Checked,  Prefs.ANSIBAR,
               TAG_DONE);

               LT_New(Handle, LA_Type, END_KIND, TAG_DONE);    /* This ends the current group. */
               }

            LT_New(Handle,
               LA_Type,       HORIZONTAL_KIND,
            TAG_DONE);
               {
               LT_New(Handle,
                  LA_Type,       CHECKBOX_KIND,
                  LA_LabelText,  "External Desc.",
                  LA_LabelChars, 15,
                  LA_ID,         externaldesc,
                  GTCB_Checked,  Prefs.EXTERNALDESC,
               TAG_DONE);

               LT_New(Handle,
                  LA_Type,       CHECKBOX_KIND,
                  LA_LabelText,  "External Names",
                  LA_LabelChars, 15,
                  LA_ID,         externalnames,
                  GTCB_Checked,  Prefs.EXTERNALNAMES,
               TAG_DONE);

               LT_New(Handle, LA_Type, END_KIND, TAG_DONE);    /* This ends the current group. */
               }

            LT_New(Handle, LA_Type, END_KIND, TAG_DONE);    /* This ends the current group. */
            }

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
                  LA_Chars,      15,
                  LA_LabelChars, 5,
                  LA_ID,         ibmsize,
                  //GTSL_DispFunc, ShowSIZE,
                  GTSL_Min,1,
                  GTSL_Max,99,
                  //GTSL_LevelFormat, "%s",
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
                  LA_Chars,      15,
                  LA_LabelChars, 5,
                  LA_ID,         topazsize,
                  //GTSL_DispFunc, ShowSIZE,
                  GTSL_Min,1,
                  GTSL_Max,99,
                  //GTSL_LevelFormat, "%s",
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
            LA_Type,      VERTICAL_KIND,  /* A vertical group. */
            LA_LabelText, "Misc",        /* Group title text. */
         TAG_DONE);
            {
            LT_New(Handle,
               LA_Type,       INTEGER_KIND,
               LA_LabelText,  "Design File",
               LA_ID,         output,
               LA_Chars,      3,
               LAIN_Min,      1,
               LAIN_Max,      99,
               LAIN_UseIncrementers, TRUE,
               GTIN_Number, Prefs.OUTPUT,
            TAG_DONE);

            LT_New(Handle, LA_Type, END_KIND, TAG_DONE);    /* This ends the current group. */
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

            LT_New(Handle, LA_Type, END_KIND, TAG_DONE);    /* This ends the current group. */
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
        LAWN_Title,     "1oo% =T= Join Config (c) Anti-g/1oo%/BB",
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

          if(WindowMenu) SetMenuStrip(Window, WindowMenu); // activate menu
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

                 LT_HandleInput(Handle,MsgQualifier,&MsgClass, &MsgCode,&MsgGadget);

                 switch(MsgClass)
                 {
                    case IDCMP_CLOSEWINDOW:

                        Done = TRUE;
                        break;

                    case IDCMP_GADGETUP:

                        switch(MsgGadget->GadgetID)
                        {
                           case infobar:
                              Prefs.INFOBAR = LT_GetAttributesA(Handle, infobar, NULL);
                              break;

                           case ansibar:
                              Prefs.ANSIBAR = LT_GetAttributesA(Handle, ansibar, NULL);
                              break;

                           case numerical:
                              Prefs.NUMERICAL = LT_GetAttributesA(Handle, numerical, NULL);
                              break;

                           case showconf0:
                              Prefs.SHOWCONF0 = LT_GetAttributesA(Handle, showconf0, NULL);
                              break;

                           case externaldesc:
                              Prefs.EXTERNALDESC = LT_GetAttributesA(Handle, externaldesc, NULL);
                              break;

                           case externalnames:
                              Prefs.EXTERNALNAMES = LT_GetAttributesA(Handle, externalnames, NULL);
                              break;

                           case ibmsize:
                              Prefs.IBMSIZE = LT_GetAttributesA(Handle, ibmsize, NULL);
                              break;

                           case topazsize:
                              Prefs.TOPAZSIZE = LT_GetAttributesA(Handle, topazsize, NULL);
                              break;

                           case output:
                              Prefs.OUTPUT = LT_GetAttributesA(Handle, output, NULL);
                              break;

                           case ibmauto:
                              Prefs.IBMAUTO = LT_GetAttributesA(Handle, ibmauto, NULL);
                              if (Prefs.IBMAUTO)
                                 {
                                 LT_SetAttributes(Handle,ibmsize,
                                    GA_Disabled,   TRUE,
                                 TAG_DONE);
                                 }
                              else
                                 {
                                 LT_SetAttributes(Handle,ibmsize,
                                    GA_Disabled,   FALSE,
                                 TAG_DONE);
                                 }
                              break;

                           case topazauto:
                              Prefs.TOPAZAUTO = LT_GetAttributesA(Handle, topazauto, NULL);
                              if (Prefs.TOPAZAUTO)
                                 {
                                 LT_SetAttributes(Handle,topazsize,
                                    GA_Disabled,   TRUE,
                                 TAG_DONE);
                                 }
                              else
                                 {
                                 LT_SetAttributes(Handle,topazsize,
                                    GA_Disabled,   FALSE,
                                 TAG_DONE);
                                 }
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

                 }
              }
          }
          while(!Done);
      }

      LT_DeleteHandle(Handle);
   }
}

//=

//+ ReadPrefs

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

//+ WritePrefs

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
   if ( (temp[strlen(temp)-1]!=':') && (strlen(temp)!=0) ) strcat(temp,"/");
   strcpy(p_name,temp);                         // prefs-filename
   strcat(p_name,"T-Join.prefs");               // prefs-filename


   if( !ReadPrefs() ) Fehler("Can't open/create prefs");

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


