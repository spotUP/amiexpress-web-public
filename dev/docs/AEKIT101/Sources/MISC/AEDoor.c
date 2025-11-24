/*
 *   XIM Template for AmiExpress (c) 1993 by Gord Dimitrieff (aka Garindan).
 *   $VER: 1.0 (May 1993)
 *
 *   Adapted from JH_Message/DoorDocs by Joseph Hodge, author of AmiExpress.
 *
 *   -------------------------------------------------------------------------
 *   This file may be freely distributed as long as it remains unmodified.
 *   -------------------------------------------------------------------------
 *
 *   E-Mail Contact: FidoNet#1:250/728.0 (My own system)
 *               or: AmiXNet#416002 (*Not* my own system)
 *               or: gordon.dimitrieff@canrem.com (usenet address)
 *
 *   Postal Contact: Gord Dimitrieff
 *                   120 Dinnick Cres.
 *                   Toronto, Ontario
 *                   M4N 1L8   CANADA
 *
 *   PLEASE contact me if you find any bugs in the logic of this code, or
 *   whatever, so that I may fix the problem for myself.  Please send any
 *   modified versions of this that you think I should know about, etc..
 *
 *   -------------------------------------------------------------------------
 *   DISCLAIMER
 *   -------------------------------------------------------------------------
 *   I in no way, shape or form take any responsibilty for the functionality
 *   of the information presented in this file.  I do not run an AmiExpress
 *   BBS, and therefore can not vouch for its reliablity.  I have done my best
 *   to make it work, but it may not in some cases.  If there are any problems
 *   with these routines, you can ask me for help, but it may be a better idea
 *   to go to somebody who knows more about the whole system than me.
 *   Basically, the only reason I did this was to help me adapt my door program
 *   for use with AmiExpress.  (Unfortunatly, AmiExpress does not support
 *   standard i/o handles through fifo: or anything, so I had to do this.
 *   It's really too bad that this lame way of door support still exists...
 *   Supporting a callback structure would be a much better way..)
 *
 *   -------------------------------------------------------------------------
 *   AN EXPLAINATION...
 *   -------------------------------------------------------------------------
 *   This file was created because of the apparent lack of information
 *   and source code for programming external modules for AmiExpress.
 *
 *   What I have attempted to do here is create a set of 'standard'
 *   routines that can easily be added to existing source, or be used
 *   to create an original program.  These routines have been designed
 *   for easy expansion, so you may add more XIM functions to it, as
 *   well as for easy of use.  These functions will monitor the state of
 *   the XIM port for you, and will call a standard shut-down function
 *   if the user drops carrier, runs out of time, etc.  The code will also
 *   exit safely if it receives a CTRL-C signal.
 *
 *   NB: This file has been designed with OS1.3 compatability in mind.
 *       It makes use of the CreatePort()/DeletePort() functions in amiga.lib,
 *       instead of the new CreateMsgPort()/DeleteMsgPort() in exec..you may
 *       want to change this for your own purposes.
 *
 *
 *   Please look at the main() function in this file to see how exactly the
 *   door protocol should be started up...
 *
 *   -------------------------------------------------------------------------
 *   MODULE DESCRIPTIONS
 *   -------------------------------------------------------------------------
 *   CheckMessage() - Used for sending/receiving messages
 *   PortStart()    - Start up initial door-protocol with AmiExpress
 *                    (allocates memory, creates reply port, etc)
 *                    This returns 0 if everything opens okay, non-zero if not.
 *                    the return code can be used to figure out exactly what
 *                    went wrong, too.
 *   TakeOffEh()    - Shut down door-port and exit (used by ShutDown() )
 *   ShutDown()     - This is automatically called by CheckMessage if anything
 *                    goes wrong.  Insert your save routines here!  This will
 *                    just call TakeOffEh() after calling your save code.
 *   -------------------------------------------------------------------------
 *   GetString()    - Example function for using the input command 
 *   PutString()    - Example function for using the output command
 *   -------------------------------------------------------------------------
 *
 */

#include <exec/types.h>
#include <exec/ports.h>
#include <exec/memory.h>
#include <dos/dos.h>
#include <clib/exec_protos.h>
#include <clib/dos_protos.h>
#include <clib/alib_protos.h>
#include <stdio.h>

#ifdef LATTICE
int CXBRK(void) {return(0);} /* Disable Lattice CTRL-C handling */
int chkabort(void) {return(0);}
#endif

/* Function prototypes: */
int CheckMessage(void);
int PortStart(void);
void TakeOffEh(int code);
void ShutDown(void);

void GetString(char text[], int len);
void PutString(char text[], int lf);

struct XIM   /* This has been taken directly from JH_Message */
{            /* structure in the doordocs file.  */

  struct Message Msg;	/* msg structure */
  char String[200];	/* info buffer */
  int Data;		/* Read/Write & result indicator */
  int Command;		/* Command sent from door. */
  int NodeID;		/* reserved */
  int LineNum;		/* reserved */
  unsigned long signal;	/* reserved */
  struct Process *task;	/* see BB_GETTASK in doordocs */
  APTR Semi;		/* See MULTICOM in doordocs */
};

