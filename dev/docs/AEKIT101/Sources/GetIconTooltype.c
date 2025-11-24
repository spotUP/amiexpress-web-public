
BOOL GetIconTooltype(IconName, ToolType ,ReturnStr)

    IconName:   Name of the Icon WITHOUT the .info
    ToolType:   Wanted Icon-Tooltype
    ReturnStr:  Returned Icon-Tooltype

This routine returns a BOOLEAN value:
    
    0 = ToolType NOT found
    1 = ToolType found


EXAMPLE:
~~~~~~~~
 Node1.info :     Node.1=HELLO

 CALL       :     found=GetIconTooltype("BBS:Node1", "Node.1", string);
 
 RETURN     :     string="HELLO"
                  found=TRUE (1)


The following MUST be included in your source:

==============================================================================

#include <proto/icon.h>
#include <dos/dos.h>
#include <ctype.h>

/***[ Structures ]***********************************************************/

struct Library *IconBase=NULL;
struct DiskObject *dobj;

/***[ Main ]*****************************************************************/

void Main(void)  
{
  .
  .
  IconBase=(struct Library *) OpenLibrary("icon.library", 33);
  if (!IconBase)
  {
    printf("Cannot open icon.library!\n\n");
    exit(0);
  }
  start();
  CloseLibrary((struct Library *)IconBase);
  DExit();
}

/****************************************************************************/

BOOL GetIconTooltype(char *IconName, char *text, char *buffer)
{
   dobj = GetDiskObject(IconName);
   if (dobj==NULL) DExit();
   toolarray = (char **)dobj->do_ToolTypes;
   if (tooltype=FindToolType(toolarray, text))
   {
     strcpy(buffer,tooltype);
     FreeDiskObject(dobj);
     return(1);
   }
   else
   {
     buffer=NULL;
     FreeDiskObject(dobj);
     return(0);
   }
}

==============================================================================
