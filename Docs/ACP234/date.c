#include "version.h"

char *VerStr;
char *GetDate(void);
char *MyVerStr=MYVER;
char *ACPVer;
char *GetDate(void)
{
VerStr="$VER: Version "MYVER" ("__DATE__", "__TIME__")\0";
ACPVer="$VER: Version "MYVER" \0";
return(__DATE__);
}
