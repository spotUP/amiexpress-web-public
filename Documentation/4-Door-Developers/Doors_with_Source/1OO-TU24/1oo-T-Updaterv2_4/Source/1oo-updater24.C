/* ________________________________________________________
  |                                                        |
  |^-->    .--------------------------------------.    <--^|
  |--^-->  | Programm: 1oo%-T-Updater             |  <--^--|
  |-^--^-->| Version : 2.4                        |<--^--^-|
  |--^-->  | Date    : 96-12-29                   |  <--^--|
  |^-->    `--------------------------------------´    <--^|
  |________________________________________________________|
*/

//+ INCLUDES

#include <proto/utility.h>
#include <proto/exec.h>
#include <proto/dos.h>
#include <sys/dir.h>
#include <dos.h>
#include <stdio.h>
#include <stdlib.h>
#include <exec/memory.h>
#include <stdarg.h>

#include <string.h>
#include <time.h>
#include <tempest/headers.h>
#include <tempest/defines.h>
#include <tempest/T-Updater.h>
#include <proto/FileID.h>

//------------------------------- FILE I/O ------------------------------

#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>

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

typedef struct File_Struct *fs_ptr;

struct File_Struct
   {
   struct FileInfoBlock *fileinfo;
   fs_ptr next;
   fs_ptr prev;
   };

typedef struct
   {
   int anzahl;
   fs_ptr first;
   fs_ptr last;
   } Header;

typedef Header *h_ptr;

typedef struct
   {
   int  anzahl;            // first = 1
   long time;              // seconds since...
   int  packertype;        // packertype 1=lha, 2=lzx, 3=zip
   unsigned long files_total;       // file downloaded total
   unsigned long calls_total;       // updater used total
   } Update;

typedef struct
   {
   long calls_today;
   long calls_total;
   long files_today;
   long files_total;
   long time;
   } Stat;


struct FI_FileInfo              *MyFileInfo=NULL;
struct FileIDBase               *FileIDBase=NULL;

struct User       *User;
struct SystemData *SystemData;
struct NodeData   *NodeData;
struct MsgPort *MyPort = NULL;
struct MyMessage *msg;
struct MyMessage send;

struct tm *TM;
struct FileInfoBlock *FBlock;
struct FileLock *FLock;

struct Updater_Prefs Prefs;

int  DoorStart(TEXT *);
int  DOORIO(WORD);
VOID CloseStuff(void);
VOID Activity(BYTE,TEXT *);
VOID pl(TEXT *fmt,...);
VOID PL(TEXT *);
int  CheckKey(void);
int  CursorHotKey(VOID);
VOID showfile(TEXT *);
void MoveFile(TEXT *,TEXT *);
VOID input(TEXT *,int);
int  GetValue(int);
void GetPromptsLine(int, char *);
void ASLRequester(int,char *,char *,char *);
void HydraDownload(TEXT *);
void ZmodemDownload(TEXT *);
void ZmodemUpload(VOID);
void SelectTransferProtocol(VOID);


void Fehler(char *,...);
void GetFileDate(struct DateStamp , long , char *, char *);
int  GetConfig(char*, char* ,FILE*);
int  GetL_Size(void);
void CheckInput(char *);
void CheckRange(char *);
void FlagItem(short);
void ShowItems(int);
void FlagAll(void);
void ClearAll(void);
void FlagToggle(void);
void ShowHelp(void);
void PackFlagged(void);
void WriteConfig(void);
void ReadConfig(void);
void AutoFlag(void);
int  Flagged(void);
void GetStatistic(void);
void WriteStatistic(void);
void StartXfer(char *);
void LocalDownload(char *);
int  CheckPath(char *);
void FlagSinceDate(void);
void KillFile(void);
void UploadFile(void);
void GetFiletypes(h_ptr);
void TranslateLine(char *,...);
BOOL ExchangeLine(char *, int ,struct TagItem *);
BOOL ReadPrefs(void);
BOOL SelectPacker(void);
BOOL CheckAccess(void);
void ExternalDesign(char *, int, char *, int);
int ExternalPref(char *);
void GetJumps(void);
void DEBUG(int);
h_ptr New_Header(void);
void MainInits(char *);
void Insert_FS(fs_ptr,h_ptr);
int GetDir(char *, h_ptr);
fs_ptr New_FS(void);
fs_ptr GetXFS(int , h_ptr );
void Delete_FS(fs_ptr, h_ptr);
void Delete_All(h_ptr header);

extern long _OSERR;

//=

//+ Global Variables


#define maxitems (User->Length-l_size-toplines-bottomlines)

#define datestr    111
#define systemname 222
#define i_anzahl   223
#define i_flagged  224
#define posy       225
#define i_number   226
#define calls_td   228
#define calls_tt   229
#define calls_us   300
#define files_td   301
#define files_tt   302
#define files_us   303
#define act_page   304
#define max_page   305
#define f_name     306
#define f_size     307
#define f_date     308
#define f_time     309
#define f_comment  310

char version[50]="$VER:1oo% T-Updater 2.4 (96-12-29)";    // VERSION-String

int  Result,Error,NODE,x;
char MyName[60],st[60],nodename[255];
char String[1024];                                       // must be 1024 coz the GetPromptsLine()
char output_p_jump[100];                                 // external design for prompt jump
char output_flag[50];                                    // external design for flagging
char output_deflag[50];                                  // external design for deflagging
char output_f_line[255];                                 // external design for flagged itemline
char output_d_line[255];                                 // external design for deflagged itemline
char namestring[35]="\0";
int  page=0,pages;                                       // aktuelle page, anzahl der pages
int  l_size;                                             // logo-size
int  screen;                                             // items on screen

int  toplines;                                           // number of toplines
int  bottomlines;                                        // number of bottomlines

short flag[100];                                         // flagged files (0=no 1=yes)
BOOL sysopaccess;                                        // sysopaccess true/false

Update newdir;
Update olddir;

Stat Statistic;                                          // today/total statistic

char  cfg_namestring[31];                                // namestring for file (max 30!)

char logoname[100]="T-Updater.";                         // Logo-filename!
char c_name[100]="T-Updater.prefs";                      // config-filename
char s_name[100]="Userdatas";                            // User-Save-filename
char h_name[100]="T-Updater.hlp";                        // Helpfilename
char stat_name[100]="T-Updater.dat";                     // Statistic-Save-filename
char diz_name[100]="T-Updater.diz";                      // file_id.diz name
char access_name[100]="T-Updater.names";                 // accessname file
char e_name[100]="T-Updater.output.";                    // design-file

FILE *FH;                                                // FileHandler

h_ptr NewHeader;
h_ptr OldHeader;
h_ptr UploadHeader;

long freemem;

//=

//-----------------------------------------------------------
//-----------------------------------------------------------
//----------------------> Modules <--------------------------
//-----------------------------------------------------------
//-----------------------------------------------------------

//+AutoFlag

