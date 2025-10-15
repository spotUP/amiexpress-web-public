/************************** includes *****************************/
#include <amiex/Bull.h>
#include <fcntl.h>
#include <amiex/info.h>
/************************* voids *********************************/
void bull_zeigen(void);
void space(char Enterstring[]);
void main(int argc,char **argv);
int INF(char str[],int zeigen);
int INF1(char str[]);
void wb(char STR[]);

int level;
/********************** main() ***********************************/
void main(int argc,char **argv)
	{
        if(argc<2)
        	{
		puts("/X Door!from Byteandi/AFL\n");
		exit(1);
		};
        DoorStart(argv[1]);
	change("9\n",0,163);
	inoutput("\tView Bulletins with Bullview V1.2\n",150);
	IconBase = OpenLibrary ("icon.library",0L) ;
	if (IconBase == NULL)   wb("\n\rerror......") ;
	bull_zeigen();	
	CloseStuff();
	exit(1);
	}

/******************** bull zeigen **********************************/

void bull_zeigen()
	{
	char 	Bull[100],
			Bulltext[50],
			Enterstring[200],
			str[200],
			Zeigen[2];
	int  	zeigen=0,
			error;
	strcpy(Bull,"bulletins:bullhelp");
	change(Enterstring,1,105);
	level=atoi(Enterstring);
	change(Enterstring,1,131);
	space(Enterstring);
	zeigen=atoi(&(Enterstring[1]));
	do 
		{
		if(zeigen==0)
			{
			anzeige:
					error=access(Bull,0);
					if(!(error))	wb("cant find bulletins:bullhelp.txt\n\r");
					inoutput(Bull,7);
					inoutput("[34mBullviewer [0mV1.5 by [34mByteandi/AFL[0m\n\r",3);
					inoutput("[36mWhich Bulletin [32m([33m#[32m)[36m=Number, [32m([33mEnter[32m)[36m=none? [0m",3);
					Zeigen[0]='\0';
					error=JH_LI (Zeigen,2);
					zeigen=atoi(Zeigen);
					if(error==-1)	wb("droped....\n\r");
					if(zeigen==0)	wb("");
			}
		sprintf(str,"BULL.%d",zeigen);
		if(INF(str,level)!=0)	goto anzeige;
		sprintf(str,"RUN.%d",zeigen);
		INF1(str);
		sprintf(Bulltext,"Bulletins:Bull%d.txt.ansi",zeigen);
		if(access(Bulltext,0)!=0)	sprintf(Bulltext,"Bulletins:Bull%d.txt",zeigen);;
		if(access(Bulltext,0)!=0) goto anzeige;
		inoutput(Bulltext,8);
		inoutput("[0m\n\rPress ReTuRn...",3);
		Zeigen[0]='\0';
		if(JH_HK(Zeigen)==-1) wb("");
		if(zeigen>0) { zeigen=0; goto anzeige; }
		else wb("");
		}
	while(strlen(Zeigen)>0);
	}

void space(char Enterstring[])
	{
	char str1[20];
	int	help=0,
		help1=0;
	strcpy(str1,"                   ");
	while(Enterstring[help]!='\0')
		{
		if(Enterstring[help]!=' ')
			{
			str1[help1]=Enterstring[help];
			help1++;
			}
		help++;
		}
	str1[help1]='\0';
	strcpy(Enterstring,"                   ");
	strcpy(Enterstring,str1);
	}

int INF(char str[],int zeigen)
	{
	char str2[100];
	GetInfo("doors:bullview",str,str2);
	if(level>=atoi(str2))	return(0);
	else	return(-1);
	}

int INF1(char str[])
	{
	char str2[200];
	GetInfo("doors:bullview",str,str2);
	if(strlen(str2)>0)	
		{ 
		inoutput("\n\r  Wait....Updating.....",3);
		if(system(str2)!=0)	wb("\n\rThere is an ERROR....Please Inform the Sysop...\n\r");		
		return(0); 
		}
	else	return(-1);
	}

void wb(char STR[])
	{
	inoutput(STR,3);
	CloseLibrary(IconBase);
	CloseStuff();
	exit(1);
	}
