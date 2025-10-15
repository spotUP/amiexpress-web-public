/*----------------------------------------------------------------------*/
/*	BullView V1.5 Coded By ByteAndi/Trsi				*/
/*	Updated To V2.5 By Galaxy/Ind					*/
/*----------------------------------------------------------------------*/

/*--[ includes ]--------------------------------------------------------*/

#include <dh1:private/amiex/galaxy/include/bull.h>
#include <dh1:private/amiex/galaxy/include/info.h>
#include <fcntl.h>

/*--[ voids ]-----------------------------------------------------------*/

void main(int argc,char **argv);
void showbull(void);
void showreturn(void);
void space(char Enterstring[]);
void wb(char STR[]);

/*--[ ints ]------------------------------------------------------------*/

int INF1(char str[]),zeigen=0,page=1;

/*--[ chars ]-----------------------------------------------------------*/

char Bull[100],Bulltext[50],Enterstring[200],str[200],Zeigen[2],Message[200];

/*--[ main ]------------------------------------------------------------*/

void main(int argc,char *argv[])
{
	if(argc<2)
	{
		puts("\rBullView\n\n\rV1.5 Coded By Byteandi/Trsi\n\rV2.5 Coded By Galaxy/Ind\r");
		exit(1);
	};

        DoorStart(argv[1]);
	change("9\n",0,163);
	inoutput("\tUser Viewed The Bulletins With BullView V2.5!\n",150);

	IconBase=OpenLibrary("icon.library",0L);

	if(!IconBase)
		wb("\n\rError ...\r");

	showbull();
	CloseStuff();
	exit(1);
}

/*--[ bull zeigen ]-----------------------------------------------------*/

void showbull()
{
	change(Enterstring,1,131);
	space(Enterstring);
	Enterstring[4]='\0';
	zeigen=atoi(&(Enterstring[1]));

	do
	{
		if(zeigen==0)
		{

			loop:
			if(page==0)
				page++;

			sprintf(Bull,"Bulletins:BullHelp%i.Txt.Gr",page);

			if(access(Bull,0)==-1)
			{

				sprintf(Bull,"Bulletins:BullHelp%i.Txt",page);

				if(access(Bull,0)==-1)
				{
					page--;
					goto loop;

				}

			}

			inoutput(Bull,8);
			inoutput("\n\r[36mBullView - [0mV1.5 [34mBy [35mByteAndi/Trsi [34m& [0mV2.5 [34mBy [35mGalaxy/Ind[0m\n\r",3);
			inoutput("\r[36mWhich Bulletin [35m([37m0-9[35m)[36m=Number, [35m([37m+/-[35m)[36m=Pages, [35m([37mEnter[35m)[36m=None?[0m ",3);
			Zeigen[0]='\0';

			if(JH_LI(Zeigen,3)==-1||Zeigen[0]==0)
				wb("\r");

			zeigen=atoi(Zeigen);

			switch(Zeigen[0])
			{
				case'+':page++;goto loop;break;
				case'-':page--;goto loop;break;

			}

		}

		sprintf(str,"RUN.%d",zeigen);
		INF1(str);

		sprintf(Bulltext,"Bulletins:Bull%d.Txt.Gr",zeigen);

		if(access(Bulltext,0)==0)
		{
			showreturn();

		}

		else
		{
			sprintf(Bulltext,"Bulletins:Bull%d.Txt",zeigen);

			if(access(Bulltext,0)==0)
			{
				showreturn();

			}

		}

		Zeigen[0]='X';
		zeigen=0;
	}

	while(strlen(Zeigen)>0);
}

/*--[ showreturn ]------------------------------------------------------*/

void showreturn()
{
	inoutput(Bulltext,8);
	inoutput("\n\r[0mPress Return! ",3);
	Zeigen[0]='\0';

	if(JH_HK(Zeigen)==-1)
		wb("\r");
}

/*--[ space ]-----------------------------------------------------------*/

void space(char Enterstring[])
{
	char str1[10];
	int help=0,help1=0;
		/*   01234567890123456789*/
	strcpy(str1,"     ");
	while(Enterstring[help]!='\0')
	{
		if(Enterstring[help]!=' ')
		{
			if(help1!=3)
			{
				str1[help1]=Enterstring[help];
				help1++;
			}

		}

		help++;
	}

	str1[help1]='\0';
	strcpy(Enterstring,"     ");
	strcpy(Enterstring,str1);
}

/*--[ inf1 ]------------------------------------------------------------*/

int INF1(char str[])
{
	char str2[200];
	GetInfo("Doors:Gxy_Tools/BullView",str,str2);

	if(strlen(str2)>0)
	{
		inoutput("\n\r[0mWait, Updating! ",3);

		if(system(str2)!=0)
			wb("\n\r[0mThere Is An Error! Please Inform The Sysop!\r");

		return(0);
	}

	else
		return(-1);
}

/*--[ wb ]--------------------------------------------------------------*/

void wb(char STR[])
{
	inoutput(STR,3);
	inoutput("\n\r[34mSpecialy Made For [35mDIABOLO [34mAnd [35mTOWER OF BABYLON [34mBulletinBoard Systems![0m\n\n\r",3);
	CloseLibrary(IconBase);
	CloseStuff();
	exit(1);
}