void AutoFlag(void)
{
int o;
fs_ptr tempfs1,tempfs2;

   for(o=0;o<NewHeader->anzahl;o++) flag[o]=1;

   tempfs1=OldHeader->first;
   while(tempfs1)
      {
      tempfs2=NewHeader->first;
      o=0;
      while(tempfs2)
         {
         if (stricmp(tempfs1->fileinfo->fib_FileName,tempfs2->fileinfo->fib_FileName)==0)
            {
            if (CompareDates(&tempfs1->fileinfo->fib_Date,&tempfs2->fileinfo->fib_Date)==0)
               flag[o]=0;
            break;
            }
         tempfs2=tempfs2->next;
         o++;
         }
      tempfs1=tempfs1->next;
      }
}
//=

//+CheckAccess

BOOL CheckAccess(void)
{
   if ((FH = fopen (access_name,"r")) == (FILE *) NULL) return(FALSE);

   while (feof(FH)==0)
      {
      fgets(String,1024,FH);
      if (strnicmp(String,User->Name,strlen(User->Name))==0)
         {
         fclose(FH);
         return(TRUE);
         }
      }
   fclose(FH);
   return(FALSE);
}
//=

//+CheckInput

void CheckInput(char *inputstring)
{
   char *getstring;
   int item;

   PL("[31m");

   getstring = strtok(inputstring,", ");

   while(getstring!=NULL)
      {
      if (strchr(getstring,'-')!=NULL)
         {
         CheckRange(getstring);
         }
      else
         {
         item=atoi(getstring);
         if( (item>0) && (item<=NewHeader->anzahl) ) FlagItem(item);
         }
      getstring=strtok(NULL,", ");
      }

}
//=

//+CheckPath

int CheckPath(char *pathstr)
{
   if (strlen(pathstr)==0) return(1);
   if ( (pathstr[strlen(pathstr)-1]!='/') && (pathstr[strlen(pathstr)-1]!=':') )
      strcat(pathstr,"/");

   if((FLock = (struct FileLock *)Lock(pathstr,ACCESS_READ)) == NULL) return(1);
   else UnLock((BPTR)FLock);
   return(0);
}

//=

//+CheckRange

void CheckRange(char *istring)
{
   int first,last,j=0,k=0;
   char tempstring[50];


   while((istring[j]!=NULL) && (istring[j]!='-'))
      tempstring[j]=istring[j++];

   tempstring[j]=NULL;

   j++;
   first=atoi(tempstring);

   while(istring[j]!=NULL)
      tempstring[k++]=istring[j++];

   tempstring[k]=NULL;

   last=atoi(tempstring);

   if((last==0) && (first==0)) return;  // wenn beide 0 >raus

   if(first>NewHeader->anzahl) first=NewHeader->anzahl;
   if(last>NewHeader->anzahl) last=NewHeader->anzahl;   // auf maximum setzen

   if(first<1) first=1;                 // -9 -> 1-9
   if(last<1) last=NewHeader->anzahl;       // 9- -> 9-max

   if(first<=last) for( j=first ; j<=last ; j++) FlagItem(j); // 1-9
   else for(j=last; j<=first ;j++)   FlagItem(j);             // 9-1
}
//=

//+ClearAll

void ClearAll(void)
{
   int o;

   for(o=0;o<NewHeader->anzahl;o++)
      if (flag[o]!=0) FlagItem(o+1);
}
//=

//+ DEBUG

void DEBUG(int nr)
{
int k;

   pl("[30H[KDebug-Point %d",nr);
   k=CursorHotKey();
}
//=

//+ Delete_All
void Delete_All(h_ptr header) // deleted den header inclusive der fs structuren
{
fs_ptr temp;

   if(header)
      {
      temp=header->first;
      while(temp)
         {
         header->first=temp->next;
         FreeMem(temp->fileinfo,sizeof (struct FileInfoBlock));
         FreeMem(temp,sizeof (struct File_Struct));
         temp=header->first;
         }
      FreeMem(header,sizeof(Header));
      }
}
//=

//+ Delete_FS
void Delete_FS(fs_ptr actual, h_ptr header)
{
   if (header->first==actual) header->first=actual->next;
   if (header->last==actual) header->last=actual->prev;

   if (actual->next) actual->next->prev=actual->prev;
   if (actual->prev) actual->prev->next=actual->next;

   FreeMem(actual->fileinfo,sizeof (struct FileInfoBlock));
   FreeMem(actual,sizeof (struct File_Struct));

   header->anzahl--;
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
         case 2:
            if (strnicmp(input_str,"NR",t_length)==0)
               {
               tag_type=i_number;
               break;
               }
            break;

         case 3:
            if (strnicmp(input_str,"MAX",t_length)==0)
               {
               tag_type=i_anzahl;
               break;
               }
            break;

         case 4:
            if (strnicmp(input_str,"FLAG",t_length)==0)
               {
               tag_type=i_flagged;
               break;
               }
            if (strnicmp(input_str,"POSY",t_length)==0)
               {
               tag_type=posy;
               break;
               }
            if (strnicmp(input_str,"PAGE",t_length)==0)
               {
               tag_type=act_page;
               break;
               }
            if (strnicmp(input_str,"NAME",t_length)==0)
               {
               tag_type=f_name;
               break;
               }
            if (strnicmp(input_str,"SIZE",t_length)==0)
               {
               tag_type=f_size;
               break;
               }
            if (strnicmp(input_str,"DATE",t_length)==0)
               {
               tag_type=f_date;
               break;
               }
            if (strnicmp(input_str,"TIME",t_length)==0)
               {
               tag_type=f_time;
               break;
               }
            break;

         case 5:
            if (strnicmp(input_str,"CALLS",t_length)==0)
               {
               tag_type=calls_tt;
               break;
               }
            if (strnicmp(input_str,"FILES",t_length)==0)
               {
               tag_type=files_tt;
               break;
               }
            if (strnicmp(input_str,"PAGES",t_length)==0)
               {
               tag_type=max_page;
               break;
               }
            break;
         case 7:
            if (strnicmp(input_str,"CALLS_U",t_length)==0)
               {
               tag_type=calls_us;
               break;
               }
            if (strnicmp(input_str,"FILES_U",t_length)==0)
               {
               tag_type=files_us;
               break;
               }
            if (strnicmp(input_str,"COMMENT",t_length)==0)
               {
               tag_type=f_comment;
               break;
               }
            if (strnicmp(input_str,"ID_DATE",t_length)==0)
               {
               tag_type=datestr;
               break;
               }
            if (strnicmp(input_str,"ID_NAME",t_length)==0)
               {
               tag_type=systemname;
               break;
               }
            break;

         case 8:
            if (strnicmp(input_str,"FILES_TD",t_length)==0)
               {
               tag_type=files_td;
               break;
               }
            if (strnicmp(input_str,"CALLS_TD",t_length)==0)
               {
               tag_type=calls_td;
               break;
               }
            break;
         }
      }
   else return(FALSE);

   strncpy(tempc,&input_str[t_length+1],29);

