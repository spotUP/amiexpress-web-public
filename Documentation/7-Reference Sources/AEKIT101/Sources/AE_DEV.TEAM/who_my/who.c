#include <exec/exec.h>
#include <exec/semaphores.h>
#include <proto/exec.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <proto/exec.h>

#include "sc:ae/CmodGlue/doorheader.h"
#include "sc:ae/CmodGlue/glue.h"

#define sm sendmessage

void LastCommand(void);
void end(void);

struct SinglePort
{
  struct SignalSemaphore semi;
  struct MinList sl_List;
  APTR *s;
  UBYTE SemiName[20];
  int Status;
  char Handle[31];
  char Location[31];
  char Misc1[100];
  char Misc2[100];
} ;
struct NodeStat
{
  char Status;
  char info;
};
struct NodeInfo
{
  char Handle[31];
  ULONG StartTime;
  int ChatColor;
  int Channel;
  int Private;
  struct NodeStat Stats[10];
  APTR *t;
  APTR *s;
  unsigned long tasksignal;
};
APTR Singles[10];
struct MultiPort
{
  struct SignalSemaphore semi;
  struct MinList sl_List;
  struct NodeInfo MyNode[10];
  UBYTE SemiName[20];
} *Nodes;

char SingleName[] = "AEStat ";

