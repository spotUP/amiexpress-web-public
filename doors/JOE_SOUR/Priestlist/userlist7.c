#include <AE.Includes/doorheader.h>
#include <AE.Includes/glue.h>

#include <string.h>
#include <proto/exec.h>
#include <dos/dos.h>
#include <ctype.h>
#include <time.h>

#define Ver "$VER: PRiEST-Userlist! 1.7 (25-10-94) - ©1994 H!-TEX / G-SUS"

#define sm sendmessage
#define pm prompt
#define gu getuserstring
#define pu putuserstring

#define Beep 0x07

/***[ SubRoutines ]**********************************************************/

void start(int);
void GetAEinfo(void);
void GetDate(char);
void end(void);
void DExit(void);
void LastCommand(void);
struct User *Loaddata(struct User *p,int *max);
char *Byteconv(double byte);
void aufbau1(struct User *p,int i);
void aufbau2(int fast);
void part2(struct User *p,int i);

/***[ Global Variables ]*****************************************************/

int  Node,num;
struct User {
 char    Name[31],Pass[9],Location[30],PhoneNumber[13];
 USHORT  Slot_Number;
 USHORT  Sec_Status,
     Sec_Board,                   /* File or Byte Ratio */
     Sec_Library,                 /* Ratio              */
     Sec_Bulletin,                /* Computer Type      */
     Messages_Posted;
 /* Note ConfYM = the last msg you actually read, ConfRead is the same ?? */
 ULONG   NewSinceDate, ConfRead1, ConfRead2, ConfRead3, ConfRead4,
         ConfRead5;
 UWORD   XferProtocol, Filler2;
 UWORD   Lcfiles,BadFiles; 
 ULONG   AccountDate;
 UWORD   ScreenType, Filler1;
 char    Conference_Access[10];
 USHORT  Uploads, Downloads, ConfRJoin, Times_Called;
 long    Time_Last_On, Time_Used, Time_Limit, Time_Total;
 ULONG   Bytes_Download, Bytes_Upload, Daily_Bytes_Limit, Daily_Bytes_Dld;
 char    Expert;
 ULONG   ConfYM1, ConfYM2, ConfYM3, ConfYM4, ConfYM5, ConfYM6, ConfYM7,
         ConfYM8, ConfYM9;
 long    BeginLogCall;
 UBYTE   Protocol, UUCPA, LineLength, New_User;
 };
/***[ Main ]*****************************************************************/

void main (int argc,char *argv[]) 
{
  if(argc!=2)
  {
    printf("\n %s \n",Ver);
    exit(0);
  }
  Node=atoi(argv[1]);
  Register(argv[1][0]-'0');
  putuserstring("G^SUS Userlist",177);
  start(Node);
  DExit();
}
/****************************************************************************/

void start(int node)


