/* ________________________________________________________ 
  |                                                        |
  |^-->    .--------------------------------------.    <--^|
  |--^-->  | Programm: 1oo% T-Join                |  <--^--|
  |-^--^-->| Version : 2.0                        |<--^--^-|
  |--^-->  | Date    : 97-06-30                   |  <--^--|
  |^-->    `--------------------------------------´    <--^|
  |________________________________________________________|
*/


//+ ----------------------- INCLUDES ---------------------

#include <proto/utility.h>
#include <proto/exec.h>
#include <proto/dos.h>
#include <dos.h>
#include <stdio.h>
#include <stdlib.h>
#include <exec/memory.h>
#include <exec/types.h>
#include <stdarg.h>
#include <ctype.h>

#include <string.h>
#include <time.h>
#include <tempest/headers.h>
#include <tempest/defines.h>
#include <tempest/T-Join.h>

//------------------------------- FILE I/O ------------------------------

#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>

//=

//+-------------------  Structures/Defines --------------------
//-------------------------------------------------------------
//-------------------------------------------------------------

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
   struct Today        *Today;
  };

   struct Names
      {
      char Name[100];
      char What[250];
      };

struct Globals    Globals;
struct User          *User;
struct SystemData *SystemData;
struct NodeData   *NodeData;
struct Today          *Today;

struct MsgPort *MyPort = NULL;
struct MyMessage *msg;
struct MyMessage send;
struct Down_Load Down_Load;
struct DownLoad_Status DownLoad_Status;
struct File_Area File_Area;
struct Msg_Area Msg_Area;
struct Names Names[41];
struct node_info nody;

struct Join_Prefs Prefs;

int  DoorStart(TEXT *);
int  DOORIO(WORD);
VOID CloseStuff(VOID);
VOID Activity(BYTE,TEXT *);
VOID pl(TEXT *fmt,...);
VOID PL(TEXT *);
VOID GetStr(TEXT *s,int opt);
int  CursorHotKey(VOID);
VOID showfile(TEXT *);
VOID StripAllAnsiCodes(TEXT *);
VOID JoinConference(ULONG Area);
int  Loadnody(int node);
int  CheckAreaAccess(int Area);

void ClearOld(void);
BOOL ExchangeLine(char *, int, struct TagItem *);
void ExternalDesign(char *, int, char *, int);
int  ExternalPref(char *);
void Fehler(char *,...);
int  GetConfig(char*, char* ,FILE*);
int  GetL_Size(void);
int  GetStringLength(char*);
void infoline(int);
void InitItems(int);
void InitScreen(void);
void Jump(int);
void LoadDesign2Mem(void);
void MainInits(char *);
VOID Movement(VOID);
BOOL ReadPrefs(void);
void TranslateLine(char *,...);

//=

//+-----------------> Global Variables <---------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------

#define maxareas      40                           // max number of areas
#define maxlinelength 500                          // max line length of designlines

#define Pages         100
#define Xpos          101
#define Page          102
#define Area_l        103
#define Area_r        104
#define Name_l        105
#define Name_r        106
#define What_l        107
#define What_r        108
#define Center        109
#define Infostr       110
#define N_area        111

int  posx=1;                                       // cursor-pos

int  Result,Error,NODE,x;
char MyName[60],st[60];   
char temp[500];

int  cursor;                                       // input-key
int  l_size;                                       // logo-size
int  flag=0;                                       // 0=links 1=rechts
int  zahl=0;                                       // 0 = 1. zahl    1 = 2.zahl
int  conf[42];                                     // item to conf
int  item[42];                                     // conf to item
int  max=1,maxu,maxs;                              // max value of confs
int  x=99;                                         // item-number
int  i=0;
int  page=0;                                       // actuelle page
int  pages=0;                                      // anzahl der seiten
int  parjoin=99;                                   // parameter join

int  logo=99;                                      // externes design file

int  toplines=99;                                  // number of toplines
int  middlelines=99;                               // number of middlelines
int  bottomlines=99;                               // number of bottomlines
int  pagelines=99;                                 // line for the page

