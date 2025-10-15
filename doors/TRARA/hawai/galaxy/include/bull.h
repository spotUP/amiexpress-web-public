/*----------------------------------------------------------------------*/
/*	Amiexpress Standart Includes By Galaxy/Tfa			*/
/*----------------------------------------------------------------------*/

/*--[ includes ]--------------------------------------------------------*/

#include <stdio.h>
#include <string.h>
#include <dos.h>
#include <stdlib.h>
#include <time.h>
#include <ctype.h>
#include <devices/timer.h>
#include <devices/serial.h>
#include <exec/memory.h>
#include <proto/all.h>

/*--[ structs ]---------------------------------------------------------*/

struct JHMessage
{
	struct Message Msg;
	char String[200];
	int Data,Command,NodeID,LineNum;
	unsigned long signal;
	struct Process *task;
};

struct MsgPort *AmiexPort,*DoorPort;
struct JHMessage msg;

/*--[ voids ]-----------------------------------------------------------*/

void Transfer(void);
void DoorStart(char node[]);
void CloseStuff(void);
void change(char str[],int dir,int fct);
void inoutput(char str[],int Command);

/*--[ transfer ]--------------------------------------------------------*/

void Transfer(void)
{
	PutMsg((struct MsgPort *) AmiexPort,(struct Message *)&msg);
	WaitPort(DoorPort);
	GetMsg(DoorPort);
}

/*--[ doorstart ]-------------------------------------------------------*/

void DoorStart(char node[])
{
	char Name[100],Name2[100];
	sprintf(Name,"AEDoorPort%s",node);
	AmiexPort=FindPort(Name);

	if(AmiexPort==NULL)
	{
		printf("Can't Find AeDoorPort\n");
		exit(0);
	}

	sprintf(Name2,"DoorReplyPort%s",node);
	DoorPort=CreatePort(Name2,0L);

	if(DoorPort==NULL)
	{
		printf("Can't Open DoorReplyPort\n");
		exit(0);
	}

	msg.Msg.mn_Node.ln_Type=NT_MESSAGE;
	msg.Msg.mn_Length=sizeof(msg);
	msg.Msg.mn_ReplyPort=DoorPort;
	strcpy(msg.String,"");
	msg.Data=0;
	msg.Command=1;
	Transfer();
}

/*--[ closestuff ]------------------------------------------------------*/

void CloseStuff(void)
{
	struct JHMessage *msg1;
	msg.Command=2;
	Transfer();

	while(msg1=(struct JHMessage *)GetMsg(DoorPort))
		ReplyMsg((struct Message *)&msg);

	DeletePort(DoorPort);
}

/*--[ change ]----------------------------------------------------------*/

void change(char str[],int dir,int fct)
{
	msg.Command=fct;
	msg.Data=dir;

	if(dir==0)
		strcpy(msg.String,str);

	Transfer();

	if(dir==1)
		strcpy(str,msg.String);

}

/*--[ inoutput ]--------------------------------------------------------*/

void inoutput(char str[],int Command)
{
	msg.Command=Command;
	strcpy(msg.String,str);
	Transfer();
}

/*--[ jh_li ]-----------------------------------------------------------*/

int JH_LI(char str[],int len)
{
	msg.Command=0;
	strcpy(msg.String,str);
	msg.Data=len;
	Transfer();
	strcpy(str,msg.String);
	return(msg.Data);
}

/*--[ jh_hk ]-----------------------------------------------------------*/

int JH_HK(char str[])
{
	msg.Command=6;
	strcpy(msg.String,str);
	Transfer();
	strcpy(str,msg.String);
	return(msg.Data);
}
