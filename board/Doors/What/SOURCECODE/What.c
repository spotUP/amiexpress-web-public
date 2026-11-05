/*
** $VER: What.c - Transfer Activities v2.0 (01-Jan-96)
**
** Main
**
** (c) Copyright 1994/95 Bobo/Mystic.
**     All Rights Reserved.
**
** Application: Transfer Activities v2.0
** Language:    SAS/C v6.50
**
** This sourcecode is free to use. However, you are not allowed to
** make any changes at all in this code without permission from
** the auther. You are not allowed to remove my name from the design.
**
** This version won't probably be updated. If you are interested in
** updating WHAT, please contact me.
*/

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <proto/dos.h>
#include <proto/icon.h>
#include <proto/exec.h>
#include <exec/semaphores.h>
#include <time.h>
#include "amiexpress.h"
#include "structure.h"

UBYTE *version = "$VER: Transfer Activities v"VER" ("DATE")";

char *status[]={
  "Beginning DL..",  // ST_BEGDL
  "DL'ing file...",  // ST_DLING
  "Download - OK!",  // ST_DLOK
  "Beginning UL..",  // ST_BEGUL
  "Uploading file",  // ST_ULING
  "Uploaded - OK!",  // ST_ULOK
  "Starting HYDRA",  // ST_HYDRA
  "Hydra UL - OK!",  // ST_HYDULOK
  "Hydra DL - OK!",  // ST_HYDDLOK
  "Hydra UL'ing..",  // ST_HYDULING
  "Hydra DL'ing.."   // ST_HYDDLING
    };

struct SinglePort *SingleNode;
struct MultiPort *Nodes;

struct Library *IconBase;

APTR Singles[32];
char bbspath[100];

struct List *GetFiles(char *);
struct List *GetDownloadList(const char *);
char *GetLastEntry(const char *);
void GetPlaypenDir(int,char *);
void OutStatusLine(int,const char *,char,const char *,const char *,int);
void MyDateInsert(struct List *,struct File *);
void ClearList(struct List *);
void getsemaphores(void);
char *CenterText(const char *,char *,int);
char *fixbytes(int);
void end(void);

