#include <exec/types.h>
#include <intuition/intuition.h>

#include <clib/exec_protos.h>
#include <clib/intuition_protos.h>

#include <stdio.h>


struct EasyStruct myES=
{
   sizeof(struct EasyStruct),
   0,
   "ACP Notification",
   0,
   "Continue",
};
extern struct IntuitionBase *IntuitionBase;

void myrequest(char *s)
{
     myES.es_TextFormat=(APTR)s;
     EasyRequest(NULL,&myES,NULL);


}