//   tag = (struct TagItem *) AllocMem (sizeof (struct TagItem),0L); // never forget the mem!!!!!!!

   while (tag = NextTagItem(&t_items))
      {
      if (tag->ti_Tag==tag_type)
         {
         sprintf(input_str,tempc,tag->ti_Data);
         all_ok=TRUE;
         }
      }

//   FreeMem(tag,sizeof (struct TagItem)); // i dont support memory-holes ;)

return(all_ok);
}
//=

//+ExternalDesign

void ExternalDesign(char *area, int i, char *temp, int maxlength)
{

FILE *file;
int o=0;
char temp_string[500];

   if ((file = fopen (e_name,"r")) == (FILE *) NULL) Fehler("Can't open %s",e_name);


   do
      {
      fgets(temp_string,499,file);
      if (temp_string[0]=='#')
         {
         if (strnicmp(&temp_string[1],area,strlen(area))==0) o=1;
         }
      }
   while ((o==0) && (feof(file)==0));

   if (o!=1)
      {
      fclose(file);
      Fehler("Output file error. Can't find %s",area);
      }

   for(o=0;o<i;o++)
      fgets(temp_string,499,file);
   fclose(file);

   o=strlen(temp_string);

   temp_string[o-1]='\r';
   temp_string[o]='\n';
   temp_string[o+1]='\0';

   strncpy(temp,temp_string,maxlength);


}//=

//+External Pref
int ExternalPref(char *area)
{

FILE *file;
int o=0;
char temp_string[500];
char *p;

   if ((file = fopen (e_name,"r")) == (FILE *) NULL) Fehler("Can't open %s",e_name);

   do
      {
      fgets(temp_string,499,file);
      if (temp_string[0]=='#')
         {
         if (strnicmp(&temp_string[1],area,strlen(area))==0) o=1;
         }
      }
   while ((o==0) && (feof(file)==0));

   if (o!=1)
      {
      fclose(file);
      Fehler("Output file error. Can't find %s",area);
      }
   fclose(file);

   p=temp_string;

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

   pl("\r\n[31mT-Updater Error: %s[0m\r\n", &s[0]);
   CloseStuff();
}//=

//+FlagAll

void FlagAll(void)
{
   int o;

   for(o=0;o<NewHeader->anzahl;o++)
      if (flag[o]!=1) FlagItem(o+1);
}
//=

//+Flagged Files

int Flagged(void)
{
   int o,c=0;

   for(o=0;o<NewHeader->anzahl;o++)
      if (flag[o]==1) c++;

   return(c);
}
//=

//+FlagItem

void FlagItem(short item)
{
   if (flag[item-1]==0)
      {
      if ((item-1>=maxitems*page) && (item-1 < maxitems*(page+1)))
         {
         strcpy(String,output_flag);
         TranslateLine(String,
            posy,       l_size+(item-maxitems*page)+toplines,
            i_number,   item,
            TAG_DONE);
         PL(String);
         }
      flag[item-1]=1;
      }
   else
      {
      if ((item-1>=maxitems*page) && (item-1 < maxitems*(page+1)))
         {
         strcpy(String,output_deflag);
         TranslateLine(String,
            posy,       l_size+(item-maxitems*page)+toplines,
            i_number,   item,
            TAG_DONE);
         PL(String);
         }
      flag[item-1]=0;
      }
}
//=

//+FlagSinceDate

void FlagSinceDate(void)
{
int k=1;
struct DateTime datetime;
char tempstring[10];
int year,month,day;
fs_ptr tempfs;

   datetime.dat_Format=FORMAT_USA;
   datetime.dat_Flags=DTF_SUBST;
   datetime.dat_StrDay=NULL;
   datetime.dat_StrDate=tempstring;
   datetime.dat_StrTime="00:00:00";

   do
      {
      pl("[%dH[K[35mEnter Date: [33mYear: [37m19",screen+l_size+toplines+bottomlines+1);
      input(String,2);
      year=atoi(String);
      }
   while((year<10) || (year>99));

   do
      {
      pl("[%d;24H[33mMonth: [37m[K",screen+l_size+toplines+bottomlines+1);
      input(String,2);
      month=atoi(String);
      }
   while((month<1) || (month>12));

   do
      {
      pl("[%d;34H[33mDay: [37m[K",screen+l_size+toplines+bottomlines+1);
      input(String,2);
      day=atoi(String);
      }
   while((day<1) || (day>31));

   sprintf(tempstring,"%2.2d-%2.2d-%2.2d",month,day,year);

   if(StrToDate(&datetime)==0) Fehler("Can't build date");

   tempfs=NewHeader->first;

   while(tempfs)
      {
      if (CompareDates(&datetime.dat_Stamp,&tempfs->fileinfo->fib_Date)>=0)
         FlagItem(k);
      k++;
      tempfs=tempfs->next;
      }

   pl("[%dH",screen+l_size+toplines+bottomlines+1);

   if (sysopaccess) ExternalDesign ("PROMPTS", 1, String, 1024);
   else ExternalDesign ("PROMPTN", 1, String, 1024);
   TranslateLine (String, i_flagged, Flagged(), i_anzahl, NewHeader->anzahl, TAG_DONE);
   PL(String);
}
//=

//+FlagToggle

void FlagToggle(void)
{
   int o;

   for(o=0;o<NewHeader->anzahl;o++)
      FlagItem(o+1);
}
//=

//+GetConfig

int GetConfig(char *buffer, char *item , FILE *file_handler)

{
int pos=0;
int i=0,j;                     // lese-puffer, zaehler...
char dummy[100],dummy2[100];   // dummy-puffer
char * p;                      // check pointer

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
            }
         }
      }
   while (p!=0);
   return(1);
}
//=

//+GetDir

int GetDir(char *directory, h_ptr header)

{
int count=0;
DIR *dfd;
struct dirent *dir_el;
fs_ptr tempfs;
BPTR lock;

   if (header->anzahl!=0) Fehler("Abnormal Error!");

   dfd = opendir(directory);

//   dir_el = (struct dirent *)  AllocMem(sizeof(struct dirent),0L);

   chdir(directory);

   do
      {
      dir_el=readdir(dfd);
      if (dir_el)
         {
         lock=Lock(dir_el->d_name,ACCESS_READ);
         if (lock)
            {
            tempfs=New_FS();
            Examine(lock,tempfs->fileinfo);
            if (tempfs->fileinfo->fib_DirEntryType<0)
               {
               Insert_FS(tempfs,header);
               count++;
               }
            else
               {
               FreeMem(tempfs->fileinfo,sizeof (struct FileInfoBlock));
               FreeMem(tempfs,sizeof (struct File_Struct));
               }
            UnLock(lock);
            }
         }
      }
   while(dir_el);

//   FreeMem(dir_el,sizeof(struct dirent));

   closedir(dfd);

   return(count);
}
//=

