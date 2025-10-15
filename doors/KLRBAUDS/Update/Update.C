#define BAUD_UPDATE

#include <string.h>
#include <exec/types.h>
#include <exec/execbase.h>
#include <exec/memory.h>

#include <clib/exec_protos.h>
#include <clib/dos_protos.h>
#include <pragmas/exec_pragmas.h>
#include <pragmas/dos_pragmas.h>

#define	NO_DOS_LIB		"Error opening dos.library!\n"
#define	NO_MEMORY		"Out of memory!\n"
#define	ERROR_READING	"Error reading file!\n"
#define	ERROR_OPENING	"Error opening file!\n"
#define	ERROR_BACKUP	"Error opening backup file!\n"
#define	ALL_OK			"Update was successfull.\n"
#define	NOT_OK			"Update was NOT successfull.\n"

void update( void )
{
   struct Library *DOSBase = OpenLibrary("dos.library", 0L);
	BPTR	 fh;
	BOOL	success = 0;

	char	OLDDATA[] = "KiLLER_Baud.Data";
	char	NEWDATA[] = "KiLLER_Baud.Data_Backup";

	struct BAUDRATE_OLD
	{
		ULONG	RunningSince;			// Running since (Julian date)
		ULONG	ConnectSlow;			// All connects below 9600
		ULONG	Connect9600;			// All connects 9600
		ULONG	Connect12000;			// All connects 12000
		ULONG	Connect14400;			// You'll get the idea by now
		ULONG	Connect16800;
		ULONG	Connect19200;
		ULONG	Connect21600;
		ULONG	Connect24000;
		ULONG	Connect26400;
		ULONG	Connect28800;
	   ULONG Connect31200;
		ULONG	ConnectFAST;			// All connects above 33600
		ULONG	DateSlow;				// Date/time of last connect < 9600
		ULONG	Date9600;				// Date/time of last connect 9600
		ULONG	Date12000;				// Date/time of last connect 12000
		ULONG	Date14400;				// Got it? Good.
		ULONG	Date16800;
		ULONG	Date19200;
		ULONG	Date21600;
		ULONG	Date24000;
		ULONG	Date26400;
		ULONG	Date28800;
	   ULONG Date31200;
		ULONG DateFAST;
		BYTE	UserSlow[ 32 ];		// Name of last user with connect < 9600
		BYTE	User9600[ 32 ];		// Name of last user with connect 9600
		BYTE	User12000[ 32 ];		// Name of last user with connect 12000
		BYTE	User14400[ 32 ];		// You've got it by now
		BYTE	User16800[ 32 ];
		BYTE	User19200[ 32 ];
		BYTE	User21600[ 32 ];
		BYTE	User24000[ 32 ];
		BYTE	User26400[ 32 ];
		BYTE	User28800[ 32 ];
	   BYTE  User31200[ 32 ];
		BYTE	UserFAST[ 32 ];
	} *old_data;

	struct BAUDRATE
	{
		ULONG	RunningSince;			// Running since (Julian date)
		ULONG	ConnectSlow;			// All connects below 9600
		ULONG	Connect9600;			// All connects 9600
		ULONG	Connect12000;			// All connects 12000
		ULONG	Connect14400;			// You'll get the idea by now
		ULONG	Connect16800;
		ULONG	Connect19200;
		ULONG	Connect21600;
		ULONG	Connect24000;
		ULONG	Connect26400;
		ULONG	Connect28800;
	   ULONG Connect31200;
		ULONG	Connect33600;			// USR rules!
		ULONG	ConnectFAST;			// All connects above 33600
		ULONG	DateSlow;				// Date/time of last connect < 9600
		ULONG	Date9600;				// Date/time of last connect 9600
		ULONG	Date12000;				// Date/time of last connect 12000
		ULONG	Date14400;				// Got it? Good.
		ULONG	Date16800;
		ULONG	Date19200;
		ULONG	Date21600;
		ULONG	Date24000;
		ULONG	Date26400;
		ULONG	Date28800;
	   ULONG Date31200;
		ULONG	Date33600;
		ULONG DateFAST;
		BYTE	UserSlow[ 32 ];		// Name of last user with connect < 9600
		BYTE	User9600[ 32 ];		// Name of last user with connect 9600
		BYTE	User12000[ 32 ];		// Name of last user with connect 12000
		BYTE	User14400[ 32 ];		// You've got it by now
		BYTE	User16800[ 32 ];
		BYTE	User19200[ 32 ];
		BYTE	User21600[ 32 ];
		BYTE	User24000[ 32 ];
		BYTE	User26400[ 32 ];
		BYTE	User28800[ 32 ];
	   BYTE  User31200[ 32 ];
		BYTE	User33600[ 32 ];
		BYTE	UserFAST[ 32 ];
	} *new_data;

	if ( DOSBase )
	{
		if ( old_data = AllocVec( sizeof( struct BAUDRATE_OLD ) , MEMF_PUBLIC|MEMF_CLEAR ) )
		{
			if ( new_data = AllocVec( sizeof( struct BAUDRATE ) , MEMF_PUBLIC|MEMF_CLEAR ) )
			{
				/* Clear new structure to be on the safe side */
				memset( (char *) new_data , 0 , sizeof( struct BAUDRATE ) );

				/* Open old data file */
				if ( fh = Open( OLDDATA , MODE_OLDFILE ) )
				{
					if ( Read( fh , old_data , sizeof( struct BAUDRATE_OLD ) ) )
					{
						/* Tranfser all data to the new structure */
						new_data->RunningSince = old_data->RunningSince;
						new_data->ConnectSlow = old_data->ConnectSlow;
						new_data->Connect9600 = old_data->Connect9600;
						new_data->Connect12000 = old_data->Connect12000;
						new_data->Connect14400 = old_data->Connect14400;
						new_data->Connect16800 = old_data->Connect16800;
						new_data->Connect19200 = old_data->Connect19200;
						new_data->Connect21600 = old_data->Connect21600;
						new_data->Connect24000 = old_data->Connect24000;
						new_data->Connect26400 = old_data->Connect26400;
						new_data->Connect28800 = old_data->Connect28800;
					   new_data->Connect31200 = old_data->Connect31200;
						new_data->Connect33600 = 0;
						new_data->ConnectFAST = old_data->ConnectFAST;
						new_data->DateSlow = old_data->DateSlow;
						new_data->Date9600 = old_data->Date9600;
						new_data->Date12000 = old_data->Date12000;
						new_data->Date14400 = old_data->Date14400;
						new_data->Date16800 = old_data->Date16800;
						new_data->Date19200 = old_data->Date19200;
						new_data->Date21600 = old_data->Date21600;
						new_data->Date24000 = old_data->Date24000;
						new_data->Date26400 = old_data->Date26400;
						new_data->Date28800 = old_data->Date28800;
						new_data->Date31200 = old_data->Date31200;
						new_data->Date33600 = 0;
						new_data->DateFAST = old_data->DateFAST;
						strcpy( new_data->UserSlow , old_data->UserSlow );
						strcpy( new_data->User9600 , old_data->User9600 );
						strcpy( new_data->User12000 , old_data->User12000 );
						strcpy( new_data->User14400 , old_data->User14400 );
						strcpy( new_data->User16800 , old_data->User16800 );
						strcpy( new_data->User19200 , old_data->User19200 );
						strcpy( new_data->User21600 , old_data->User21600 );
						strcpy( new_data->User24000 , old_data->User24000 );
						strcpy( new_data->User26400 , old_data->User26400 );
						strcpy( new_data->User28800 , old_data->User28800 );
						strcpy( new_data->User31200 , old_data->User31200 );
						strcpy( new_data->UserFAST , old_data->UserFAST );

						/* Open new file, but first close old file */
						Close( fh );
						if ( fh = Open( NEWDATA , MODE_NEWFILE ) )
						{
							Write( fh , old_data , sizeof( struct BAUDRATE_OLD ) );
							Close( fh );
							
							if ( fh = Open( OLDDATA , MODE_NEWFILE ) )
							{
								Write( fh , new_data , sizeof( struct BAUDRATE ) );
								success = TRUE;
							}
							else
								Write( Output() , ERROR_BACKUP , strlen( ERROR_OPENING ) );
						}
						else
							Write( Output() , ERROR_OPENING , strlen( ERROR_OPENING ) );
					}
					else
						Write( Output() , ERROR_READING , strlen( ERROR_READING ) );
					Close( fh );	/* Close old file */
				}
				else
					Write( Output() , ERROR_OPENING , strlen( ERROR_OPENING ) );

				/* Free memory again */
				FreeVec( new_data );
			}
			else
				Write( Output() , NO_MEMORY , strlen( NO_MEMORY ) );
			FreeVec( old_data );
		}
		else
			Write( Output() , NO_MEMORY , strlen( NO_MEMORY ) );

		if ( success )
			Write( Output() , ALL_OK , strlen( ALL_OK ) );
		else
			Write( Output() , NOT_OK , strlen( NOT_OK ) );

		CloseLibrary( ( struct Library *) DOSBase );
	}
}
