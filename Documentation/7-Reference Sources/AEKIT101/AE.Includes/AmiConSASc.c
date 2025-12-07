#include <exec/exec.h>
#include <dos/dos.h>
#include <libraries/dos.h>
#include <devices/timer.h>
#include <proto/intuition.h>
#include <stdio.h>
#include <stdlib.h>
#include "doorheader.h"
#include <proto/exec.h>
#include <proto/dos.h>
#include <string.h>
#include "mygen.protos"
//#include <functions.h>
#define FOREVER for(;;)
#define SM sendmessage
#define HK hotkey
#define FHK Fhotkey
#define PM prompt
#define LI lineinput
#define JH_CK 500
#define JH_ExtHK 15


#define ADDBIT 1000
#define REMBIT 1001
#define QUERYBIT 1002
extern void end(void);
extern void LastCommand(void);
extern void main(int,char argv[]);
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


struct MsgPort *port;
struct MsgPort *replymp;
struct JHMessage *Jhmsg,*msg;
#define ANYKEY "press <RETURN> to continue"
char DoorReply[] = "AEDoorRP.000";
VOID Register(int node)
{
  ULONG portsig;
  int n1,n2,n3;
  int found=0;
  char PortName[80];
  Jhmsg=(struct JHMessage *)AllocMem(sizeof(struct JHMessage),MEMF_PUBLIC);

 if(Jhmsg==0)
  {
     printf("Not enough Memory for message structure\n");
     exit(30);
  }
  n1=n2=n3=0;
  while(n1<10)
  {
    n2=0;
    while(n2<10)
    {
      n3=0;
      while(n3<10)
      {
        DoorReply[9]=n1+'0';
        DoorReply[10]=n2+'0';
        DoorReply[11]=n3+'0';
        if(FindPort(DoorReply)) { n3++; continue; }
        found=1; break;
      }
      if(found) break;
      n2++;
    }
    if(found) break;
    n1++;
  }
  if(!found)
  {
     FreeMem(Jhmsg,sizeof(struct JHMessage));
    exit(30);
  }
  replymp=CreatePort(DoorReply,0L); strcpy(PortName,DoorReply);
  

  if(replymp==0)
  {
    printf("Couldn't create reply port\n");
    FreeMem(Jhmsg,sizeof(struct JHMessage));
    exit(30);
  }
  Jhmsg->Msg.mn_Node.ln_Type=NT_MESSAGE;
  Jhmsg->Msg.mn_Length=sizeof(struct JHMessage);
  Jhmsg->Msg.mn_ReplyPort=replymp;
  strcpy(Jhmsg->String,PortName);
  Jhmsg->Command=JH_REGISTER;
  Jhmsg->Data=2;
  Jhmsg->NodeID=-1;
  Jhmsg->LineNum=0;
  sprintf(PortName,"AEDoorPort%d",node);
  while(!(port=FindPort(PortName)));
  PutMsg(port,(struct Message *)Jhmsg);

    portsig=1<<replymp->mp_SigBit;
  
Wait(portsig);
msg=(struct JHMessage *)GetMsg((struct MsgPort *)replymp);
}

VOID ShutDown(VOID)
{
 ULONG portsig,signal;
  LastCommand();
 portsig=1<<replymp->mp_SigBit;
  Jhmsg->Command=JH_SHUTDOWN;
  PutMsg(port,(struct Message *)Jhmsg); 
  signal=Wait(portsig);
  ClosePort();
}

void ClosePort(void)
{
      while(msg=(struct JHMessage *)GetMsg((struct MsgPort *)replymp));
       DeletePort((struct MsgPort *)replymp);
       FreeMem(Jhmsg,sizeof(struct JHMessage));
}
int Editfile(char Name[],int len)
{ 
         strcpy(msg->String,Name);
         msg->Command=JH_EF;
         msg->Data=len;
         PutMsg(port,(struct Message *)Jhmsg); 
         WaitPort(replymp);
         GetMsg(replymp);
         len=msg->Data;
         if(msg->Data==-1) CloseOut();
         return(len);
}


