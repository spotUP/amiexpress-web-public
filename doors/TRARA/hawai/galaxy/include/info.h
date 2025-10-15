/*----------------------------------------------------------------------*/
/*	GetToolTypes By Galaxy/Tfa					*/
/*----------------------------------------------------------------------*/

/*--[ includes ]--------------------------------------------------------*/

#include <exec/ports.h>
#include <exec/libraries.h>
#include <workbench/workbench.h>
#include <libraries/dos.h>

/*--[ structs ]---------------------------------------------------------*/

struct Library *IconBase;
struct DiskObject *dobj;

/*--[ getinfo ]---------------------------------------------------------*/

int GetInfo(char temp[],char welcher_string[],char str[])
{
	char **oldtooltypes;
	char *s;
	dobj=GetDiskObject(temp);

	if(dobj)
	{
		oldtooltypes=dobj->do_ToolTypes;

		if(s=FindToolType(oldtooltypes,welcher_string))
		{
			strcpy(str,s);
			FreeDiskObject(dobj);
			return(0);
		}

		else

		{
			str[0]='\0';
			FreeDiskObject(dobj);
			return(-1);
		}

	}

	return(-2);
}
