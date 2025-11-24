
/***************[  Page 1.0 - (02-27-93) - by EMPiRE/MYSTiC  ]***************/
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
#include <time.h>

#define Ver "$VER: Page 1.0 (02-72-93) - ©1993 EMPiRE/MYSTiC"

#define sm sendmessage
#define pm prompt

#define Beep 0x07

/***[ SubRoutines ]**********************************************************/

void start(void);
void GetAEinfo(void);
void GetDate(char);
void end(void);
void DExit(void);
void LastCommand(void);

/***[ Global Variables ]*****************************************************/

int  Node, i, j, StartNode, EndNode, Pages, Nr, UsrLevel, MinUserLevel;

char UsrName[36], SysName[36], Answer[200], ChatFlag[10], CurDate[9],CurTime[9];

BOOL ChatStat;

FILE *File, *LogFile, *StatsFile, *TempFile;

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

  StartNode=1;                   /* Skip Private/Local Node0 */
  EndNode=2;
  MinUserLevel=30;

  GetAEinfo();

  if (UsrLevel<MinUserLevel) Pages=2;
  else Pages=99;

  sprintf(buffer,"ENV:Page%d.TMP",Node);
  TempFile=fopen(buffer,"r");         
  if (TempFile!=NULL)
  {
    fgets(buffer,10,TempFile);
    Nr=atoi(buffer);
    fclose(TempFile);
  }
  else Nr=0;

  if (strstr(ChatFlag,"OFF")!=0)
  {
    sm("",1);
    sprintf(buffer,"[0m %s is NOT Around Right Now.",SysName);
    sm(buffer,1);
    sm("",1);
    hotkey(" Do You Want To Leave A Comment? [y/N] ",buffer);
    sm(buffer,1);
    if (buffer[0]=='y' || buffer[0]=='Y') putuserstring("C",RETURNCOMMAND);
    else sm("",1);
  }
  else
  {
    if (Nr<Pages)
    {
      ChatStat=FALSE;
      for(i=StartNode;i<=EndNode;i++)
      {
        sprintf(buffer,"ENV:STATS@%d",i);
        StatsFile=fopen(buffer,"r");
        if (StatsFile==NULL) DExit();
        fgets(buffer,200,StatsFile);
        j=strlen(buffer);
        strmid(buffer,buffer2,j-1,2);
        j=atoi(buffer2);
        fclose(StatsFile);
        if (j==17) ChatStat=TRUE;
      }

      sm("",1);
      sm("[34m+-----------------------------------+--------------------------+",1);
      if (Pages-Nr==1) sm("[34m| [0mPlease State Your Business.....   [34m|    [36m1 Time Left to Page   [34m|",1);
      else
      {
        sprintf(buffer,"[34m| [0mPlease State Your Business.....   [34m|  [36m%2d Times Left to Page   [34m|",Pages-Nr);
        sm(buffer,1);
      }
      sm("[34m+-----------------------------------+--------------------------+",1);
      sm("[34m|                                                              |",1);
      sm("[34m+--------------------------------------------------------------+",1);
      sm("[3A",1);

      pm("[34m| [0m",Answer,60);
      sm("",1);
      sm("",1);

      if (ChatStat)
      {
        sprintf(buffer,"%c%s is Already in Chat On Another Node!",Beep,SysName);
        sm(buffer,1);
      }
      else
      if (strlen(Answer)==0) { sm("[0m Page Aborted!",1); sm("",1); }
      else
      {
        putuserstring("O",RETURNCOMMAND);
        GetDate('U');
        LogFile=fopen("BBS:Page.LOG","a");         
        sprintf(buffer,"%s | %16s | %s\n",CurDate,UsrName,Answer); 
        fputs(buffer,LogFile);              
        fclose(LogFile);

        Nr++;
        sprintf(buffer,"ENV:Page%d.TMP",Node);
        TempFile=fopen(buffer,"w");         
        sprintf(buffer,"%d\n",Nr); 
        fputs(buffer,TempFile);              
        fclose(TempFile);
      }
    }
    else
    {
       sm("",1);
       sprintf(buffer,"[0m You Already Tried to Page me %d Times Just Now!!!",Nr);
       sm(buffer,1);
       sm("",1);
    }
  }
}

/****************************************************************************/

void GetAEinfo(void)
{
  char buffer[200];
 
  getuserstring(UsrName,DT_NAME);
  getuserstring(buffer,DT_SECSTATUS);
  UsrLevel=atoi(buffer);
  getuserstring(SysName,JH_Sysop);
  getuserstring(ChatFlag,BB_CHATFLAG);
}

/****************************************************************************/

void GetDate(char option)
{
  struct tm s;
  time_t t;
  time(&t);
  s=*localtime(&t);

  if (option=='U') sprintf(CurDate,"%02d-%02d-%02d", s.tm_mon+1, s.tm_mday, s.tm_year);
  if (option=='E') sprintf(CurDate,"%02d-%02d-%02d", s.tm_mday,s.tm_mon+1, s.tm_year);
  sprintf(CurTime,"%02d:%02d:%02d", s.tm_hour, s.tm_min, s.tm_sec);
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
}
