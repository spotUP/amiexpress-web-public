#include <exec/types.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "aclvl.h"
#define SOPTLOOP for(i=p.ns;i<=p.ne;i++) if(Sopt[i]!=NULL)
#define CMDLOOP for(i=p.ns;i<=p.ne;i++) if(Cmds[i]!=NULL)
extern BOOL NodeIdle[];
void strlim(char *str1,char *str2,int limit);
void strleft(char *str,char *str1);
struct UserData {
	char	Name[31],
		Pass[9],
		Location[30],
		PhoneNumber[13];
	USHORT	Slot_Number;
	USHORT	Sec_Status,
		Sec_Board,		/* File or Byte Ratio */
		Sec_Library,		/* Ratio              */
		Sec_Bulletin,		/* Computer Type      */
		Messages_Posted;
	ULONG	NewSinceDate,
		ConfRead1,
		ConfRead2,
		ConfRead3,
		ConfRead4,
		ConfRead5,
		ConfRead6,
		ConfRead7,
		ConfRead8,
		ConfRead9;
	char	Conference_Access[10];
	USHORT	Uploads,
		Downloads,
		ConfRJoin,
		Times_Called;
	long	Time_Last_On,
		Time_Used,
		Time_Limit,
		Time_Total;
	ULONG	Bytes_Download,
		Bytes_Upload,
		Daily_Bytes_Limit,
		Daily_Bytes_Dld;
	char	Expert;
	ULONG	ConfYM1,
		ConfYM2,
		ConfYM3,
		ConfYM4,
		ConfYM5,
		ConfYM6,
		ConfYM7,
		ConfYM8,
		ConfYM9;
	long    BeginLogCall;
	UBYTE	Protocol,
			UUCPA,
			LineLength,
			New_User;
	};

struct Commands {
	UBYTE	AcLvl[100],
		SerDevUnit;
	char	SerDev[40],
		NEW_UserPW[15];
	long	OpeningBaud;
	BYTE	TaskPri;
	char	ConfName[9][60],
		ConfLoc[9][60],
		BBSName[41],
		BBSLoc[41],
		SysopName[41];
	UBYTE	PSAcLvl[6],
		PSRType[6],
		PSRatio[6];
	long	PSDBytes[6],
		PSTime[6];
	char	PSCnfAc[6][10],
		MInit[101],
		MReset[31],
		MRing[31],
		MAnswer[31],
		MC300[31],
		MC1200[31],
		MC2400[31],
		MC4800[31],
		MC9600[31],
		MC19200[31];
	short	NumConf;
	char	SysPass[31],
		RemotePass[31];
	USHORT	BaudTimes[10];
	char	Pad[18];
	};
struct StartOption
{
  SHORT LeftEdge;
  SHORT TopEdge;
  SHORT Width;
  SHORT Height;
  int BitPlanes;
  BOOL StatBar;
  BOOL Interlace;
  BOOL DupeCheck;
  BOOL QLogon;
  BOOL TakeCredits;
  BOOL SeenIt;
  BOOL TrapDoor;
  BOOL Iconify;
  BOOL RadBoogie;
  BOOL A2232;
  BOOL Toggles[20];
  char Logoff[80];
  char ShutDown[80];
  char CycleLock[80];
  char RamPen[80];
  char BBSConfig[80];
  char FilesNot[80];
  char UserData[80];
  char UserKey[80];
  char OffHook[80];
  char PubScreen[80];
  APTR MasterSemi;
  APTR SingleSemi;
};

extern struct Commands *Cmds[11];
extern struct StartOption *Sopt[11];


struct PSTR
{
  int s1;
  int s2;
  int ns;
  int ne;
};