//============================================================================
// Main (start)
//============================================================================
void main(int argc,char **argv)
{
struct List *FileList,*FileListNew;
struct File *FileNode;
int totulbytes=0,totulfiles=0;
int totdlbytes=0,totdlfiles=0;
char temp[100];
char *pt;
int act=0;                      // TRANSFER ACTICIVITES
int i;

  // started in CLI (missing node argument)
  if(argc<2) exit(0);

  DoorStart(argv[1]);

  // missing icon.library
  if((IconBase=OpenLibrary("icon.library",36L))==NULL) end();

  putuserstring(177,WRITE,"WHAT v"VER"");
  getuserstring(bbspath,128);

  sendmessage("\r\n[34m.----------------------------------------------------------------------------.\r\n");
  sendmessage("[34m| [33mWHAT: Transfer Activities v"VER" ["TEXT"] Copyright (c)1994-95 Bobo/Mystic![34m |\r\n");
  sendmessage("[34m|--v----------------------v----------------v--------------v-----------v------|\r\n");
  sendmessage("[34m|[0mNd[34m| [0mUsername (Handle)[34m    | [0mStatus/Action[34m  | [0mFile(s)[34m      | [0mFilesize[34m  | [0mCPS[34m  |\r\n");
  sendmessage("[34m|--+----------------------+----------------+--------------+-----------+------|[0m\r\n");

  putuserstring(150,WRITE,"\tTransfer Activities v"VER" by Bobo/Mystic\n");
  getsemaphores();

  for(i=0;i<32;i++)
  {
   ObtainSemaphore((struct SignalSemaphore *)Singles[i]);
   SingleNode=(struct SinglePort *)Singles[i];

   if(act>0&&(SingleNode->Status==1||SingleNode->Status==2||(SingleNode->Status==3&&stricmp(SingleNode->Misc1,"AEHYDRA")==NULL)))
   {
    sendmessage("[34m|--+----------------------+----------------+--------------+-----------+------|[0m\r\n");
   }

   switch(SingleNode->Status)
   {
    case 1: /* USER IS DOWNLOADING A FILE */
            act++;

            if(SingleNode->Misc1[0]==NULL)     // DOWNLOADING NOT STARTED YET
            {
             OutStatusLine(i,SingleNode->Handle,ST_BEGDL,"","",0);
             break;
            }
            sprintf(temp,"%sNode%d/UDLog",bbspath,i);
            if((pt=GetLastEntry(temp))==NULL) break;

            FileList=GetDownloadList(pt);
            free(pt);

            if(FileList==NULL) break;

            FileNode=(struct File *)FileList->lh_Head;
            while(FileNode->en_Node.ln_Succ)
            {
             if(stricmp(FileNode->filename,SingleNode->Misc1)==NULL) OutStatusLine(i,SingleNode->Handle,ST_DLING,FileNode->filename,fixbytes(FileNode->filesize),FileNode->cps);
             else
             {
              totdlbytes+=FileNode->filesize; totdlfiles++;
              OutStatusLine(i,SingleNode->Handle,ST_DLOK,FileNode->filename,fixbytes(FileNode->filesize),FileNode->cps);
             }
             FileNode=(struct File *)FileNode->en_Node.ln_Succ;
            }

            ClearList(FileList);
            break;
    case 2: /* USER IS UPLOADING A FILE */
            act++;

            if(SingleNode->Misc1[0]==NULL)     // UPLOADING NOT STARTED YET
            {
             OutStatusLine(i,SingleNode->Handle,ST_BEGUL,"","",0);
             break;
            }

            GetPlaypenDir(i,temp);
            FileList=GetFiles(temp);
            if(FileList==NULL) break;

            FileNode=(struct File *)FileList->lh_Head;
            while(FileNode->en_Node.ln_Succ)
            {
             if(stricmp(FileNode->filename,SingleNode->Misc1)==NULL) OutStatusLine(i,SingleNode->Handle,ST_ULING,FileNode->filename,"",FileNode->cps);
             else
             {
              totulbytes+=FileNode->filesize; totulfiles++;
              OutStatusLine(i,SingleNode->Handle,ST_ULOK,FileNode->filename,fixbytes(FileNode->filesize),FileNode->cps);
             }
             FileNode=(struct File *)FileNode->en_Node.ln_Succ;
            }

            ClearList(FileList);
            break;
    case 3: /* USER IS USING A DOOR (AEHYDRA?) */

            if(stricmp(SingleNode->Misc1,"AEHYDRA")==NULL)
            {
             act++;

             sprintf(temp,"%sNode%d/Partupload",bbspath,i);

             FileListNew=GetFiles(temp);
             if(FileListNew)
             {
              sprintf(temp,"%sNode%d/Playpen",bbspath,i);
              FileList=GetFiles(temp);

              FileNode=(struct File *)FileList->lh_Head;
              while(FileNode->en_Node.ln_Succ)
              {
               totulbytes+=FileNode->filesize; totulfiles++;
               OutStatusLine(i,SingleNode->Handle,ST_HYDULOK,FileNode->filename,fixbytes(FileNode->filesize),FileNode->cps);

               FileNode=(struct File *)FileNode->en_Node.ln_Succ;
              }
              FileNode=(struct File *)FileListNew->lh_TailPred;
              OutStatusLine(i,SingleNode->Handle,ST_HYDULING,FileNode->filename,"",FileNode->cps);

              ClearList(FileListNew);
              ClearList(FileList);
             }

             sprintf(temp,"%sNode%d/UDLog",bbspath,i);
             if((pt=GetLastEntry(temp))==NULL) break;

             FileList=GetDownloadList(pt);
             free(pt);

             if(FileList==NULL) break;

             FileNode=(struct File *)FileList->lh_Head;
             while(FileNode->en_Node.ln_Succ)
             {
              if(FileList->lh_TailPred==(struct Node *)FileNode) OutStatusLine(i,SingleNode->Handle,ST_HYDDLING,FileNode->filename,fixbytes(FileNode->filesize),FileNode->cps);
              else
              {
               totdlbytes+=FileNode->filesize; totdlfiles++;
               OutStatusLine(i,SingleNode->Handle,ST_HYDDLOK,FileNode->filename,fixbytes(FileNode->filesize),FileNode->cps);
              }
              FileNode=(struct File *)FileNode->en_Node.ln_Succ;
             }
             ClearList(FileList);
            }
            break;
   }
   ReleaseSemaphore((struct SignalSemaphore *)Singles[i]);
  }

  if(act==0) sendmessage("[34m|          [33m- NO TRANSFER ACTIVITIES -[34m                                        |[0m\r\n");

  sendmessage("[34m|--^----------------------^----------------^--------------^-----------^------|\r\n");
  sendmessage("[34m| [0mUpload   Activities [37m-> [33mTotal files[0m: [32m[ [0m%3d[32m ]   [33mTotal bytes[0m: [32m[ [0m%11s[32m ][34m |\r\n",totulfiles,fixbytes(totulbytes));
  sendmessage("[34m| [0mDownload Activities [37m-> [33mTotal files[0m: [32m[ [0m%3d[32m ]   [33mTotal bytes[0m: [32m[ [0m%11s[32m ][34m |\r\n",totdlfiles,fixbytes(totdlbytes));
  sendmessage("[34m`----------------------------------------------------------------------------'[0m\r\n\r\n");

  CloseLibrary(IconBase);
  end();
}