static UBYTE *VersTag ="$VER:1oo% T-Join v2.0  (97-06-30)";     // VERSION-String

int   cursor;

dl_ptr firstline=NULL;                                // erste line des designfiles


FILE *file;                                              // FILE-Handler
char logoname[100];                                      // Logo-filename!
char p_name[100];                                        // config-filename
char e_name[100];                                        // External-design-filename
char d_name[100];                                        // External-desc-filename
char f_name[100];                                        // File/msg-Area-filename
char n_name[100];                                        // Name-filename

//=

//----------------------> Modules <--------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------


//+ ClearOld

void ClearOld(void)
{
   if (x-(page*maxs)<=maxu)
      {
      if (Prefs.ANSIBAR==TRUE)
         ExternalDesign("CLR_LEFT_BAR",1,temp, maxlinelength);
      else
         ExternalDesign("CLR_LEFT_NOBAR",1,temp, maxlinelength);

      TranslateLine(temp,
         Xpos,    l_size+x-(page*maxs)+posx,
         Area_l,  conf[x],
         Name_l,  Names[conf[x]].Name,
         What_l,  Names[conf[x]].What,
         TAG_DONE);
      PL(temp);
      }
   else
      {
      if (Prefs.ANSIBAR==TRUE)
         ExternalDesign("CLR_RIGHT_BAR",1,temp, maxlinelength);
      else
         ExternalDesign("CLR_RIGHT_NOBAR",1,temp, maxlinelength);

      TranslateLine(temp,
         Xpos,    l_size+x-maxu-(page*maxs)+posx,
         Area_r,  conf[x],
         Name_r,  Names[conf[x]].Name,
         What_r,  Names[conf[x]].What,
         TAG_DONE);
      PL(temp);
      }
}//=

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
         case 2:

            break;

         case 3:


            break;

         case 4:

            if (strnicmp(input_str,"XPOS",t_length)==0)
               {
               tag_type=Xpos;
               break;
               }

            if (strnicmp(input_str,"PAGE",t_length)==0)
               {
               tag_type=Page;
               break;
               }

            if (strnicmp(input_str,"AREA",t_length)==0)
               {
               tag_type=N_area;
               break;
               }

            break;

         case 5:

            if (strnicmp(input_str,"PAGES",t_length)==0)
               {
               tag_type=Pages;
               break;
               }

            break;

         case 6:

            if (strnicmp(input_str,"AREA_L",t_length)==0)
               {
               tag_type=Area_l;
               break;
               }

            if (strnicmp(input_str,"AREA_R",t_length)==0)
               {
               tag_type=Area_r;
               break;
               }

            if (strnicmp(input_str,"WHAT_L",t_length)==0)
               {
               tag_type=What_l;
               break;
               }

            if (strnicmp(input_str,"WHAT_R",t_length)==0)
               {
               tag_type=What_r;
               break;
               }

            if (strnicmp(input_str,"NAME_L",t_length)==0)
               {
               tag_type=Name_l;
               break;
               }

            if (strnicmp(input_str,"NAME_R",t_length)==0)
               {
               tag_type=Name_r;
               break;
               }

            if (strnicmp(input_str,"CENTER",t_length)==0)
               {
               tag_type=Center;
               break;
               }

            break;

         case 7:

            if (strnicmp(input_str,"INFOSTR",t_length)==0)
               {
               tag_type=Infostr;
               break;
               }

            break;

         case 8:


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

   pl("[31mT-Join Error: %s[0m\r\n", &s[0]);
   CloseStuff();
}//=

//+ GetConfig

