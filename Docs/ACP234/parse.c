#include <exec/types.h>
#include <string.h>


struct PSTR
{
  int s1;
  int s2;
  int ns;
  int ne;
};

int ParseImage(char *str,struct PSTR *p)
{
  register int i;
  int returncode=0;
  if(!strnicmp(str,"Node",4))
  {
    if(*(str+4)=='*') { p->ns=0;p->ne=9; }
    else { p->ns=(*(str+4))-'0';p->ne=p->ns; } 
    returncode=1;
    i=5;
    p->s2=0;
    p->s1=0;
    while(*(str+i)!='\0')
    {
      if(*(str+i)!=' ')
      { 
          p->s1=i; break;
      }
      i++;
    }
    while(*(str+i)!='\0')
    {
      if(*(str+i)==' ') break;
      i++;
    }
    while(*(str+i)!='\0')
    {
      if(*(str+i)!=' ')
      {
        p->s2=i; break;
      }
      i++;
    }
  }
    return(returncode);
}