void sendmessage(char mstring[],int nl)
{
        register int counter;
        char Temp[80];
   
        if(strlen(mstring)<80) sendMessage(mstring,0);
        else
        {
          counter=0;
          do
          {
            sprintf(Temp,"%.79s",&mstring[counter]);
            sendMessage(Temp,0);
            counter +=79;
          }while(strlen(Temp)==79);
        }
        if(nl==1){ sendMessage("",1); Jhmsg->LineNum +=1; }
        if(Jhmsg->LineNum==22)
        { hotkey(ANYKEY,Temp); 
 SM("\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b",0);
SM("                          ",0);
SM("\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b",0);
}
}
void mciputstr(char mstring[],int nl)
{
        register int counter;
        char Temp[80];
   
        if(strlen(mstring)<80) MciSendStr(mstring,0);
        else
        {
          counter=0;
          do
          {
            sprintf(Temp,"%.79s",&mstring[counter]);
            MciSendStr(Temp,0);
            counter +=79;
          }while(strlen(Temp)==79);
        }
        if(nl==1) MciSendStr("",1); 
}
int Download(char *s)
{
   strcpy(Jhmsg->String,s);
   Jhmsg->Command=ZMODEMSEND;
   PutMsg(port,(struct Message *)Jhmsg);
   WaitPort(replymp);
   GetMsg(replymp);
   if(Jhmsg->Data==0) return(0);
   if(Jhmsg->Data==1) return(1);
   if(Jhmsg->Data==-2)
   {
     CloseOut();
   }
}
int BatchDownload(APTR s)
{
   Jhmsg->Filler1=s;
   Jhmsg->Command=BATCHZMODEMSEND;
   PutMsg(port,(struct Message *)Jhmsg);
   WaitPort(replymp);
   GetMsg(replymp);
   if(Jhmsg->Data==0) return(0);
   if(Jhmsg->Data==1) return(1);
   if(Jhmsg->Data==-2)
   {
     CloseOut();
   }
}
int NetUpload(APTR s)
{
   Jhmsg->Filler1=s;
   Jhmsg->Command=NETUPLOAD;
   PutMsg(port,(struct Message *)Jhmsg);
   WaitPort(replymp);
   GetMsg(replymp);
   if(Jhmsg->Data==0) return(0);
   if(Jhmsg->Data==1) return(1);
   if(Jhmsg->Data==-2)
   {
     CloseOut();
   }
}
int Upload(char *s)
{
   strcpy(Jhmsg->String,s);
   Jhmsg->Command=ZMODEMRECEIVE;
   PutMsg(port,(struct Message *)Jhmsg);
   WaitPort(replymp);
   GetMsg(replymp);
   if(Jhmsg->Data==0) return(0);
   if(Jhmsg->Data==1) return(1);
   if(Jhmsg->Data==-2)
   {
     CloseOut();
   }
}
int NetDownload(char *s)
{
   strcpy(Jhmsg->String,s);
   Jhmsg->Command=NETDOWNLOAD;
   PutMsg(port,(struct Message *)Jhmsg);
   WaitPort(replymp);
   GetMsg(replymp);
   if(Jhmsg->Data==0) return(0);
   if(Jhmsg->Data==1) return(1);
   if(Jhmsg->Data==-2)
   {
     CloseOut();
   }
}
void ConOnly(char mstring[],int nl)
{
  Jhmsg->Data = nl;
  Jhmsg->Command = JH_CO;
  strcpy(Jhmsg->String,mstring);
  PutMsg(port,(struct Message *)Jhmsg);
  (void)WaitPort(replymp);
  (void)GetMsg(replymp);
}
void SerOnly(char mstring[],int nl)
{
  Jhmsg->Data = nl;
  Jhmsg->Command = JH_SO;
  strcpy(Jhmsg->String,mstring);
  PutMsg(port,(struct Message *)Jhmsg);
  (void)WaitPort(replymp);
  (void)GetMsg(replymp);
}
void sendMessage(char mstring[],int nl)
{
	Jhmsg->Data = nl;
	Jhmsg->Command = JH_SM;
	strcpy(Jhmsg->String,mstring);
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
}
void MciSendStr(char mstring[],int nl)
{
	Jhmsg->Data = nl;
	Jhmsg->Command = JH_MCI;
	strcpy(Jhmsg->String,mstring);
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
}