int GetConfig(char *buffer, char *item , FILE *file_handler)
{

int pos=0;
int i=0,j;                           // lese-puffer, zaehler...
char dummy[100],dummy2[100];         // dummy-puffer
char * p;                            // check pointer

   do
      {
      p=fgets(dummy2,99,file_handler);
      if ((dummy2[0]!=';') && ((dummy2[0]==item[0]) || (dummy2[0]==item[0]+32)))
      {
         strmid(dummy2,dummy,1,strlen(item));
         if (stricmp(dummy,item)==0)
            {
            strmid(dummy2,dummy,strlen(item)+2,strlen(dummy2)-strlen(item));
            while((dummy[i]!='\n') && (dummy[i]!='\0') && (dummy[i]!=';'))
               {
               if (dummy[i]==' ')
                  {
                  pos++;
                  i++;
                  }
               else
                  {
                  if (pos!=0) for(j=0;j<pos;j++) *buffer++=dummy[i-1];
                  *buffer++=dummy[i++];
                  pos=0;
                  }
               }
            *buffer=NULL;
            return(0);
            break;
            }
         }
         }
      while (p!=0);
      return(1);
   }//=

//+ GetLogoSize

int GetL_Size(void)

{

char c=0,d=0;
int x=0;

   if ((file = fopen (logoname,"r")) == (FILE *) NULL) return(0);

   while (feof(file)==0)
      {
      d=c;
      c=fgetc(file);
      if (c==10) ++x;
      }
   if (d!=10) ++x;

   fclose(file);
   return(x);
}//=

//+ GetStringLength

int GetStringLength(char *stringname)
{

char stringtemp[250];

   strcpy(stringtemp,stringname);
   StripAllAnsiCodes(stringtemp);
   return((int)strlen(stringtemp));
}//=

//+ infoline

void infoline(int itemnumber)
{
   if (Prefs.NUMERICAL==TRUE)
      {
      ExternalDesign("NUM_INPUT",1,temp, maxlinelength);
      TranslateLine(temp,
         Xpos,    l_size+maxu+1+middlelines+posx,
         N_area,    conf[itemnumber],
         TAG_DONE);
      PL(temp);
      }

   if (Prefs.INFOBAR==TRUE)
      if (GetStringLength(Names[conf[itemnumber]].What)<72)
         {
         ExternalDesign("INFOSTRING",1,temp, maxlinelength);
         TranslateLine(temp,
            Xpos,    l_size+maxu+1+middlelines+posx,
            Center,  (72-GetStringLength(Names[conf[itemnumber]].What))/2L,
            Infostr, Names[conf[itemnumber]].What,
            TAG_DONE);
         PL(temp);
         }
      else
         {
         ExternalDesign("INFOSTRING",1,temp, maxlinelength);
         TranslateLine(temp,
            Xpos,    l_size+maxu+1+middlelines+posx,
            Center,  0,
            Infostr, Names[conf[itemnumber]].What,
            TAG_DONE);
         PL(temp);
         }
   pl("[%dH",l_size+maxu+2+middlelines+posx+bottomlines);
}//=

//+ InitScreen

void InitScreen(void)
{
   int o;


//--------------------------------> Show Logo <-----------------------------------------------

   pl("[H[2J");                                       //Clear Screen,Cursor >0;0H
   if (logo==1)  showfile(logoname);

//---------------------> type Confs >-------------------------------------

   pages=(max-1)/maxs;

   pl("[%dH",l_size+1);

   for(o=0; o < toplines; o++)
      {
      ExternalDesign("TOP",o+1,temp, maxlinelength);
      TranslateLine(temp,
         Pages,   pages+1,
         TAG_DONE);
      PL(temp);
      }

   InitItems(page);

//---------------------> cursor movement >-------------------------------------
   Jump(x);

}//=

//+ InitItems

