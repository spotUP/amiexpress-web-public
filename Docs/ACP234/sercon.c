#include <exec/types.h>
#include <exec/exec.h>
#include <exec/memory.h>
#include <exec/ports.h>
#include <libraries/dos.h>
#include <devices/timer.h>
#include <intuition/intuitionbase.h>
#include "sc:ae/CmodGlue/doorheader.h"
#include <stdlib.h>
#include <string.h>
#include <clib/exec_protos.h>
extern void getuserstring();
int Register(int node);
VOID ShutDown(VOID);
BOOL PutToPort(struct Message *);
struct MsgPort *Nport;
struct MsgPort *replymp;

extern long MasterSig;
extern long signals;
char NPortName[80];
char MasterPort[80];
long sersig;
int Register(int node)
{
sprintf(MasterPort,"AEServer.%d",node);
 Nport=(struct MsgPort *)FindPort(MasterPort);
  if(!Nport)
  {
    ShutDown(); return(0);
  }
  return(1);
}

VOID ShutDown(VOID)
{
//  DeletePort((struct MsgPort *)replymp);
//  FreeMem(Jhmsg,sizeof(struct JHMessage));
}



BOOL PutToPort(struct Message *message)
{
  PutMsg(Nport,message);
  return((BOOL)1);
}

void getuserstring(char *ostring,int nl)
{
  struct JHMessage *Jhmsg;
  Jhmsg=(struct JHMessage *)AllocMem(sizeof(struct JHMessage),MEMF_PUBLIC);
  Jhmsg->Msg.mn_Node.ln_Type=NT_FREEMSG;
  Jhmsg->Msg.mn_Length=sizeof(struct JHMessage);
  Jhmsg->Msg.mn_ReplyPort=0L;
 
        Jhmsg->Command = nl;
        Jhmsg->Data=READIT;
     
	PutToPort((struct Message *)Jhmsg);

}