{ struct User *p,*q=NULL;
  int i,new=0,merk=0,max=0,fast=1;
  ULONG slot,anz=0,maxline,rahmenu=12,rahmeno=1,cursor=0,cur=1;
  char line[400],line2[2],line3[3];
  pu (line,501);
  gu (line3,122);
  pu ("80",122);
  PutInfo (0,122);
  maxline=atoi(line);
  
  q=Loaddata(q,&max);
  if (q==NULL)
    {
    sm ("[36m  sORRY sOMETHINGS wRONG",1);
    DExit(); 
    }
  
  printf(line2,1);
  aufbau2(fast);
  gu (line,104);
  slot=atoi(line);
do { if (merk==0) sm("[2;1H",0);
     if (merk==1) sm("[2;1H",0);
  for (i=rahmeno;i<=rahmenu;i++)
    {p=q+i-1; 
    if (merk==0)
   { if (p->Slot_Number!=0)
      {anz++;
      if (cursor+rahmeno==i)
        sm("[3C[44m",0); 
      else
        sm("[3C[40m",0);
      sprintf (line,"[36m[[32m%3d[36m][0m",p->Slot_Number);
      sm (line,0);
      if (p->New_User==NULL)
	sprintf (line," %-19.19s",p->Name);
      else
    	{
         sprintf (line,"*%-19.19s",p->Name);
         new++;
	}
      sm (line,0);
      sprintf (line," %-19.19s [35m",p->Location);
      sm (line,1);}
    
}

   if (merk==1)
   { if (p->Slot_Number!=0)
      {
      anz++;
      if (cursor+rahmeno==i)
        sm("[3C[44m",0); 
      else
        sm("[3C[40m",0);
      sprintf (line,"[36m[[32m%3d[36m][0m",p->Slot_Number);
      sm (line,1);}
   }
   if (merk==2)
   {  if (fast==0)
      {sm ("[2;54H[0m[32mF[0mast Mode: [36moN ",0);}
      else
      {sm ("[2;54H[0m[32mF[0mast Mode: [36moFF",0);}
   }   
}
if (fast==1) {aufbau1(q,cursor+rahmeno-1);}
hotkey("",line2);
merk=3;
sm ("[18;1H",0);
if (line2[0]==3) if (rahmenu+13<max) {rahmeno+=12;rahmenu+=12;merk=0;} else if (rahmenu<max) {rahmenu=max;rahmeno=rahmenu-11;merk=0;} else {cursor=11;merk=0;} 
if (line2[0]==2) if (rahmeno>12) {rahmeno-=12;rahmenu-=12;merk=0;} else if (rahmenu>12) {rahmeno=1;rahmenu=rahmeno+11;merk=0;} else {cursor=0;merk=0;}
if (line2[0]==5) if (rahmeno+cursor<max) if (cursor>=rahmenu-rahmeno) {merk=0;rahmenu++;rahmeno++;cur++;} else {merk=1;cursor++;cur++;}
if (line2[0]==4) if (cursor) {merk=1;cursor--;cur--;} else if (rahmeno>1) {merk=0;rahmeno--;rahmenu--;cur--;}
if (line2[0]==' ') {part2(q,cursor+rahmeno-1);aufbau2(fast);merk=0;}
if (line2[0]=='f' || line2[0]=='F') {merk=2;if (fast==1) fast=0; else fast=1;}


} while (line2[0]!=13);

	pu (line3,122);
	PutInfo (0,122);
}



void part2(struct User *p,int i)
{char ch[2],line[200],dummy[15],dummy2[10],dummy3[10];
 p+=i; 
 sm ("c",0);


          sm ("[0m       [35m .----------------------------------------------------------------.",1);
 sprintf(line,"[0m       [35m |[36m Handle:[0m %-19.19s[36m      Location:[0m %-20.20s[35m|",p->Name,p->Location);
 sm (line,1);
          sm ("[0m[35m        ·----------------------------------------------------------------·",1);
 sprintf(line,"[0m[35m        |[36m sLOT:[0m %4d       [36maXX lEVEL:[0m %3d [36m cONF aXX:[0m %-10.10s          [35m|",p->Slot_Number,p->Sec_Status,p->Conference_Access);
 sm (line,1);

          sm ("[0m[35m        |                                                                |",1);
 sprintf(line,"[0m[35m        |[36m cALLS:[0m %5d   [36mmESSAGES:[0m %5d                                 [35m|",p->Times_Called,p->Messages_Posted);
 sm (line,1);
          sm ("[0m[35m        |                                                                |",1);
 sprintf(line,"[0m[35m        |[36m uL bYTES:[0m %10d [36m uL fILES:[0m %4d  [36mbYTE lIMIT:[0m %10d[35m |",p->Bytes_Upload,p->Uploads,p->Daily_Bytes_Limit);
 sm (line,1);
          sm ("[0m[35m        |                                                                |",1);
 sprintf(line,"[0m[35m        |[36m dL bYTES:[0m %10d [36m dL fILES:[0m %4d  [36mtODAY dOWN:[0m %8d[35m     |",p->Bytes_Download,p->Downloads,p->Daily_Bytes_Dld);
 sm (line,1);
          sm ("[0m[35m        |                                                                |",1);

 if (!p->Sec_Library) {sprintf(dummy,"dISABLED ");sprintf(dummy2,"dISABLED ");}
 else {if (p->Sec_Board==0) sprintf(dummy,"%s","bYTE     "); 
       else if (p->Sec_Board==1) sprintf(dummy,"%s","bYTE/fILE");
       else if (p->Sec_Board==2) sprintf(dummy,"%s","fILE     ");
       sprintf (dummy3,"1:%d",p->Sec_Library);
       sprintf (dummy2,"%-9.9s",dummy3);
      }
       
 sprintf(line,"[0m[35m        |[36m rATIO tYPE:[0m %s [36mrATIO:[0m %s                         [35m|",dummy,dummy2);
 sm (line,1);
          sm ("[0m[35m        `----------------------------------------------------------------'",1);
          sm ("[0m",0);
 hotkey("",ch);
}



