struct MsgPort *DoorControlPort, *DoorReplyPort;
struct XIM *XIM_Msg, *reply;
ULONG usersig, portsig, signals;
STRPTR doorport[30]; /* Portname for AEDoorPort(n) */
int EXIT_FLAG=0; /* This is the global shutdown flag */
char instring[256];

void main(int argc, char *argv[])
{
int line_num;

	if(argc<2) /* AmiExpress will supply line_num on command line */
	{
		printf("Sorry, %s must be called from AmiExpress.\n",argv[0]);
		exit(0);
	}

	line_num=atoi(argv[1]);

	/* Don't know what Jon Radoff's problem was.. This works fine.. */
	sprintf((STRPTR)doorport,"AEDoorPort%d",line_num);

	if(PortStart()!=0) TakeOffEh(40); /* You must use this before you start! */

	/* ..Place your own code in here.. */
	PutString("\fTada!",1);

	ShutDown(); /* NEVER quit with exit() as it will cause AmiExpress
                       to wait around forever on you. */
}

/**********************************************************************/
/* This function does all of the message passing, and signal checking */
/**********************************************************************/
int CheckMessage(void)
{
int ret=0;

	if(DoorControlPort)
	{
		Forbid();
		PutMsg(DoorControlPort, (struct Message *)XIM_Msg);
		Permit();

		signals = Wait(usersig|portsig);
		if(signals & portsig)
		{
			if(reply = (struct XIM_Msg *) GetMsg(DoorReplyPort))
			{
				strcpy(instring,XIM_Msg->String);
				if(XIM_Msg->Data == -1) EXIT_FLAG=1;
				ret=XIM_Msg->Data;
			}
		}
		if(signals & usersig) EXIT_FLAG=1; /* CTRL-C was received */
	}
	else
	{
		printf("Error! Can no longer locate doorport!!\n");
		EXIT_FLAG=1;
	}
	if(EXIT_FLAG) ShutDown();
	return(ret);
}

/*****************************************************************************/

int PortStart(void)
{
int error=0;

	if(DoorReplyPort = CreatePort(0,0))
	{
		portsig = 1<<DoorReplyPort->mp_SigBit; /* setup signal bits */
		usersig = SIGBREAKF_CTRL_C;

		if(XIM_Msg = (struct XIM *) AllocMem(sizeof(struct XIM), MEMF_PUBLIC |MEMF_CLEAR))
		{
			/* Setup stuff for exec.. */
			XIM_Msg->Msg.mn_Node.ln_Type = NT_MESSAGE;
			XIM_Msg->Msg.mn_Length = sizeof(struct XIM);
			XIM_Msg->Msg.mn_ReplyPort = DoorReplyPort;

			XIM_Msg->Command = 1; /* Register Door with AmiExpress */

			Forbid();
			DoorControlPort = FindPort(doorport);
			Permit();

			if(DoorControlPort==NULL)
			{
				printf("Can't find doorport \"%s\"\n",doorport);
				error=3;
			}
			else CheckMessage();
		}
		else
		{
			printf("Can't allocate memory for XIM Message Structure!\n");
			error=2;
		}
	}
	else
	{
		printf("Can't setup reply port!\n");
		error=1;
	}

return(error);
}

void TakeOffEh(int code) /* Notify AmiExpress of shutdown, and then exit safely */
{
	XIM_Msg->Command=2;
	if(DoorControlPort) CheckMessage();

	if(XIM_Msg) FreeMem(XIM_Msg, sizeof(struct XIM));
	if(DoorReplyPort) DeletePort(DoorReplyPort);
	exit(code);
}

/*****************************************************************************\
 This is the start of the general routines that you will probably want to use.
 Only two other functions are provided in addition to the ShutDown() funciton,
 for the purpose of examples:

 To use the other XIM commands available, look up the Msg->Command/Data fields
 from the doordocs file, set them up for the XIM_Msg struct, and then
 CheckMessage() it.  The contents of XIM_Msg->String will be copied into the
 global instring[] for you when the command returns, and CheckMessage() will
 return the contents of XIM_Msg->Data.  (Note that 'XIM_Msg' is simply called
 'Msg' in the doordocs file.

\*****************************************************************************/

void ShutDown(void)
{
	/* This routine will be call automatically by CheckMessage if
           AmiExpress says to shut down, or if it receives a CTRL-C signal.
           This allows you to save any data before shutdown.

           IF YOU HAVE ANYTHING TO SAVE, DO IT HERE!!  THIS NEVER RETURNS!
	*/

	TakeOffEh(0);
}

void GetString(char text[], int len)
{
	XIM_Msg->Command=0;
	XIM_Msg->Data=len;
	strcpy(XIM_Msg->String,text);
	CheckMessage(); /* the returned string will be found in instring[] */
}

void PutString(char text[], int lf)
{
	XIM_Msg->Command=4;
	XIM_Msg->Data=lf;
	strcpy(XIM_Msg->String,text);
	CheckMessage();
}

