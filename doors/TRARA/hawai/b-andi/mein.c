#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <fcntl.h>
#include <dos/dos.h>
#include <dos.h>
#include <proto/dos.h>
#include <ctype.h>
#include <exec/types.h>  /* STRPTR         */
#include <exec/ports.h>  /* struct Message */
#include <exec/memory.h> /* MEMF_PUBLIC    */
#include <exec/nodes.h>  /* NT_MESSAGE     */
#include <exec/libraries.h>
#include <proto/exec.h>

#define MAX 1

struct FileInfoBlock *Fib;
struct FileInfoBlock	*fib;

void output(void);
int read_dir(char *str);
void Test_Input(void);
void clear(void);

int Eintrag=NULL;

void main(int argc,char **argv)
	{
	read_dir(argv[1]);
	exit(0);
	}

int read_dir(char *str)
	{
	BPTR FLock;
	int array=NULL;
	if(FLock = Lock(str,ACCESS_READ))
		{if(Fib=malloc(MAX * (sizeof(struct FileInfoBlock))))
			{if(fib=malloc(sizeof(struct FileInfoBlock)))
				{if(Examine(FLock,fib))
					{Fib[0].fib_FileName[0]=(char) 124;
					 while(ExNext(FLock,fib))
						{	Test_Input();
						}
					}free(fib);
				}output();
				 free(Fib);
			}UnLock(FLock);
		}else return(0);
	return(1);
	}

void clear()
	{
	int i=NULL;
	while(i++<MAX-1)	Fib[i].fib_FileName[0]='\0';
	}

void output()
	{
	int array=NULL;
	while(array++<Eintrag)
		printf("Name.%3d : %s\n",array,Fib[array-1].fib_FileName);
	}

void Test_Input()
	{
	int anfang=NULL,
			ende=MAX-1,
			e=NULL,
			this,
			search;
	ende=Eintrag;
	Eintrag++;
	Fib=realloc(Fib,Eintrag*sizeof(struct FileInfoBlock));
	while(anfang<ende)
		{ if((this=(int) tolower(fib[0].fib_FileName[e]) <= (search=(int) tolower(Fib[anfang].fib_FileName[e]))))
				{	while(ende>=anfang)
						{	CopyMem(&Fib[ende-1],&Fib[ende],sizeof(struct FileInfoBlock));
							ende--;
						}
					CopyMem(&fib[0],&Fib[anfang],sizeof(struct FileInfoBlock));
					return;
				}
		anfang++;
		}
	CopyMem(&fib[0],&Fib[anfang],sizeof(struct FileInfoBlock));
	}
