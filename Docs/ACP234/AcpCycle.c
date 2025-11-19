#include <exec/types.h>
#include <intuition/intuition.h>
#include <graphics/gfxbase.h>
#include "includes/AcpCycle_protos.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <clib/intuition_protos.h>
#include <clib/graphics_protos.h>
#include <clib/alib_protos.h>
extern struct Window *EWin;
extern int Theight;
char LastUsers[6][44];
char LastUploads[6][44];
char LastDownloads[6][44];
struct NodeUsers
{
  char LastUsers[6][44];
  int num;
} NdUser[10],NdUploads[10],NdDownloads[10];
char LastBlank[]="                               ";
void RegLastUser(char *name,int node)
{
  register int i=0;
  static int num=0;
  RegNodeUser(name,node);
  if(num>0 && num<5)
  {
  if(!strcmp(LastUsers[num-1],name))
    return;
  }
  if(num==5)
  {
    while(i<4)
    {
      strcpy(LastUsers[i],LastUsers[i+1]);
      i++;
    }
    num =4;
    strcpy(LastUsers[num],name); 
    
  } else strcpy(LastUsers[num],name);
  num +=1; 
}
void RegNodeUser(char *name,int node)
{
  register int i=0;
  if(NdUser[node].num>0 && NdUser[node].num<5)
  {
  if(!strcmp(NdUser[node].LastUsers[NdUser[node].num-1],name))
    return;
  }
  if(NdUser[node].num==5)
  {
    while(i<4)
    {
      strcpy(NdUser[node].LastUsers[i],NdUser[node].LastUsers[i+1]);
      i++;
    }
    NdUser[node].num =4;
    strcpy(NdUser[node].LastUsers[NdUser[node].num],name); 
    
  } else strcpy(NdUser[node].LastUsers[NdUser[node].num],name);
  NdUser[node].num +=1; 
}
   
void ShowLastUser(struct Window *Win)
{
   register int i=0;
   SetAPen(Win->RPort,1);
   while(i<5)
   {
      PrintMyText(Win->RPort,LastBlank,340,155+(i*10)-110+(Theight*11));
      PrintMyText(Win->RPort,&LastUsers[i][0],340,155+(i*10)-110+(Theight*11));
      i++;
   }
}
void ShowNdLastUser(struct Window *Win,int node)
{
   register int i=0;
   SetAPen(Win->RPort,1);
   while(i<5)
   {
      PrintMyText(Win->RPort,LastBlank,340,155+(i*10)-110+(Theight*11));
      PrintMyText(Win->RPort,NdUser[node].LastUsers[i],340,155+(i*10)-110+(Theight*11));
      i++;
   }
}
void RegLastUploads(char *name,int node)
{
  register int i=0;
  static int num=0;
  RegNodeUploads(name,node);
  if(num>0 && num<5)
  {
  if(!strcmp(LastUploads[num-1],name))
    return;
  }
  if(num==5)
  {
    while(i<4)
    {
      strcpy(LastUploads[i],LastUploads[i+1]);
      i++;
    }
    num =4;
    strcpy(LastUploads[num],name); 
    
  } else strcpy(LastUploads[num],name);
  num +=1; 
}
void RegNodeUploads(char *name,int node)
{
  register int i=0;
  if(NdUploads[node].num>0 && NdUploads[node].num<5)
  {
  if(!strcmp(NdUploads[node].LastUsers[NdUploads[node].num-1],name))
    return;
  }
  if(NdUploads[node].num==5)
  {
    while(i<4)
    {
      strcpy(NdUploads[node].LastUsers[i],NdUploads[node].LastUsers[i+1]);
      i++;
    }
    NdUploads[node].num =4;
    strcpy(NdUploads[node].LastUsers[NdUploads[node].num],name); 
    
  } else strcpy(NdUploads[node].LastUsers[NdUploads[node].num],name);
  NdUploads[node].num +=1; 
}
   