void InitItems(int pagenumber)
{

int o;

   maxu=(max+1-maxs*pagenumber)/2L; // max items which would fit on the userscreen

   if (maxu>maxs/2) maxu=maxs/2;
   pl("[%dH[J",l_size+posx+1); // Clear to end of screen

   ExternalDesign("PAGENR",1,temp, maxlinelength);
   TranslateLine(temp,
      Xpos,    l_size+pagelines,
      Page,    pagenumber+1,
      TAG_DONE);
   PL(temp);

   pl("[%dH", l_size+posx+1); // set cursor am ende vom top

    for(i=1+(pagenumber*maxs);i<=maxu+(pagenumber*maxs);i++)
      if (maxu+i<=max) // check if one or two areas in this line
         {
         ExternalDesign("DOUBLEAREA",1,temp, maxlinelength);
         TranslateLine(temp,
            Area_l,    conf[i],
            Name_l,    Names[conf[i]].Name,
            What_l,    Names[conf[i]].What,
            Xpos,      l_size+i-(pagenumber*maxs)+posx,
            Area_r,    conf[maxu+i],
            Name_r,    Names[conf[maxu+i]].Name,
            What_r,    l_size+i-(pagenumber*maxs)+posx,
            TAG_DONE);
         PL(temp);
         }
      else
         {
         ExternalDesign("SINGLEAREA",1,temp, maxlinelength);
         TranslateLine(temp,
            Area_l,    conf[i],
            Name_l,    Names[conf[i]].Name,
            What_l,    Names[conf[i]].What,
            Xpos,      l_size+i-(pagenumber*maxs)+posx,
            TAG_DONE);
         PL(temp);
         }

   for(o=0;o<middlelines;o++)
      {
      ExternalDesign("MIDDLE",o+1,temp, maxlinelength);
      PL(temp);
      }

  if ((Prefs.INFOBAR==TRUE) || (Prefs.NUMERICAL==TRUE))
     {
     ExternalDesign("INFO",1,temp, maxlinelength);
     PL(temp);
     }

  for(o=0;o<bottomlines;o++)
     {
     ExternalDesign("BOTTOM",o+1,temp, maxlinelength);
     PL(temp);
     }

}//=

