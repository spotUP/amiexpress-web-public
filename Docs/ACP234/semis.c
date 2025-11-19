#include <exec/exec.h>
#include <clib/exec_protos.h>
#include <clib/dos_protos.h>
#include <clib/alib_protos.h>
#include "semis.h"
void ShutDownSemis(void);
#define CHAT_ENTER 5
#define CHAT_EXIT  4
#define CHAT_IDLE  3
#define CHAT_TEXT  2
#define CHAT_NONE  1
#define CHAT_NTXT  6

struct MultiPort *SemiNodes;
struct SinglePort *SingleNode;
char MultiName[] = "AEMulti";
char SingleName[] = "AEStat ";
void CreateSemaphores(void);
void InitSemaSemiNodes(struct MultiPort *s);
void CreateSemaphores(void)
{
  Forbid();
  if(!(SemiNodes=(struct MultiPort *)FindSemaphore(MultiName)))
  {
       
       SemiNodes=(struct MultiPort *)AllocMem(sizeof(struct MultiPort),MEMF_PUBLIC|MEMF_CLEAR);
       strcpy(SemiNodes->SemiName,MultiName);
       SemiNodes->semi.ss_Link.ln_Pri=0;
       SemiNodes->semi.ss_Link.ln_Name=SemiNodes->SemiName;
       NewList((struct List *)&SemiNodes->sl_List);
        InitSemaSemiNodes(SemiNodes);
       InitSemaphore((struct SignalSemaphore *)SemiNodes);
       //AddSemaphore((struct SignalSemaphore *)SemiNodes);
  }
  else
  {
     ObtainSemaphore((struct SignalSemaphore *)SemiNodes);
     InitSemaSemiNodes(SemiNodes);
     ReleaseSemaphore((struct SignalSemaphore *)SemiNodes);
  }
  Permit();
}

void InitSemaSemiNodes(struct MultiPort *s)
{
  register int i=0;
  register int j;
  while(i<9)
  {
     strcpy(s->MyNode[i].Handle,"");
     for(j=0;j<9;j++)
     {
       s->MyNode[i].Stats[j].info='\0';
       s->MyNode[i].Stats[j].Status=CHAT_NONE;
     }
     
     s->MyNode[i].t=NULL;
     s->MyNode[i].tasksignal=NULL;
     s->MyNode[i].StartTime=NULL;
     s->MyNode[i].Private=FALSE;
     s->MyNode[i].Channel=0;
     s->MyNode[i].ChatColor=i+1;
     SingleName[6]='0'+i;
      if(!(SingleNode=(struct SinglePort *)FindSemaphore(SingleName)))
      {
       
       SingleNode=(struct SinglePort *)AllocMem(sizeof(struct SinglePort),MEMF_PUBLIC|MEMF_CLEAR);
       strcpy(SingleNode->SemiName,SingleName);
       SingleNode->semi.ss_Link.ln_Pri=0;
       SingleNode->semi.ss_Link.ln_Name=SingleNode->SemiName;
       SingleNode->MultiCom=(APTR)s;
       strcpy(SingleNode->Handle,"");
       strcpy(SingleNode->Location,"");
       strcpy(SingleNode->Misc1,"");
       strcpy(SingleNode->Misc2,"");
       SingleNode->Status=-1;
       NewList((struct List *)&SingleNode->sl_List);
       InitSemaphore((struct SignalSemaphore *)SingleNode);
       //AddSemaphore((struct SignalSemaphore *)SingleNode);
 
       }
       else
       {
          ObtainSemaphore((struct SignalSemaphore *)SingleNode);
                SingleNode->MultiCom=(APTR)s;
                strcpy(SingleNode->Handle,"");
                strcpy(SingleNode->Location,"");
                strcpy(SingleNode->Misc1,"");
                strcpy(SingleNode->Misc2,"");
                SingleNode->Status=-1;
          ReleaseSemaphore((struct SignalSemaphore *)SingleNode);
       }
     s->MyNode[i].s=SingleNode;
     if(s->MyNode[i].ChatColor>7)
     {
       s->MyNode[i].ChatColor -=6;
     }
     i++;
  }
}

void ShutDownSemis(void)
{
   register int i;
   struct SinglePort *p;
   Forbid();
   //RemSemaphore((struct SignalSemaphore *)SemiNodes);
   ObtainSemaphore((struct SignalSemaphore *)SemiNodes);
   for(i=0;i<9;i++)
   {
      p=(struct SinglePort *)SemiNodes->MyNode[i].s;
      //RemSemaphore((struct SignalSemaphore *)p);
      ObtainSemaphore((struct SignalSemaphore *)p);
      ReleaseSemaphore((struct SignalSemaphore *)p);
      FreeMem((struct SinglePort *)p,sizeof(struct SinglePort));
   }
   ReleaseSemaphore((struct SignalSemaphore *)SemiNodes);
   FreeMem((struct MultiPort *)SemiNodes,sizeof(struct MultiPort));
   Permit();
}