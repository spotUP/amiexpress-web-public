#include <exec/exec.h>
#include <dos/dos.h>
#include <libraries/dos.h>
#include <devices/timer.h>
#include <proto/intuition.h>
#include <stdio.h>
#include <stdlib.h>
#include "sc:ae/doorheader.h"
#include <proto/exec.h>
#include <proto/dos.h>
#include <string.h>
#include "amiconsasc_protos.h"
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

ULONG UnixTimeOffset = 252482400;

struct MsgPort *port;
struct MsgPort *replymp;
struct JHMessage *Jhmsg,*msg;
#define ANYKEY "press <RETURN> to continue"
char PortName[20];
VOID Register(int node)
{
  ULONG portsig;
  int n1,n2,n3;
  int found=0;
  Jhmsg=(struct JHMessage *)AllocMem(sizeof(struct JHMessage),MEMF_CLEAR|MEMF_PUBLIC);

 if(Jhmsg==0)
  {
     printf("Not enough Memory for message structure\n");
     exit(30);
  }
  replymp=CreatePort(0L,0L); //strcpy(PortName,DoorReply);
  

  if(replymp==0)
  {
    printf("Couldn't create reply port\n");
    FreeMem(Jhmsg,sizeof(struct JHMessage));
    exit(30);
  }
  Jhmsg->Msg.mn_Node.ln_Type=NT_MESSAGE;
  Jhmsg->Msg.mn_Length=sizeof(struct JHMessage);
  Jhmsg->Msg.mn_ReplyPort=replymp;
  strcpy(Jhmsg->String,"");
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

void sendMessage(char mstring[],int nl)
{
	Jhmsg->Data = nl;
	Jhmsg->Command = JH_SM;
	strcpy(Jhmsg->String,mstring);
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
VOID CloseOut(void)
{
  ShutDown();
  end();
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
