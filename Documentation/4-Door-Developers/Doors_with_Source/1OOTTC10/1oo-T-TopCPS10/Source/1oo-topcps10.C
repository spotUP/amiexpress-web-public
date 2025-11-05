
/* ________________________________________________________
  |                                                        |
  |^-->    .--------------------------------------.    <--^|
  |--^-->  | Programm: 1oo% T=TopCPS              |  <--^--|
  |-^--^-->| Version : 1.0                        |<--^--^-|
  |--^-->  | Date    : 97-05-19                   |  <--^--|
  |^-->    `--------------------------------------´    <--^|
  |________________________________________________________|
*/

//+ INCLUDES

#include <proto/utility.h>
#include <exec/execbase.h>
#include <proto/exec.h>
#include <proto/dos.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include <exec/memory.h>

#include <string.h>
#include <time.h>
#include <tempest/headers.h>
#include <tempest/defines.h>
#include <tempest/T-TopCPS.h>
#include <tempest/ExtDesign.h>

//------------------------------- FILE I/O ------------------------------

#include <sys/types.h>
#include <sys/stat.h>

//=

//+ Structures/Defines

struct MyMessage
{
   struct Message Msg; // for Exec message routines
   ULONG  Command;     // Command to be executed.

   char   *text1,
          *text2,
          *text3;
   int    Value1,
          Value2;
   ULONG  LongValue;
   LONGBITS Flags;
   int    carrier;
   struct User       *User;             // Pointers!
   struct SystemData *SystemData;
   struct NodeData   *NodeData;
  };

typedef struct Top_CPS *CPS_ptr;

struct User       *User;
struct SystemData *SystemData;
struct NodeData   *NodeData;
struct MsgPort *MyPort = NULL;
struct MyMessage *msg;
struct MyMessage send;
struct node_info nody;

int  DoorStart(TEXT *);
int  DOORIO(WORD);
VOID CloseStuff(void);
VOID Activity(BYTE,TEXT *);
VOID pl(TEXT *fmt,...);
VOID PL(TEXT *);
int  CheckKey(void);
int  CursorHotKey(VOID);
int  GetValue(int);
int Loadnody(int);

long CheckCPS(char *);
BOOL CheckSize(char *);
void CheckTopCPS(void);
void DEBUG(int);
BOOL ExchangeLine(char *, int, struct TagItem *);
void ExternalDesign(char *, int, char *, int);
int  ExternalPref(char *);
void Fehler(char *,...);
void InitData(CPS_ptr);
void LoadDesign2Mem(void);
void MainInits(char *);
CPS_ptr NewCPS(void);
BOOL ReadData(void);
BOOL ReadLine(char *);
BOOL ReadNextBlock(void);
void ShowText(void);
void TranslateLine(char *,...);
BOOL WriteData(void);

//=

//+ Global Variables

#define block_size 512     // blocksize for log-file reading
#define min_size   50000   // minimum size to be included in topcps

static UBYTE *VersTag ="$VER:1oo% T=TopCPS 1.0 (97-05-19)";    // VERSION-String

int  Result,Error,x;
int  NODE = 0;
long count;                                           // file-position
int  pos_b;                                           // block-position
char MyName[60],st[60],nodename[255];
char String[1024];                                    // must be 1024 coz the GetPromptsLine()
char read_buffer[block_size+2];                       // read_buffer
int  Local_CPS;                                       // users best cps

CPS_ptr TOPCPS[99];                                 // max 99 nodes

char d_name[255]="T-TopCPS.data";                       // config-filename
char e_name[255]="T-TopCPS.output.";                    // output-filename
char log_name[255];                                     // logfile-filename

FILE *FH;                                             // FileHandler
BPTR Fh;                                             // FileHandler

dl_ptr firstline=NULL;                                // erste line des designfiles

int designlines;                                     // number of lines

//=

//-----------------------------------------------------------
//-----------------------------------------------------------
//----------------------> Modules <--------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------

//+ CheckCPS