int CheckConfigNode(char str[]);
int CheckConfigNode(char str[])
{
  register int i;
  struct PSTR p;
  if(ParseImage(str,&p))
  {
    if(!strnicmp(&str[p.s1],"TRAPDOOR",8))
    {
      SOPTLOOP Sopt[i]->TrapDoor=TRUE; return(1); }
    if(!strnicmp(&str[p.s1],"EALL_LEVEL",10))
    {
      SOPTLOOP Sopt[i]->RadBoogie=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"A2232_PATCH",11))
    {
      SOPTLOOP Sopt[i]->A2232=TRUE; return(1); }
    if(!strnicmp(&str[p.s1],"NO_PURGELINE",12)) 
    {
      SOPTLOOP Sopt[i]->Toggles[11]=1; return(1); }
    if(!strnicmp(&str[p.s1],"REPURGE",7))
    {
      SOPTLOOP Sopt[i]->Toggles[12]=1; return(1); }
    if(!strnicmp(&str[p.s1],"LOGOFF_RESET",12))
    {
      SOPTLOOP Sopt[i]->Toggles[17]=1; return(1); }
    
    if(!strnicmp(&str[p.s1],"ACTIVATE_WINDOW",15))
    {
      SOPTLOOP Sopt[i]->Iconify=FALSE; return(1); }
    if(!strnicmp(&str[p.s1],"IDLENODE",8))
    {
      SOPTLOOP NodeIdle[i]=1; return(1);
    }
    if(!strnicmp(&str[p.s1],"LEFTEDGE",8)) 
    { SOPTLOOP Sopt[i]->LeftEdge=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"TOPEDGE",7)) 
    { SOPTLOOP Sopt[i]->TopEdge=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"WIDTH",5)) 
    { SOPTLOOP Sopt[i]->Width=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"HEIGHT",6)) 
    { SOPTLOOP Sopt[i]->Height=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"BITPLANES",9)) 
    { SOPTLOOP Sopt[i]->BitPlanes=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"ONE_TIME_BULLETINS",18))
    { SOPTLOOP Sopt[i]->SeenIt=TRUE; return(1); }
    if(!strnicmp(&str[p.s1],"LOGOFFBATCH",11)) 
    { SOPTLOOP strcpy(Sopt[i]->Logoff,&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"SHUTDOWN_BATCH",14)) 
    { SOPTLOOP strcpy(Sopt[i]->ShutDown,&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"USERDATA_LOCATION",17))
    { SOPTLOOP strcpy(Sopt[i]->UserData,&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"USERKEY_LOCATION",16))
    { SOPTLOOP strcpy(Sopt[i]->UserKey,&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"TAKECREDITS",11))
    {
      SOPTLOOP Sopt[i]->StatBar=TRUE; return(1); 
    }
    if(!strnicmp(&str[p.s1],"STATBAR",7))
    {
      SOPTLOOP Sopt[i]->StatBar=TRUE; return(1);
    }
    if(!strnicmp(&str[p.s1],"INTERLACE",9))
    {
      SOPTLOOP Sopt[i]->Interlace=TRUE; return(1);
    }
    if(!strnicmp(&str[p.s1],"SUPPRESS_QLOGON",15))
    {
      SOPTLOOP Sopt[i]->QLogon=TRUE; return(1);
    }
    if(!strnicmp(&str[p.s1],"SCREENS",7))
    {
      SOPTLOOP strcpy(Sopt[i]->PubScreen,&str[p.s2]); return(1); }

     if(!strnicmp(&str[p.s1],"PLAYPEN",7))
     {
       SOPTLOOP strcpy(Sopt[i]->RamPen,&str[p.s2]); return(1); }
     if(!strnicmp(&str[p.s1],"MODEM_OFFHOOK",13))
     {
        SOPTLOOP strcpy(Sopt[i]->OffHook,&str[p.s2]); return(1); }

     if(!strnicmp(&str[p.s1],"FILESNOTALLOWED",15))
     {
       SOPTLOOP strcpy(Sopt[i]->FilesNot,&str[p.s2]); return(1); }
     if(!strnicmp(&str[p.s1],"TRUE_RESET",10))
     {
       SOPTLOOP Sopt[i]->Toggles[0]=TRUE; return(1); }
     if(!strnicmp(&str[p.s1],"RELATIVE_CONFERENCES",20))
     {
       SOPTLOOP Sopt[i]->Toggles[1]=TRUE; return(1); }
     if(!strnicmp(&str[p.s1],"DOORLOG",7))
     {
       SOPTLOOP Sopt[i]->Toggles[2]=TRUE; return(1); }
     if(!strnicmp(&str[p.s1],"STARTLOG",8))
     {
       SOPTLOOP Sopt[i]->Toggles[3]=TRUE; return(1); }
     if(!strnicmp(&str[p.s1],"NO_TIMEOUT",10))
     {
       SOPTLOOP Sopt[i]->Toggles[4]=TRUE; return(1); }
     if(!strnicmp(&str[p.s1],"NO_MCI_MESSAGE",14))
     {
       SOPTLOOP Sopt[i]->Toggles[5]=TRUE; return(1); }
     if(!strnicmp(&str[p.s1],"BREAK_CHAT",10))
     {
       SOPTLOOP Sopt[i]->Toggles[7]=TRUE; return(1); }
     if(!strnicmp(&str[p.s1],"MODEM_HARDFLUSH",15))
     {
        SOPTLOOP Sopt[i]->Toggles[8]=TRUE; return(1); }
     if(!strnicmp(&str[p.s1],"QUIETNODE",9))
     {
       SOPTLOOP Sopt[i]->Toggles[9]=TRUE; return(1); }
    if(!strnicmp(&str[p.s1],"ACCOUNT_EDITING",15))
    { CMDLOOP Cmds[i]->AcLvl[ACCOUNT_EDITING]=atoi(&str[p.s2]); return(1); }     
    if(!strnicmp(&str[p.s1],"COMMENT_TO_SYSOP",16))
    { CMDLOOP Cmds[i]->AcLvl[COMMENT_TO_SYSOP]=atoi(&str[p.s2]); return(1); }    
    if(!strnicmp(&str[p.s1],"DOWNLOAD",8))
    { CMDLOOP Cmds[i]->AcLvl[DOWNLOAD]=atoi(&str[p.s2]); return(1); }            
    if(!strnicmp(&str[p.s1],"ENTER_MESSAGE",13))
    { CMDLOOP Cmds[i]->AcLvl[ENTER_MESSAGE]=atoi(&str[p.s2]); return(1); }       
    if(!strnicmp(&str[p.s1],"FILE_LISTINGS",13))
    { CMDLOOP Cmds[i]->AcLvl[FILE_LISTINGS]=atoi(&str[p.s2]); return(1); }        
    if(!strnicmp(&str[p.s1],"JOIN_CONFERENCE",15))
    { CMDLOOP Cmds[i]->AcLvl[JOIN_CONFERENCE]=atoi(&str[p.s2]); return(1); }      
    if(!strnicmp(&str[p.s1],"NEW_FILES_SINCE",15))
    { CMDLOOP Cmds[i]->AcLvl[NEW_FILES_SINCE]=atoi(&str[p.s2]); return(1); }      
    if(!strnicmp(&str[p.s1],"PAGE_SYSOP",10))
    { CMDLOOP Cmds[i]->AcLvl[PAGE_SYSOP]=atoi(&str[p.s2]); return(1); }           
    if(!strnicmp(&str[p.s1],"READ_MSG",8))             
    { CMDLOOP Cmds[i]->AcLvl[READ_MSG]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"DISPLAY_USER_STATS",18))   
    { CMDLOOP Cmds[i]->AcLvl[DISPLAY_USER_STATS]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"UPLOAD",6))               
    { CMDLOOP Cmds[i]->AcLvl[UPLOAD]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"VIEW_A_FILE",11))          
    { CMDLOOP Cmds[i]->AcLvl[VIEW_A_FILE]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"EDIT_USER_INFO",14))       
    { CMDLOOP Cmds[i]->AcLvl[EDIT_USER_INFO]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"REMOTE_SHELL",12))         
    { CMDLOOP Cmds[i]->AcLvl[REMOTE_SHELL]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"ZIPPY_TEXT_SEARCH",17))    
    { CMDLOOP Cmds[i]->AcLvl[ZIPPY_TEXT_SEARCH]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"OVERRIDE_CHAT",13))        
    { CMDLOOP Cmds[i]->AcLvl[OVERRIDE_CHAT]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"EDIT_USER_NAME",14))       
    { CMDLOOP Cmds[i]->AcLvl[EDIT_USER_NAME]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"EDIT_USER_LOCATION",18))   
    { CMDLOOP Cmds[i]->AcLvl[EDIT_USER_LOCATION]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"EDIT_PHONE_NUMBER",17))    
    { CMDLOOP Cmds[i]->AcLvl[EDIT_PHONE_NUMBER]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"EDIT_PASSWORD",13))        
    { CMDLOOP Cmds[i]->AcLvl[EDIT_PASSWORD]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"SENTBY_FILES",12))         
    { CMDLOOP Cmds[i]->AcLvl[SENTBY_FILES]=1; return(1); }
    if(!strnicmp(&str[p.s1],"DEFAULT_CHAT_ON",15))      
    { CMDLOOP Cmds[i]->AcLvl[DEFAULT_CHAT_ON]=1; return(1); }
    if(!strnicmp(&str[p.s1],"CLEAR_SCREEN_MSG",16))     
    { CMDLOOP Cmds[i]->AcLvl[CLEAR_SCREEN_MSG]=1; return(1); }
    if(!strnicmp(&str[p.s1],"CAPITOLS_in_FILE",16))     
    { CMDLOOP Cmds[i]->AcLvl[CAPITOLS_in_FILE]=1; return(1); }
    if(!strnicmp(&str[p.s1],"CHAT_COLOR_SYSOP",16))     
    { CMDLOOP Cmds[i]->AcLvl[CHAT_COLOR_SYSOP]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"CHAT_COLOR_USER",15))      
    { CMDLOOP Cmds[i]->AcLvl[CHAT_COLOR_USER]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"VARYING_LINK_RATE",17))    
    { CMDLOOP Cmds[i]->AcLvl[VARYING_LINK_RATE]=1; return(1); }
    if(!strnicmp(&str[p.s1],"KEEP_UPLOAD_CREDIT",18))   
    { CMDLOOP Cmds[i]->AcLvl[KEEP_UPLOAD_CREDIT]=1; return(1); }
    if(!strnicmp(&str[p.s1],"ALLOW_FREE_RESUMING",19))  
    { CMDLOOP Cmds[i]->AcLvl[ALLOW_FREE_RESUMING]=1; return(1); }
    if(!strnicmp(&str[p.s1],"DO_CALLERSLOG",13))        
    { CMDLOOP Cmds[i]->AcLvl[DO_CALLERSLOG]=1; return(1); }
    if(!strnicmp(&str[p.s1],"DO_U/D_LOG",10))          
    { CMDLOOP Cmds[i]->AcLvl[DO_UD_LOG]=1; return(1); }
    if(!strnicmp(&str[p.s1],"OVERRIDE_TIMES",14))       
    { CMDLOOP Cmds[i]->AcLvl[OVERRIDE_TIMES]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"BULLETINS",9))            
    { CMDLOOP Cmds[i]->AcLvl[BULLETINS]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"SYSOP_READ",10))           
    { CMDLOOP Cmds[i]->AcLvl[SYSOP_READ]=atoi(&str[p.s2]); return(1); }
   /* if(!strnicmp(&str[p.s1],"NODE_NUMBER",11))          
    { CMDLOOP Cmds[i]->AcLvl[NODE_NUMBER]=atoi(&str[p.s2]); return(1); }
   */
    if(!strnicmp(&str[p.s1],"SCREEN_TO_FRONT",15))      
    { CMDLOOP Cmds[i]->AcLvl[SCREEN_TO_FRONT]=1; return(1); }
    
    if(!strnicmp(&str[p.s1],"PRESET_ACCESS_LVL",17))
    {
       if(atoi(&str[p.s2])<7)
       {
         CMDLOOP Cmds[i]->PSAcLvl[atoi(&str[p.s2])-1]=atoi(&str[p.s2+3]);
                 return(1);
       }
    }
    if(!strnicmp(&str[p.s1],"PRESET_RATIO_TYPE",17))
    {
       if(atoi(&str[p.s2])<7)
       {
         CMDLOOP Cmds[i]->PSRType[atoi(&str[p.s2])-1]=atoi(&str[p.s2+3]);
                 return(1);
       }
    }
    if(!strnicmp(&str[p.s1],"PRESET_RATIO",12))
    {
       if(atoi(&str[p.s2])<7)
       {
         CMDLOOP Cmds[i]->PSRatio[atoi(&str[p.s2])-1]=atoi(&str[p.s2+3]);
                 return(1);
       }
    }
    if(!strnicmp(&str[p.s1],"PRESET_TIME_LIMIT",17))
    {
       if(atoi(&str[p.s2])<7)
       {
         CMDLOOP Cmds[i]->PSTime[atoi(&str[p.s2])-1]=atol(&str[p.s2+3]);
                 return(1);
       }
    }
    if(!strnicmp(&str[p.s1],"PRESET_DAILY_BYTES",18))
    {
       if(atoi(&str[p.s2])<7)
       {
         CMDLOOP Cmds[i]->PSDBytes[atoi(&str[p.s2])-1]=atol(&str[p.s2+3]);
                 return(1);
       }
    }
    if(!strnicmp(&str[p.s1],"PRESET_CONF_ACCESS",18))
    {
       if(atoi(&str[p.s2])<7)
       {
         CMDLOOP { Cmds[i]->PSCnfAc[atoi(&str[p.s2])-1][0]=str[p.s2+3];
                   Cmds[i]->PSCnfAc[atoi(&str[p.s2])-1][1]=str[p.s2+4];
                   Cmds[i]->PSCnfAc[atoi(&str[p.s2])-1][2]=str[p.s2+5];
                   Cmds[i]->PSCnfAc[atoi(&str[p.s2])-1][3]=str[p.s2+6];
                   Cmds[i]->PSCnfAc[atoi(&str[p.s2])-1][4]=str[p.s2+7];
                   Cmds[i]->PSCnfAc[atoi(&str[p.s2])-1][5]=str[p.s2+8];
                   Cmds[i]->PSCnfAc[atoi(&str[p.s2])-1][6]=str[p.s2+9];
                   Cmds[i]->PSCnfAc[atoi(&str[p.s2])-1][7]=str[p.s2+10];
                   Cmds[i]->PSCnfAc[atoi(&str[p.s2])-1][8]=str[p.s2+11];
                 }
                 return(1);
       }

    }
    if(!strnicmp(&str[p.s1],"CONF_NAME",9))
    {
       if(atoi(&str[p.s2])<10)
       {
         CMDLOOP strlim(Cmds[i]->ConfName[atoi(&str[p.s2])-1],&str[p.s2+3],58);
                 return(1);
       }
    }
    if(!strnicmp(&str[p.s1],"CONF_LOCAL",10))
    {
       if(atoi(&str[p.s2])<10)
       {
         CMDLOOP strlim(Cmds[i]->ConfLoc[atoi(&str[p.s2])-1],&str[p.s2+3],58);
                 return(1);
       }
    }
    if(!strnicmp(&str[p.s1],"UNIT",4))                 
    { CMDLOOP Cmds[i]->SerDevUnit=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"INIT_BAUD",9))                 
    { CMDLOOP Cmds[i]->OpeningBaud=atol(&str[p.s2]); return(1); }
       if(!strnicmp(&str[p.s1],"DEVICE_DRIVER",13))                 
    { CMDLOOP strlim(Cmds[i]->SerDev,&str[p.s2],38); return(1); }
    if(!strnicmp(&str[p.s1],"SYSTEM_PASSWORD",15))                 
    { CMDLOOP strlim(Cmds[i]->SysPass,&str[p.s2],29); return(1); }
    if(!strnicmp(&str[p.s1],"REMOTE_PASSWORD",15))                 
    { CMDLOOP strlim(Cmds[i]->RemotePass,&str[p.s2],29); return(1); }
    if(!strnicmp(&str[p.s1],"NEW_USER_PASSWORD",17))                 
    { CMDLOOP strlim(Cmds[i]->NEW_UserPW,&str[p.s2],13); return(1); }
    if(!strnicmp(&str[p.s1],"TASK_PRIORITY",13))                 
    { CMDLOOP Cmds[i]->TaskPri=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"BBS_NAME",8))                 
    { CMDLOOP strlim(Cmds[i]->BBSName,&str[p.s2],39); return(1); }
    if(!strnicmp(&str[p.s1],"BBS_LOCATION",12))                 
    { CMDLOOP strlim(Cmds[i]->BBSLoc,&str[p.s2],39); return(1); }
    if(!strnicmp(&str[p.s1],"SYSOP_NAME",10))                 
    { CMDLOOP strlim(Cmds[i]->SysopName,&str[p.s2],39); return(1); }
    if(!strnicmp(&str[p.s1],"MODEM_INIT",10))                 
    { CMDLOOP strlim(Cmds[i]->MInit,&str[p.s2],99); return(1); }
    if(!strnicmp(&str[p.s1],"MODEM_RESET",11))                 
    { CMDLOOP strlim(Cmds[i]->MReset,&str[p.s2],29); return(1); }
    if(!strnicmp(&str[p.s1],"MODEM_RING",10))                 
    { CMDLOOP strlim(Cmds[i]->MRing,&str[p.s2],29); return(1); }
    if(!strnicmp(&str[p.s1],"MODEM_ANSWER",12))                 
    { CMDLOOP strlim(Cmds[i]->MAnswer,&str[p.s2],29); return(1); }
    if(!strnicmp(&str[p.s1],"CONNECT_300",11))                 
    { CMDLOOP strlim(Cmds[i]->MC300,&str[p.s2],29); return(1); }
    if(!strnicmp(&str[p.s1],"CONNECT_1200",12))                 
    { CMDLOOP strlim(Cmds[i]->MC1200,&str[p.s2],29); return(1); }
    if(!strnicmp(&str[p.s1],"CONNECT_2400",12))                 
    { CMDLOOP strlim(Cmds[i]->MC2400,&str[p.s2],29); return(1); }
    if(!strnicmp(&str[p.s1],"CONNECT_4800",12))                 
    { CMDLOOP strlim(Cmds[i]->MC4800,&str[p.s2],29); return(1); }
    if(!strnicmp(&str[p.s1],"CONNECT_9600",12))                 
    { CMDLOOP strlim(Cmds[i]->MC9600,&str[p.s2],29); return(1); }
    if(!strnicmp(&str[p.s1],"CONNECT_19200",13))                 
    { CMDLOOP strlim(Cmds[i]->MC19200,&str[p.s2],29); return(1); }
    if(!strnicmp(&str[p.s1],"START_0300_TIME",15))                 
    { CMDLOOP Cmds[i]->BaudTimes[0]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"END_0300_TIME",13))                 
    { CMDLOOP Cmds[i]->BaudTimes[1]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"START_1200_TIME",15))                 
    { CMDLOOP Cmds[i]->BaudTimes[2]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"END_1200_TIME",13))                 
    { CMDLOOP Cmds[i]->BaudTimes[3]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"START_2400_TIME",15))                 
    { CMDLOOP Cmds[i]->BaudTimes[4]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"END_2400_TIME",13))                 
    { CMDLOOP Cmds[i]->BaudTimes[5]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"START_4800_TIME",15))                 
    { CMDLOOP Cmds[i]->BaudTimes[6]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"END_4800_TIME",13))                 
    { CMDLOOP Cmds[i]->BaudTimes[7]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"START_9600_TIME",15))                 
    { CMDLOOP Cmds[i]->BaudTimes[8]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"END_9600_TIME",13))                 
    { CMDLOOP Cmds[i]->BaudTimes[9]=atoi(&str[p.s2]); return(1); }
    if(!strnicmp(&str[p.s1],"TOTAL_CONFERENCES",17))
    {
      CMDLOOP Cmds[i]->NumConf=atoi(&str[p.s2]); return(1); }
     

  }
  return(0);
}




