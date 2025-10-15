#define COM_TOP

#include "Chat-O-Meter.H"

//#define CHATTOPDEBUG

extern struct CHATTOP 		*chat_ptr;
extern struct TODAY_DATA	*td_ptr;
extern struct Library		*DOSBase;
extern UBYTE  ErrStr[];

void TopTen( ULONG t )
{
	/* This routine will update the Chat-O-Top.Data file if it exists
	 * and if it does not exist it will first create a new, empty one
	 * before updating it.
	 */

	char	temp[ 100 ];

	UBYTE	DataFile[] = "PROGDIR:Chat-O-Top.Data";

	ULONG	i, j ;

	USHORT slotnumber;

	FILE	*fptr;

	BPTR	fh;
	
	// Initialize soms vars
	getuserstring( temp , DT_SLOTNUMBER );
	slotnumber = atoi( temp );
	chat_ptr->Time = 0;
	chat_ptr->Chats = 0;

	if ( access( DataFile , F_OK ) )
	{
		// Does not exist
		if ( fh = Open( DataFile , MODE_NEWFILE ) )
		{
			for ( j = 1 ; j <= slotnumber ; j ++ )			
				Write( fh , chat_ptr , sizeof( struct CHATTOP ) );
			Close( fh );
		}
		else
		{
			sprintf( temp , ErrStr , "create Chat-O-Top data file." );
			sm( temp ,1 );
			enddoor( FALSE );
		}
	}
	else
	{
		if ( fptr = fopen( DataFile , "r+" ) )
		{
			fseek( fptr , 0 , SEEK_END );
			i = ftell( fptr );	// FileSize
			if ( ( i / sizeof( struct CHATTOP ) ) < slotnumber )
			{
				for ( j = 1 ; j <= ( slotnumber - ( i / sizeof( struct CHATTOP ) ) ) ; j ++ )
					fwrite( chat_ptr , sizeof( struct CHATTOP ) , 1 , fptr );
			}
			fclose( fptr );
		}
		else
		{
			sprintf( temp , ErrStr , "access Chat-O-Top data file." );
			sm( temp , 1 );
			enddoor( FALSE );
		}
	}
	
	// Okay, by now it should be no problem to write the new data in it
	if ( fh = Open( DataFile , MODE_OLDFILE ) )
	{
		Seek( fh , ( slotnumber - 1 ) * sizeof( struct CHATTOP ) , OFFSET_BEGINNING );
		Read( fh , chat_ptr , sizeof( struct CHATTOP ) );

		/* We need to check if this is a new user, we don't want new users
		 * profiting from the old users' time (if he was deleted).
		 */
		chat_ptr->Time += t;
		chat_ptr->Chats++;
		Seek( fh , ( slotnumber - 1 ) * sizeof( struct CHATTOP ) , OFFSET_BEGINNING );
		Write( fh , chat_ptr , sizeof( struct CHATTOP ) );
		Close( fh );
	}
	else
	{
		sprintf( temp , ErrStr , "write Chat-O-Top data file." );
		sm( temp , 1 );
		enddoor( FALSE );
	}
}

BOOL Today ( ULONG time_chatted )
{
	/* This routine will update the .today file of Chat-O-Meter, this
	 * means that this chat's time will be added to the time of any
	 * previous chats of today. If a new day has begun, the result
	 * will be compared to the previous record. If a new record has
	 * been set, this routine will return TRUE else FALSE.
	 */

	UBYTE		DayFile[] = "PROGDIR:Chat-O-Meter.Today";

	char		temp[ 200 ];

	ULONG		hours,
				mins;

	time_t	t;

	BPTR		fh;

	BOOL		new_record = FALSE;	/* RETURN VALUE */

	struct	ClockData	now;

	struct	Library		*UtilityBase;

	if ( UtilityBase = OpenLibrary( "utility.library" , 37 ) )
	{
		/* Get current date/time */
		time( &t );
		t -= 252482400;	/* UNIX TIME OFFSET */
		Amiga2Date( t , &now );

		/* Convert time */
		hours = time_chatted / 3600;
		time_chatted -= hours * 3600;
		mins = time_chatted / 60;
		time_chatted -= mins * 60;

		/* Check for today file */
		if ( access ( DayFile , F_OK ) )
		{
			/* NOT FOUND */
			if ( fh = Open( DayFile , MODE_NEWFILE ) )
			{
				td_ptr -> tt_Time  = hours * ( 60 * 60 );				
				td_ptr -> tt_Time += mins  * 60;
				td_ptr -> tt_Time += time_chatted;

				td_ptr -> tt_Day   = now.mday;
				td_ptr -> tt_Month = now.month;
				td_ptr -> tt_Year  = now.year;

				td_ptr -> tt_RecYear = 1900;

				Write( fh , td_ptr , sizeof( struct TODAY_DATA ) );
				Close( fh );
			}
		}
	
		/* Open the .today file and check it */
		if ( fh = Open( DayFile , MODE_OLDFILE ) )
		{
			/* Pick up old data */
			Read( fh , td_ptr , sizeof( struct TODAY_DATA ) );

			/* Is it still today? */
			if ( now.mday == td_ptr -> tt_Day ) 
			{
				td_ptr -> tt_Time += hours * ( 60 * 60 );
				td_ptr -> tt_Time += mins  * 60;
				td_ptr -> tt_Time += time_chatted;
				td_ptr -> tt_Chats++;

				Seek ( fh , 0 , OFFSET_BEGINNING );
				Write( fh , td_ptr , sizeof( struct TODAY_DATA ) );
			}
			else
			{
				/* It's a new day, hurray hurray ;) */
				if ( td_ptr -> tt_RecTime < td_ptr -> tt_Time &&
					  td_ptr -> tt_Chats > 0 )
				{
					/* A new record, yeeehaaa, copy record data */
					td_ptr -> tt_RecTime  = td_ptr -> tt_Time;
					td_ptr -> tt_RecChats = td_ptr -> tt_Chats;
					td_ptr -> tt_RecDay   = td_ptr -> tt_Day;
					td_ptr -> tt_RecMonth = td_ptr -> tt_Month;
					td_ptr -> tt_RecYear  = td_ptr -> tt_Year;
					new_record = TRUE;
				}

				/* Record or not, we need to reset the data for today */
				td_ptr -> tt_Time  = hours * ( 60 * 60 );				
				td_ptr -> tt_Time += mins  * 60;
				td_ptr -> tt_Time += time_chatted;

				td_ptr -> tt_Day   = now.mday;
				td_ptr -> tt_Month = now.month;
				td_ptr -> tt_Year  = now.year;

				/* Save the updated data file */
				Seek ( fh , 0 , OFFSET_BEGINNING );
				Write( fh , td_ptr , sizeof( struct TODAY_DATA ) );
			}
			Close( fh );
		}
		else
		{
			sprintf( temp , ErrStr , "read Chat-O-Meter.Today file." );
			sm( temp , 1 );
			enddoor( FALSE );
		}
		CloseLibrary( UtilityBase );
	}
	else
	{
		sprintf( temp , ErrStr , "open utility.library" );
		sm( temp , 1 );
		enddoor( FALSE );
	}
	return( new_record );
}