long CheckCPS(char *cps_string)
{
int stat;
long temp_long;
long t;
char temp_string[10];
char *getstring;

   time(&t);
   stat=Loadnody(NODE);
   if(stat==0) Fehler("NodeInfo File Not Found");

   cps_string = cps_string + 9;
   temp_long=atol(cps_string);

   sprintf(temp_string,"%d",temp_long);
   strrev(temp_string);
   temp_long = atol(temp_string);

   if (Local_CPS < temp_long) Local_CPS = temp_long;

   strrev(cps_string);
   if (!strncmp(cps_string,"(UPLOAD)",8) )
      {
      if (TOPCPS[NODE]->top_ul < temp_long)
         {
         if (CheckSize(cps_string) )
            {
            TOPCPS[NODE]->top_ul = temp_long;
            strcpy(TOPCPS[NODE]->ul_user, User->Name);
            cps_string = cps_string + 9;
            getstring = strtok(cps_string, ", ");
            strcpy(TOPCPS[NODE]->ul_filename, getstring);
            getstring = strtok(NULL, ", ");
            TOPCPS[NODE]->ul_size = atol(getstring);
            TOPCPS[NODE]->ul_date = t;
            TOPCPS[NODE]->ul_baud = nody.GLOB->CurrentBaudRate;
            //pl("(UL) Filename: \"%s\" Filesize: \"%d\" CPS: \"%d\"\r\n", TOPCPS[NODE]->ul_filename, TOPCPS[NODE]->ul_size, TOPCPS[NODE]->top_ul);
            }
         }
      }
   if (!strncmp(cps_string,"(DOWNLOAD)",8) )
      {
      if (TOPCPS[NODE]->top_dl < temp_long)
         {
         if (CheckSize(cps_string) )
            {
            TOPCPS[NODE]->top_dl = temp_long;
            strcpy(TOPCPS[NODE]->dl_user, User->Name);
            cps_string = cps_string + 11;
            getstring = strtok(cps_string, ", ");
            strcpy(TOPCPS[NODE]->dl_filename, getstring);
            getstring=strtok(NULL, ", ");
            TOPCPS[NODE]->dl_size = atol(getstring);
            TOPCPS[NODE]->dl_date = t;
            TOPCPS[NODE]->dl_baud = nody.GLOB->CurrentBaudRate;
            //pl("(DL) Filename: \"%s\" Filesize: \"%d\" CPS: \"%d\"\r\n", TOPCPS[NODE]->dl_filename, TOPCPS[NODE]->dl_size, TOPCPS[NODE]->top_dl);
            }
         }
      }

   return (temp_long);
}
//=

//+ CheckSize

BOOL CheckSize(char *cpsstring) // if true file-size is ok else file is to small
{
char tempstring[255];
char *getstring;

   strcpy(tempstring,cpsstring);
   getstring = strtok(tempstring,", ");
   getstring=strtok(NULL,", ");
   getstring=strtok(NULL,", ");
   if (atol(getstring) >= min_size) return (TRUE);
   else return (FALSE);
}
//=

//+ CheckTopCPS

void CheckTopCPS(void)
{
if (TOPCPS[0] -> top_ul < TOPCPS[ NODE ] -> top_ul)
   {
   pl("changing top_ul\r\n");
   TOPCPS[0] -> top_ul = TOPCPS[ NODE ] -> top_ul;
   strcpy(TOPCPS[0] -> ul_user , TOPCPS[ NODE ] -> ul_user);
   strcpy(TOPCPS[0] -> ul_filename , TOPCPS[ NODE ] -> ul_filename);
   TOPCPS[0] -> ul_date = TOPCPS[ NODE ] -> ul_date;
   TOPCPS[0] -> ul_size = TOPCPS[ NODE ] -> ul_size;
   TOPCPS[0] -> ul_baud = TOPCPS[ NODE ] -> ul_baud;
   }
if (TOPCPS[0] -> top_dl < TOPCPS[ NODE ] -> top_dl)
   {
   pl("changing top_dl\r\n");
   TOPCPS[0] -> top_dl = TOPCPS[ NODE ] -> top_dl;
   strcpy(TOPCPS[0] -> dl_user , TOPCPS[ NODE ] -> dl_user);
   strcpy(TOPCPS[0] -> dl_filename , TOPCPS[ NODE ] -> dl_filename);
   TOPCPS[0] -> dl_date = TOPCPS[ NODE ] -> dl_date;
   TOPCPS[0] -> dl_size = TOPCPS[ NODE ] -> dl_size;
   TOPCPS[0] -> dl_baud = TOPCPS[ NODE ] -> dl_baud;
   }
}
//=