//+GetFileDate

void GetFileDate(struct DateStamp filedate, long t_day, char *datestring, char *timestring)

{
   struct DateTime datetime;

   datetime.dat_Stamp=filedate;
   datetime.dat_Format=FORMAT_INT;
   datetime.dat_Flags=DTF_SUBST;
   datetime.dat_StrDay=NULL;
   datetime.dat_StrDate=datestring;
   datetime.dat_StrTime=timestring;

   DateToStr(&datetime);
}
//=

//+GetFiletypes

void GetFiletypes(h_ptr header)

{
   int o;
   fs_ptr tempfs;

   if(!(FileIDBase =       (struct FileIDBase *)OpenLibrary("FileID.library",6L)))
      {
      Fehler("Couldn`t open FileID.library");
      }
   if(!(MyFileInfo = (struct FI_FileInfo *)FIAllocFileInfo()))
      {
      CloseLibrary( (struct Library *) FileIDBase);
      Fehler("Can't allocate FI_FileInfo!");
      }

   tempfs=header->first;
   for(o=0;o<header->anzahl;o++)
      {
      FIIdentifyFromName(MyFileInfo,tempfs->fileinfo->fib_FileName);
      strncpy(tempfs->fileinfo->fib_Comment, MyFileInfo -> FI_Description,80);
      tempfs=tempfs->next;
      }

   FIFreeFileInfo(MyFileInfo);
   CloseLibrary( (struct Library *) FileIDBase);
}
//=

//+GetL_Size

int GetL_Size(void)

{
   char c=0,d=0;
   int ls=0;

   if ((FH = fopen (logoname,"r")) == (FILE *) NULL) return(0);
   
   while (feof(FH)==0)
      {
      d=c;
      c=fgetc(FH);
      if (c==10) ++ls;
      }
   if (d!=10) ++ls;
   
   fclose(FH);

   return(ls);

}
//=

//+GetJumps

void GetJumps(void)

{

FILE *file;
int o=0;
char temp_string[500];

   if ((file = fopen (e_name,"r")) == (FILE *) NULL) Fehler("Can't open %s",e_name);


   do
      {
      fgets(temp_string,499,file);
      if (temp_string[0]=='#')
         {
         if (strnicmp(&temp_string[1],"JUMPS",5)==0) o=1;
         }
      }
   while ((o==0) && (feof(file)==0));

   if (o!=1)
      {
      fclose(file);
      Fehler("Output file error. Can't find JUMPS");
      }

//---------- get prompt-jump ----------------

   if (sysopaccess) fgets(temp_string,499,file);
   fgets(temp_string,499,file);
   if (!sysopaccess) fgets(temp_string,499,file);
   temp_string[strlen(temp_string)-1]='\0';
   strncpy(output_p_jump,temp_string,100);

//---------- get flag-jump ----------------

   fgets(temp_string,499,file);
   temp_string[strlen(temp_string)-1]='\0';
   strncpy(output_flag,temp_string,50);

//---------- get deflag-jump ----------------

   fgets(temp_string,499,file);
   temp_string[strlen(temp_string)-1]='\0';
   strncpy(output_deflag,temp_string,50);
}
//=

//+GetStatistic

void GetStatistic(void)
{
   long t;

   if ((FH = fopen (stat_name,"r")) == (FILE *) NULL)
       setmem(&Statistic,sizeof(Statistic),NULL);
   else
      {
      fread(&Statistic,sizeof(Statistic),1,FH);
      fclose(FH);
      }

   time(&t);

   t/=86400;

   if (t-Statistic.time>0)
      {
      Statistic.calls_today=0;
      Statistic.files_today=0;
      }

   if(Statistic.calls_today>999) Statistic.calls_today=0;
   if(Statistic.files_today>9999) Statistic.files_today=0;
   if(Statistic.calls_total>9999) Statistic.calls_total=0;
   if(Statistic.files_total>99999) Statistic.files_total=0;

   Statistic.time=t;
}
//=

//+GetXFS

fs_ptr GetXFS(int number, h_ptr header) // number: 0=1, 1=2....
{
int x;
fs_ptr tempfs;

   tempfs=header->first;

   if (number < header->anzahl)
      {
      for (x=0; x < number; x++) tempfs=tempfs->next;
      return(tempfs);
      }
   else return ((fs_ptr) NULL);
}

//=

//+ Insert_FS

void Insert_FS(fs_ptr newfs, h_ptr header)
{
fs_ptr tempfs;

   if (header->anzahl==0)
      {
      header->first=newfs;
      header->last=newfs;
      }
   else
      {
      tempfs=header->first;
      while(tempfs)
         {
         if (stricmp(tempfs->fileinfo->fib_FileName,newfs->fileinfo->fib_FileName)>0)
            {
            if (tempfs==header->first) // am anfang einfuegen   (header veraendern)
               {
               newfs->next=tempfs;
               tempfs->prev=newfs;
               header->first=newfs;
               }
            else                       // in der mitte einfuegen
               {
               newfs->prev=tempfs->prev;
               tempfs->prev->next=newfs;
               newfs->next=tempfs;
               tempfs->prev=newfs;
               }
            tempfs=(fs_ptr) NULL;               // while schleife beenden!
            }
         else
            {
            if (tempfs==header->last) // am ende einfuegen (Header veraendern!)
               {
               tempfs->next=newfs;
               newfs->prev=tempfs;
               header->last=newfs;
               tempfs=(fs_ptr) NULL;            // whileschleife beenden!
               }
            else tempfs=tempfs->next;  // noch nicht am ende also zum naechsten!
            }
         }
      }
   header->anzahl++; // increase anzahl
}

//=

//+KillFile

void KillFile(void)
{
int killnr,k;
fs_ptr tempfs;

   do
      {
      pl("[%dH[K[35mKill which File? [37m",screen+l_size+toplines+bottomlines+1);
      input(String,2);
      killnr=atoi(String);
      }
   while((killnr<1) || (killnr>NewHeader->anzahl));

   tempfs=GetXFS(killnr-1,NewHeader);

   pl("[%dH[K[35mKill [33m%s [35m? ([33mY[35m/[33mn[35m)",screen+l_size+toplines+bottomlines+1,tempfs->fileinfo->fib_FileName);
   k=CursorHotKey();

   if ((k==121) || (k==89) || (k==13)) remove(tempfs->fileinfo->fib_FileName);
   else
      {
      pl("[%dH",screen+l_size+toplines+bottomlines+1);
      if (sysopaccess) ExternalDesign ("PROMPTS", 1, String, 1024);
      else ExternalDesign ("PROMPTN", 1, String, 1024);
      TranslateLine (String, i_flagged, Flagged(), i_anzahl, NewHeader->anzahl, TAG_DONE);
      PL(String);
      return;
      }

   Delete_FS(tempfs,NewHeader); // delete file

//----------------------------> get number of pages <---------------------------------------

   pages=(NewHeader->anzahl-1)/maxitems;

//-------------------------------------------------------------------------------

   pl("[H[J[0m");
   showfile(logoname);
   pl("[%dH[J[0m",l_size+1);                    // reset cursor clear screen
   if(page>pages) page=pages;
   ShowItems(page);
   ClearAll();

}
//=

