
#include <AE.Includes/doorheader.h>
#include <AE.Includes/glue.h>

#include <string.h>
#include <proto/exec.h>
#include <dos/dos.h>
#include <ctype.h>
#include <time.h>
#include <clib/dos_protos.h>
#include <stdio.h>
#include <proto/icon.h>
#include <dos.h>
#include <stdlib.h>



#define Ver "$VER: sTATUS 1.0 (21-07-94) - ©1994 jOE cOOl/mOTION"

#define sm sendmessage
#define pm prompt
#define gu getuserstring
#define pu putuserstring

#define Beep 0x07

/***[ SubRoutines ]**********************************************************/

void start(int);
void GetAEinfo(void);
void GetDate(char);
void end(void);
void DExit(void);
void LastCommand(void);
BOOL GetIconTooltype(char *text, char *buffer);

/***[ Global Variables ]*****************************************************/

int  Node,num;
struct Library *IconBase;
struct DiskObject *dobj;
BYTE *tooltype;




/***[ Main ]*****************************************************************/

void main (int argc,char *argv[]) 
{
  if(argc!=2)
  { printf("\n %s \n",Ver);
    exit(0);
  }
  Node=atoi(argv[1]);
  Register(argv[1][0]-'0');
  IconBase=(struct Library *) OpenLibrary("icon.library", 33);
  if (IconBase == NULL)
    {
     sm("",1);
     sm("System Error - Unable to open Icon.library",1);
     sm("",1);
     DExit();
    }
  start(Node);
  CloseLibrary((struct Library *)IconBase);
  DExit();
}
/****************************************************************************/

void start(int node)


{ char buffer[400],buffer2[400];
  int confs=0,i=0,j,k=0,bytes=0,relative=NULL,*axx=NULL;
  char confname[15][40];
  char *p=NULL,*s=NULL,**ap=NULL,*t=NULL;
  ULONG size=0,nr=0;
sm ("[65C[1A[44mJoin by H!-Tex[0m",1);
                 
  dobj = GetDiskObject("bbs:confconfig");
if (dobj==NULL) DExit();

   GetIconTooltype("NCONFS",buffer);
   confs=atoi(buffer);
   strcpy(buffer,"RELATIVE_CONFERENCES");
   relative=GetIconTooltype(buffer, buffer2);
	while (k<confs)
	{       p=s;

		sprintf(buffer,"NAME.%d",k+1);
		GetIconTooltype(buffer, buffer2);
                if ((s=realloc(s,(bytes+strlen(buffer2)+1)))!=NULL)
                   {if (s!=p)
                    for (j=0;j<i;j++)
                    ap[j]+=s-p;
                    strcpy(s+bytes,buffer2);
                    if ((ap=realloc(ap, ((i+1)*sizeof(char *))))==NULL)
                    DExit();
                    ap[i]=s+bytes;
                    bytes += strlen(buffer2)+1;
                    i++;
                    } else DExit();
                k++;
   	}
	
   FreeDiskObject(dobj);
gu (buffer,DT_CONFACCESS);
sprintf (buffer2,"bbs:access/area.%s",buffer);

dobj = GetDiskObject(buffer2);
if (dobj==NULL) {sm(buffer2,0);sm(" not found!",1);DExit();}
if ((axx=realloc(axx,((confs)*sizeof(int))))==NULL)
DExit();
                    
k=0;
	while (k<confs)
               {
		sprintf(buffer,"conf.%d",k+1);
                axx[k]=GetIconTooltype(buffer, buffer2);
                k++;
   	}
  FreeDiskObject(dobj);
j=0;

gu (buffer,BB_MAINLINE);
p=strchr(buffer,32);
if (p!=NULL) {strcpy(buffer2,p);
              nr=atoi(buffer2);
              if ((nr!=0) && (nr<=confs) && (axx[nr-1])) 
                {sprintf(buffer,"j %d",nr); 
                 pu (buffer,PRV_COMMAND);
                 DExit();
                }
             }

//sm("c",0);
for (i=0;i<confs;i++)
if (axx[i]) {if (!(relative)) {sprintf (buffer,"%2d  ",(i+1));
                               sm (buffer,0);sm (ap[i],1);}
                       else   {sprintf (buffer,"%2d  ",(j+1));
                               j++;sm (buffer,0);sm (ap[i],1);}
            }
//gu (buffer,BB_MAINLINE);
//p=strchr(buffer,32);
//if (p!=NULL) ce",1);
//sm (buffer,1);
//pu ("j 8",PRV_COMMAND);


//RETURNCOMMAND
//PRV_COMMAND
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
BOOL GetIconTooltype(char *text, char *buffer)
{
	UBYTE **toolarray;

   toolarray = (char **)dobj->do_ToolTypes;
   if (tooltype=FindToolType(toolarray, text))
   {
     strcpy(buffer,tooltype);
     return(1);
   }
   else
   {
     buffer=NULL;
     return(0);
   }
}
