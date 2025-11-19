void Restrict(char *str)
{
   BPTR  FLock;
   int bad=TRUE;
   struct FileInfoBlock *FBlock;
   if((FLock=Lock(str,ACCESS_READ))!=0)
   {
     if((FBlock=AllocMem((long)sizeof(struct FileInfoBlock),MEMF_CHIP)) == NULL)
     { 
       bad=TRUE; 
     }
     else 
     { 
       if((Examine(FLock,FBlock))==0)
       {  
          
         bad=TRUE;  
       }
       else
       { 
     
           bad=FALSE;  
       }
       FreeMem(FBlock,sizeof(struct FileInfoBlock));
    }
    UnLock(FLock);
if(!bad) SetComment(str,"Restricted");
   }
    
}
void Backup(char *str,int cycle)
{
  BPTR fi,fo;
  char ch[10];
  int num;
  char im1[200];
  char im2[200];
  num=cycle;
  
  if(TLock(str))
  {
     while(cycle)
     {
       sprintf(im1,"%s{%d}",str,cycle);
       if(TLock(im1))
       {
          if(cycle==num)
          {  
            DeleteFile(im1); cycle -=1; continue; 
          }
          sprintf(im2,"%s{%d}",str,cycle+1);
          Rename(im1,im2);
          Restrict(im2);
       }
       cycle--;
     }
     sprintf(im1,"%s{1}",str);
     Rename(str,im1);
     fi=Open(im1,MODE_OLDFILE);
     fo=Open(str,MODE_NEWFILE);
     while(FRead(fi,(APTR)&ch,sizeof(char),1)!=NULL)
       Write(fo,(APTR)&ch,sizeof(char));
     Close(fo);
     Close(fi);
     Restrict(im1);
     Restrict(str);
  }
}
            