//+LocalDownload

void LocalDownload(char *n_string)
{
   int k;
   char path_name[255];

   sprintf(path_name,"%s%s",Prefs.TEMPDIR,n_string);

   GetPromptsLine(265,String);
   PL(String);
   if (SystemData->ASLRequesters==0)
      {
      GetPromptsLine(359,String);
      pl("%s[37m? [y/[33mN[37m] ",String);
      k=CursorHotKey();
      }
   if ((k==121) || k==(89) || (SystemData->ASLRequesters==1))
      ASLRequester(1,String,"Local Download To Path",SystemData->LocalDLPath);
   else
      {
      GetPromptsLine(266,String);
      PL(String);
      input(String,60);
      }
   if (CheckPath(String)!=0)
      {
      PL("[31mCan't move file or aborted\r\n");
      CloseStuff();
      }

   PL("[37m");
   strcat(String,n_string);
   MoveFile(path_name,String);
}
//=

//+ MainInits

void MainInits(char *path)
{
   stcgfp(String,path);
   if (String[strlen(String)-1]!=':') strcat(String,"/");

   strins(logoname,String);         // Logo-filename!

   if ((User->AnsiType==2) || (User->AnsiType==3))
      {
      strcat(logoname,"ibm");
      strcat(e_name,"ibm");
      }
   else
      {
      strcat(logoname,"ami");
      strcat(e_name,"ami");
      }
   strins(c_name,String);               // config-filename
   strins(s_name,String);
   strins(h_name,String);
   strins(stat_name,String);
   strins(diz_name,String);
   strins(access_name,String);
   strins(e_name,String);

//----------------------------> init 2 headers <----------------------------------------

   NewHeader=New_Header();
   OldHeader=New_Header();
   UploadHeader=New_Header();
   if ((NewHeader==(h_ptr) NULL) || (OldHeader==(h_ptr) NULL) || (UploadHeader==(h_ptr) NULL)) Fehler("Can't init structur!");

//-----------------------------------> check Config-File <------------------------------------

   if (!ReadPrefs()) Fehler("Can't open %s",c_name);

//------------------------------------> check User-Dir <------------------------------------

   if((FLock = (struct FileLock *)Lock(s_name,ACCESS_READ)) == NULL)
      {
      if(mkdir(s_name)!=0) Fehler("Can't create Dir %s","s_name");
      }
   else UnLock((BPTR)FLock);

   strcat(s_name,"/");
   stci_d(String,User->SerialNumber);   //Add '<userserialnr>'
   strcat(s_name,String);

   ReadConfig();

//----------------------------> get autologo-size <----------------------------------------

   if (User->Length<l_size+toplines+bottomlines+1) Fehler("Screenlength to small!");

}
//=

//+ New_Header

h_ptr New_Header(void)
{
h_ptr newheader;

   newheader = (h_ptr) AllocMem (sizeof (Header),0L);
   if (newheader)
      {
      newheader->anzahl= 0;
      newheader->first = (fs_ptr) NULL;
      newheader->last  = (fs_ptr) NULL;
      return(newheader);
      }
   else return((h_ptr) NULL);
}

//=

//+ New_FS

fs_ptr New_FS(void)
{
fs_ptr newfs;

   newfs = (fs_ptr) AllocMem (sizeof (struct File_Struct),0L);
   if (newfs)
      {
      newfs->next = (fs_ptr) NULL;
      newfs->prev = (fs_ptr) NULL;
      newfs->fileinfo = (struct FileInfoBlock *) AllocMem (sizeof (struct FileInfoBlock),0L);
      if (!newfs->fileinfo)
         {
         FreeMem(newfs,sizeof (struct File_Struct));
         return((fs_ptr) NULL);
         }
      return(newfs);
      }
   else return((fs_ptr) NULL);
}

//=

//+PackFlagged

void PackFlagged(void)
{
int o,key=0;
short check=0;
long t;
char callstring[255];
char tempstring[20];
char packercall[15];
fs_ptr tempfs;

   PL("[H[2J");                                 // reset cursor clear screen

   time(&t);
   TM = gmtime(&t);
   strftime(namestring, 35, Prefs.FILENAME,TM);

   sprintf(tempstring,"%d",User->SerialNumber);
   strcat(Prefs.TEMPDIR,tempstring);

   // remove old-------------------------------------------------------------------------------

   rmdir(Prefs.TEMPDIR);

   mkdir(Prefs.TEMPDIR);
   strcat(Prefs.TEMPDIR,"/");

   if( (olddir.packertype==0) || ((olddir.packertype==1) && (!Prefs.P_LHA)) || ((olddir.packertype==2) && (!Prefs.P_LZX)) || ((olddir.packertype==3) && (!Prefs.P_ZIP)) )
      {
      if(!SelectPacker())
         {
         pl("\r\n[31mT-Updater Error: can't write %s[0m\r\n",s_name);
         CloseStuff();
         }
      }
   else
      {
      PL("\r\n[0;33mChange Compression Method (current: [37m");
      switch(olddir.packertype)
         {
         case 1:
            PL("LHA");
            break;
         case 2:
            PL("LZX");
            break;
         case 3:
            PL("ZIP");
            break;
         }
      PL("[33m)? [35m([1;37my[0;35m/[1;37mN[0;35m)");
      key=CursorHotKey();
      if ((key=='y') || (key=='Y')) SelectPacker();
      if (key==3)
         {
         PL("\r\n[31mAborting\r\n");
         CloseStuff();
         }
      }

   strftime(tempstring, 20, "%d %b %y %H:%M",TM);

   PL("\r\n\r\n[32mCreating Archive please wait....\r\n\r\n");

//------------- check witch packer ----------------------

   switch (olddir.packertype)
      {
      case 1:
         strcpy(packercall,"c:lha a");
         strcat(namestring,".lha");
         break;
      case 2:
         strcpy(packercall,"c:lzx af");
         strcat(namestring,".lzx");
         break;
      case 3:
         strcpy(packercall,"c:zip -k -j");
         strcat(namestring,".zip");
         break;
      }


//----------------> adding files <---------------------------------------

   SetTaskPri(FindTask(0),0);

   tempfs=NewHeader->first;
   for(o=0;o<NewHeader->anzahl;o++)
      {
      key=CheckKey();
      if (o!=0) tempfs=tempfs->next;
      if (flag[o]==1)
         {
         pl("adding %s\r\n",tempfs->fileinfo->fib_FileName);
         sprintf(callstring,"%s \"%s%s\" \"%s\"",packercall,Prefs.TEMPDIR,namestring,tempfs->fileinfo->fib_FileName);

         if (!Execute(callstring,NULL,NULL))
            {
            pl("\r\n[31mT-Updater Error: Can't create archive[0m\r\n");
            CloseStuff();
            }
         check++;
         }
      if (key==3)
         {
         PL("\r\n[31mAborting\r\n");
         CloseStuff();
         }
      }

//-----------------------------> adding File_Id.Diz <-----------------------------

   sprintf(callstring,"%sFile_Id.Diz",Prefs.TEMPDIR);

   setmem(&String,1024,NULL); // String loeschen

   if ((FH = fopen (diz_name,"r")) == (FILE *) NULL)
       {
       pl("\r\n[31mT-Updater Error: Can't open %s[0m\r\n",diz_name);
       CloseStuff();
       }
   fread(String,1024,1,FH);
   fclose(FH);

   if ((FH = fopen (callstring,"w+")) == (FILE *) NULL)
       {
       pl("\r\n[31mT-Updater Error: Can't write %s[0m\r\n",callstring);
       CloseStuff();
       }

   TranslateLine(String,systemname,SystemData->Name,datestr,tempstring, TAG_DONE);

   fwrite(String,strlen(String),1,FH);
   fclose(FH);

   sprintf(callstring,"%s \"%s%s\" \"%sFile_Id.Diz\"",packercall,Prefs.TEMPDIR,namestring,Prefs.TEMPDIR);

   if (!Execute(callstring,NULL,NULL))
       {
       pl("\r\n[31mT-Updater Error: Can't create archive[0m\r\n");
       CloseStuff();
       }

   sprintf(callstring,"%sFile_Id.Diz",Prefs.TEMPDIR);
   remove(callstring);

//---------------------------------------------------------------------------------

   pl("\r\n%d files added\r\n",check);

//----------------------> download y/n , ok y/n <----------------------------------------

   if (GetValue(2)==0) StartXfer(namestring);
   else LocalDownload(namestring);

//---------------------------------------------------------------------------------

   sprintf(String,"%s%s",Prefs.TEMPDIR,namestring);
   remove(String);
   Prefs.TEMPDIR[strlen(Prefs.TEMPDIR)-1]=0;
   rmdir(Prefs.TEMPDIR);


   newdir.time=t/86400L;

   olddir.files_total+=check;

   WriteConfig();

   GetStatistic();                 // get statistic and increase calls
   Statistic.files_today+=check;
   Statistic.files_total+=check;
   WriteStatistic();               // write new statistic

   PL("\r\n");

   CloseStuff();
}
//=