void main(int argc,char *argv[]) 
{
char FileName[100], mes[100],mes2[100],mes1[100];
char Name[100],Location[100];
struct SinglePort *s;
int status;
int i=0;

  if(argc!=2)
  {
     printf("InfoNode v3.0ß, written by the /X Developement Team\n");
     printf("This is a XIM for AmiExpress 2.30+\n");
     printf("\n");
     exit(0);
   }
   Register(argv[1][0]-'0');
 getuserstring(mes,BB_TASKPRI);
  SetTaskPri(FindTask(0),atol(mes));
 Nodes=(struct MultiPort *)GetSemaphore();
    ObtainSemaphore((struct SignalSemaphore *)Nodes);
  for(i=0;i<9;i++) Singles[i]=Nodes->MyNode[i].s;
    ReleaseSemaphore((struct SignalSemaphore *)Nodes);
 sm("",1);
 sm("",1);
 sm("[32m.---+----------------------+---------------------------+----------------------.[0m",1);

  sm("[32m|[33mNd#[32m|[36m Name/Handle          [32m| [36mLocation         ",0);
  sm("[32m         |[36m Action               [32m|[0m",1);
  sm("[32m)---+----------------------+---------------------------+----------------------([0m",1);
  i=0;
  while(i<9)
  {
   ObtainSemaphore((struct SignalSemaphore *)Singles[i]);
   s=(struct SinglePort *)Singles[i];
  status=s->Status;
  strcpy(Name,s->Handle);
  strcpy(Location,s->Location);
  strcpy(FileName,s->Misc1);    /*DL: POE-TEX6.DMS  */
//  strcpy(FileName,s->Misc2);  /*BEGINNING DL      */
  ReleaseSemaphore((struct SignalSemaphore *)Singles[i]);
  switch(status)
  {
     case 0:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","IDLE"); break;
     case 1:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);
              if(FileName[0]!='\0')
               sprintf(mes1," DL: %-16.16s [32m|[0m",FileName);
              else
              sprintf(mes1," %-20.20s [32m|[0m","BEGINNING DL"); break;
     case 2:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);
              if(FileName[0]!='\0')
               sprintf(mes1," UL: %-16.16s [32m|[0m",FileName);
              else sprintf(mes1," %-20.20s [32m|[0m","BEGINNING UL"); break;
     case 3:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);
     if(i==argv[1][0]-'0')
     sprintf(mes1," %-20.20s [32m|[0m","InfoNode v2.3a"); else
    sprintf(mes1," %-20.20s [32m|[0m","MODULE"); break;
     case 4:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","READING MAIL"); break;
     case 5:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","REVIEWING STATS"); break;
     case 6:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","ACCOUNT EDITING"); break;
     case 7:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","ZOOMING"); break;
     case 8:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","VIEWING DIRS"); break;
     case 9:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","READING BULLS"); break;
    case 10:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","VIEWING FILES"); break;
    case 11:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m","","");sprintf(mes1," %-20.20s [32m|[0m","ACCOUNT SEQUENCE"); break;
    case 12:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","LOGGING OFF"); break;
    case 13:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","SYSOPING"); break;
    case 14:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","USING SHELL"); break;
    case 15:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","EDITING");break;
    case 16:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","JOINING CONF");break;
    case 17:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","CHATTING");break;
    case 18:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m","","");sprintf(mes1," %-20.20s [32m|[0m","NODE INACTIVE.");break;
    case 19:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","REQUESTING CHAT");break;
    case 20:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","CONNECTING");break;
    case 21:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","LOGGING ON");break;
    case 22:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m","","");sprintf(mes1," %-20.20s [32m|[0m","AWAITING CONNECT");break;
    case 23:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","SCANNING MAIL");break;
    case 24:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m","","");sprintf(mes1," %-20.20s [32m|[0m","SHUTDOWN");break;
    case 25:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m",Name,Location);sprintf(mes1," %-20.20s [32m|[0m","MULTICHAT");break;
    case 26:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m","","");sprintf(mes1," %-20.20s [32m|[0m","SUSPENDED");break;
    case 27:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m","","");sprintf(mes1," %-20.20s [32m|[0m","RESERVED");break;
    case -1:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m","","");sprintf(mes1," %-20.20s [32m|[0m","UNAVAILABLE");break;
    default:  sprintf(mes, "[32m| [0m%-20.20s [32m|[0m %-25.25s [32m|[0m","","");sprintf(mes1," %-20.20s [32m|[0m","");break;
  
  }
  sprintf(mes2,"[32m| [0m%d ",i);
  if(status!=27 && status>=0 && status!=24 && status!=18)
  {
    sm(mes2,0); sm(mes,0); sm(mes1,1);
  sm("[32m|---+----------------------+---------------------------+----------------------|[0m",1);

  }
  i++;
  }
  sm("[32m`-----------------------------------------------------------------------------'[0m",1);

  ShutDown();
  end();
}

void LastCommand(void)
{
  sm("",1);
}
void end(void)
{
  exit(0);
}




/***************************************************************************/
/***************************************************************************/
/******************* MY PART ***********************************************/
/***************************************************************************/
/***************************************************************************/

//struct JHMessage
//{
// struct Message Msg;
//  char String[200];
//  int Data;
//  int Command;
//  int NodeID;
//  int LineNum;
//  unsigned long signal;
//  struct Process *task;
//  APTR *Semi;
//  APTR Filler1;
//  APTR Filler2;
//};
/*        struct JHMessage *Jhmsg;*/

//struct ACPMessage
//{
//  struct Message Msg;
//  char User[50];
//  char Location[50];
//  char Action[50];
//  char Baud[10];
//  int Data;
//  int Command;
//  int Node;
//  int LineNum;
//  struct Commands *Cmds;
//  struct StartOption *Sopt;
//} *msg,*cpymsg;

//struct MsgPort *mp;

//msg=(struct ACPMessage *)AllocMem(sizeof(struct ACPMessage),MEMF_PUBLIC|MEMF_CLEAR);
//FreeMem(msg,sizeof(struct ACPMessage));


//*********************************************************************
// CallNode - This function opens a port to a nodes AEServer and tries
// to send a msg to the node and waits on a reply
//*********************************************************************
//void CallNode(int node,int Code)
//{
//   char Response[100];
//   sprintf(Response,"AmiExpress_Node.%d",node);
//   if(!FindPort(Response))
//   {
//     if(StartNode[node][0]!='\0')
//     {
//       if(StartProcess(&StartNode[node][0],BBSStack)) { ActiveNodes +=1; Down[node]=FALSE; }
//       return;
//     }
//   }
//   if(Register(node))
//   {
//      getuserstring(Response,Code);
//   }
//}      

/*
void GetCmds(int i)
{
  int j;
  extern struct MultiPort *SemiNodes;
  Cmds[i]=(struct Commands *)AllocMem(sizeof(struct Commands),MEMF_PUBLIC|MEMF_CLEAR);
  Sopt[i]=(struct StartOption *)AllocMem(sizeof(struct StartOption),MEMF_PUBLIC|MEMF_CLEAR);
  Sopt[i]->LeftEdge=0;
  Sopt[i]->TopEdge=0;
  Sopt[i]->RadBoogie=255;
  Sopt[i]->A2232=FALSE;
for(j=0;j<19;j++)
  {
    Sopt[i]->Toggles[j]=FALSE; }
    Sopt[i]->Toggles[13]=1;
    Sopt[i]->Toggles[14]=1;
  if(DoMultiCom)
  {
    ObtainSemaphore((struct SignalSemaphore *)SemiNodes);
  Sopt[i]->MasterSemi=SemiNodes;
  Sopt[i]->SingleSemi=SemiNodes->MyNode[i].s;
  ReleaseSemaphore((struct SignalSemaphore *)SemiNodes); Sopt[i]->Toggles[10]=TRUE;
  } else { Sopt[i]->MasterSemi=NULL; Sopt[i]->SingleSemi=NULL; }
  strcpy(Sopt[i]->UserData,"");
  strcpy(Sopt[i]->UserKey,"");
  strcpy(Sopt[i]->OffHook,"");
  strcpy(Sopt[i]->PubScreen,"");
}
*/


//case JH_UPDATE:
//     UpdateNode(msg->User,msg->Location,msg->Action,msg->Baud,msg->Node);
//     if(ShowAbout) { ShowNodes(); ShowAbout=0; }
//     break;
//case JH_DOWNLOAD:
//     RegLastDownloads(msg->User,msg->Node);
//     sprintf(temp,"DL: %s",msg->User); sprintf(temp1,"%d",SV_NEWMSG);
//     UpdateNode(temp,msg->Location,temp1,msg->Baud,msg->Node);
//     if(ShowAbout) { ShowNodes(); ShowAbout=0;}
//     break;
//case JH_UPLOAD:
//     RegLastUploads(msg->User,msg->Node);
//     sprintf(temp,"UL: %s",msg->User); sprintf(temp1,"%d",SV_NEWMSG);
//     UpdateNode(temp,msg->Location,temp1,msg->Baud,msg->Node);
//     if(ShowAbout) { ShowNodes(); ShowAbout=0;}
//     break;