int GetInfo(int cmd)
{
   Jhmsg->Command=cmd;
   Jhmsg->Data=0;
   PutMsg(port,(struct Message *)Jhmsg);
   WaitPort(replymp);
   GetMsg(replymp);
   return(msg->Data);
}
int IsInfo(int value,int cmd)
{
   Jhmsg->Command=cmd;
   Jhmsg->Data=value;
   PutMsg(port,(struct Message *)Jhmsg);
   WaitPort(replymp);
   GetMsg(replymp);
   return(msg->Data);
}
void PutInfo(int data,int cmd)
{
   Jhmsg->Command=cmd;
   Jhmsg->Data=data;
   PutMsg(port,(struct Message *)Jhmsg);
   WaitPort(replymp);
   GetMsg(replymp);
}
void sendchar(char mstring[],int nl)
{
     char temp[3];
     temp[0]=mstring[0];
     temp[1]='\0';
	Jhmsg->Data = nl;
	Jhmsg->Command = JH_SM;
     strcpy(Jhmsg->String,temp);
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
}
void hotkey(char mstring[],char *ostring)
{
        Jhmsg->LineNum=0;
	strcpy(Jhmsg->String,mstring);
	Jhmsg->Command = JH_HK;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
	strcpy(ostring,Jhmsg->String);
if(Jhmsg->Data==-1) CloseOut();
}
int QuicKey(void)
{
        Jhmsg->LineNum=0;
	Jhmsg->Command = QUICK_KEY;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
	//strcpy(ostring,Jhmsg->String);
if(Jhmsg->Data<0) CloseOut();
     return(Jhmsg->Data);
}
int FetchKey(void)
{
        Jhmsg->LineNum=0;
	Jhmsg->Command = JH_FETCHKEY;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
if(Jhmsg->Data==-1) CloseOut();
 return(Jhmsg->Command);
}
int sigkey(void)
{
	Jhmsg->Command = JH_ExtHK;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);

if(Jhmsg->Data==-1) CloseOut();
     return(Jhmsg->Command);
}
char Fhotkey(void)
{
        Jhmsg->LineNum=0;
	Jhmsg->Command = JH_HK;
	strcpy(Jhmsg->String,"");
     PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
	
if(Jhmsg->Data==-1) CloseOut();
    return(*(Jhmsg->String));
}
int getkey(void)
{
        Jhmsg->LineNum=0;
	Jhmsg->Command = JH_CK;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
	if(Jhmsg->String[0]=='1') return(1); else return(0);
}

void Chain(char *str,int node,int opt)
{
  char cmd[200];
  if(opt==SHUTDOWN)
  {
    sprintf(cmd,"RUN >NIL: %s %d",str,node);
    Jhmsg->Command=CHAIN;
    PutMsg(port,(struct Message *)Jhmsg);
    (void)WaitPort(replymp);
    (void)GetMsg(replymp);
    ClosePort();
    Execute(cmd,NULL,NULL);
    
  }
  if(opt==CHAIN_WAIT)
  {
    sprintf(cmd,"%s %d",str,node);
    //Jhmsg->Command=CHAIN;
    //PutToPort((struct Message *)Jhmsg);
    //(void)WaitPort(replymp);
    //(void)GetMsg(replymp);
    //ClosePort();
    Execute(cmd,NULL,NULL);
    //Register(node);
    return;
  }
}

void prompt(char mstring[],char *ostring,int len)
{
        len +=1;
        Jhmsg->LineNum=0;
	strcpy(Jhmsg->String,mstring);
	Jhmsg->Data=len;
	Jhmsg->Command = JH_PM;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
	strcpy(ostring,Jhmsg->String);
if(Jhmsg->Data==-1) CloseOut();
}
void AcpCommand(char mstring[],int command,int node)
{
     int Line;     
     Line=Jhmsg->LineNum;
     Jhmsg->LineNum=node;
     Jhmsg->Data=command;
     Jhmsg->Command=ACP_COMMAND;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
     Jhmsg->LineNum=Line;
}
void lineinput(char mstring[],char *ostring,int len)
{
        len +=1;
        Jhmsg->LineNum=0;
	strcpy(Jhmsg->String,mstring);
	Jhmsg->Data=len;
	Jhmsg->Command = JH_LI;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
	strcpy(ostring,Jhmsg->String);
if(Jhmsg->Data==-1) CloseOut();
}
void showfile(char mstring[])
{
	strcpy(Jhmsg->String,mstring);
	Jhmsg->Command = JH_SF;
        Jhmsg->Data=0;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
}
void showgfile(char mstring[])
{
	strcpy(Jhmsg->String,mstring);
	Jhmsg->Command = JH_SG;
        Jhmsg->Data=0;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
}
void showfilensf(char mstring[])
{
	strcpy(Jhmsg->String,mstring);
	Jhmsg->Command = JH_SF_NSF;
        Jhmsg->Data=0;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
}
void showgfilensf(char mstring[])
{
	strcpy(Jhmsg->String,mstring);
	Jhmsg->Command = JH_SG_NSF;
	Jhmsg->Data=0;
        PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
}