//============================================================================
// Output status lines
//============================================================================
void OutStatusLine(int node,const char *un,char action,const char *file,const char *size,int cps)
{
char cpsrate[100];
char sc=32;      // 32 = SPACE

  strcpy(cpsrate," -");

  switch(action)
  {
   case ST_ULING   :
   case ST_HYDULING: if(cps>0) stci_d(cpsrate,cps);
   case ST_DLING   :
   case ST_HYDDLING: sc='*';
                     break;
   case ST_BEGDL   :
   case ST_BEGUL   :
   case ST_HYDRA   : sc='#';
                     break;
   default: sc=32;
            break;
  }

  sendmessage("[34m|[0m%2d[34m| [32m%-20.20s[34m |[33m%c[35m%-14s[34m | [36m%-12.12s[34m | [32m%9s[34m | [0m%-4s[34m |[0m\r\n",node,un,sc,status[action],file,size,cpsrate);
}

//============================================================================
// Get Playpen Directory
//============================================================================
void GetPlaypenDir(int node,char *dt)
{
struct DiskObject *bbsicon;
char temp[100];
char *str;

  sprintf(temp,"%sNode%d",bbspath,node);
  if((bbsicon=GetDiskObject(temp)))
  {
   if((str=FindToolType(bbsicon->do_ToolTypes,"PLAYPEN"))) strcpy(dt,str);
   FreeDiskObject(bbsicon);
  }
  if(str==NULL) sprintf(dt,"%sNode%d/Playpen",bbspath,node);
}

//============================================================================
// Get downloads from callerslog/udlog
//============================================================================
struct List *GetDownloadList(const char *pt)
{
struct List *mylist;
struct File *mynode;
char temp[100];
char file[100];
char filepth[100];
char *pos=NULL;
int i=0,x,tmp,len;

  while(pt[i])
  {
   for(tmp=i,x=0;pt[i]!='\n'&&pt[i]!=NULL;i++,x++) temp[x]=pt[i];
   temp[x]=NULL; i++;

   if((pos=strstr(temp,"Downloading"))!=NULL)
   {
    while(pt[i])
    {
     for(x=0;pt[i]!='\n'&&pt[i]!=NULL;i++,x++) temp[x]=pt[i];
     temp[x]=NULL; i++;

     if(strstr(temp,"Downloading")==NULL) { tmp=NULL; break; }
    }
    if(pt[i]==NULL) break;
   }
   tmp=NULL;
  }

  if(tmp==NULL) return(NULL);

  mylist=calloc(1,sizeof(struct List));
  NewList(mylist);

  while(pt[tmp])
  {
   for(x=0;pt[tmp]!='\n'&&pt[tmp]!=NULL;tmp++,x++) temp[x]=pt[tmp];
   temp[x]=NULL; tmp++;

   for(i=13,x=0;temp[i]!=' '&&temp[i];i++,x++) filepth[x]=temp[i];
   filepth[x]=NULL;

   if(temp[i]==NULL) continue;

   stcgfn(file,filepth);
   strupr(file);

   len=atoi(&temp[++i]);
   if(len<=0||strlen(file)<=0) continue;

   mynode=calloc(1,sizeof(struct File));
   strcpy(mynode->filename,file);
   mynode->filesize=len;
   mynode->date=mynode->cps=0;

   AddTail(mylist,(struct Node *)mynode);
  }

  return(mylist);
}

//============================================================================
// Get the last entry in callerslog (udlog)
//============================================================================
char *GetLastEntry(const char *log)
{
FILE *fp;
char *pt;
char temp[100];
int readlen=0;
int length=0;
int pos=0;
char *p;

  if((fp=fopen(log,"rb"))==NULL) return(NULL);

  fseek(fp,0,SEEK_END);
  length=ftell(fp);

  pos=(length-62);
  if(pos<=100) { fclose(fp); return(NULL); }

  fseek(fp,pos,SEEK_SET);

  while(1)
  {
   fgets(temp,sizeof(temp),fp);

   p=strchr(temp,'\n');
   if(p==NULL) break;

   if(temp[0]=='*'&&*(p-1)=='*')
   {
    readlen=length-ftell(fp);
    if(readlen<=0) break;

    pt=malloc(readlen+1);
    if(pt==NULL) { pos=0; break; }

    fread(pt,readlen,1,fp);
    pt[readlen]=NULL;

    break;
   }

   pos-=62;
   if(pos<=0) break;

   fseek(fp,pos,SEEK_SET);
  }
  fclose(fp);

  if(readlen<=0) return(NULL);
  return(pt);
}

