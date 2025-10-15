#include <exec/types.h>
#include <clib/exec_protos.h>
#include <misc/doorheader.h>
#include <misc/mygen.protos>
#include <fcntl.h>
#include	<time.h>
#include	<string.h>

long CODED=2498;
long DECODED=-702;
char REG[]="$SYSOP                                                                ";
char PAS[]="1%3";

long	DoSumCRC(char *Str,long Size)
{
	long usum = 0;

	while(Size--)
		usum+=*Str++;

	return(usum);
}

void DeCode (char *str,char *code)
{
char *p1,*p2 ;
	p1 = str ;
 p2 = code ;
 while (*p1 != '\0')
	{
		*p1 = (char) (*p1 - *p2) ;
		p1++ ;
		p2++ ;
		if (*p2 == '\0')
			p2 = code ;
	}
}

void Code (char *str,char *code)
{
	char *p1,*p2 ;
	p1 = str ;
	p2 = code ;
	while (*p1 != '\0')
		{
		*p1 = (char) (*p1 + *p2) ;
		p1++ ;
		p2++ ;
		if (*p2 == '\0')
			p2 = code ;
		}
}

void Reset(void)
{
	if(CODED==DoSumCRC(REG,strlen(REG)))
	{
		DeCode(REG,PAS);
		if(DECODED!=DoSumCRC(REG,strlen(REG)))
			ColdReboot();
	}
	else ColdReboot();
}

char *SysopName(char *REG)
{
	return(&REG[31]);
}

void Time(char *TimeString)
{
int i=0;
LONG t;
char *ptr;
char Day[3],Month[3],Year[3];
struct	tm	*s;

	ptr=TimeString;
	ptr++;i=0;
	while(ptr[0]!='.')
	{
		Day[i++]=ptr[0];
		ptr++;
	}
	Day[i]='\0';
	ptr++;i=0;
	while(ptr[0]!='.')
	{
		Month[i++]=ptr[0];
		ptr++;
	}
	Month[i]='\0';
	ptr++;i=0;
	while(ptr[0]!=')')
	{
		Year[i++]=ptr[0];
		ptr++;
	}
	Year[i]='\0';
	t=atol(Month);
	t++;
	if(t>12)
	{
		t=1;
		sprintf(Month,"%ld",t);
		t=atol(Year);
		t++;
		sprintf(Year,"%ld",t);
	}
	else
	{
		sprintf(Month,"%ld",t);
	}
	time(&t);
	s=localtime(&t);
	if(atol(Year)<s->tm_year) //are we a year further -> reset
		ColdReboot();
	else
		if(atol(Year)==s->tm_year) //are we in the same year
			if(atol(Month)<s->tm_mon+1) // are we in a month further then limit -> reset
				ColdReboot();
			else
				if(atol(Month)==s->tm_mon+1) // are we in the same month
					if(atol(Day)<s->tm_mday) // are we some days further -> reset
						ColdReboot();
}