/****************************************************************************/
void DExit(void)
{
  ShutDown();
  end();
}
void end (void)
{
  exit(0);
}


void aufbau1(struct User *p,int i)
{  char line[400];
 



p+=i;


      sprintf (line,"[16;3H[36m[[32m%3d[36m] [0m",p->Slot_Number);
      sm (line,0);
      if (p->New_User==NULL)	
        sprintf (line," %-19.19s",p->Name);
      else
    	 sprintf (line,"*%-19.19s",p->Name);
      sm (line,0);
      sprintf (line," %-19.19s",p->Location);
      sm (line,0);
      sm (Byteconv((double)p->Bytes_Upload),0);
      sm (" ",0);
      sm (Byteconv((double)p->Bytes_Download),0);
      sprintf (line," %4d %4d",p->Times_Called,p->Messages_Posted);
      sm (line,1);
    


}

void aufbau2(int fast)
{ int i;
  sm("c",0);
  sm ("p",0);
  sm (" [35m.-----------------------------------------------.-------------------------.",1);
  for (i=0;i<12;i++)
  sm (" [35m|[47C|[0m[25C[35m|[0m",1);
  
  sm ("[14;1H[0m[35m ·-----------------------------------------------´-------------------------·",1);     
  sm (" |[36;44m sLOT[40m ",0);
  sm ("[44m      hANDLE       [40m ",0);
  sm ("[44m     lOCATION      [40m ",0);
  sm ("[44m   uL   [40m ",0);
  sm ("[44m   dL   [40m ",0);
  sm ("[44mcALL[40m ",0);
  sm ("[44mmAIL[40m[35m|",1);
  sm (" [35m|[73C|",1);
  sm (" `-------------------------------------------------------------------------´",1);
    


if (fast==0)
      {sm ("[2;54H[0m[32mF[0mast Mode: [36moN ",0);}
      else
      {sm ("[2;54H[0m[32mF[0mast Mode: [36moFF",0);}
   


  sm ("[4;53H[0mJust use Cursor keys",0);
  sm ("[7;52H[0mCall these G-SUS Boards",0);
  sm ("[8;54H[0mOtOrInOlArIngOIAtrA",0);
  sm ("[9;56H[0mCAFE BANGLADESH",0);
  sm ("[10;55H[0m)) bAUD bOILER ((",0);
  sm ("[11;59H[0mScumWhere",0);
  sm ("[12;50H[35m·-------------------------·",0);
  sm ("[13;52H[36mUserlist by H!-TEX/G-SUS",0);
}

struct User *Loaddata(struct User *p,int *max)
{
  FILE *fp;
  struct User *q;
  int j;
  if ((fp=fopen("bbs:USER.DATA","r"))!=NULL)
    {
     if ((p=realloc(p,sizeof(struct User)))!=NULL)
       {q=p;
        fseek(fp,0,SEEK_SET);
        j=0;
        do 
          {if ((q=realloc(q,(j+1)*sizeof(struct User)))!=NULL)
             {
             p=q;
             p+=j;
             fread(p,sizeof(struct User),1,fp);
             if (p->Slot_Number!=0)
               {j++;}
             }
          } while (!feof(fp));
        fclose(fp);
       } else return NULL;       
        *max=j-1;            
        return (q);
     } else return NULL;
return (q);
}
char *Byteconv(double byte)
{  double bytenum;
   int nr;
   char line[400];
  if (byte>=1073741824)
        { bytenum=(byte/1073741824.0);
          nr=1; }
        else if (byte>=1048576)
        { bytenum=(byte/1048576.0);
          nr=2; }
        else
        { bytenum=(byte/1024.0);
          nr=3;}
           
        if (nr==1)
          sprintf (line,"%6.2f%2s",bytenum,"gB");
        else if (nr==2) 
          sprintf (line,"%6.1f%2s",bytenum,"mB");
        else if (nr==3)
          sprintf (line,"%6.1f%2s",bytenum,"kB");
 return (line);       
}
void LastCommand(void)
{
}