//+ Jump
void Jump(int newpos)
{
   ClearOld();

   x=newpos;

   if ((x>(page+1)*maxs) || (x<(page)*maxs+1))
      {
      page=(x-1)/maxs;
      InitItems(page);
      }
   if (x-(page*maxs)<=maxu)
      {
      if (Prefs.ANSIBAR==TRUE)
         ExternalDesign("Hi_LEFT_BAR",1,temp, maxlinelength);
      else
         ExternalDesign("Hi_LEFT_NOBAR",1,temp, maxlinelength);

      TranslateLine(temp,
         Xpos,    l_size+x-(page*maxs)+posx,
         Area_l,  conf[x],
         Name_l,  Names[conf[x]].Name,
         What_l,  Names[conf[x]].What,
         TAG_DONE);
      PL(temp);

      flag=0;
      }         
   if ((x-(page*maxs)>maxu) && (x-(page*maxs)<=maxu*2))
      {
      if (Prefs.ANSIBAR==TRUE)
         ExternalDesign("Hi_RIGHT_BAR",1,temp, maxlinelength);
      else
         ExternalDesign("Hi_RIGHT_NOBAR",1,temp, maxlinelength);

      TranslateLine(temp,
         Xpos,    l_size+x-maxu-(page*maxs)+posx,
         Area_r,  conf[x],
         Name_r,  Names[conf[x]].Name,
         What_r,  Names[conf[x]].What,
         TAG_DONE);
      PL(temp);

      flag=1;
      }

   infoline(x);
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

//+ MainInits

void MainInits(char *path)
{
char string[200],string2[5];
char *getstring;

//---------------------------------> get Doorspath <----------------------------------
   stcgfp(temp,path);
   if (temp[strlen(temp)-1]!=':') strcat(temp,"/");

   strcpy(e_name,temp);                         // external-design-filename
   strcat(e_name,"T-Join.output");              // external-design-filename

   strcpy(logoname,temp);         // Logo-filename!

   if ((User->AnsiType==2) || (User->AnsiType==3))
      {
      if (SystemData->SystemFlags1 & SD1_LINKMSGFILEAREA) strcat(logoname,"T-Join.ibm");
      else
         {
         if (nody.GLOB->AreaType==1) strcat(logoname,"T-Join.fb.ibm");
         else strcat(logoname,"T-Join.mb.ibm");
         }
      strcat(e_name,".ibm");
      }
   else
      {
      if (SystemData->SystemFlags1 & SD1_LINKMSGFILEAREA) strcat(logoname,"T-Join.ami");
      else
         {
         if (nody.GLOB->AreaType==1) strcat(logoname,"T-Join.fb.ami");
         else strcat(logoname,"T-Join.mb.ami");
         }
      strcat(e_name,".ami");
      }
   strcpy(p_name,temp);                         // config-filename
   strcat(p_name,"T-Join.prefs");               // config-filename

   strcpy(d_name,temp);                         // desc-filename
   strcat(d_name,"T-Join.desc");                // desc-filename

   strcpy(n_name,temp);                         // names-filename
   strcat(n_name,"T-Join.names");               // names-filename

   strcpy(f_name,SystemData->MainPath);         // File/msg-Area-filename
   strcat(f_name,"Setup/");                     // File/msg-Area-filename

//------------> check for paramters and jump to area ->exit <------------------------

   GetStr(string,1);

   getstring = strtok(string," ");
   getstring=strtok(NULL," ");
   while(getstring!=NULL)
      {
      JoinConference(atoi(getstring));
      CloseStuff();
      }

//-----------------------------------> check Join-Config-File <------------------------------------

   if(!ReadPrefs()) Fehler("Error will reading %s, start T-Join-Config first!",p_name);
   sprintf(string,"%d",Prefs.OUTPUT);
   strcat(e_name,string);


//--------------------------------> get confs <-----------------------------------------------

   if ((nody.GLOB->AreaType==1) || (SystemData->SystemFlags1 & SD1_LINKMSGFILEAREA))
      {
      strcpy(string,User->FileBase);
      strcat(f_name,"Files.data");
      }
   else
      {
      strcpy(string,User->MsgBase);
      strcat(f_name,"Messages.data");
      }

//---------------------> get Confs >-------------------------------------

   if ((file=fopen(f_name,"r")) == (FILE *) NULL) Fehler("Can't open %s",f_name); // open data-file

   if ((nody.GLOB->AreaType==1) || (SystemData->SystemFlags1 & SD1_LINKMSGFILEAREA))  // if filearea or linked msg/file areas
      {
      for(i=0;i < maxareas; i++)
         {
            fread(&File_Area,sizeof(struct File_Area),1,file);  // read area element
            if ((CheckAreaAccess(i)==1) && ((i!=0) || ((i==0) && (Prefs.SHOWCONF0==TRUE)))) // check if user has access to area or if  it is area 0 and area0 is enabled in prefs
               {
               if(User->FB_J==i) x=max;  // user is acutal on this area
               conf[max]=i;  // die <max>. area wo der user zugriff hat is die <i>. reale area
               item[i]=max++; // die <i>. area ist die <max>. area wo der user zugriff hat

               strcpy(Names[i].Name,File_Area.Name); // copy areaname into name-buffer
               strcpy(Names[i].What,File_Area.What); // copy areadesc intro desc-buffer
               }
            else
               {
               item[i]=99; // user hat kein zugriff
               Names[i].Name[0] = '\0';
               Names[i].What[0] = '\0';
               }
         }
      }
   else
      {
      for(i=0;i < maxareas; i++)
         {
            fread(&Msg_Area,sizeof(struct Msg_Area),1,file);
            if ((CheckAreaAccess(i)==1) && ((i!=0) || ((i==0) && (Prefs.SHOWCONF0==TRUE))))
              {
               if(User->MB_J==i) x=max;
               conf[max]=i;
               item[i]=max++;
               strcpy(Names[i].Name,Msg_Area.Name);
               strcpy(Names[i].What,Msg_Area.What);
               }
            else
               {
               item[i]=99;
               Names[i].Name[0] = '\0';
               Names[i].What[0] = '\0';
               }
         }
      }
   fclose(file);
   --max; // decrease max

   if (max==0) Fehler("[31mno access[0m\r\n"); // auf keine conf zugriff...

   if (x==99) x=1; // wenn user in einer conf ist wo er normal kein access hat

//--------------------------------> get items from design-file <-----------------------------


   LoadDesign2Mem();

   if ((file = fopen (e_name,"r")) == (FILE *) NULL) Fehler("Can't open %s",e_name);

   logo = ExternalPref("LOGO");

   pagelines = ExternalPref("PAGELINE");

   toplines = ExternalPref("TOP");
   posx = toplines;

   middlelines = ExternalPref("MIDDLE");

   bottomlines = ExternalPref("BOTTOM");

//--------------------------------> get external desc if needed <-----------------------------

   if ((Prefs.EXTERNALDESC == TRUE) && (Prefs.INFOBAR==TRUE))
      {
      if ((file=fopen(d_name,"r")) == (FILE *) NULL) Fehler("Can't open %s",d_name);

      for (i=0; i < maxareas; i++)
         if (item[i]!=99)
            {
            sprintf(string2,"%d",i);
            if (GetConfig(string,string2,file)!=0) Fehler("External-Desc Error (%d=...)",i);
            strncpy(Names[i].What,string,250);
            }

      fclose(file);
      }

//--------------------------------> get external names if needed <-----------------------------

   if ((Prefs.EXTERNALNAMES == TRUE) && (Prefs.INFOBAR==TRUE))
      {
      if ((file=fopen(n_name,"r")) == (FILE *) NULL) Fehler("Can't open %s",n_name);

      for (i=0;i < maxareas; i++)
         if (item[i]!=99)
            {
            sprintf(string2,"%d",i);
            if (GetConfig(string,string2,file)!=0) Fehler("External-Names Error (%d=...)",i);
            strncpy(Names[i].Name,string,100);
            }

      fclose(file);
      }

   if (logo==0) l_size=0;     // kein logo!

}
//=

//+ Movement

VOID Movement(VOID)
{

int tempzahl=0;

    do
      {
      cursor=CursorHotKey();
       switch(cursor)
          {
         case 72:
         case 300: // UP ARROW
         case 301: // SHIFT UP ARROW
            if (x!=1) Jump(x-1);
            else Jump(max);
            zahl=0;
            break;
         case 80:
         case 400: // DOWN ARROW
         case 401: // SHIFT DOWN ARROW
            if (x!=max) Jump(x+1);
            else Jump(1);
            zahl=0;
            break;
         case 75:
         case 501: // SHIFT LEFT ARROW
         case 500: // LEFT ARROW
            if ((page==pages) && (flag==0) && (pages!=0))   Jump(x-maxs/2);
            else
               if (x-maxu>0)   Jump(x-maxu);
               else
                  if (pages*maxs+(max+1-maxs*pages)/2L+x>max)   Jump(max);
                  else Jump(pages*maxs+(max+1-maxs*pages)/2L+x);
            zahl=0;
            break;
         case 77:
         case 601: // SHIFT RIGHT ARROW
         case 600: // RIGHT ARROW
            if (page==pages-1)
                  // .-- maxu bei pages --. .- linksoben-.
               if (x+maxu>(max+1-maxs*pages)/2L + pages*maxs) Jump((max+1-maxs*pages)/2L+pages*maxs);
               else Jump(x+maxu);
            else
               if ((page==pages) && (x+maxu>max))
                  if (flag==0)
                     if (max!=x) Jump(max);
                     else Jump(1);
                  else Jump(x-(pages*maxs)-maxu);
               else Jump(x+maxu);
            zahl=0;
            break;
         case 48:
         case 49:
         case 50:
         case 51:
         case 52:
         case 53:
         case 54:
         case 55:
         case 56:
         case 57:
            if (Prefs.NUMERICAL==TRUE)
               {
               if (zahl==1)
                  {
                  if ( (item[tempzahl * 10 + cursor - 48] != 99) && (tempzahl * 10 + cursor - 48 < maxareas) && (tempzahl != 0) )
                     {// if user has access to area and area isnt out of range and last number isnt zero
                     tempzahl=tempzahl*10+cursor-48;
                     zahl=0;
                     }
                  else
                     {
                     tempzahl=(cursor-48);
                     zahl=1;
                     }
                  }
               else
                  {
                  tempzahl=(cursor-48);
                  zahl=1;
                  }

               ExternalDesign("NUM_INPUT",1,temp, maxlinelength);
               TranslateLine(temp,
                  Xpos,    l_size+maxu+1+middlelines+posx,
                  N_area,  tempzahl,
                  TAG_DONE);
               PL(temp);

               if ((item[tempzahl]!=99) && (tempzahl<maxareas) && (tempzahl!=conf[x])) Jump(item[tempzahl]);
               }
            break;
         }
      }
   while ((cursor != 3) && (cursor != 13) && (cursor != 27) && (cursor != 81) && (cursor != 113));
   if (cursor==3) 
      {
      pl("[%dH[31mAborting[0m",l_size+maxu+2+posx+middlelines+bottomlines);
      CloseStuff();
      }

   pl("[%dH",l_size+maxu+2+posx+middlelines+bottomlines);
   if (cursor==13) JoinConference(conf[x]);

}//=

//+ReadPrefs

BOOL ReadPrefs(void)
{
   if ((file = fopen (p_name,"r")) == (FILE *) NULL)
      return(FALSE);
   else
      {
      fread(&Prefs,sizeof(Prefs),1,file);
      fclose(file);
      }

   if ((User->AnsiType==2) || (User->AnsiType==3))
      {
      if (Prefs.IBMAUTO==TRUE) l_size=GetL_Size();
      else l_size=Prefs.IBMSIZE;
      }
   else
      {
      if (Prefs.TOPAZAUTO==TRUE) l_size=GetL_Size();
      else l_size=Prefs.TOPAZSIZE;
      }

   return(TRUE);
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

int stat;

   if(!DoorStart(argv[1])) { PutStr("Tempest Door (1oo% =T= Join v2.0)\n"); exit(0); }
   SetTaskPri(FindTask(0),SystemData->DoorsPriority);
   Activity(99,"1oo% =T= Join v2.0");

   NODE=atoi(argv[1]);
   stat=Loadnody(NODE);
   if(stat==0) Fehler("NodeInfo File Not Found");


   MainInits(argv[0]);

   if (User->Length<=l_size+posx+middlelines+bottomlines) Fehler("Screenlength to small!");

   maxs=(User->Length-l_size-toplines-middlelines-bottomlines)*2; // max items on screen
   page=(x-1)/maxs;  // calculate actual page

   InitScreen();

   Movement();

   pl("[0m");

   CloseStuff();
}//=

//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//--------------------------> M A I N    E N D! <------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------


//+--------------------> DOOR-STUFF <------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------

//-----------------------------------------------------------
//--------------> DOORSTART - MUST BE IN! <------------------
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
  Today=*&send.Today;
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

 // dealloc my structs

 templine = firstline;

 while (templine)
    {
    firstline = templine->next;
    FreeVec(templine->line);
    FreeVec(templine);
    templine = firstline;
    }

 exit(0);
}

//************************
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
 TEXT s[255];
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
//*****  Cursor HotKey  ***** // Command 17
//***************************
int CursorHotKey(VOID)
{
 DOORIO(17);
 return(send.Value1);
}

//***************************
//*****  GetStr         ***** // Command 33
//***************************
VOID GetStr(TEXT *s,int opt)
{
 send.Value1=opt;
 strcpy(s,"");
 send.text1=s;
 DOORIO(33);
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
//***********************
//*****  Show File  *****  // Command 70
//***********************
void showfile(TEXT *filename)
{
 send.text1=filename;
 DOORIO(70);
}

//***********************
//***** STRIP ANSI  ***** // Command 81
//***********************

VOID StripAllAnsiCodes(TEXT *string)
{
 send.text1=string;
 DOORIO(81);
}

//****************************
//***** CheckAreaAccess  ***** // Command 86
//****************************

int CheckAreaAccess(int Area)
{
 send.Value1=Area;
 DOORIO(86);
 return(send.Value1);
}

//***********************
//*****  Join Area  ***** // Command 91
//***********************
VOID JoinConference(ULONG Area)
{
 send.LongValue=Area;
 DOORIO(91);
}
//=
