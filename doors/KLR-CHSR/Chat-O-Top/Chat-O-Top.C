/*************************************************************************

                                CHAT-O-TOP

         Small utility that is able to generate bulletins based up
              a data file that is created with CHAT-O-METER.

                       (c) 1995 by KiLLraVeN/MYSTiC

 *************************************************************************

             This source can be compiled with NO startup-code!

                  Last Revision: Fri Jun 23 14:09:10 1995

 *************************************************************************/

#define CHAT_O_TOP

#include <exec/types.h>
#include <exec/lists.h>
#include <exec/memory.h>

#include <stdio.h>
#include <string.h>

#include <clib/exec_protos.h>
#include <clib/dos_protos.h>

#include <pragmas/exec_pragmas.h>
#include <pragmas/dos_pragmas.h>

struct CHATTOP
{
	ULONG	Time;						/* Total chat time			*/
	ULONG	Chats;					/* Total number of chats	*/
};

struct USERTOP
{
	struct 	Node	ut_Node;				/* For structure reference */
	char		ut_Name[ 32 ];				/* Name of user 				*/
	char		ut_Location[ 31 ];		/* Location of user			*/
	ULONG		ut_Time;						/* Chat time of user			*/
	ULONG		ut_Chats;					/* Number of chats			*/
	ULONG		ut_Avg;						/* Average time/chat			*/
};

struct USER
{
   char    Name[31],Pass[9],Location[30],PhoneNumber[13];
   USHORT  Slot_Number;
   USHORT  Sec_Status, RatioType, Ratio, CompType, Messages_Posted;
   ULONG   NewSinceDate, CRCPassword, ConfRead2, ConfRead3;
   UWORD   vote_yesno;
   UWORD   voted;
   UWORD   reserved;
   UWORD   Area;
   UWORD   XferProtocol, Filler2;
   UWORD   Lcfiles, BadFiles;
   ULONG   AccountDate;
   UWORD   ScreenType, EditorType;
   char    Conference_Access[10];
   USHORT  Uploads, Downloads, ConfRJoin, Times_Called;
   long    Time_Last_On, Time_Used, Time_Limit, Time_Total;
   ULONG   Bytes_Download, Bytes_Upload, Daily_Bytes_Limit, Daily_Bytes_Dld;
   char    Expert;
   /* Note ConfYM = the last msg you actually read, ConfRead is the same ?? */
   ULONG   ConfYM1, ConfYM2, ConfYM3, ConfYM4, ConfYM5, ConfYM6, ConfYM7,
           ConfYM8, ConfYM9;
   long    BeginLogCall;
   UBYTE   Protocol, UUCPA, LineLength, New_User;
};

#define	TEMPLATE		"TO,FROM,H=HEADER/K,UD=USERDATA/K,B=BORDER/K,TOP/K/N,SORT/K/N,MIN=MINIMUM/K/N,NO_HEADER/S,NO_CLS/S,REVERSED/S"
#define	TEMPLATE_SIZE (11)

#define	TO_FILE	(0)
#define	DATAFILE (1)
#define	HEADER	(2)
#define	USERDATA (3)
#define	BORDER	(4)
#define	TOP		(5)
#define	SORT		(6)
#define	MIN		(7)
#define	NO_HEAD	(8)
#define	NO_CLS	(9)
#define	REVERSED	(10)

VOID  FreeNodes (struct List *);
VOID  MyExit( struct Library *, struct USER *, struct CHATTOP *, struct RDArgs *, struct List *, int );
VOID  myprintf( char * , char *, ...);
ULONG GetFileSize( struct Library * , char * );
VOID	PutInSortedList( struct List * , struct USERTOP * , ULONG , ULONG );
BOOL	MeetMinimum( struct USERTOP * , ULONG , ULONG );

char	VER[] = "$VER: Chat-O-Top 1.0.5 BETA!"__AMIGADATE__;

