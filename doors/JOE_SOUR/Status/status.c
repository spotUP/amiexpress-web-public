
#include <string.h>
#include <proto/exec.h>
#include <dos/dos.h>
#include <ctype.h>
#include <time.h>

#define Ver "$VER: sTATUS 1.0 (21-07-94) - ©1994 jOE cOOl/mOTION"

#define sm sendmessage
#define pm prompt
#define gu getuserstring
#define pu putuserstring

#define Beep 0x07

/***[ SubRoutines ]**********************************************************/

void start(void);
void GetAEinfo(void);
void GetDate(char);
void end(void);
void DExit(void);
void LastCommand(void);

/***[ Global Variables ]*****************************************************/

int  Node,num;

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
{ char result[200],result1[200],result2[200],result3[200],line[400],nr[3];
  sm("",1);
  gu(result,DT_NAME);
  gu(result1,102);
  sprintf (line,"[35m.---------[ [36m[44m%-25s[40m[35m ]----[ [36m[44m%-25s[40m[35m ]-------.",result,result1);
  sm (line,1);
  sm ("|[78C|",1);
  gu(result,112);
  gu(result1,146);
  gu(result2,105);
  gu(result3,126);
  sprintf (line,"|  [36mcALLS: [35m%5.5s   [36mcONF aXX: [35m%-10s  [36maXX lEVEL: [35m%3.3s   [36mcONF:[35m%15.15s  |",result,result1,result2,result3);
  sm (line,1);
  gu(result,117);
  gu(result1,111);
  gu(result2,119);
  sprintf (line,"|  [36muL bYTES: [35m%10.10s         [36muL fILES: [35m%5.5s        [36mbYTES aVail: [35m%8.8s   |",result,result1,result2);
  sm(line,1);
 
  gu(result,118);
  gu(result1,112);
  gu(result2,120);
  sprintf (line,"|  [36mdL bYTES: [35m%10.10s         [36mdL fILES: [35m%5.5s        [36mbYTES dOWN : [35m%8.8s   |",result,result1,result2);
  sm(line,1);

  gu(nr,107);
  num=atoi(nr);
  gu(result,121);
  if (result[0]==78)
  { strcpy (result1,"oFF");}
  else
  { strcpy (result1,"oN");}

  gu(result,142);
  if (result[1]==70)
  { strcpy (result,"oFF");}
  else
  { strcpy (result,"oN");}

  if (num==0)
  { sprintf (line,"|  [36mrATIO tYPE: [35mdISABLED    [36m rATIO: [35mdISABLED     [36mcHATFLAG: [35m%-3s    [36meXPERT: [35m%-3s   |",result,result1);
    sm (line,1); }
  else
  { gu(result3,107);
    gu(nr,106);
    num=atoi(nr);
    if (num==0) {strcpy (result2,"bYTE");}
    if (num==1) {strcpy (result2,"bYTE/fILE");}
    if (num==2) {strcpy (result2,"fILE");}
    sprintf (line,"|  [36mrATIO tYPE: [35m%-9s    [36m rATIO: [35m%1.1s:1         [36mcHATFLAG: [35m%-3s    [36meXPERT: [35m%-3s   |",result2,result3,result,result1);
    sm (line,1);
   }
  gu (result,109);
  gu (result1,149);
  gu (result2,505);
  gu (result3,516);
  sprintf (line,"|  [36mmESSAGES: [35m%5.5s        [36msLOT: [35m%2.2s       [36mcONNECT: [35m%-6s      [36mlOCKED: [35m%-6s   |",result,result1,result2,result3);
  sm (line,1);
    

  sm ("|[78C|",1);
  gu(result,143);
  gu(result1,144);
  sprintf (line,"`-lAST oN [ [36m[44m%-25s[40m[35m ]----[ [36m[44m%-25s[40m[35m ] tIME--'",result,result1);
  sm (line,1);
  sm ("[36m[4m                                                                                ",1);
  sm ("[44m sTATUS v1.0                                                   ©1994  jOE cOOL  [0m",1);
  sm ("",1);

  
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
