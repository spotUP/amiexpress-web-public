#include <workbench/workbench.h>
#include <stdio.h>
#include <proto/all.h>
#include <exec/types.h>
#include <ctype.h>
#include <devices/timer.h>
#include <devices/serial.h>
#include <libraries/dos.h>
#include <intuition/intuition.h>
#include <exec/memory.h>
#include <exec/types.h>  /* STRPTR         */
#include <exec/ports.h>  /* struct Message */
#include <exec/memory.h> /* MEMF_PUBLIC    */
#include <exec/nodes.h>  /* NT_MESSAGE     */
#include <exec/libraries.h>

struct Library *IconBase;
struct DiskObject *dobj;

int GetInfo(char temp[],char welcher_string[],char str [])
	{
	char **oldtooltypes;
	char *s;
	dobj=GetDiskObject(temp);
	if(dobj)
		{
		oldtooltypes=dobj->do_ToolTypes;
		if(s=FindToolType(oldtooltypes,welcher_string))	{ strcpy (str,s); FreeDiskObject(dobj); return(0); }
		else {	str[0]='\0'; FreeDiskObject(dobj); return(-1); }
		}
	return(-2);
	}
