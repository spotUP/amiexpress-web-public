/************[  FrontEnd 2.0 - (06-18-93) - by EMPiRE/MYSTiC  ]**************/
/*                                                                          */
/*          This Source may be used to LEARN how /X-Doors operate           */
/*          But it may never be distributed outside this archive            */
/*             without the Permission of the Writer! (EMPiRE)               */
/*                                                                          */
/*             LAST OUTPOST  +31-72-157682  &  +31-72-201182                */
/*                                                                          */
/**********************[ Use it but DON'T Abuse it! ]************************/


#include "sc:AE.Includes/doorheader.h"
#include "sc:AE.Includes/glue.h"

#include <string.h>
#include <proto/exec.h>
#include <dos/dos.h>
#include <ctype.h>

#define Ver "$VER: FrontEnd 2.0 (06-18-93) - ©1993 EMPiRE/MYSTiC"

#define sm sendmessage
#define pm prompt

/***[ SubRoutines ]**********************************************************/

void start(void);
void GetAEinfo(void);
void end(void);
void DExit(void);
void LastCommand(void);

/***[ Global Variables ]*****************************************************/

int  i, j, NodeNr, Node, StartNode, MaxNode, Baud, TrapDoorNode;

char NodesUsed[200];

FILE *File;

/***[ Main ]*****************************************************************/

void main (int argc,char *argv[]) 
{
  if(argc!=2)
  {
    printf("\n %s is a XIM-DOOR for AmiExpress 3.x\n\n",Ver);
    exit(0);
  }
  Node=atoi(argv[1]);
  Register(argv[1][0]-'0');
  start();
  DExit();
}

/****************************************************************************/

void start(void)
{
  char buffer[200], buffer2[200];
  
  StartNode=1;                   /* Skip Node0 (Private/Local Node) */
  MaxNode=32;                    /* Just for Speed */
  TrapDoorNode=2;

  GetAEinfo();

  if (Baud<9600) DExit();        /* Only show it to users with 9600+ Modems */

  sm("[H[2J",1);
  sm("[36m    _______    __________________    ________",1);
  sm(" /\\/       \\/\\/                  \\/\\/        \\/\\",1);
  sm("<    [35mAMiGA        [0mLAST OUTPOST       [35mCONSOLES   [36m>",1);
  sm(" \\/\\_______/\\/\\__________________/\\/\\________/\\/",1);
  sm("",1);
  sm("",1);

  for(NodeNr=StartNode; NodeNr<=MaxNode; NodeNr++)
  {
    if (NodesUsed[NodeNr]=='X')
    {
      sprintf(buffer,"ENV:STATS@%d",NodeNr);
      File=fopen(buffer,"r");
       if (File==NULL) DExit();
       fgets(buffer,80,File);
       j=strlen(buffer);
       strmid(buffer,buffer2,j-1,2);
       j=atoi(buffer2);
      fclose(File);
      switch(j)
      {
        case  0 : strcpy(buffer,"Idle"); break;
        case  1 : strcpy(buffer,"Downloading"); break;
        case  2 : strcpy(buffer,"Uploading"); break;
        case  3 : strcpy(buffer,"In a Door"); break;
        case  4 : strcpy(buffer,"Read/Write Mail"); break;
        case  5 : strcpy(buffer,"Reviewing Stats"); break;
        case  6 : strcpy(buffer,"Account Editing"); break;
        case  7 : strcpy(buffer,"Zooming Mail"); break;
        case  8 : strcpy(buffer,"View Dir Files"); break;
        case  9 : strcpy(buffer,"Reading Bulletins"); break;
        case 10 : strcpy(buffer,"Viewing a File"); break;
        case 11 : strcpy(buffer,"Logging On"); break;
        case 12 : strcpy(buffer,"Logging Off"); break;
        case 13 : strcpy(buffer,"Sysop Commands"); break;
        case 14 : strcpy(buffer,"Dropped to Shell"); break;
        case 15 : strcpy(buffer,"Using Emacs"); break;
        case 16 : strcpy(buffer,"Joining a Conf."); break;
        case 17 : strcpy(buffer,"Chatting"); break;
        case 18 : strcpy(buffer,"Resetting Node"); break;
        case 19 : strcpy(buffer,"Paging Sysop"); break;
        case 20 : strcpy(buffer,"Connecting"); break;
        case 21 : strcpy(buffer,"Logging On"); break;
        case 22 : strcpy(buffer,"Awaiting Logon"); break;
        case 23 : strcpy(buffer,"Scanning Mail"); break;
        case 24 : if (NodeNr!=TrapDoorNode) strcpy(buffer,"Node Inactive");
                  else strcpy(buffer,"Awaiting Logon [TRAPDOOR]");
                  break;
        case 25 : strcpy(buffer,"In MultiNode Chat"); break;
        case 26 : strcpy(buffer,"BBS Suspended"); break;
        case 27 : strcpy(buffer,"Reserved for User"); break;
        case 28 : strcpy(buffer,"Entered AEShell"); break;

        case 98 : strcpy(buffer,"In a Door"); break;
        default : strcpy(buffer,"Carrier Lost"); break;
      }
      if (NodeNr==Node)
      {
         sprintf(buffer2,"[0m       NODE %d:   Receiving Your Call",NodeNr);
         sm(buffer2,1);
      }
      else
      {
         sprintf(buffer2,"[0m       NODE %d:   %s",NodeNr,buffer);
         sm(buffer2,1);
      }
    }
  }

  sm("",1);
  sm("[36m      ____________          _______________",1);
  sm(" /\\/\\/            \\/\\/\\/\\/\\/               \\/\\/\\",1);
  sm("<        [0mMYSTiC               CONSOLE WHQ       [36m>",1);
  sm(" \\/\\/\\____________/\\/\\/\\/\\/\\_______________/\\/\\/",1);
  sm("",1);
  sm("[0m",1);

}
/****************************************************************************/

void GetAEinfo(void)
{
  char buffer[200];              /* Local variable */

  getuserstring(NodesUsed,ACTIVE_NODES);
  getuserstring(buffer,NODE_BAUD);
  Baud=atoi(buffer);
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

void LastCommand (void)
{
  sm("",1);
}