//============================================================================
// Get a directory sorted after date into a list
//============================================================================
struct List *GetFiles(char *d)
{
struct List *mylist;
struct File *mynode;
struct FileInfoBlock info;
BPTR FLock;
long t;

  if((FLock=Lock(d,SHARED_LOCK))==NULL||(Examine(FLock,&info))==NULL)
  {
   if(FLock) UnLock(FLock);
   return(NULL);
  }

  mylist=calloc(1,sizeof(struct List));
  NewList(mylist);

  if(info.fib_DirEntryType>0)
  {
   while(ExNext(FLock,&info))
   {
    if(info.fib_DirEntryType<0)
    {
     mynode=calloc(1,sizeof(struct File));
     strcpy(mynode->filename,info.fib_FileName);
     strupr(mynode->filename);

     mynode->filesize=info.fib_Size;
     mynode->date=(info.fib_Date.ds_Days*86400)+(info.fib_Date.ds_Minute*60)+(info.fib_Date.ds_Tick/50);

     MyDateInsert(mylist,mynode);
    }
   }
  }
  UnLock(FLock);

  if(IsListEmpty(mylist)) { free(mylist); return(NULL); }

  time(&t);
  t-=252482400;

  mynode=(struct File *)mylist->lh_Head;
  while(mynode->en_Node.ln_Succ)
  {
   if(mylist->lh_TailPred==(struct Node *)mynode)
   {
    mynode->cps=(t-mynode->date);
    mynode->cps=(mynode->filesize/mynode->cps);
   }
   else mynode->cps=0;

   mynode=(struct File *)mynode->en_Node.ln_Succ;
  }
  return(mylist);
}

//============================================================================
// Date insert in list
//============================================================================
void MyDateInsert(struct List *mylist,struct File *mynode)
{
struct File *tmp;

  if(IsListEmpty(mylist)) AddHead(mylist,(struct Node *)mynode);
  else
  {
   tmp=(struct File *)mylist->lh_Head;
   while(tmp->en_Node.ln_Succ)
   {
    if(mynode->date<tmp->date)
    {
     Insert(mylist,(struct Node *)mynode,tmp->en_Node.ln_Pred);
     break;
    }
    tmp=(struct File *)tmp->en_Node.ln_Succ;
   }
   if(tmp->en_Node.ln_Succ==NULL) AddTail(mylist,(struct Node *)mynode);
  }
}

//============================================================================
// Clear a list
//============================================================================
void ClearList(struct List *mylist)
{
struct Node *mynode,*tmp;

  if(mylist)
  {
   if(IsListEmpty(mylist)==NULL)
   {
    mynode=(struct Node *)mylist->lh_Head;

    while(mynode->ln_Succ)
    {
     tmp=(struct Node *)mynode->ln_Succ;
     free(mynode);
     mynode=tmp;
    }
   }
   free(mylist);
   mylist=NULL;
  }
}

//============================================================================
// Get semaphore pointers
//============================================================================
void getsemaphores(void)
{
int i;

  putuserstring(531,READ,"");    // GET SEMEPHORE POINTER TO MSG STRUCTURE
  Nodes=(struct MultiPort *)msg.Semi;
  ObtainSemaphore((struct SignalSemaphore *)Nodes);

  for(i=0;i<32;i++) Singles[i]=Nodes->MyNode[i].s;

  ReleaseSemaphore((struct SignalSemaphore *)Nodes);
}

//============================================================================
// Center a string
//============================================================================
char *CenterText(const char *s,char *d,int len)
{
int i,x,pos;

  if(s==NULL||d==NULL||len<=0) return(NULL);

  pos=(len/2)-(strlen(s)/2);
  if(pos<0) return(NULL);

  for(i=0;i<pos;i++) d[i]=32;

  for(x=0;s[x];x++,i++) d[i]=s[x];

  for(;i<len;i++) d[i]=32;
  d[i]=NULL;

  return(d);
}

//============================================================================
// Fix upload bytes
// Routine by LOOBY/INSANE
//============================================================================
char *fixbytes(int byte)
{
static char temp[100];
char byt[15];
int len,x,mark;

  stcul_d(byt,byte);
  len=strlen(byt);

  if(len<=3) mark=len-1;
  else
  if(len<=6) mark=len;
  else
  if(len<=9) mark=len+1;
  else mark=len+2;

  temp[mark+1]=NULL;

  for(x=--len;x>=0;x--)
  {
   temp[mark--]=byt[x];
   if((x==len-2||x==len-5||x==len-8)&&x!=0) temp[mark--]='.';
  }
  return((char *)&temp[0]);
}

//============================================================================
// End (quit and return to express)
//============================================================================
void end(void)
{
  CloseDoor();
  exit(0);
}