VOID main ( int argc , char *argv[] )
{
	struct	Library *DOSBase = OpenLibrary( "dos.library" , 37L );

	BPTR		fh;

	char		*buffer,
				temp[ 400 ];

	struct	MinList	ut_List;
	struct	USERTOP	*ut_Node, *ut_Worknode, *ut_Nextnode;
	struct	USER		*user_ptr, *userdata = NULL;
	struct	CHATTOP	*ct_ptr = NULL;

	struct 	RDArgs	*rdargs;

	LONG defaults[ TEMPLATE_SIZE ] =
	{
		(LONG) "*",
		(LONG) "PROGDIR:Chat-O-Top.Data",
		(LONG) "PROGDIR:Chat-O-Top.Header",
		(LONG) "BBS:User.Data",
		(LONG) "[34m",
		(LONG) NULL,
		(LONG) NULL,			/* Sort by Time */
		(LONG) NULL,
		(LONG) NULL
	};

	int	zeros[] = { 67 , 71 , 93 , 96 , 104 , 107 , 137 , 141 };

	STRPTR headers[] = { " %s.--- --- -- -  -    [36mcHAT-O-tOP [35muSER sTATiSTiCS [36mbY [32mtIME     %s-  - -- --- ---.\n |[73C|\n",
							   " %s.--- --- -- -  -    [36mcHAT-O-tOP [35muSER sTATiSTiCS [36mbY [32mcHATS    %s-  - -- --- ---.\n |[73C|\n",
							   " %s.--- --- -- -  -   [36mcHAT-O-tOP [35muSER sTATiSTiCS [36mbY [32maVERAGE   %s-  - -- --- ---.\n |[73C|\n",
								" %s|   [36m# Name[35m/[36mAlias           Location[35m/[36mGroup          Time      Chats   Avg  %s|\n |[73C|\n",
								" %s|[35m%4ld [0m%-20.20s %-19.19s  [32m%2ldd %2ldh %2ldm  [33m%5ld  [32m%2ld:%2ld %s|\n",
								" %s:-------------------------------------------------------------------------:\n | [35mOverall avg.: [36m%2ld:%2ld  [35mTotal time:[36m%3ldd %2ldh %2ldm  [33m(c) 1995 by KiLLraVeN/MST %s|\n `-------------------------------------------------------------------------'[0m\n" };

	/* Error reports */
	BYTE	nomemory[]       = "Not enough memory.\n";
	BYTE	nofile[]         = "Could not open: \"%s\".\n";
	BYTE  INCORRECT_ARGS[] = "Incorrect arguments.\n";

	ULONG		parameters[ TEMPLATE_SIZE ];
	ULONG		fsize;				/* file size */
	ULONG		ct_entries = 0,	/* Entries in chat-o-top.data */
				ud_entries = 0;	/* Entries in user.data       */
	ULONG		j , tot_time = 0 , tot_chat = 0;
	register ULONG	i;

	int		days , hours , mins , avgm , avgs ;

	/* If we have no dos.library we'll exit quietly */
	if ( ! DOSBase )
		Exit( 100 );

	/* Set default values */
	for ( i = 0 ; i < TEMPLATE_SIZE ; i++ )
		parameters[ i ] = defaults[ i ];

	/* Initialise the list */
	ut_List.mlh_Head     = (struct MinNode *) &ut_List.mlh_Tail;
	ut_List.mlh_Tail     = 0;
	ut_List.mlh_TailPred = (struct MinNode *) &ut_List.mlh_Head;

	/* Get the user's args */
	rdargs = ReadArgs( (STRPTR) TEMPLATE, (LONG *) parameters, NULL );

	/* Only continue if we have good args */
	if ( ! rdargs )
	{
		Printf( INCORRECT_ARGS );
		MyExit( DOSBase , userdata , ct_ptr , rdargs , ( struct List *) &ut_List , 20 );
	}

	/* If there is a SORT method given, check it's validity */
	if ( *((ULONG *) parameters[ SORT ] ) > 2 )
	{
		Printf( "\nValid SORT arguments range from 0 to 2.\n\n" );
		MyExit( DOSBase , userdata , ct_ptr , rdargs , ( struct List *) &ut_List , 20 );
	}

	/* Lock User.Data data file and get it's size */
	if ( fsize = GetFileSize( DOSBase , (STRPTR) parameters[ USERDATA ] ) )
		ud_entries = fsize / sizeof( struct USER );
	else
		MyExit( DOSBase , userdata , ct_ptr , rdargs , ( struct List *) &ut_List , 20 );

	/* Lock Chat-O-Top.Data file and get it's size */
	if ( fsize = GetFileSize( DOSBase , (STRPTR) parameters[ DATAFILE ] ) )
		ct_entries = fsize / sizeof( struct CHATTOP );
	else
		MyExit( DOSBase , userdata , ct_ptr , rdargs , ( struct List *) &ut_List , 20 );

	/* If there are more entries in the Chat-O-Top data file then there
	 * are in the User.Data, we will only check the Chat-O-Top data file
	 * for the number of entries in the User.Data
	 */
	if ( ud_entries < ct_entries )
		ct_entries = ud_entries;

	/* We will read the entire user.data in memory to speed it up
	 * a whole bit!
	 */
	if ( userdata = (struct USER *) AllocVec( ud_entries * sizeof( struct USER ) , MEMF_PUBLIC|MEMF_CLEAR ) )
	{
		fh = Open( (STRPTR) parameters[ USERDATA ] , MODE_OLDFILE );
		if ( ! fh )
		{
			Printf( nofile , (STRPTR) parameters[ USERDATA ] );
			MyExit( DOSBase , userdata , ct_ptr , rdargs , ( struct List *) &ut_List , 20 );
		}
		else
		{
			Read( fh , userdata , ud_entries * sizeof( struct USER ) );
			Close( fh );
		}
	}
	else
	{
		Printf( nomemory );
		MyExit( DOSBase , userdata , ct_ptr , rdargs , ( struct List *) &ut_List , 20 );
	}

	/* We will NOT read the entire Chat-O-Top.Data in memory because
	 * the time difference will not be that big and the executable
	 * will most likely be bigger.
	 */
	fh = Open( (STRPTR) parameters[ DATAFILE ] , MODE_OLDFILE );
  	if ( ! fh )
	{
		Printf( nofile , (STRPTR) parameters[ DATAFILE ] );
		MyExit( DOSBase , userdata , ct_ptr , rdargs , ( struct List *) &ut_List , 20 );
	}

	/* Allocate memory */
	ct_ptr = AllocVec( sizeof( struct CHATTOP ) , MEMF_PUBLIC|MEMF_CLEAR );
	if ( ct_ptr == NULL )
	{
		Printf( nomemory );
		MyExit( DOSBase , userdata , ct_ptr , rdargs , ( struct List *) &ut_List , 20 );
	}

	/* Add 3 dummy nodes to avoid problems with the sort-routine
	 * This is a flaw in the sort-routine, but this solves the 
	 * problem real simple and I don't have to write a new, better,
	 * complex and probably bigger sort-routine.
	 */
	for ( i = 0 ; i < 3 ; i ++ )
	{
		if ( ut_Node = AllocVec( sizeof( struct USERTOP ) , MEMF_PUBLIC|MEMF_CLEAR ) )
		{
			if ( parameters[ REVERSED ] )
			{
				ut_Node->ut_Time  = 234567890;
				ut_Node->ut_Chats = 223456790;
				ut_Node->ut_Avg	= 223456790;
			}
			AddTail( (struct List *) &ut_List , ( struct Node *) ut_Node );
		}
		else
		{
			Printf( nomemory );
			MyExit( DOSBase , userdata , ct_ptr , rdargs , ( struct List *) &ut_List , 20 );
		}
	}

	/* Main loop:
	 * ==========
	 * 1. Allocate memory for new node
	 * 2. Read Chat-O-Top data
	 * 3. Read User.Data
	 * 4. Add it to the sorted list
	 *
	 * But with the appropriate checks (if user is still active etc.).
	 */
	for ( i = 0 , user_ptr = userdata ; i < ct_entries ; i ++ , user_ptr ++ )
	{
		/* Allocate node */
		if ( ut_Node = AllocVec( sizeof( struct USERTOP ) , MEMF_PUBLIC|MEMF_CLEAR ) )
		{
			j = Read( fh , ct_ptr , sizeof( struct CHATTOP ) );
			if ( j > 0 )
			{
				if ( ct_ptr->Time != 0 &&
					  ct_ptr->Chats != 0 &&
					  user_ptr->Slot_Number != 0 )
				{
					strcpy( ut_Node->ut_Name , user_ptr->Name );
					strcpy( ut_Node->ut_Location , user_ptr->Location );
					ut_Node->ut_Time  = ct_ptr->Time;
					ut_Node->ut_Chats = ct_ptr->Chats;
					ut_Node->ut_Avg   = ut_Node->ut_Time / ut_Node->ut_Chats;
					tot_time += ct_ptr->Time;
					tot_chat += ct_ptr->Chats;

					if ( TRUE == ( MeetMinimum( ut_Node , *((ULONG *) parameters[ MIN ] ) , *((ULONG *) parameters[ SORT ] ) ) ) )
					{
						PutInSortedList( (struct List *) &ut_List ,
											  ut_Node ,
											  parameters[ REVERSED ] ,
											  *((ULONG *) parameters[ SORT ] ) );
					}
					else
						FreeVec( ut_Node );
				}
				else
					FreeVec( ut_Node );
			}
			else
			{
				FreeVec( ut_Node );
				break;
			}
		}
		else
		{
			Printf( nomemory );
			MyExit( DOSBase , userdata , ct_ptr , rdargs , ( struct List *) &ut_List , 20 );
		}
	}

	/* We are done reading and sorting the data, so we can close the file
	 * and give back the memory.
	 */
	Close( fh );
	FreeVec( userdata );
	userdata = NULL;

	/* Remove the three dummy nodes that were put in the list to
	 * solve a flaw in the sorting routine. The three last nodes
	 * in the list are always the dummy ones.
	 */
	for ( i = 0 ; i < 3 ; i ++ )
	{
		ut_Worknode = ( struct USERTOP *) ut_List.mlh_TailPred;
		Remove( ( struct Node *) ut_Worknode );
		FreeVec( ut_Worknode );
	}

	/* By default we will put a CLS code in the file we create, but if the
	 * user has set the NO_CLS flag, we will NOT do this. We do however
	 * open the file, because this will also initialize a new, empty
	 * file. If we don't do this, we either have to delete any old
	 * file otherwise the data will be stuck after any existing file.
	 */
	if ( fh = Open( (STRPTR) parameters[ TO_FILE ] , MODE_NEWFILE ) )
	{
		if ( ! parameters[ NO_CLS ] )
			Write ( fh , "\014" , 1 );
		Close( fh );
	}
	else
	{
		Printf( "Cannot open output file.\n" );
		MyExit( DOSBase , userdata , ct_ptr , rdargs , ( struct List *) &ut_List , 20 );
	}

	/* If the user has specified his own header, we will simply copy
	 * the specified file and stick our data behind it. If not, we will
	 * generate a very simple header.
	 */

	/* Our very own copy routine :-) */
	if ( ! parameters[ NO_HEAD ] )
	{
		if ( fsize = GetFileSize( DOSBase , (STRPTR) parameters[ HEADER ] ) )
		{
			if ( buffer = AllocVec( fsize , MEMF_CLEAR|MEMF_PUBLIC ) )
			{
				if ( fh = Open( (STRPTR) parameters[ HEADER ] , MODE_OLDFILE ) )
				{
					Read( fh , buffer , fsize );
					Close( fh );
					if ( fh = Open( (STRPTR) parameters[ TO_FILE ] , MODE_READWRITE ) )
					{
						Seek( fh , 0 , OFFSET_END );
						Write( fh , buffer , fsize );
						Close( fh );
					}
				}
				else
				{
					Printf( nofile , (STRPTR) parameters[ TO_FILE ] );
					MyExit( DOSBase , userdata , ct_ptr , rdargs , ( struct List *) &ut_List , 20 );
				}
				FreeVec( buffer );
			}
			else
			{
				Printf( nomemory );
				MyExit( DOSBase , userdata , ct_ptr , rdargs , ( struct List *) &ut_List , 20 );
			}
		}
		else
			MyExit( DOSBase , userdata , ct_ptr , rdargs , ( struct List *) &ut_List , 20 );
	}
	else
	{
		if ( fh = Open( (STRPTR) parameters[ TO_FILE ] , MODE_READWRITE ) )
		{
			Seek( fh , 0 , OFFSET_END );
			myprintf( temp , headers[ *((ULONG *) parameters[ SORT ] ) ] , (STRPTR) parameters[ BORDER ] , (STRPTR) parameters[ BORDER ] );
			Write( fh , temp , strlen( temp ) );
			Close( fh );
		}
		else
		{
			Printf( nofile , (STRPTR) parameters[ TO_FILE ] );
			MyExit( DOSBase , userdata , ct_ptr , rdargs , ( struct List *) &ut_List , 20 );
		}
	}
	
	/* And now add our data to that header file */
	if ( fh = Open( (STRPTR) parameters[ TO_FILE ] , MODE_READWRITE ) )
	{
		/* Add it to the end of the file */
		Seek( fh , 0 , OFFSET_END );

		/* A second header to identify all the data */
		myprintf( temp , headers[ 3 ] , (STRPTR) parameters[ BORDER ] , (STRPTR) parameters[ BORDER ] );
		Write( fh , temp , strlen( temp ) );

		/* Add all the user data */
		i = 1;
		ut_Worknode = ( struct USERTOP *) ut_List.mlh_Head;
		while ( ut_Nextnode = ( struct USERTOP *) ut_Worknode->ut_Node.ln_Succ )
		{
			fsize  = ut_Worknode->ut_Time;
			days	 = fsize / 86400;
			fsize -= days * 86400;
			hours	 = fsize / 3600;
			fsize -= hours * 3600;
			mins	 = fsize / 60;
			avgm	 = ut_Worknode->ut_Avg / 60;
			avgs   = ut_Worknode->ut_Avg - ( avgm * 60 );
			myprintf( temp , headers[ 4 ] , (STRPTR) parameters[ BORDER ], i,
														ut_Worknode->ut_Name,
														ut_Worknode->ut_Location,
														days, hours , mins,
														ut_Worknode->ut_Chats,
														avgm , avgs ,
														(STRPTR) parameters[ BORDER ] ); 

			/* Take care of any spaces (" 1" -> "01" ) */
			for ( j = 0 ; j < 4 ; j ++ )
			{
				if ( temp[ zeros[ j ] + strlen( (STRPTR) parameters[ BORDER ] ) ] == ' ' )
					temp[ zeros[ j ] + strlen( (STRPTR) parameters[ BORDER ] ) ] = '0';
			}

			Write( fh , temp , strlen( temp ) );
			ut_Worknode = ut_Nextnode;
			i++;
			if ( parameters[ TOP ] != NULL )
			{
				if ( i > *((ULONG *) parameters[ TOP ] ) )
					break;
			}
		}

		/* And now add the footer */
		fsize  = tot_time;
		days	 = fsize / 86400;
		fsize -= days * 86400;
		hours	 = fsize / 3600;
		fsize -= hours * 3600;
		mins	 = fsize / 60;
		fsize  = tot_time / tot_chat;
		avgm	 = fsize / 60;
		avgs   = fsize - ( avgm * 60 );
		myprintf( temp , headers[ 5 ] , (STRPTR) parameters[ BORDER ],
													avgm , avgs , days, hours , mins,
													(STRPTR) parameters[ BORDER ] );

		/* Take care of any blanks (fill'm with 0's) */
		for ( j = 4 ; j < 8 ; j ++ )
		{
			if ( temp[ zeros[ j ] + strlen( (STRPTR) parameters[ BORDER ] ) ] == ' ' )
				temp[ zeros[ j ] + strlen( (STRPTR) parameters[ BORDER ] ) ] = '0';
		}

		/* And write it */
		Write( fh , temp , strlen( temp ) );

		/* Close the file when you're done */
		Close( fh );
	}
	MyExit( DOSBase , userdata , ct_ptr , rdargs , ( struct List *) &ut_List , 0 );
}