void getuserstring(char *ostring,int nl)
{
        Jhmsg->Command = nl;
        Jhmsg->Data=READIT;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
   strcpy(ostring,Jhmsg->String);
}
void putuserstring(char *ostring,int nl)
{
        Jhmsg->Command = nl;
        Jhmsg->Data=WRITEIT;
        strcpy(Jhmsg->String,ostring);
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
 
}
void getspecdata(char *ostring,char *dest,int nl);
void getspecdata(char *ostring,char *dest,int nl)
{
        Jhmsg->Command = nl;
        Jhmsg->Data=WRITEIT;
        strcpy(Jhmsg->String,ostring);
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
     strcpy(dest,Jhmsg->String);
 
}
/*
struct MsgPort *CreatePort(UBYTE *name,LONG pri)
{
  int sigBit;
  struct MsgPort *mp;
  
  if((sigBit=AllocSignal(-1L))==-1)
    return(NULL);
  mp=(struct MsgPort *)
     AllocMem((ULONG)sizeof(struct MsgPort),(ULONG)MEMF_CLEAR|MEMF_PUBLIC);
  if(!mp)
  {
    FreeSignal(sigBit);
    return(NULL);
  }
  mp->mp_Node.ln_Name=name;
  mp->mp_Node.ln_Pri=pri;
  mp->mp_Node.ln_Type=NT_MSGPORT;
  mp->mp_Flags=PA_SIGNAL;
  mp->mp_SigBit=sigBit;
  mp->mp_SigTask=(struct Task *)FindTask(0L);
  if(name)
    AddPort(mp);
  else
    NewList(&(mp->mp_MsgList));
  return(mp);
}
*/
int getsignal(void)
{
  Jhmsg->Command = JH_SIGBIT;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
   return(Jhmsg->Data);
}
void FlagFile(char *string)
{
   strcpy(Jhmsg->String,string);
	Jhmsg->Command = JH_FLAGFILE;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
}
VOID CloseOut(void)
{
  ShutDown();
  end();
}
BOOL CheckToDisplay(char *s)
{
register int loop;
char FileName[200];
char temp[200];
getuserstring(FileName,DT_SECSTATUS);
loop=atoi(FileName);
strcpy(FileName,s);
	loop=(loop-(loop%5));
	for(; loop>2; loop-=5)
		{
		sprintf(temp,"%s%d.txt",FileName,loop);
          if(TLock(temp))
          {
            sprintf(temp,"%s%d",FileName,loop);
            showgfile(temp); return(1);
          }
          sprintf(temp,"%s%d.txt.gr",FileName,loop);
          if(TLock(temp))
          {
             sprintf(temp,"%s%d",FileName,loop);
             showgfile(temp); return(1);
          }
          sprintf(temp,"%s%d.GR1",FileName,loop);
          if(TLock(temp))
          {
             sprintf(temp,"%s%d",FileName,loop);
             showgfile(temp); return(1);
          }          
	}
     sprintf(temp,"%s.txt",FileName);
     if(TLock(temp))
     {
       showgfile(FileName); return(1);
     }
     sprintf(temp,"%s.txt.gr",FileName);
     if(TLock(temp))
     {
       showgfile(FileName); return(1);
     }
     sprintf(temp,"%s.GR1",FileName);
     if(TLock(temp))
     {
       showgfile(FileName); return(1);
     }
     return(0);
}

int TLock(char *str)
{
  long lock;
  if(lock=Lock(str,ACCESS_READ))
  {
    UnLock(lock); return(1);
  }
  return(0);
}
APTR GetSemaphore(void)
{
   Jhmsg->Command=MULTICOM;
   PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
     return(msg->Semi);
}
int AcsStat(int bits,int opt)
{
   switch(opt)
   {
     case ADDBIT:
          Jhmsg->Command=ADDBIT;
          Jhmsg->Data=bits;
          break;
     case REMBIT:
          Jhmsg->Command=REMBIT;
          Jhmsg->Data=bits;
          break;
     case QUERYBIT:
          Jhmsg->Command=QUERYBIT;
          Jhmsg->Data=bits;
          break;
     default: return(0);
   } 
   	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
     return(msg->Command);
}
STRPTR GetTheDate(long number)
{
  char Date[22];
  getsystime(number,Date,NULL);
  return(Date);
}
STRPTR GetTheTime(long number)
{
  char temp[30];
  getsystime(number,NULL,temp);
 return(temp);
}
void DateToString(ULONG number,char *s)
{
  char Date[22];
  getsystime(number,Date,NULL);
  strcpy(s,Date);
}
void TimeToString(ULONG number,char *s)
{
  char temp[30];
  getsystime(number,NULL,temp);
  strcpy(s,temp);
}
ULONG UnixTimeOffset = 252482400;

