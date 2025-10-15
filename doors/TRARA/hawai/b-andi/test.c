
char *s;

long read_file(char *str)
{
BPTR Flock,f1;
long Laenge=NULL;
struct FileInfoBlock *Fib;
s=NULL;

if((Fib = (struct FileInfoBlock *)AllocDosObject(DOS_FIB,NULL)))
{
	if((Flock = Lock(str,ACCESS_READ)))
	{
		if((Examine(Flock,Fib)))
		{
			if(s=malloc(Fib->fib_Size+1000))
			{
				if(f1=Open(str,MODE_OLDFILE))
				{
					Laenge=Read(f1,s,Fib->fib_Size+900);
					s[Laenge]='\0';
					Close(f1);
				}

			}

		else Laenge=-1;
		}

	UnLock(Flock);
	}

FreeDosObject(DOS_FIB,Fib);
}

return(Laenge);
}
