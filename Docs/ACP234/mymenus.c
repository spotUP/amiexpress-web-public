#include <exec/types.h>
#include <libraries/gadtools.h>
#include <exec/memory.h>
#include <clib/exec_protos.h>
#include <clib/dos_protos.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#define TX(x) if(Buttons[x].Text[0]!='\0')
extern struct NewMenu *EWinMenu;
#define PX(x) if(Buttons[x].Text[0]!='\0' && Buttons[x].Type)
static int MaxMenus=0;
void MaddItem(UBYTE Type,char *Label,char *CommKey,UWORD Flags,LONG Mutual,APTR User);
void CreateCustomMenus(int nodes);
extern int BM[];
extern char *MyVerStr;
extern char *VerStr;
struct BUTTON
{
  char Text[100];
  char Command[100];
  BOOL Type;
} ;
extern struct BUTTON Buttons[];
  char chip Version[200];
extern char *GetDate(void);
int menuset = 0;
void MaddRem(void);
void MaddNodes(int nodes);
void CreateCustomMenus(int nodes)
{
  int bt,nm;
  int tempnodes;
  int i;
  tempnodes=nodes;
(void)GetDate();
  for(i=0;i<2;i++)
  {
   bt=0; nm=0;
   menuset=i;
   nodes=tempnodes; nodes--;
  
  MaddItem( NM_TITLE, "Project", 0 , 0, 0, (APTR)0);
     MaddItem( NM_ITEM,  "About",0,0,0,(APTR)0);
   strcpy(Version," AmiExpress Professional "); strcat(Version,&VerStr[6]);
   MaddItem( NM_SUB,&Version[0],0,0,0,(APTR)0);
   MaddItem( NM_SUB,"                  Written by Joseph Hodge     ",0,0,0,(APTR)0);
  
     MaddItem( NM_ITEM,  "/X Technical", 0,0,0,(APTR)0);
   MaddItem( NM_SUB,"                   AmiExpress Technical Support",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~  ",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"        ByteMaster       ByteMaster's BBS USA     - 703-639-6114    ",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"                                                                    ",0,0,0,(APTR)0);

   MaddItem( NM_ITEM,  "/X Distributors", 0,0,0,(APTR)0);

   MaddItem( NM_SUB,"                       AmiExpress Distributors",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~  ",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"        ByteMaster    ByteMaster's BBS     USA     - 703-639-6114   ",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"        Lector & Dux  THE NORTHERN PALACE  DENMARK - 45-31744704    ",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"                                                                    ",0,0,0,(APTR)0);

   MaddItem( NM_ITEM,"/X Developement",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"    /X Developement Team   ",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"   ~~~~~~~~~~~~~~~~~~~~~~  ",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"   Joseph Hodge            ",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"   James E. Millsap        ",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"   Gregg Green             ",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"   Jens Langner            ",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"   Ted Mahar               ",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"   Phillip Julias IV       ",0,0,0,(APTR)0);

   MaddItem( NM_ITEM,"/X Utility Developement",0,0,0,(APTR)0);                                                                   
   MaddItem( NM_SUB,"    /X Utility Developement Team   ",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~  ",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"   James E. Millsap  ",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"   Krzysztof Wianecki",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"   Stephan Schiemann ",0,0,0,(APTR)0);
   MaddItem( NM_SUB,"   Eddie Oniel       ",0,0,0,(APTR)0);
 
     MaddItem( NM_TITLE, "Master Control",0,0,0,(APTR)0);
MaddItem(  NM_ITEM, "Sysop Login",0, 0, 0, (APTR)0);
     MaddNodes(nodes);
   MaddItem(  NM_ITEM, "Instant Login",0, 0, 0, (APTR)0);
     MaddNodes(nodes);
MaddItem(  NM_ITEM, "AEShell",0, 0, 0, (APTR)0);
     MaddNodes(nodes);
MaddItem(  NM_ITEM, "Toggle Chat",0, 0, 0, (APTR)0);
     MaddNodes(nodes);
MaddItem(  NM_ITEM, "Exit Node",0, 0, 0, (APTR)0);
     MaddNodes(nodes);
MaddItem(  NM_ITEM, "Local Login",0, 0, 0, (APTR)0);
     MaddNodes(nodes);
MaddItem(  NM_ITEM, "Reserve Node",0, 0, 0, (APTR)0);
     MaddNodes(nodes);
MaddItem(  NM_ITEM, "Accounts",0, 0, 0, (APTR)0);
     MaddNodes(nodes);
MaddItem(  NM_ITEM, "Init Modem",0, 0, 0, (APTR)0);
     MaddNodes(nodes);
MaddItem(  NM_ITEM, "Node(offhook)",0, 0, 0, (APTR)0);
     MaddNodes(nodes);
MaddItem(  NM_ITEM, "Quiet Node",0, 0, 0, (APTR)0);
     MaddNodes(nodes);
MaddItem(  NM_ITEM, "Config Node",0, 0, 0, (APTR)0);
     MaddNodes(nodes);
MaddItem(  NM_ITEM, "Node Chat",0, 0, 0, (APTR)0);
     MaddNodes(nodes);
MaddItem( NM_ITEM,"Set NRAMS",0,0,0,(APTR)0);
     MaddNodes(nodes);

     MaddItem( NM_TITLE, "Custom Control",0,0,0,(APTR)0);
     TX(0)
     {
       BM[nm++]=bt;MaddItem(  NM_ITEM, (STRPTR)&Buttons[0].Text,0, 0, 0, (APTR)0);
     }bt++;
     PX(bt-1)
     {
      MaddNodes(nodes);
     }
     TX(bt){ BM[nm++]=bt; MaddItem(  NM_ITEM, (STRPTR)&Buttons[bt].Text,0, 0, 0, (APTR)0);}bt++;
     PX(bt-1)
     {
      MaddNodes(nodes);
     }
    TX(bt){ BM[nm++]=bt; MaddItem(  NM_ITEM, (STRPTR)&Buttons[bt].Text,0, 0, 0, (APTR)0);}bt++;
        PX(bt-1)
     {
       MaddNodes(nodes);
     }
    TX(bt){ BM[nm++]=bt; MaddItem(  NM_ITEM, (STRPTR)&Buttons[bt].Text,0, 0, 0, (APTR)0);}bt++;
        PX(bt-1)
     {
       MaddNodes(nodes);
     }
    TX(bt){ BM[nm++]=bt; MaddItem(  NM_ITEM, (STRPTR)&Buttons[bt].Text,0, 0, 0, (APTR)0);}bt++;
        PX(bt-1)
     {
       MaddNodes(nodes);
     }
    TX(bt){ BM[nm++]=bt; MaddItem(  NM_ITEM, (STRPTR)&Buttons[bt].Text,0, 0, 0, (APTR)0);}bt++;
        PX(bt-1)
     {
       MaddNodes(nodes);
     }
    TX(bt){ BM[nm++]=bt; MaddItem(  NM_ITEM, (STRPTR)&Buttons[bt].Text,0, 0, 0, (APTR)0);}bt++;
        PX(bt-1)
     {
       MaddNodes(nodes);
     }
    TX(bt){ BM[nm++]=bt; MaddItem(  NM_ITEM, (STRPTR)&Buttons[bt].Text,0, 0, 0, (APTR)0);}bt++;
        PX(bt-1)
     {
      MaddNodes(nodes);
     }
    TX(bt){ BM[nm++]=bt; MaddItem(  NM_ITEM, (STRPTR)&Buttons[bt].Text,0, 0, 0, (APTR)0);}bt++;
        PX(bt-1)
     {
      MaddNodes(nodes);
     }
    TX(bt){ BM[nm++]=bt; MaddItem(  NM_ITEM, (STRPTR)&Buttons[bt].Text,0, 0, 0, (APTR)0);}bt++;
        PX(bt-1)
     {
      MaddNodes(nodes);
     }
    TX(bt){ BM[nm++]=bt; MaddItem(  NM_ITEM, (STRPTR)&Buttons[bt].Text,0, 0, 0, (APTR)0);}bt++;
        PX(bt-1)
     {
      MaddNodes(nodes);
     }
    TX(bt){ BM[nm++]=bt; MaddItem(  NM_ITEM, (STRPTR)&Buttons[bt].Text,0, 0, 0, (APTR)0);}bt++;
        PX(bt-1)
     {
      MaddNodes(nodes);
     }
    TX(bt){ BM[nm++]=bt; MaddItem(  NM_ITEM, (STRPTR)&Buttons[bt].Text,0, 0, 0, (APTR)0);}bt++;
        PX(bt-1)
     {
      MaddNodes(nodes);
     }
    TX(bt){ BM[nm++]=bt; MaddItem(  NM_ITEM, (STRPTR)&Buttons[bt].Text,0, 0, 0, (APTR)0);}bt++;
        PX(bt-1)
     {
     MaddNodes(nodes); 
     }
    TX(bt){ BM[nm++]=bt; MaddItem(  NM_ITEM, (STRPTR)&Buttons[bt].Text,0, 0, 0, (APTR)0);}bt++;
        PX(bt-1)
     {
      MaddNodes(nodes);
     }


    MaddItem(   NM_END, 0, 0 , 0, 0, (APTR)0);
 }
}
void MaddNodes(int nodes)
{
   char temp[100];
   register int i;
   for(i=0;i<=nodes;i++)
   {
     sprintf(temp,"Node %c",'0'+i);
     MaddItem( NM_SUB,temp,0,0,0,(APTR)0);
   }
}
void MaddItem(UBYTE Type,char *Label,char *CommKey,UWORD Flags,LONG Mutual,APTR User)
{
   static int i=0;
   struct NewMenu *t;
   char temp[200];
   char *s;
   if(menuset==1)
   {
     EWinMenu=(struct NewMenu *)AllocMem((LONG)sizeof(struct NewMenu)*(LONG)i,MEMF_PUBLIC|MEMF_CLEAR);
     menuset=-1;
     i=0;
   }
   if(menuset==-1)
   {
     t=EWinMenu+i;
     t->nm_Type=Type;
       s=AllocMem(80L,MEMF_PUBLIC|MEMF_CLEAR);
       if(Label!=NULL)
       strcpy(s,Label);else strcpy(s,"");
     t->nm_Label=s;
     t->nm_CommKey=0;//(STRPTR)CommKey;
     t->nm_Flags=Flags;
     t->nm_MutualExclude=Mutual;
     t->nm_UserData=0;
     MaxMenus++;
   }
   i++;
}
  
void MaddRem(void)
{
   register int i;
   struct NewMenu *t;
   for(i=0;i<MaxMenus;i++)
   {
     t=EWinMenu+i;
     FreeMem(t->nm_Label,80L);
   }
   FreeMem(EWinMenu,(LONG)(sizeof(struct NewMenu))*(LONG)MaxMenus);
}