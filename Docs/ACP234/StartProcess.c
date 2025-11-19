#include <exec/exec.h>
#include <exec/libraries.h>
#include <dos/dos.h>
#include <dos/dostags.h>
#include <clib/dos_protos.h>
#include <clib/exec_protos.h>

struct TagItem tags[]={ {SYS_Input,0},{SYS_Output,0},{SYS_Asynch,TRUE},{NP_StackSize,0},{NP_Priority,0},{TAG_DONE,0}};

extern struct Library *SysBase;
int StartProcess(char *s,ULONG Stack)
{
    tags[3].ti_Data=Stack;
    if(SystemTagList(s,tags)==-1)
    {
      return(0);
    }
    return(1);
}
