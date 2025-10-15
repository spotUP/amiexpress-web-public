#define COM_REGISTER

#include "Chat-O-Meter.H"

#define ERROR 1
#define BULL  2
 
//#define DEBUG

UBYTE VER[]="$VER: Chat-O-Meter 2.3.0 "__AMIGADATE__;
UBYTE ErrStr[] = "[33mChat-O-Meter ERROR![0m Could not %s";

struct	COMDATA		*com_ptr=NULL;
struct	CHATTOP		*chat_ptr=NULL;
struct	TODAY_DATA	*td_ptr=NULL;

void main ( int argc , char *argv[] )
{
	char	temp[ 200 ], temp2[ 200 ], filename[ 50 ];

	char	bulletin[ 200 ];

	int	i, j;

	ULONG	t_begin , t_end;

	BOOL	EndChat    = FALSE,
			ShowAsk    = TRUE,
			Trunc      = TRUE,
			DoTopTen   = TRUE,
			HideChat   = FALSE,
			DoToday    = TRUE,
			New_Record = FALSE,
			Quiet      = FALSE,
			//BackUp     = FALSE,
			DoLog      = TRUE;

	UBYTE TimeFile[]  = "T:CoM_StartChat.Node";
	UBYTE	DataFile[]  = "PROGDIR:Chat-O-Meter.Data";
	//UBYTE	BackUpFile[]= "PROGDIR:Chat-O-Meter.Last";

	struct Library    *IconBase;
	struct DiskObject *dobj;
	char   *tooltype, **toolarray;

	FILE	*fptr;

	Register( atoi( argv[ 1 ] ) );

	// Allocate memory for the two structures
	com_ptr = AllocVec( sizeof( struct COMDATA ) , MEMF_PUBLIC|MEMF_CLEAR );
	chat_ptr = AllocVec( sizeof( struct CHATTOP ) , MEMF_PUBLIC|MEMF_CLEAR );
	td_ptr = AllocVec( sizeof( struct TODAY_DATA ) , MEMF_PUBLIC|MEMF_CLEAR );
	if ( com_ptr == NULL || chat_ptr == NULL || td_ptr == NULL )
	{
		sprintf( temp , ErrStr , "allocate memory." );
		sm( temp , 1 );
		enddoor( FALSE );
	}

	// Trace the command icon
	getuserstring( temp2 , BB_MAINLINE );
	LocateCommandIcon( temp , temp2 );

	// Open icon library and read the icon's tooltypes
	IconBase = OpenLibrary("icon.library", 0L	);
	if ( IconBase )
	{
		dobj = GetDiskObject( temp );
		if ( dobj )
		{
			toolarray = (char **) dobj->do_ToolTypes;
			if ( tooltype = FindToolType( toolarray , "CHAT_END" ) )
				EndChat = TRUE;	
			if ( tooltype = FindToolType( toolarray , "DONT_ASK" ) )
				ShowAsk = FALSE;	
			if ( tooltype = FindToolType( toolarray , "DONT_TRUNC" ) )
				Trunc = FALSE;
			if ( tooltype = FindToolType( toolarray , "NO_USERFILE" ) )
				DoTopTen = FALSE;
			if ( tooltype = FindToolType( toolarray , "HIDE_CHAT" ) )
				HideChat = TRUE;
			if ( tooltype = FindToolType( toolarray , "NO_DAY_RECORD" ) )
				DoToday = FALSE;
			if ( tooltype = FindToolType( toolarray , "QUIET" ) )
				Quiet = TRUE;
			/**********
			if ( tooltype = FindToolType( toolarray , "BACKUP" ) )
				BackUp = TRUE;
			**********/
			if ( tooltype = FindToolType( toolarray , "NO_LOG" ) )
				DoLog = FALSE;
			if ( tooltype = FindToolType( toolarray , "BULLETIN" ) )
				strcpy( bulletin , tooltype );
			else
			{
				if ( EndChat )
				{
					sprintf( temp , ErrStr , "find \"BULLETIN\" tooltype." );
					sm( temp , 1 );
					enddoor( FALSE );
				}
			}
			FreeDiskObject( dobj );
		}
		else
		{
			sprintf( temp , ErrStr , "lock command icon." );
			sm( temp , 1 );
			enddoor( FALSE );
		}
		CloseLibrary( IconBase );
	}
	else
	{
		sprintf( temp , ErrStr , "open icon library." );
		sm( temp , 1 );
		enddoor( FALSE );
	}

	// What's the time?
	time( (time_t *) &t_end);

	getuserstring( temp , BB_NODEID );
	temp[ 2 ] = 0x00;
	sprintf( filename , "%s_%s" , TimeFile , temp );

	if ( ! EndChat )
	{
		if ( ! HideChat )
		{
			// Make known that user is chatting
			putuserstring( "17" , ENVSTAT );
		}

		/* OPENING TEMP-FILE TO WRITE DATE/TIME */
		if ( fptr = fopen( filename , "w" ) )
		{
			fprintf( fptr , "%ld\n" , t_end );
			fclose( fptr );
		}
		else
		{
			sprintf( temp , ErrStr , "save starting time." );
			sm( temp ,1 );
		}
		enddoor( FALSE );
	}

	// This point will only be reached if the chat has ended
	if ( access( DataFile , F_OK ) )
	{
		// Not found
		if ( fptr = fopen( DataFile , "w" ) )
		{
			com_ptr->Chats = 0;
			com_ptr->TimeChatted = 0;
			for ( i = 0 ; i < 10 ; i ++ )
			{
				com_ptr->Time[ i ] = 0;
				com_ptr->Date[ i ] = 0;
				com_ptr->User[ i ][ 0 ] = '-';
				com_ptr->User[ i ][ 1 ] = 0x00;
			}
			fwrite( com_ptr , sizeof( struct COMDATA ) , 1 , fptr );
			fclose( fptr );
		}
		else
			enddoor( ERROR );
	}

	if ( fptr = fopen( filename , "r" ) )
	{
		fgets( temp2 , sizeof( temp2 ) , fptr );
		t_begin = atol( temp2 );
		t_end -= t_begin;	// Number of seconds chat lasted
		fclose( fptr );

		/* UPDATE TODAY FiLE */
		if ( DoToday )
			New_Record = Today( t_end );

		/* UPDATE USER FiLE */
		if ( DoTopTen )
			TopTen( t_end );

		/* Update Log file */
		if ( DoLog )
			LogChat( t_begin, t_end );

		if ( fptr = fopen( DataFile , "r" ) )
		{
			fread( com_ptr , sizeof( struct COMDATA ) , 1 , fptr );
			fclose( fptr );

			/************ 
			if ( BackUp )
			{
				if ( fptr = fopen( BackUpFile , "w" ) )
				{
					fwrite( com_ptr , sizeof( struct COMDATA ) , 1 , fptr );
					fclose( fptr );
				}
				else
				{
					sprintf( temp , ErrStr , "write backup." );
					sm( temp , 1 );
				}
			}
			************/

			com_ptr->TimeChatted += t_end;
			com_ptr->Chats++;

			i = RecordTime( t_end );

			if ( i != -1 )
			{
				// Make room for new time in list
				for ( j = 10 ; j > ( i + 1 ) ; j -- )
				{
					com_ptr->Time[ j - 1 ] = com_ptr->Time[ j - 2 ];
					com_ptr->Date[ j - 1 ] = com_ptr->Date[ j - 2 ];
					strcpy( com_ptr->User[ j - 1 ] , com_ptr->User[ j -2 ] );
				}

				com_ptr->Time[ i ] = t_end;

				#ifdef DEBUG
				co( "Pick up user's name\n\r" , 0 );
				#endif

				// Pick up user name, shorten it to 20 chars
				getuserstring( temp , DT_NAME );
				temp[ 20 ] = 0x00;
				strcpy( com_ptr->User[ i ] , temp );

				#ifdef DEBUG
				co( "Picking up current time.\n\r" , 0 );
				#endif
				// What's the current time?
				time( (time_t *) &t_begin );
				com_ptr->Date[ i ] = t_begin;
			}
			// Save the new stats
			if ( fptr = fopen( DataFile , "w" ) )
			{
				fwrite( com_ptr , sizeof( struct COMDATA ) , 1 , fptr );
				fclose( fptr );
			}
			else
				enddoor( ERROR );

			// Create the bulletin
			if ( fptr = fopen( bulletin , "w" ) )
				CreateBulletin( fptr , bulletin , Trunc , Quiet , DoToday );
			else
				enddoor( BULL );

			// Present the end result
			if ( ! Quiet )
				Record( t_end , i + 1 , bulletin , ShowAsk , DoTopTen , DoToday , New_Record );

			remove( filename );
		}
		else
			enddoor( ERROR );
	}
	else
		enddoor( ERROR );

	enddoor( FALSE );
}

