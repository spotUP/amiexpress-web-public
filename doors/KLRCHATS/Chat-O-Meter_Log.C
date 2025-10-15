#define COM_LOG
#include "Chat-O-Meter.H"

extern struct Library	*DOSBase;
extern UBYTE  ErrStr[];

VOID LogChat( ULONG chat_Start , ULONG chat_Time )
{
	UBYTE	temp[ 100 ];

	BPTR	fh;

	struct CHAT_LOG *cl_ptr;

	/* Allocate memory for log entry */
	if ( cl_ptr = AllocVec( sizeof( struct CHAT_LOG ) , MEMF_PUBLIC|MEMF_CLEAR ) )
	{
		/* Fill entry with info */
		cl_ptr->cl_Start = chat_Start;
		cl_ptr->cl_End   = chat_Start + chat_Time;

		/* Fill in slotnumber of user */
		getuserstring( temp , DT_SLOTNUMBER );
		cl_ptr->cl_Slotnumber = atol( temp );

		/* Open the logfile */
		if ( fh = Open( "PROGDIR:Chat-O-Meter.Log" , MODE_READWRITE ) )
		{
			/* Go to the end */
			Seek( fh , 0 , OFFSET_END );
			
			/* Save the new entry */
			Write( fh , cl_ptr , sizeof( struct CHAT_LOG ) );
			
			/* And close it again */
			Close( fh );
		}
		else
		{
			sprintf( temp , ErrStr , "log this chat." );
			sm( temp , 1 );
			FreeVec( cl_ptr );
			enddoor( FALSE );
		}
		/* Free memory again */
		FreeVec( cl_ptr );
	}
	else
	{
		sprintf( temp , ErrStr , "allocate enough memory." );
		sm( temp , 1 );
		enddoor( FALSE );
	}
}