//+ DEBUG

void DEBUG(int nr)
{
int k;

   pl("Debug-Point %d\r\n",nr);
   k=CursorHotKey();
   if (k==27) CloseStuff();
}
//=

//+ExchangeLine

BOOL ExchangeLine(char *input_str, int t_length, struct TagItem *t_items)
{
struct TagItem *tag;
BOOL   all_ok=FALSE;
char   tempc[30];
int    tag_type=999;

   if (t_length!=0)
      {
      switch (t_length)
         {
         case 3:
         case 4:
         case 5:
         case 6:

            break;

         case 7:

            if (strnicmp(input_str,"NUL_CPS",t_length)==0)
               {
               tag_type=nul_cps;
               break;
               }

            if (strnicmp(input_str,"NDL_CPS",t_length)==0)
               {
               tag_type=ndl_cps;
               break;
               }

            if (strnicmp(input_str,"GUL_CPS",t_length)==0)
               {
               tag_type=gul_cps;
               break;
               }

            if (strnicmp(input_str,"GDL_CPS",t_length)==0)
               {
               tag_type=gdl_cps;
               break;
               }

            break;

         case 8:

            if (strnicmp(input_str,"USER_CPS",t_length)==0)
               {
               tag_type=user_cps;
               break;
               }

            if (strnicmp(input_str,"NUL_USER",t_length)==0)
               {
               tag_type=nul_user;
               break;
               }

            if (strnicmp(input_str,"NDL_USER",t_length)==0)
               {
               tag_type=ndl_user;
               break;
               }

            if (strnicmp(input_str,"GUL_USER",t_length)==0)
               {
               tag_type=gul_user;
               break;
               }

            if (strnicmp(input_str,"GDL_USER",t_length)==0)
               {
               tag_type=gdl_user;
               break;
               }

             if (strnicmp(input_str,"NUL_DATE",t_length)==0)
               {
               tag_type=nul_date;
               break;
               }

            if (strnicmp(input_str,"NDL_DATE",t_length)==0)
               {
               tag_type=ndl_date;
               break;
               }

            if (strnicmp(input_str,"GUL_DATE",t_length)==0)
               {
               tag_type=gul_date;
               break;
               }

            if (strnicmp(input_str,"GDL_DATE",t_length)==0)
               {
               tag_type=gdl_date;
               break;
               }

            if (strnicmp(input_str,"NUL_BAUD",t_length)==0)
               {
               tag_type=nul_baud;
               break;
               }

            if (strnicmp(input_str,"NDL_BAUD",t_length)==0)
               {
               tag_type=ndl_baud;
               break;
               }

            if (strnicmp(input_str,"GUL_BAUD",t_length)==0)
               {
               tag_type=gul_baud;
               break;
               }

            if (strnicmp(input_str,"GDL_BAUD",t_length)==0)
               {
               tag_type=gdl_baud;
               break;
               }

            if (strnicmp(input_str,"NUL_FILE",t_length)==0)
               {
               tag_type=nul_file;
               break;
               }

            if (strnicmp(input_str,"NDL_FILE",t_length)==0)
               {
               tag_type=ndl_file;
               break;
               }

            if (strnicmp(input_str,"GUL_FILE",t_length)==0)
               {
               tag_type=gul_file;
               break;
               }

            if (strnicmp(input_str,"GDL_FILE",t_length)==0)
               {
               tag_type=gdl_file;
               break;
               }

            if (strnicmp(input_str,"NUL_SIZE",t_length)==0)
               {
               tag_type=nul_size;
               break;
               }

            if (strnicmp(input_str,"NDL_SIZE",t_length)==0)
               {
               tag_type=ndl_size;
               break;
               }

            if (strnicmp(input_str,"GUL_SIZE",t_length)==0)
               {
               tag_type=gul_size;
               break;
               }

            if (strnicmp(input_str,"GDL_SIZE",t_length)==0)
               {
               tag_type=gdl_size;
               break;
               }

           break;
         }
      }
   else return(FALSE);

   strncpy(tempc,&input_str[t_length+1],29);

   while (tag = NextTagItem(&t_items))
      {
      if (tag->ti_Tag==tag_type)
         {
         sprintf(input_str,tempc,tag->ti_Data);
         all_ok=TRUE;
         }
      }

return(all_ok);
}
//=