void enddoor ( int RC )
{
	if ( RC )
		sm( "[33mChat-O-Meter ERROR![0m " , 0 );

	if ( RC == ERROR )
		sm( "Couldn't open data file!" , 1 );

	if ( RC == BULL )
		sm( "Couldn't write bulletin!" , 1 );

	if ( td_ptr )
		FreeVec( td_ptr );

	if ( com_ptr )
		FreeVec( com_ptr );

	if ( chat_ptr )
		FreeVec( chat_ptr );

	ShutDown();
	end();
}

void LastCommand ( void )
{}

void end ( void )
{
	exit ( 0 );
}

void LocateCommandIcon( char *output , char *cmd_name )
{
	char	temp[ 200 ];
	int	i;
	
	sprintf( temp , "BBS:Commands/SYSCmd/%s.info" , cmd_name );
	if ( access( temp , F_OK ) )
	{
		// Not found
		getuserstring( temp , BB_CONFNUM );
		i = atoi( temp ) + 1;
		sprintf( temp , "BBS:Commands/Conf%dCmd/%s.info" , i , cmd_name );
		if ( access( temp , F_OK ) )
		{
			// Not found
			getuserstring( temp , BB_NODEID );
			sprintf( temp , "BBS:Commands/Node%sCmd/%s.info" , temp , cmd_name );
			if ( access( temp , F_OK ) )
			{
				// Not found
				sprintf( temp , "BBS:Commands/BBSCmd/%s.info" , cmd_name );
				if ( access( temp , F_OK ) )
				{
					// Not found
					//strcpy( output, "Could not find it!" );
 					output[ 0 ] = 0x00;
				}
				else
					sprintf( output, "BBS:Commands/BBSCmd/%s" , cmd_name );
			}
			else
				sprintf( output , "BBS:Commands/Node%sCmd/%s" , temp , cmd_name );
		}
		else
			sprintf( output , "BBS:Commands/Conf%dCmd/%s" , i , cmd_name );
	}
	else
		sprintf( output , "BBS:Commands/SYSCmd/%s" , cmd_name );
}