void FreeNodes (struct List *list)
{
	struct Node *worknode;
	struct Node *nextnode;

	worknode = (struct Node *) list->lh_Head; // First node in list
	while (nextnode = (struct Node *) worknode->ln_Succ)
	{
		Remove( worknode );     // Take the node out of the list
		FreeVec( worknode );      // Free the memory of the node
		worknode = nextnode;      // Go to next node
	}
}

ULONG GetFileSize( struct Library *DOSBase , char *filename )
{
	BPTR		fh;
	ULONG		fsize = 0;
	struct	FileInfoBlock 	*FBlock;

	if ( ( fh = Lock( filename , ACCESS_READ ) ) != NULL )
	{
		if ( ( FBlock = ( struct FileInfoBlock *) AllocDosObject ( DOS_FIB , NULL ) ) )
		{
			if ( Examine( fh , FBlock ) )
				fsize = FBlock->fib_Size;
			FreeDosObject( DOS_FIB , FBlock );
		}
		UnLock( fh );
	}
	else
		Printf( "Could not lock file: %s\n." , filename );
	return( fsize );
}

VOID MyExit( struct Library *DOSBase , struct USER *userdata , struct CHATTOP *ct_ptr , struct RDArgs *rdargs , struct List *list , int rc )
{
	if ( userdata )
		FreeVec( userdata );

	if ( ct_ptr )
		FreeVec( ct_ptr );

	FreeNodes( list );

	if ( rdargs )
		FreeArgs( rdargs );

	if ( DOSBase )
		CloseLibrary( DOSBase );

	Exit( rc );
}