//+ExternalDesign

void ExternalDesign(char *area, int i, char *temp, int maxlength)
{
int o=0;
dl_ptr templine;

   templine=firstline;

   while (templine)
      {
      if (templine->line[0]=='#')
         {
         if (strnicmp(&templine->line[1],area,strlen(area))==0)
            {
            o=1;
            break;
            }
         }
      templine=templine->next;
      }

   if (o!=1) Fehler("Output file error. Can't find %s",area);

   for(o=0;o<i;o++)
      {
      if (templine) templine=templine->next;
      else Fehler("Output file error. Can't load line");
      }

   strncpy(temp,templine->line,maxlength-2);

   o=strlen(temp);

   temp[o-1]='\r';
   temp[o]='\n';
   temp[o+1]='\0';

}//=

//+ExternalPref
int ExternalPref(char *area)
{
BOOL o=FALSE;
char *p;
dl_ptr templine;

   templine=firstline;

   while (templine)
      {
      if (templine->line[0]=='#')
         {
         if (strnicmp(&templine->line[1],area,strlen(area))==0)
            {
            o=TRUE;
            break;
            }
         }
      templine=templine->next;
      }

   if (o!=TRUE) Fehler("Output file error. Can't find %s",area);

   p=templine->line;

   while ((*p++ != '=') && (*p!=0));

   return(atoi(p));
}//=

//+ FEHLER -> EXIT

void Fehler(char *fmt,...)
{
   va_list args;
   char s[255];
   va_start(args,fmt);
   vsprintf(s,fmt,args);
   va_end(args);

   pl("\r\n[31mT=TopCPS Error: %s[0m\r\n", &s[0]);
   CloseStuff();
}//=

//+ LoadDesign2Mem

void LoadDesign2Mem(void)
{
int Length;
char tempbuffer[maxlinelength];
dl_ptr oldline=NULL;
dl_ptr newline=NULL;
FILE *file;

   if ((file = fopen (e_name,"r")) == (FILE *) NULL) Fehler("Can't open %s",e_name);

   while (feof(file)==0)
      {
      fgets(tempbuffer,maxlinelength,file);
      Length=strlen(tempbuffer);
      Length++;

      newline = (dl_ptr) AllocVec (sizeof (struct DesignLine),0L);
      newline->line = (char *) AllocVec (Length,MEMF_CLEAR);
      newline->next=NULL;

      strcpy(newline->line,tempbuffer);

      if (firstline==NULL) firstline=newline;
      else oldline->next=newline;
      oldline=newline;

      }

   fclose (file);

}//=

//+ InitData

void InitData(CPS_ptr CPS)
{
   CPS->top_ul=0;
   CPS->ul_user[0]='\0';
   CPS->ul_baud=0;
   CPS->ul_filename[0]='\0';
   CPS->ul_date=0;
   CPS->ul_size=0;

   CPS->top_dl=0;
   CPS->dl_user[0]='\0';
   CPS->dl_baud=0;
   CPS->dl_filename[0]='\0';
   CPS->dl_date=0;
   CPS->dl_size=0;
}//=

//+ MainInits