//+ReadConfig

void ReadConfig(void)
{
fs_ptr tempfs;

   setmem(&olddir,sizeof(olddir),NULL);

   if ((FH = fopen (s_name,"r")) == (FILE *) NULL) return;
   else
      {
      fread(&olddir,sizeof(olddir),1,FH);
      while(feof(FH)==0)
         {
         tempfs=New_FS();
         fread(tempfs->fileinfo,sizeof (struct FileInfoBlock),1,FH);
         Insert_FS(tempfs,OldHeader);
         }
      fclose(FH);
      }

   if (olddir.calls_total>999) olddir.calls_total=0;
   if (olddir.files_total>9999) olddir.calls_total=0;

}
//=

//+ReadPrefs

BOOL ReadPrefs(void)
{
   if ((FH = fopen (c_name,"r")) == (FILE *) NULL) return(FALSE);
   else
      {
      fread(&Prefs,sizeof(Prefs),1,FH);
      fclose(FH);
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

   if (Prefs.UPDATEDIR[strlen(Prefs.UPDATEDIR)-1]=='/') Prefs.UPDATEDIR[strlen(Prefs.UPDATEDIR)-1]='\0';

   return(TRUE);
}

//=

//+SelectPacker

BOOL SelectPacker(void)
{
BOOL all_ok=FALSE;
int  c;

   PL("\r\n[0;36mSelect Compression Method [[31m");
   if(Prefs.P_LHA) PL(" 0[35m: LHA [31m");
   if(Prefs.P_LZX) PL(" 1[35m: LZX [31m");
   if(Prefs.P_ZIP) PL(" 2[35m: ZIP ");
   PL("[36m] : ");

   do
      {
      c=CursorHotKey();
      switch(c)
         {
         case 48:
            if(Prefs.P_LHA)
               {
               olddir.packertype=1;
               all_ok=TRUE;
               }
            break;
         case 49:
            if(Prefs.P_LZX)
               {
               olddir.packertype=2;
               all_ok=TRUE;
               }
            break;
         case 50:
            if(Prefs.P_ZIP)
               {
               olddir.packertype=3;
               all_ok=TRUE;
               }
            break;
         }
      }
   while(!all_ok);

   PL("\r\n");

   if ((FH = fopen (s_name,"r+")) == (FILE *) NULL)
      if ((FH = fopen (s_name,"w+")) == (FILE *) NULL) Fehler("Can't write %s",s_name);

   fwrite(&olddir,sizeof(olddir),1,FH);
   fclose(FH);

   return(TRUE);
}

//=

//+ShowItems

void ShowItems(int seite)
{
int o, grenze;
char date_str[15], time_str[6];
long t;
fs_ptr tempfs;

   time(&t);

   t/=86400;

   if (maxitems>=NewHeader->anzahl) grenze=NewHeader->anzahl;
   else grenze=maxitems*(seite+1);

   if (grenze>=NewHeader->anzahl) grenze=NewHeader->anzahl;   // grenze darf max NewHeader->anzahl sein!!!

   screen=0;

   for(o=0;o<toplines;o++)
      {
      ExternalDesign("TOP",o+1,String,1024);
      TranslateLine(String,
         calls_td,   Statistic.calls_today,
         calls_tt,   Statistic.calls_total,
         calls_us,   olddir.calls_total,
         files_td,   Statistic.files_today,
         files_tt,   Statistic.files_total,
         files_us,   olddir.files_total,
         act_page,   seite+1,
         max_page,   pages+1,
         TAG_DONE);
      PL(String);
      }

   tempfs=GetXFS(maxitems*seite,NewHeader);

   for (o=maxitems*seite; o<grenze; o++)
      {
      GetFileDate(tempfs->fileinfo->fib_Date,t,date_str, time_str);
      if (flag[o]==1) strcpy(String,output_f_line);
      else  strcpy(String,output_d_line);
      TranslateLine(String,
         i_number,   o+1,
         f_name,     tempfs->fileinfo->fib_FileName,
         f_size,     tempfs->fileinfo->fib_Size>>10,
         f_date,     date_str,
         f_time,     time_str,
         f_comment,  tempfs->fileinfo->fib_Comment,
         TAG_DONE);
      PL(String);
      screen++;
      tempfs=tempfs->next;
      }

   for(o=0;o<bottomlines;o++)
      {
      ExternalDesign("BOTTOM",o+1,String,1024);
      PL(String);
      }

   if (sysopaccess) ExternalDesign ("PROMPTS", 1, String, 1024);
   else ExternalDesign ("PROMPTN", 1, String, 1024);
   TranslateLine (String, i_flagged, Flagged(), i_anzahl, NewHeader->anzahl, TAG_DONE);
   PL(String);
}
//=

//+ShowHelp

void ShowHelp(void)
{
   PL("[H[J");                                 // reset cursor clear screen

   showfile(h_name);

   CursorHotKey();

   PL("[H[J");                                 // reset cursor clear screen
   showfile(logoname);
   pl("[%dH[J[0m",l_size+1);                    // reset cursor clear screen
   ShowItems(page);
}
//=

//+StartXfer

void StartXfer(char *n_string)
{
   int k;
   char path_name[255];

   sprintf(path_name,"%s%s",Prefs.TEMPDIR,n_string);

   do
      {
      GetPromptsLine(369,String);
      PL(String);
      if (User->Protocol==0) PL("=T= Internal Zmodem\r\n");
      if (User->Protocol==1) PL("=T= Internal Hydra Bi-Directional\r\n");
      if (User->Protocol==2) PL("External Smodem Bi-Directional\r\n");

      PL("\r\n[0;33mStart download? [35m([1;37mY[0;35m/[1;37mn[0;35m/[1;37mp[0;33mrotocol Change[35m)");
      k=CursorHotKey();
      if ((k==110) || (k==78) || (k==3))
         {
         PL("\r\n[31mAborting\r\n");
         CloseStuff();
         }
      if ((k==112) || (k==80))
         {
         PL("[0m");
         SelectTransferProtocol();
         continue;
         }

      PL("\r\n");

      if (User->Protocol==0) ZmodemDownload(path_name);
      if (User->Protocol==1)
         {
         GetPromptsLine(58,String);
         PL(String);
         HydraDownload(path_name);
         }
      if (User->Protocol==2)
         {
         PL("\r\n[31mSorry still no Smodem available in this door.\r\n");
         ZmodemDownload(path_name);
         }

      PL("\r\n\r\n[33mGet the whole archive? [35m([1;37mY[0;35m/[1;37mn[0;35m)");
      k=CursorHotKey();
      }
   while((k!=3) && (k!=13) && (k!=121) && (k!=89));
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

//+UploadFile

void UploadFile(void)
{
int k;
fs_ptr tempfs,tempfs2;
char tempstring[150];

   if (GetValue(2)!=0)
      {
      pl("[%d;53H[K[31monly remote!",screen+l_size+toplines+bottomlines+1);
      k=CursorHotKey();
      return;
      }

   pl("[%dH[K[35mStart Upload (using default protocol)? ([33mY[35m/[33mn[35m)",screen+l_size+toplines+bottomlines+1);
   k=CursorHotKey();

   if ((k!=121) && (k!=89) && (k!=13))
      {
      pl("[%dH",screen+l_size+toplines+bottomlines+1);

      if (sysopaccess) ExternalDesign ("PROMPTS", 1, String, 1024);
      else ExternalDesign ("PROMPTN", 1, String, 1024);
      TranslateLine (String, i_flagged, Flagged(), i_anzahl, NewHeader->anzahl, TAG_DONE);
      PL(String);

      return;
      }
   PL("[H[J");

   do
      {
      ZmodemUpload();

      sprintf(String,"%sWork%d/",SystemData->UploadPath,NodeData->CurrentNode);
      GetDir(String,UploadHeader);

      if (UploadHeader->anzahl!=0)
         {
         PL("[31mIncomplete upload(s)! [35mResume? ([33mY[35m/[33mn[35m)");
         do
            k=CursorHotKey();
         while((k==24) || (k==3));
         if ((k=='n') || (k=='N'))
            {
            tempfs=UploadHeader->first;
            while (tempfs)
                {
                sprintf(String,"%sWork%d/%s",SystemData->UploadPath,NodeData->CurrentNode,tempfs->fileinfo->fib_FileName);
                remove(String);
                tempfs=tempfs->next;
                }
            }
         }
      else k='n';
      }
   while((k!='n') && (k!='N'));

//----------------- delete old uploadheader structur ----------------

   Delete_All(UploadHeader);
   UploadHeader=New_Header();
   if (UploadHeader==(h_ptr) NULL) Fehler("Can't init structur!");

//-------------------------------------------------------------------


   sprintf(String,"%sWork%d/Done/",SystemData->UploadPath,NodeData->CurrentNode);
   GetDir(String,UploadHeader);
   if (Prefs.COMMENT==0)   GetFiletypes(UploadHeader);

   if (UploadHeader->anzahl==0) PL("[31mNo new files!\r\n");
   else
      {
      tempfs=UploadHeader->first;
      while(tempfs)
         {
         sprintf(String,"%sWork%d/Done/%s",SystemData->UploadPath,NodeData->CurrentNode,tempfs->fileinfo->fib_FileName);

         if (Prefs.UPDATEDIR[strlen(Prefs.UPDATEDIR)-1]==':')  // check if xxxx:
            sprintf(tempstring,"%s%s",Prefs.UPDATEDIR,tempfs->fileinfo->fib_FileName);
         else sprintf(tempstring,"%s/%s",Prefs.UPDATEDIR,tempfs->fileinfo->fib_FileName); // if not add an "/"

         if((FLock = (struct FileLock *)Lock(tempstring,ACCESS_READ)) != NULL)
            {
            UnLock((BPTR)FLock);
            remove(tempstring);
            }
         MoveFile(String,tempstring);
         tempfs2=tempfs->next;
         Insert_FS(tempfs,NewHeader);
         tempfs=tempfs2;
         }
      }

//-------------------------------------------------------------------------------

   UploadHeader->anzahl=0;
   UploadHeader->first=(fs_ptr) NULL;
   UploadHeader->last=(fs_ptr) NULL;

//-------------------------------------------------------------------------------

   pages=(NewHeader->anzahl-1)/maxitems;

   pl("[H[J[0m");
   showfile(logoname);
   pl("[%dH[J[0m",l_size+1);                    // reset cursor clear screen
   if(page>pages) page=pages;
   ShowItems(page);
   ClearAll();

}
//=

//+WriteConfig

void WriteConfig(void)
{
fs_ptr tempfs;

   if ((FH = fopen (s_name,"w+")) == (FILE *) NULL) Fehler("Can't write %s",s_name);

   newdir.packertype=olddir.packertype;
   newdir.calls_total=olddir.calls_total;
   newdir.files_total=olddir.files_total;

   fwrite(&newdir,sizeof(newdir),1,FH);
   if (NewHeader->anzahl>0)
      {
      tempfs=NewHeader->first;
      while(tempfs)
         {
         fwrite(tempfs->fileinfo,sizeof(struct FileInfoBlock),1,FH);
         tempfs=tempfs->next;
         }
      }
   fclose(FH);

}
//=

//+WriteStatistic

void WriteStatistic(void)
{
   if ((FH = fopen (stat_name,"w+")) == (FILE *) NULL) Fehler("Can't write %s",stat_name);

   fwrite(&Statistic,sizeof(Statistic),1,FH);
   fclose(FH);
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
   char STRING[31];
   int p;

   if(!DoorStart(argv[1])) { PutStr("Tempest Door (1oo%-T-Updater 2.4)\n"); exit(0); }
   SetTaskPri(FindTask(0),SystemData->DoorsPriority);
   Activity(99,"1oo% T-Updater 2.4");

   freemem=AvailMem(MEMF_ANY);

//---------------------------------> INIT's <----------------------------------

   MainInits(argv[0]);

//-------------------------------------------------------------------------------

   setmem(&flag,100,0);

   GetDir(Prefs.UPDATEDIR,NewHeader);
   if (Prefs.COMMENT==0)   GetFiletypes(NewHeader);

//----------------------------> check sysopaccess <----------------------------

   if (User->Security>=Prefs.SYSOP) sysopaccess=TRUE;
   else sysopaccess=CheckAccess();
   if (sysopaccess) strcat(h_name,"S");

//-------------------------------------------------------------------------------

   GetStatistic();                 // get statistic and increase calls
   Statistic.calls_today++;
   Statistic.calls_total++;
   olddir.calls_total++;

   if ((FH = fopen (s_name,"r+")) == (FILE *) NULL)
      if ((FH = fopen (s_name,"w+")) == (FILE *) NULL) Fehler("Can't write %s",s_name);
   fwrite(&olddir,sizeof(olddir),1,FH);
   fclose(FH);

   WriteStatistic();               // write new statistic

   AutoFlag();

//----------------------------> get external-designs <----------------------------

   GetJumps();
   ExternalDesign("ITEMS",1,output_f_line,255);
   ExternalDesign("ITEMS",2,output_d_line,255);

   toplines=ExternalPref("TOP");
   bottomlines=ExternalPref("BOTTOM");

//----------------------------> get number of pages <----------------------------

   pages=(NewHeader->anzahl-1)/maxitems;

//-------------------------------------------------------------------------------

   pl("[H[J[0m");

   showfile(logoname);

   pl("[%dH[J[0m",l_size+1);                    // reset cursor clear screen

   ShowItems(page);
   do
      {
      strcpy(String,output_p_jump);
      TranslateLine(String,i_flagged,Flagged(),posy,screen+l_size+toplines+bottomlines+1, TAG_DONE);
      pl(String);
      input(STRING,30);
      
      switch((int)STRING[0])
         {
         case '>':
            if (page!=pages) ++page;
            else page=0;
            pl("[%dH[J[0m",l_size+1);                                 // reset cursor clear screen
            ShowItems(page);
            break;
         case '<':
            if (page!=0) --page;
            else page=pages;
            pl("[%dH[J[0m",l_size+1);                                 // reset cursor clear screen
            ShowItems(page);
            break;
         case 'a':
         case 'A':
            PL("[31m");
            FlagAll();
            break;
         case 'c':
         case 'C':
            ClearAll();
            break;
         case 'f':
         case 'F':
            FlagSinceDate();
            break;
         case 'k':
         case 'K':
            if (sysopaccess) KillFile();
            break;
         case 'p':
         case 'P':
            if (STRING[1]==' ') p = atoi(&STRING[2])-1;
            else p = atoi(&STRING[1])-1;

            if (( p >= 0 ) &&  ( p <= pages ) && ( p != page ))
               {
               page = p;
               pl("[%dH[J[0m",l_size+1);                                 // reset cursor clear screen
               ShowItems(page);
               }
            break;
         case 't':
         case 'T':
            FlagToggle();
            break;
         case '?':
            ShowHelp();
            break;
         case 's':
         case 'S':
         case 0:
            if (Flagged()==0)  CloseStuff();
            PackFlagged();
            break;
         default:
            CheckInput(STRING);
            break;
         case 'u':
         case 'U':
            if (sysopaccess) UploadFile();
            break;
         }
      }
   while((STRING[0]!='q') &&  (STRING[0]!='Q') && (STRING[0]!='s') && (STRING[0]!='S'));
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
// delete temp-files

 if (strlen(namestring)>0)
   {
   sprintf(String,"%s%s",Prefs.TEMPDIR,namestring);
   remove(String);
   Prefs.TEMPDIR[strlen(Prefs.TEMPDIR)-1]=0;
   rmdir(Prefs.TEMPDIR);
   }

// delete Header and structs

   Delete_All(NewHeader);
   Delete_All(OldHeader);
   Delete_All(UploadHeader);

//exit door

 DOORIO(999);
 while(msg=(struct MyMessage *)GetMsg(MyPort)) ReplyMsg((struct Message *)msg);
 if(MyPort) DeletePort(MyPort);
 exit(0);
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

//***********************
//*****  Get Value  ***** // Command 34
//***********************
int GetValue(int opt)
{
 send.Value1=opt;
 DOORIO(34);
 return(send.Value2);
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

//************************************
//*****  SelectTransferProtocol  ***** // Command 50
//************************************
VOID SelectTransferProtocol(VOID)
{
 DOORIO(50);
}


//*****************************
//*****  Zmodem Download  ***** // Command 52
//*****************************
VOID ZmodemDownload(TEXT *file)
{
 send.text1=file;
 DOORIO(52);
}

//***************************
//*****  Zmodem Upload  ***** // Command 53
//***************************
void ZmodemUpload(VOID)
{
 DOORIO(53);
}

//****************************
//*****  Hydra Download  ***** // Command 54
//****************************

VOID HydraDownload(TEXT *mstring)
{
 send.text1=mstring;
 DOORIO(54);
}

//***********************
//*****  Show File  *****  // Command 70
//***********************
VOID showfile(TEXT *file)
{
 send.text1=file;
 DOORIO(70);
}

//***********************
//*****  Move File  *****  // Command 77
//***********************
VOID MoveFile(TEXT *Source,TEXT *Destination)
{
 send.text1=Source;
 send.text2=Destination;
 DOORIO(77);
}

//**********************
//***  ASLRequester  *** // Command 84
//**********************
VOID ASLRequester(int Type,char *rstring,char *reqtext,char *dpath)
{
 send.Value1 = Type;     // Which Type of Requester
 send.text1  = rstring;  // Return string (contains results of requester)
 send.text2  = reqtext;  // Requester Titlebar text
 send.text3  = dpath;    // Requester Default Path
 DOORIO(84);
}

//*****************************
//*****   GetPromptsLine  ***** // Command 85
//*****************************
VOID GetPromptsLine(int line,char *buffer)
 {
  send.Value1=line;
  send.text1 =buffer;
  DOORIO(85);
 }

//=