/**********************************************************
 *	ULONG getsystime(struct timeval *tv)
 *
 *      This function was rewritten using DateStamp() to
 * eliminate the opening and closing of the timer.device
 * that was occurring everytime this function was called.
 * An attempt to save some processing time.   -WMP-
 **********************************************************/
void getsystime(ULONG number,char *d,char *t)
{
  struct DateStamp ds;
   struct DateTime dt;
   if(number==0L)
   {
     DateStamp(&ds);
     dt.dat_Stamp=ds;
   }
   else
   {
      number -= UnixTimeOffset;
      dt.dat_Stamp.ds_Days=number/(60L*60L*24L);
                           number -= dt.dat_Stamp.ds_Days*(60L*60L*24L);
      dt.dat_Stamp.ds_Minute=number/60L; 
      dt.dat_Stamp.ds_Tick=0L;
   }
     dt.dat_Format=FORMAT_USA;
   dt.dat_StrDay=NULL;
   dt.dat_StrDate=d;
   dt.dat_StrTime=t;
   dt.dat_Flags=DTB_SUBST;
   DateToStr(&dt);
}

int Load_Account(int UserNum,APTR u,APTR uk)
{
	Jhmsg->Command = LOAD_ACCOUNT;
     Jhmsg->Data=UserNum;
     Jhmsg->Filler1=u;
     Jhmsg->Filler2=uk;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
     return(Jhmsg->Data);
}
LONG Choose_A_Name(APTR u,APTR uk,WORD option)
{
	Jhmsg->Command = BB_CHOOSEANAME;
     Jhmsg->Data=option;
     Jhmsg->Filler1=u;
     Jhmsg->Filler2=uk;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
     return((LONG)Jhmsg->Data);
}
int Search_Account(int UserNum,APTR uk)
{
	Jhmsg->Command = SEARCH_ACCOUNT;
     Jhmsg->Data=UserNum;
     Jhmsg->Filler1=uk;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
     return(Jhmsg->Data);
}
void Save_Account(int UserNum,APTR u,APTR uk)
{
	Jhmsg->Command = SAVE_ACCOUNT;
     Jhmsg->Data=UserNum;
     Jhmsg->Filler1=u;
     Jhmsg->Filler2=uk;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
}

void Save_ConfDB(int UserNum,int conf,APTR dat)
{
     Jhmsg->Command = SAVE_CONFDB;
     Jhmsg->Data=UserNum;
     Jhmsg->NodeID=conf;
     Jhmsg->Filler1=dat;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
}
void New_Account(APTR u,APTR uk)
{
     Jhmsg->Command = APPEND_ACCOUNT;
     Jhmsg->Filler1=u;
     Jhmsg->Filler2=uk;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
}
void Load_ConfDB(int UserNum,int conf,APTR dat)
{
     Jhmsg->Command = LOAD_CONFDB;
     Jhmsg->Data=UserNum;
     Jhmsg->NodeID=conf;
     Jhmsg->Filler1=dat;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
}


int Get_ConfName(APTR n,APTR l,int num)
{
     char *s;
     strcpy((char *)n,"");
     Jhmsg->Command = GET_CONFNUM;
     Jhmsg->Data=num;
     Jhmsg->Filler1=n;
     Jhmsg->Filler2=l;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
     s=(char *)n;
     if(*s=='\0') return(0);
     return(1);
}
int IsAccess(int acs)
{
     Jhmsg->Command = DT_QUERYBIT;
     Jhmsg->Data=acs;
	PutMsg(port,(struct Message *)Jhmsg);
	(void)WaitPort(replymp);
	(void)GetMsg(replymp);
     return(Jhmsg->Command);
}
void GetFiller1(APTR Filler,int Command)
{
     Jhmsg->Command=Command;
     Jhmsg->Data=0;
     Jhmsg->Filler1=Filler;
     PutMsg(port,(struct Message *)Jhmsg);
     WaitPort(replymp);
     GetMsg(replymp);
}
void PutFiller1(APTR Filler,int Command)
{
     Jhmsg->Command=Command;
     Jhmsg->Data=1;
     Jhmsg->Filler1=Filler;
     PutMsg(port,(struct Message *)Jhmsg);
     WaitPort(replymp);
     GetMsg(replymp);
}