void MainInits(char *path)
{
   stcgfp(String,path);
   if (String[strlen(String)-1]!=':') strcat(String,"/");

   strins(d_name,String);               // config-filename

   if ((User->AnsiType==2) || (User->AnsiType==3))
      {
      strcat(e_name,"ibm");
      }
   else
      {
      strcat(e_name,"ami");
      }

   strins(e_name,String);

   sprintf(log_name,"%sCallersLog-%d",SystemData->LogsPath,NODE);

// ---------------- get prefs ---------------------------

   for (x=0; x <= SystemData->NumberOfLines; x++)
      {
      if ((TOPCPS[x] = NewCPS()) == NULL) Fehler("Can't allocate Data!");
      }

   if (!ReadData()) Fehler("Can't open %s.",d_name);

   pos_b = -1; // init block-position

   Local_CPS=0;

   LoadDesign2Mem();

   designlines=ExternalPref("OUTPUT");
}
//=

//+ NewCPS

CPS_ptr NewCPS(void)
{
CPS_ptr newCPS;

   newCPS = (CPS_ptr) AllocMem (sizeof (struct Top_CPS),0L);
   if (newCPS)
      {
      InitData(newCPS);
      return(newCPS);
      }
   else return((CPS_ptr) NULL);
}

//=

//+ ReadLine

BOOL ReadLine(char *tempstring)
{
int pos=0;
BOOL End_Of_File=FALSE;

   do
      {
      if  (pos_b < 0) // if block-pos neg read next block
         {
         End_Of_File=ReadNextBlock();
         }
      tempstring[pos] = read_buffer[pos_b--]; // copy char by char
      }
   while((tempstring[pos++] != 10) && (End_Of_File == FALSE));

   tempstring[--pos]='\0';
   return (End_Of_File);
}
//=

//+ReadData

BOOL ReadData(void)
{
   if ((FH = fopen (d_name,"r")) != (FILE *) NULL)
      {
      for (x=0; x <= SystemData->NumberOfLines; x++)
         fread(TOPCPS[x], sizeof(struct Top_CPS),1,FH);

      fclose(FH);
      }

   return(TRUE);
}

//=

//+ ReadNextBlock
BOOL ReadNextBlock(void)
{
   if (count < 0 ) return (TRUE);

   count= count - block_size;

   if (count >= 0 )
      {
      Seek( Fh, count, OFFSET_BEGINNING );
      FRead(Fh, read_buffer, block_size,1);
      pos_b = block_size-1;
      read_buffer[block_size]='\0';
      }
   else  // file-end or better file-start :)
      {
      Seek( Fh, 1, OFFSET_BEGINNING );
      FRead(Fh, read_buffer, block_size, 1);
      pos_b = block_size + count -2 ;
      read_buffer[block_size + count-1] = '\0';
      }

   return (FALSE);
}
//=

//+ShowText

void ShowText(void)
{
int o;
char node_ul_date[50];
char node_dl_date[50];
char glob_ul_date[50];
char glob_dl_date[50];

   strcpy(node_ul_date, ctime(&TOPCPS[NODE]->ul_date) );
   strcpy(node_dl_date, ctime(&TOPCPS[NODE]->dl_date) );
   strcpy(glob_ul_date, ctime(&TOPCPS[0]->ul_date) );
   strcpy(glob_dl_date, ctime(&TOPCPS[0]->dl_date) );

   for(o=0; o < designlines; o++)
      {
      ExternalDesign("OUTPUT",o+1,String,1024);
      TranslateLine(String,
         user_cps,   Local_CPS,
         nul_cps,    TOPCPS[NODE]->top_ul,
         ndl_cps,    TOPCPS[NODE]->top_dl,
         nul_user,   TOPCPS[NODE]->ul_user,
         ndl_user,   TOPCPS[NODE]->dl_user,
         nul_date,   node_ul_date,
         ndl_date,   node_dl_date,
         nul_baud,   TOPCPS[NODE]->ul_baud,
         ndl_baud,   TOPCPS[NODE]->dl_baud,
         nul_file,   TOPCPS[NODE]->ul_filename,
         ndl_file,   TOPCPS[NODE]->dl_filename,
         nul_size,   TOPCPS[NODE]->ul_size,
         ndl_size,   TOPCPS[NODE]->dl_size,

         gul_cps,    TOPCPS[0]->top_ul,
         gdl_cps,    TOPCPS[0]->top_dl,
         gul_user,   TOPCPS[0]->ul_user,
         gdl_user,   TOPCPS[0]->dl_user,
         gul_date,   glob_ul_date,
         gdl_date,   glob_dl_date,
         gul_baud,   TOPCPS[0]->ul_baud,
         gdl_baud,   TOPCPS[0]->dl_baud,
         gul_file,   TOPCPS[0]->ul_filename,
         gdl_file,   TOPCPS[0]->dl_filename,
         gul_size,   TOPCPS[0]->ul_size,
         gdl_size,   TOPCPS[0]->dl_size,
         TAG_DONE);
      PL(String);
      }

   CursorHotKey();
}