void ShowLastUploads(struct Window *Win)
{
   register int i=0;
   SetAPen(Win->RPort,1);
   while(i<5)
   {
      PrintMyText(Win->RPort,LastBlank,340,155+(i*10)-110+(Theight*11));
      PrintMyText(Win->RPort,LastUploads[i],340,155+(i*10)-110+(Theight*11));
      i++;
   }
}
void ShowNdLastUploads(struct Window *Win,int node)
{
   register int i=0;
   SetAPen(Win->RPort,1);
   while(i<5)
   {
      PrintMyText(Win->RPort,LastBlank,340,155+(i*10)-110+(Theight*11));
      PrintMyText(Win->RPort,NdUploads[node].LastUsers[i],340,155+(i*10)-110+(Theight*11));
      i++;
   }
}
void RegLastDownloads(char *name,int node)
{
  register int i=0;
  static int num=0;
  RegNodeDownloads(name,node);
  if(num>0 && num<5)
  {
  if(!strcmp(LastDownloads[num-1],name))
    return;
  }
  if(num==5)
  {
    while(i<4)
    {
      strcpy(LastDownloads[i],LastDownloads[i+1]);
      i++;
    }
    num =4;
    strcpy(LastDownloads[num],name); 
    
  } else strcpy(LastDownloads[num],name);
  num +=1; 
}
void RegNodeDownloads(char *name,int node)
{
  register int i=0;
  if(NdDownloads[node].num>0 && NdDownloads[node].num<5)
  {
  if(!strcmp(NdDownloads[node].LastUsers[NdDownloads[node].num-1],name))
    return;
  }
  if(NdDownloads[node].num==5)
  {
    while(i<4)
    {

strcpy(NdDownloads[node].LastUsers[i],NdDownloads[node].LastUsers[i+1]);
      i++;
    }
    NdDownloads[node].num =4;
    strcpy(NdDownloads[node].LastUsers[NdDownloads[node].num],name); 
    
  } else strcpy(NdDownloads[node].LastUsers[NdDownloads[node].num],name);
  NdDownloads[node].num +=1; 
}
   
void ShowLastDownloads(struct Window *Win)
{
   register int i=0;
   SetAPen(Win->RPort,1);
   while(i<5)
   {
      PrintMyText(Win->RPort,LastBlank,340,155+(i*10)-110+(Theight*11));
      PrintMyText(Win->RPort,FilePart(LastDownloads[i]),340,155+(i*10)-110+(Theight*11));
      i++;
   }
}
void ShowNdLastDownloads(struct Window *Win,int node)
{
   register int i=0;
   SetAPen(Win->RPort,1);
   while(i<5)
   {
      PrintMyText(Win->RPort,LastBlank,340,155+(i*10)-110+(Theight*11));

PrintMyText(Win->RPort,FilePart(NdDownloads[node].LastUsers[i]),340,155+(i*10)-110+(Theight*11));
      i++;
   }
}

void InitCycles(void)
{
  register int i;
  for(i=0;i<5;i++)
  {
    strcpy(LastUsers[i],"                               ");
    strcpy(LastUploads[i],LastUsers[i]);
    strcpy(LastDownloads[i],LastUsers[i]);
  }
  InitNdCycles();
}

void InitNdCycles(void)
{
  register int i,x;
  for(x=0;x<9;x++)
  {
    for(i=0;i<5;i++)
    {
      strcpy(NdUser[x].LastUsers[i],"                               ");
      strcpy(NdUploads[x].LastUsers[i],"                               ");
      strcpy(NdDownloads[x].LastUsers[i],"                               ");
    }
    NdUser[x].num=0;
    NdUploads[x].num=0;
    NdDownloads[x].num=0;
  }
   
}
struct IntuiText t = {
  3,0,JAM2,0,0,NULL,NULL,NULL };
void PrintMyText(struct RastPort *RPort,char *text,int x,int y)
{
  t.IText=(UBYTE *)text;
  PrintIText(RPort,(struct IntuiText *)&t,x,y-6);
}