int RecordTime( ULONG t )
{
	int i;
	
	for ( i = 0 ; i <= 9 ; i ++ )
	{
		if ( t > com_ptr->Time[ i ] )
			return( i );
	}
	return( -1 );
}

void Record( ULONG t , int Position , char *bulletin , BOOL ShowAsk , BOOL DoTopTen , BOOL DoToday , BOOL New_Record )
{
	char	temp[ 400 ];
	int	hours, mins, secs;
	int	t_hours, t_mins, t_secs;
	int	td_hours, td_mins , td_secs;

	/* Convert all seconds to hours, minutes and seconds */
	SecsToHours( t , &hours , &mins , &secs );
	SecsToHours( com_ptr->TimeChatted , &t_hours , &t_mins , &t_secs );
	SecsToHours( td_ptr -> tt_Time , &td_hours , &td_mins , &td_secs );

	sm( "\n\r[34m :                                                                         :" , 1 );
	sm( "-O-------------------------------------------------------------------------O-" , 1 );
	sm( " : [30m[44m /X MYSTiC       [0m[44mChat-O-Meter v2.3  by  KiLLraVeN/MYSTiC     [30m/X MYSTiC [40m [34m:" , 1 );
	sm( " ¡                                                                         ." , 1 );
	if ( DoToday )
		sprintf( temp , " :  [36mtIME[35m: [33m%2.2d[35m:[33m%2.2d[35m:[33m%2.2d [34m^ [36mcHAT #[35m:[33m%6d [34m^ [36mtODAY[35m: [33m%2.2d[35m:[33m%2.2d[35m:[33m%2.2d [34m^ [36moVERALL[35m: [33m%4.4d[35m:[33m%2.2d[35m:[33m%2.2d [34m¡" , hours , mins , secs , com_ptr->Chats , td_hours , td_mins , td_secs , t_hours , t_mins , t_secs );
	else
		sprintf( temp , " :    [36mtHIS cHAT[35m: [33m%2d[35m:[33m%2.2d[35m:[33m%2.2d [34m^ [36moVERALL tIME[35m: [33m%4.4d[35m:[33m%2.2d[35m:[33m%2.2d [34m^ [36mcHAT #[35m: [33m%-8ld    [34m¡" , hours , mins , secs , t_hours , t_mins , t_secs , com_ptr->Chats );
	sm( temp , 1 );

	if ( DoTopTen )
	{
		SecsToHours( chat_ptr->Time , &t_hours , &t_mins , &t_secs );
		sprintf( temp , " .            [36mpRIVATE sCORE[35m: [33m%4.4ld[35m:[33m%2.2d[35m:[33m%2.2d [34m^ [36mpRIVATE chAT #[35m: [33m%-6d           [34m:" , t_hours , t_mins , t_secs , chat_ptr->Chats );
		sm( temp , 1 );
	}

	sm( " .                                                                         |" , 1 );

	switch ( Position )
	{
		case	0: 
			sm( " :   [36msORRY dUDE, [35mnO [36mChat-O-Meter tOP tIME tODAY, tRY aGAIN sOON, oKAY?!    [34m:" , 1 );
			break;
			
		case  1:
			sm( " :    [35mwOW! [36myOU aRE nOW tHE [33m#1 cHATTER [36moN tHIS bOARD! [35mcONGRATULATIONS!!!    [34m:" , 1 );
			break;

		case  2:
			sm( " :   [36myOU aRE nOW tHE [33m#2 cHATTER! [36mtHAT'S a [35mrIGHTEOUS [36maCT dUDE! [35mgO fOR #1!   [34m:" , 1 );
			break;

		case	3:
			sm( " :   [33mbRONZE [36mfOR yOU iN tHE [32mChat-O-Meter[36m! yOUR nAME wILL bE [35mrEMEMBERED[36m!!    [34m:" , 1 );
			break;

		default:
			sprintf( temp , " :  [36myOU mADE iT tO [33mpOSITION %2.2d [36mIN tHE [32mChat-O-Meter[36m! [35mtRY tO gET tO tHE tOP! [34m:" , Position );
			sm( temp , 1 );
			break;
	}

	sm( "-O-------------------------------------------------------------------------O-" , 1 );

	if ( New_Record )
	{
		sm( " : [44m                   [33mATTENTiON! NEW DAY RECORD DETECTED!                 [40m [34m:" , 1 );
		sm( "-O-------------------------------------------------------------------------O-" , 1 );
	}

	sm( " :                                                                         :[0m" , 1 );

	if ( ( Position > 0 && ShowAsk ) || New_Record )
	{
		sm("[36m         wOULD yOU lIKE tO sEE tHE [35mChat-O-Meter tOP 1o? [36m[ [33mY[35m/[33mn [36m] " , 0 );
		temp[ 0 ] = 0x00;
		hk( temp , temp );
		if ( toupper( temp[ 0 ] ) != 'N' )
			sf( bulletin );
		else
			sm( "[33mNo[0m" , 1 );
	}
}