//=

//+TranslateLine

void TranslateLine(char *inputstr,...)
{
va_list VarArgs;
struct TagItem *tagitems;

int   i=0,j,starting,ending=0,taglength=0;
char  tempa[255];

   va_start(VarArgs,inputstr);
   tagitems=(struct TagItem *)VarArgs;
   va_end(VarArgs);

   while (inputstr[i]!=0)
      {
      if (inputstr[i++]=='@')
         {
         starting=i;
         j=starting;
         while ((inputstr[j]!=0) && (ending==0))
            {
            if (inputstr[j]=='=')
               {
               taglength=j;
               }
            if (inputstr[j++]==';')
               {
               ending=j-1;
               if ((ending-starting<255) && (taglength!=0)) strmid(inputstr,tempa,starting+1,ending-starting);
               else return;
               if (ExchangeLine(tempa,taglength-starting,tagitems))
                  {
                  inputstr[starting-1]=0;
                  strcat(inputstr,&inputstr[ending+1]);
                  strins(&inputstr[starting-1],tempa);
                  }
               }
            }
         taglength=0;
         ending=0;
         }
      }
}
//=

//+WriteData

BOOL WriteData(void)
{
   if ((FH = fopen (d_name,"w+")) == (FILE *) NULL) return(FALSE);
   else
      {
      for (x=0; x <= SystemData->NumberOfLines; x++)
         fwrite(TOPCPS[x],sizeof(struct Top_CPS),1,FH);

      fclose(FH);
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
struct FileInfoBlock FI_Block;
BOOL END;
char *cps;

   if(!DoorStart(argv[1])) { PutStr("Tempest Door (1oo% =T= TopCPS 1.0)\n"); exit(0); }
   SetTaskPri(FindTask(0),SystemData->DoorsPriority);
   Activity(99,"1oo% =T= TopCPS 1.0");

//---------------------------------> INIT's <----------------------------------

   NODE=atoi(argv[1]);

   if (NODE == 0) CloseStuff();

   MainInits(argv[0]);

   if ((Fh = Open (log_name,MODE_OLDFILE)) == NULL) Fehler("Can't open %s",log_name);
   else
      {
      ExamineFH(Fh,&FI_Block); // get size of logfile

      count = FI_Block.fib_Size;

      do
         {
         END=ReadLine(String);
         if (cps = strstr(String,":RE ,SPC ")) // check for cps-entries
            {              
            CheckCPS(cps);
            }
         if (strcmp(String,"'--------------`") == 0 ) break; // end of user-log
         }
      while ((!END) || (pos_b >= 0));

      Close(Fh);
      }

   CheckTopCPS(); // check if top_cps is a global_top
   if (!WriteData()) Fehler("Can't write %s.",d_name);

   ShowText();

   CloseStuff();
}

//=

/*-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//--------------------------> M A I N    E N D! <------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
*/

//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//---------------------> DOOR-STUFF <------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------

//+------------> DOORIO - MUST BE IN! <----------------------
//-----------------------------------------------------------
//-----------------------------------------------------------

int DoorStart(TEXT *node)
{
  int x;
  struct MsgPort *HisPort;
  send.carrier=0;
  // Find Tempest BBS Port
  sprintf(st,"%s:TEMPEST_DOOR",node);
  HisPort = FindPort(st);
  if(HisPort==NULL) return(int)FALSE;
  // FIND UNIQUE NAME FOR DOOR PORT
  for(x=0;x<200;x++)
   {
    sprintf(MyName,"%s-%d:DOOR_PORT",node,x);
    if(FindPort(MyName)==NULL) break;
   }
  if(x>=200) return(int)FALSE;
  MyPort = CreatePort(MyName,0L);
  if(MyPort==NULL)
   {
    PutStr("Cant open port");
    return(int)FALSE;
   }
  DOORIO(0);
  User=*&send.User;
  SystemData=*&send.SystemData;
  NodeData=*&send.NodeData;
  return(int)TRUE;
}

//-----------------------------------------------------------
//-------------> DOORIO - MUST BE IN! <----------------------
//-----------------------------------------------------------

int DOORIO(WORD Command)
{
 struct MsgPort *HisPort;
 if(send.carrier) return(0);
 send.Command=Command;
 HisPort = FindPort(st);
 if(HisPort!=NULL)
  {
   send.Msg.mn_Node.ln_Type = NT_MESSAGE;
   send.Msg.mn_Length = sizeof(send);
   send.Msg.mn_ReplyPort = MyPort;
   send.carrier=0;
   PutMsg((struct MsgPort *)HisPort,(struct Message *)&send);
   Wait(1 << MyPort->mp_SigBit);
   GetMsg(MyPort);
   if((send.carrier)&&(send.Command!=999)) CloseStuff();
   return(1);
  }
 return(0);
}

//-----------------------------------------------------------
//-------------> CLOSEDOOR - MUST BE IN! <-------------------
//-----------------------------------------------------------
VOID CloseStuff(void)
{
dl_ptr templine;

   DOORIO(999);
   while(msg=(struct MyMessage *)GetMsg(MyPort)) ReplyMsg((struct Message *)msg);
   if(MyPort) DeletePort(MyPort);

// delete Header and structs

   for (x=0; x <= 98; x++)
      if (TOPCPS[x] != NULL) FreeMem(TOPCPS[x], sizeof(struct Top_CPS) );

 templine = firstline;

 while (templine != NULL)
      {
      firstline = templine->next;
      FreeVec(templine->line);
      FreeVec(templine);
      templine = firstline;
      }

 exit(0);
}

//*****  Load Nody  ******
//************************

int Loadnody(int node)
{
 char string[50];
 register int y;
 int filee;
 sprintf(string,"Node:NodeInfo_%d",node);
 for(y=1;y<3;y++)
  {
   filee=Open(string,MODE_OLDFILE);
   if(filee!=0)
    {
     Read(filee,(char *)&nody,sizeof(struct node_info));
     Close(filee);
     return(1);
    }
  }
 return(0);
}

//*****************************
//*****  PL (Print Line)  ***** // Command 1 with "%s %d",xxx,xxx) paramter support
//*****************************
VOID pl(TEXT *fmt,...)
{
 va_list args;
 TEXT s[500];
 va_start(args,fmt);
 vsprintf(s,fmt,args);
 va_end(args);
 send.text1=&s[0];
 DOORIO(1);
}
//*****************************
//*****  PL (Print Line)  ***** // Command 1
//*****************************
VOID PL(TEXT *string)
{
 send.text1=string;
 DOORIO(1);
}

//***************************
//*****  CheckKey       ***** // Command 15
//***************************

int CheckKey(VOID)
{
 send.Value2=0;
 DOORIO(15);
 return(send.Value2);
}

//***************************
//*****  Cursor HotKey  ***** // Command 17
//***************************
int CursorHotKey(VOID)
{
 DOORIO(17);
 return(send.Value1);
}

//***************************
//*****  input string   ***** // Command 20
//***************************

VOID input(TEXT *mstring,int len)
{
  send.Value1=len;
  send.text1 =mstring;
  DOORIO(20);
}

//**********************
//*****  Activity  ***** // Command 44
//**********************
VOID Activity(BYTE act,TEXT *s)
{
 send.Value1=act;
 send.text1=s;
 DOORIO(44);
}

//=

