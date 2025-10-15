/*           			Amiexpress door Includes...........                    */
/*                               Byteandi/AFL                                  */

/* *********************** includes and doorstart **************************** */
#include <stdio.h>
#include <string.h>
#include <proto/all.h>
#include <dos.h>
#include <stdlib.h>
#include <proto/exec.h>
#include <exec/types.h>
#include <time.h>
#include <ctype.h>
#include <devices/timer.h>
#include <devices/serial.h>
#include <exec/memory.h>
struct JHMessage
{
  struct Message Msg;   /*<----- msg structure                 */
  char String[200];     /*<----- info buffer                   */
  int Data;             /*<----- Read/Write & result indicator */
  int Command;          /*<----- Command sent from door.       */
  int NodeID;           /*<----- reserved                      */
  int LineNum;          /*<----- reserved                      */
  unsigned long signal; /*<----- reserved                      */
  struct Process *task; /*<----- see BB_GETTASK below          */
} ;

struct MsgPort *AmiexPort,*DoorPort ;
struct JHMessage msg;

void Transfer( void );
void DoorStart(char node []);
void CloseStuff( void );
void change (char str [],int dir,int fct);
void inoutput(char str [],int Command);


void Transfer( void )
{
  PutMsg ((struct MsgPort *) AmiexPort,(struct Message *)&msg) ;
  WaitPort (DoorPort) ;
  GetMsg (DoorPort) ;
}

void DoorStart(char node [])
{
char Name [100] ;
  sprintf (Name,"AEDoorPort%s",node) ;
  AmiexPort = FindPort (Name) ;
  if (AmiexPort == NULL)
  {
    printf ("Cannot find Doorport\n") ;
    exit (0) ;
  }
  DoorPort = CreatePort ("",0L) ;
  if (DoorPort == NULL)
  {
    printf ("Cannot open Doorport\n") ;
    exit (0) ;
  }
  msg.Msg.mn_Node.ln_Type = NT_MESSAGE ;
  msg.Msg.mn_Length = sizeof (msg) ;
  msg.Msg.mn_ReplyPort = DoorPort ;
  strcpy (msg.String,"") ;
  msg.Data = 0 ;
  msg.Command = 1 ;
  Transfer () ;
}

void CloseStuff( void )
{
struct JHMessage *msg1 ;
  msg.Command = 2 ;
  Transfer () ;
  while(msg1 = (struct JHMessage *)GetMsg(DoorPort))
              ReplyMsg((struct Message *)&msg);
  DeletePort(DoorPort);
}


void change (char str [],int dir,int fct)				
	{
	 msg.Command = fct ;
	 msg.Data = dir ;
	 if (dir == 0)
		 {
		 strcpy (msg.String,str) ;
	  	 }
	 Transfer () ;
	 if (dir == 1)
	 	 {
	 	 strcpy (str,msg.String) ;
	  	 }
	}

void inoutput(char str [],int Command)
	{
	msg.Command=Command;
	strcpy(msg.String,str);
	Transfer();
	}

int JH_LI (char str [],int len)
	{
	  msg.Command = 0 ;
	  strcpy (msg.String,str) ;
	  msg.Data = len ;
	  Transfer () ;
	  strcpy (str,msg.String) ;
	  return (msg.Data) ;
	}
int JH_HK (char str [])
	{
	  msg.Command = 6 ;
	  strcpy (msg.String,str) ;
	  Transfer () ;
	  strcpy (str,msg.String) ;
	  return (msg.Data) ;
	}