void SecsToHours( ULONG t , int *hours, int *mins, int *secs )
{
	*hours = ( t / 3600 );
	t -= ( *hours * 3600 );
	*mins  = ( t / 60 );
	t -= ( *mins * 60 );
	*secs  = t;
}

void CreateBulletin( FILE *fptr , char *bulletin , BOOL Trunc , BOOL Quiet , BOOL DoToday )
{
	char	temp[ 400 ], month[ 10 ], day[ 10 ] , year[ 10 ];
	int	hours, mins , secs, i;
	int	td_hours , td_mins , td_secs;
	ULONG	tot_secs;

	STRPTR	front[] = {	"!" ,	"|" ,	"O" ,	"|" ,	"¦" ,	":" ,	"¦" ,	"¡" };
	STRPTR	back[]  = {	":" ,	":" ,	"¡" ,	"O" ,	"|" ,	"¦" ,	":" ,	"·" };
	STRPTR   numba[] = { "o1" ,"o2" , "o3" , "o4" , "o5" , "o6" , "o7" , "o8" };
	STRPTR	damonth[] = { "N/A" , "jAN" , "fEB" , "mAR" , "aPR" , "mAY" , "jUN" , "jUL" , "aUG" , "oCT" , "nOV" , "dEC" };

	fprintf( fptr , "\014 [34m.                          [31m_  __           [33m/        [31m__  _      ·          [34m.\n-O-[36m_____   ___[35m.[36m___  ___________ [31m/[35m/\\[36m___   [31m/ [33m·   [36m______[31m\\  [35m.        [31m\\ _      [34m-O-\n :[35m/  [34m__[35m/[36m__[35m/   |  [34m¬[35m\\/   [34m_ ¬[35m\\[34m____[35m\\/[34m____[35m/  [31m· [33m/   [35m/  [34m__ ¬[35m\\ -:---------[31m\\/[35m-----. [34m:\n[36m_[35m/   [34m|   ¬[35m\\[36m_  [34m_    [35m\\[36m_  [34m_   [35m\\[36m_  [35m\\/  [34m¬[35m\\[36m_ [31m/ [33m/ /[36m_[35m/   \\/   \\[36m_[35m| [36m>cHAT·O·mETER< [35m| [34m:\n" );
	fprintf( fptr , "[35m\\[34m_____     [35m/[34m__[35m|     /[34m__[35m|    /[34m___     [35m/[31m/_[33m/ / [35m\\[34m_____     [35m/`----------------' [34m¦\n[31m-[34m:[31m---[35ml[34m____[35m/[31m---[35ml[34m____[35m/[31m---[35ml[34m___[35m//\\[31m-[35ml[34m____[35m/[31m-\\_[33m\\/[31m-------[35ml[34m____[35m/[31m------ ---  --   -  [34m¡[31m_\n [34m¦                       [36m__[35m/  \\  [36m___  ___________  [35m/\\[36m_________    _______  [35m\\[36m/\n [34m| [35m.------------------.  \\[34m_    [35m\\/  [34m¬[35m\\/  [36m__ [34m¬[35m\\[36m_[34m___[35m\\/[34m____/  [36m__ [34m¬[35m\\[36m___[35m\\[34m____ ¬[35m\\[36m_[34m¦\n" );
	fprintf( fptr , " ¡ [35m:   [36m·/X mYSTIC!·   [35m:  /     \\/    \\[36m_ [35m\\[34m____[35m/[36m__ [35m\\/  [34m¬[35m\\[36m_  [35m\\[34m____[35m/[36m__   [35m\\/  [34m_[35m/[34m:\n :[31m_[35m`---------------- - [36m_[35m/       \\[34m_____[35m/[34m___     [35m/[34m__     [35m/[34m____     [35m/[34m___[35m/    \\[36m_\n [35m\\[36m/ [31m-  -- --- ---------[35m\\[34m_________[35m/[31m--[36mStz[31m--[35m\\[34m____[35m/[31m--[35ml[34m____[35m/[31m----[35m\\[34m____[35m/[31m----[35m\\[34m_____[35m/[31m-\n [34m:                                                                         |\n" );

	for ( i = 0 ; i <= 7 ; i ++ )
	{
		// Convert the seconds to hours/mins/secs
		SecsToHours( com_ptr->Time[ i ] , &hours , &mins , &secs );

		// Convert the seconds to day/month/year
		GetDate( com_ptr->Date[ i ] , day , month , year );

		// Put it in the temp var and check for 1 values (no multiple 's' after the words)
		sprintf( temp , " %s   [36m%s. [35m%-20.20s [32m%2.2d [33mhOURS[35m, [32m%2.2d [33mmINS [35maND [32m%2.2d [33msECS  [35m([36m%2.2s[32m-[36m%3.3s[32m-[36m%2.2s[35m)   [34m%s\n" , front[ i ] , numba[ i ] , com_ptr->User[ i ] , hours , mins , secs , day , month , year , back[ i ] );
		
		if ( Trunc )
			MultipleOrNot( temp , hours , mins, secs );

		// Write it to disk
		fprintf( fptr , temp );
	}

	// Convert the seconds to hours/mins/secs
	SecsToHours( com_ptr->Time[ 8 ] , &hours , &mins , &secs );

	// Convert the seconds to day/month/year
	GetDate( com_ptr->Date[ 8 ] , day , month , year );

	// Put it in the temp var and check for 1 values (no multiple 's' after the words)
	sprintf( temp , "[33m_[34m:   [36mo9. [35m%-20.20s [32m%2.2d [33mhOURS[35m, [32m%2.2d [33mmINS [35maND [32m%2.2d [33msECS  [35m([36m%2.2s[32m-[36m%3.3s[32m-[36m%2.2s[35m)   [34m:[33m_\n" , com_ptr->User[ 8 ] , hours , mins , secs , day , month , year );
	if ( Trunc )
	{
		if ( hours == 1 )
			temp[ 67 ] = ' ';
		if ( mins == 1 )
			temp[ 91 ] = ' ';
		if ( secs == 1 )
			temp[ 118 ] = ' ';
	}

	// Write it to disk
	fprintf( fptr , temp );

	// Convert the seconds to hours/mins/secs
	SecsToHours( com_ptr->Time[ 9 ] , &hours , &mins , &secs );

	// Convert the seconds to day/month/year
	GetDate( com_ptr->Date[ 9 ] , day , month , year );

	// Put it in the temp var and check for 1 values (no multiple 's' after the words)
	sprintf( temp , "\\[34m:   [36m1o. [35m%-20.20s [32m%2.2d [33mhOURS[35m, [32m%2.2d [33mmINS [35maND [32m%2.2d [33msECS  [35m([36m%2.2s[32m-[36m%3.3s[32m-[36m%2.2s[35m)   [34m:[33m/\n" , com_ptr->User[ 9 ] , hours , mins , secs , day , month , year );

	if ( Trunc )
	{
		if ( hours == 1 )
			temp[ 62 ] = ' ';
		if ( mins == 1 )
			temp[ 86 ] = ' ';
		if ( secs == 1 )
			temp[ 113 ] = ' ';
	}

	// Write it to disk
	fprintf( fptr , temp );

	fprintf( fptr , " \\                                                                         /\n" );

	/* And now finish the bulletin with the footer holding all accumulated
	 * data. The total time will be displayed in units of days, hours and
	 * minutes because of better clearity.
    *
	 * This is where the conversion to days is done. td_hours contains
	 * the number of days, td_mins the number of hours and td_secs the
	 * number of minutes (I need to change the variable names :) ).
	 */
	tot_secs  = com_ptr->TimeChatted;
	hours     = tot_secs / 86400;
	tot_secs -= hours * 86400;
	mins      = tot_secs / 3600;
	tot_secs -= mins * 3600;
	tot_secs /= 60;
	
	/* Convert the record time (secs) to hours, mins and secs */
	SecsToHours( td_ptr -> tt_RecTime , &td_hours , &td_mins , &td_secs );

	/* Normally we would extract 1900 from the year to get only the last
	 * two decimals of the year ( 1995 -> 95 ), but because CoM might well
	 * be used in 2000 and up, we will have to take that into account.
	 */
	if ( td_ptr -> tt_RecYear >= 2000 )
		td_ptr -> tt_RecYear -= 100;

	fprintf( fptr , " [34m:[33m\\      [36mtOTAL # oF cHATS[35m: [32m%-10ld  [36mtOTAL cHAT tIME[35m:[32m %3ldd %2.2ldh %2.2ldm      [33m/[34m:\n-O-[33m\\[34m---------------------------------------------------------------------[33m/[34m-O-\n" , com_ptr->Chats , hours, mins , tot_secs );
	if ( ! Quiet )
	{
		if ( ! DoToday )
			fprintf( fptr , " :  [33m·                                                                   ·  [34m:[0m\n" );
		else
		{
			fprintf( fptr , " :  [33m·          [36mdAY rECORD[35m: [32m%2.2d:%2.2d:%2.2d [35moN [36m%2.2d[32m-[36m%3.3s[32m-[36m%2.2d [35m([32m%3d [33mcHATS[35m)            [33m·  [34m:\n" ,
				td_hours,
				td_mins,
				td_secs,
				td_ptr -> tt_RecDay,
				damonth[ td_ptr -> tt_RecMonth ],
				td_ptr -> tt_RecYear - 1900,
				td_ptr -> tt_RecChats );
		}
	}
	else
	{
		if ( ! DoToday )
			fprintf( fptr , " :  [33m·                    [36m(c) 1995 by KiLLraVeN/MYSTiC!                  [33m·  [34m:[0m\n" );
		else
		{
			fprintf( fptr , " :  [33m· [36mdAY rECORD[35m: [32m%2.2d:%2.2d:%2.2d [35moN [36m%2.2d[32m-[36m%3.3s[32m-[36m%2.2ld [35m([32m%3d [33mcHATS[35m) [36m- [34m([36mc[34m) [36mKiLLraVeN[34m/[36mMST [33m·  [34m:\n",
				td_hours,
				td_mins,
				td_secs,
				td_ptr -> tt_RecDay,
				damonth[ td_ptr -> tt_RecMonth ],
				td_ptr -> tt_RecYear - 1900,
				td_ptr -> tt_RecChats );
		}
	}
	fclose( fptr );
}

void MultipleOrNot( char *temp , int hours , int mins , int secs )
{
	if ( hours == 1 )
		temp[ 57 ] = ' ';

	if ( mins == 1 )
		temp[ 81 ] = ' ';

	if ( secs == 1 )
		temp[ 108 ] = ' ';
}

void GetDate ( ULONG	t , char *day , char *month , char *year )
{
	char    temp[ 30 ];

	if ( t > 0 )
	{
		strcpy( temp , ctime( (time_t *) &t) );
		strupr( temp );

		temp[ 4 ] += 32; // First letter of the month is now small capital

		// WED dEC 21 21:15:40 1994

		sprintf( day , "%c%c\0" , temp[ 8 ] , temp[ 9 ] );
		sprintf( month , "%c%c%c\0" , temp[ 4 ] , temp[ 5 ] , temp[ 6 ] );
		sprintf( year , "%c%c\0" , temp[ 22 ] , temp[ 23 ] );

	}
	else
	{
		strcpy( day , "--" );
		strcpy( month, "---" );
		strcpy( year , "--" );
	}
}