VOID myprintf( char *output , char *ctl, ...)
{
   long *arg1;

   arg1 = (long *)(&ctl + 1);
   RawDoFmt(ctl, arg1, (void (*))"\x16\xc0\x4e\x75", output );
}

VOID PutInSortedList( struct List *list , struct USERTOP *ut_Node , ULONG ReverseSort , ULONG SortBy )
{
	struct	USERTOP	*ut_Worknode, *ut_Nextnode;
	BOOL		inserted = FALSE, breakit = FALSE;

	/* If ReverseSort is TRUE, we will put the node in a list that will
	 * be sorted from LOW to HIGH. Otherwise it will be put in a list that
	 * that is sorted from HIGH to LOW.
	 */
	if ( FALSE == ReverseSort )
	{
		/* Find the first node that is BIGGER than the number
		 * of chats/time we've got and insert it after that
		 * node. This way we will get a sorted list from HIGHEST
		 * to LOWEST.
		 */
		ut_Worknode = ( struct USERTOP *) list->lh_TailPred;
		while ( ut_Nextnode = ( struct USERTOP *) ut_Worknode->ut_Node.ln_Pred )
		{
			switch( SortBy )
			{
				case NULL:	/* Sort by Time */
					if ( ut_Worknode->ut_Time >= ut_Node->ut_Time )
					{
						Insert( list , ( struct Node *) ut_Node , ( struct Node *) ut_Worknode );
						inserted = TRUE;
						breakit  = TRUE;
					}
					break;

				case 1   : /* Sort by Chats */
					if ( ut_Worknode->ut_Chats >= ut_Node->ut_Chats )
					{
						Insert( list , ( struct Node *) ut_Node , ( struct Node *) ut_Worknode );
						inserted = TRUE;
						breakit  = TRUE;
					}
					break;

				case 2	: /* Sort by Avg */
					if ( ut_Worknode->ut_Avg >= ut_Node->ut_Avg )
					{
						Insert( list , ( struct Node *) ut_Node , ( struct Node *) ut_Worknode );
						inserted = TRUE;
						breakit  = TRUE;
					}
					break;
			}
			ut_Worknode = ut_Nextnode;
			if ( TRUE == breakit )
				break;
		}
		if ( FALSE == inserted )
			Insert( list , ( struct Node *) ut_Node , NULL );
	}
	else
	{
		ut_Worknode = ( struct USERTOP *) list->lh_Head;
		while ( ut_Nextnode = ( struct USERTOP *) ut_Worknode->ut_Node.ln_Succ )
		{
			switch( SortBy )
			{
				case NULL:	/* Sort by Time */
					if ( ut_Worknode->ut_Time >= ut_Node->ut_Time )
					{
						ut_Nextnode = ( struct USERTOP *) ut_Worknode->ut_Node.ln_Pred;
						Insert( list , ( struct Node *) ut_Node , ( struct Node *) ut_Nextnode );
						inserted = TRUE;
						breakit  = TRUE;
					}
					break;

				case 1   : /* Sort by Chats */
					if ( ut_Worknode->ut_Chats >= ut_Node->ut_Chats )
					{
						ut_Nextnode = ( struct USERTOP *) ut_Worknode->ut_Node.ln_Pred;
						Insert( list , ( struct Node *) ut_Node , ( struct Node *) ut_Nextnode );
						inserted = TRUE;
						breakit  = TRUE;
					}
					break;

				case 2	: /* Sort by Avg */
					if ( ut_Worknode->ut_Avg >= ut_Node->ut_Avg )
					{
						ut_Nextnode = ( struct USERTOP *) ut_Worknode->ut_Node.ln_Pred;
						Insert( list , ( struct Node *) ut_Node , ( struct Node *) ut_Nextnode );
						inserted = TRUE;
						breakit  = TRUE;
					}
					break;
			}
			ut_Worknode = ut_Nextnode;
			if ( TRUE == breakit )
				break;
		}
		if ( FALSE == inserted )
			AddTail( list , ( struct Node *) ut_Node );
	}
}

BOOL MeetMinimum( struct USERTOP *ut_Node , ULONG Minimum , ULONG SortBy )
{
	if ( NULL == Minimum )
		return( TRUE );

	switch( SortBy )
	{
		case	NULL:	/* Time */
			if ( Minimum <= ut_Node->ut_Time )
				return( TRUE );
			else
				return( FALSE );

		case	1	:	/* Chats */
			if ( Minimum <= ut_Node->ut_Chats )
				return( TRUE );
			else
				return( FALSE );

		case	2	:	/* Average */
			if ( Minimum <= ut_Node->ut_Avg )
				return( TRUE );
			else
				return( FALSE );
	}
}
