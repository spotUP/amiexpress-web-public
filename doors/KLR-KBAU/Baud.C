#define BAUD_MAIN

#include "Baud.H"
#include "Baud_protos.h"

UBYTE VER[]="$VER: KiLLER-Baud 1.6.0 "__AMIGADATE__;

ULONG		highest_noc; /* NOC = Number of Connects */
char		DATAFILE[] = "PROGDIR:KiLLER_Baud.Data";

#define OVERRIDE 2

void main ( int argc , char *argv[] )
{
   char temp[ 200 ], temp2[ 200 ];
	char	bull1[ 200 ], bull2[ 200 ];

	ULONG	total_connects;

	struct BAUDRATE	baud_ptr;
	struct BAUDRATE_OLD *old_data;

	struct Library    *IconBase;
	struct DiskObject *dobj;
	char   *tooltype, **toolarray;

	BOOL	on_screen = FALSE, one_file = FALSE;

	int	skip_baud[ 13 ];

	FILE	*fptr;

	/* Register at /X server */
	Register( atoi( argv[ 1 ] ) );

	/* Trace command icon */
	getuserstring( temp , BB_MAINLINE );
	WordScan( temp2 , temp , 1 );
	LocateCommandIcon( temp , temp2 );

	/* Slower and faster baud-rates are normally not put in the bulletin
	 * that K_Baud creates IF they are not used. To do this, we set the
	 * value of skip_baud[x] to TRUE. TRUE means that they field will be
	 * checked for > 0 before it is used.
	 */
	for ( skip_baud[ 0 ] = 0 ; skip_baud[ 0 ] < 12 ; skip_baud[ 0 ] ++ )
		skip_baud[ skip_baud[ 0 ] ] = FALSE;
	skip_baud[ 0 ] = TRUE;	// SLOW
	skip_baud[ 12 ] = TRUE; // FAST

	// Open icon library and read the icon's tooltypes
	IconBase = OpenLibrary("icon.library", 0L	);
	if ( IconBase )
	{
		dobj = GetDiskObject( temp );
		if ( dobj )
		{
			toolarray = (char **) dobj->do_ToolTypes;

			if ( tooltype = FindToolType( toolarray , "DETECT_BAUD" ) )
			{
				if ( tooltype = FindToolType( toolarray , "LOCAL_NODE" ) )
					UpdateDataFile( tooltype );
				else
					UpdateDataFile( "0" );
				FreeDiskObject( dobj );
				CloseLibrary( IconBase );
				enddoor();
			}

			if ( tooltype = FindToolType( toolarray , "NO_SLOW" ) )
				skip_baud[ 0 ] = OVERRIDE;

			if ( tooltype = FindToolType( toolarray , "NO_9600" ) )
				skip_baud[ 1 ] = OVERRIDE;

			if ( tooltype = FindToolType( toolarray , "NO_12000" ) )
				skip_baud[ 2 ] = OVERRIDE;

			if ( tooltype = FindToolType( toolarray , "NO_14400" ) )
				skip_baud[ 3 ] = OVERRIDE;

			if ( tooltype = FindToolType( toolarray , "NO_16800" ) )
				skip_baud[ 4 ] = OVERRIDE;

			if ( tooltype = FindToolType( toolarray , "NO_19200" ) )
				skip_baud[ 5 ] = OVERRIDE;

			if ( tooltype = FindToolType( toolarray , "NO_21600" ) )
				skip_baud[ 6 ] = OVERRIDE;

			if ( tooltype = FindToolType( toolarray , "NO_24000" ) )
				skip_baud[ 7 ] = OVERRIDE;

			if ( tooltype = FindToolType( toolarray , "NO_26400" ) )
				skip_baud[ 8 ] = OVERRIDE;

			if ( tooltype = FindToolType( toolarray , "NO_28800" ) )
				skip_baud[ 9 ] = OVERRIDE;

			if ( tooltype = FindToolType( toolarray , "NO_31200" ) )
				skip_baud[ 10 ] = OVERRIDE;

			if ( tooltype = FindToolType( toolarray , "NO_33600" ) )
				skip_baud[ 11 ] = OVERRIDE;

			if ( tooltype = FindToolType( toolarray , "NO_FAST" ) )
				skip_baud[ 12 ] = OVERRIDE;

			if ( tooltype = FindToolType( toolarray , "BULL" ) )
			{
				strcpy( bull1 , tooltype );
				one_file = TRUE;
				bull2[ 0 ] = 0x00;
			}
			else
			{
				if ( tooltype = FindToolType( toolarray, "BULL.1" ) )
					strcpy( bull1 , tooltype );
				else
					bull1[ 0 ] = 0x00;

				if ( tooltype = FindToolType( toolarray , "BULL.2" ) )
					strcpy( bull2 , tooltype );
				else
					bull2[ 0 ] = 0x00;
			}
		
			if ( bull1[ 0 ] == 0x00 && bull2[ 0 ] == 0x00 )
			{
				strcpy( bull1 , "T:KiLLER_Baud_Output.Temp" );
				on_screen = TRUE;
			}
			FreeDiskObject( dobj );
		}
		else
		{
			sm( "[33mKiLLER BAUD ERROR![0m Could not lock icon!\n\r" , 0 );
			enddoor();
		}
		CloseLibrary( IconBase );
	}
	else
	{
		sm("[33mKiLLER BAUD ERROR![0m Could not open icon.library\n\r" , 0 );
		enddoor();
	}

	// Open the data file
	if ( fptr = fopen( DATAFILE , "r" ) )
	{
		fseek( fptr , 0 , SEEK_END );
		total_connects = ftell( fptr );
		fseek( fptr , 0 , SEEK_SET );
		if ( total_connects == 524 )
		{
			fread( &baud_ptr , sizeof( struct BAUDRATE ) , 1 , fptr );
			sm( "Yeeha!\n\r" , 0 );
		}
		else
		{
			if ( old_data = AllocVec( sizeof( struct BAUDRATE_OLD ) , MEMF_PUBLIC|MEMF_CLEAR ) )
			{
				fread( old_data , sizeof( struct BAUDRATE_OLD ) , 1 , fptr );

				/* Tranfser all data to the new structure */
				baud_ptr.RunningSince = old_data->RunningSince;
				baud_ptr.ConnectSlow = old_data->ConnectSlow;
				baud_ptr.Connect9600 = old_data->Connect9600;
				baud_ptr.Connect12000 = old_data->Connect12000;
				baud_ptr.Connect14400 = old_data->Connect14400;
				baud_ptr.Connect16800 = old_data->Connect16800;
				baud_ptr.Connect19200 = old_data->Connect19200;
				baud_ptr.Connect21600 = old_data->Connect21600;
				baud_ptr.Connect24000 = old_data->Connect24000;
				baud_ptr.Connect26400 = old_data->Connect26400;
				baud_ptr.Connect28800 = old_data->Connect28800;
			   baud_ptr.Connect31200 = old_data->Connect31200;
				baud_ptr.Connect33600 = 0;
				baud_ptr.ConnectFAST = old_data->ConnectFAST;
				baud_ptr.DateSlow = old_data->DateSlow;
				baud_ptr.Date9600 = old_data->Date9600;
				baud_ptr.Date12000 = old_data->Date12000;
				baud_ptr.Date14400 = old_data->Date14400;
				baud_ptr.Date16800 = old_data->Date16800;
				baud_ptr.Date19200 = old_data->Date19200;
				baud_ptr.Date21600 = old_data->Date21600;
				baud_ptr.Date24000 = old_data->Date24000;
				baud_ptr.Date26400 = old_data->Date26400;
				baud_ptr.Date28800 = old_data->Date28800;
				baud_ptr.Date31200 = old_data->Date31200;
				baud_ptr.Date33600 = 0;
				baud_ptr.DateFAST = old_data->DateFAST;
				strcpy( baud_ptr.UserSlow , old_data->UserSlow );
				strcpy( baud_ptr.User9600 , old_data->User9600 );
				strcpy( baud_ptr.User12000 , old_data->User12000 );
				strcpy( baud_ptr.User14400 , old_data->User14400 );
				strcpy( baud_ptr.User16800 , old_data->User16800 );
				strcpy( baud_ptr.User19200 , old_data->User19200 );
				strcpy( baud_ptr.User21600 , old_data->User21600 );
				strcpy( baud_ptr.User24000 , old_data->User24000 );
				strcpy( baud_ptr.User26400 , old_data->User26400 );
				strcpy( baud_ptr.User28800 , old_data->User28800 );
				strcpy( baud_ptr.User31200 , old_data->User31200 );
				baud_ptr.User33600[ 0 ] = 0x00;
				strcpy( baud_ptr.UserFAST , old_data->UserFAST );

				/* Free memory again */
				FreeVec( old_data );
			}
			else
			{
				sm( "[33mKiLLER BAUD ERROR![0m Not enough memory.\n\r" , 0 );
				enddoor();
			}
		}
		fclose( fptr );
	}
	else
	{
		sm("[33mKiLLER BAUD ERROR![0m Could not open data file. Please warn sysop.\n\r" , 0 );
		enddoor();
	}

	// Calculate neccessary stuff for percentages etc. etc.
	total_connects  = baud_ptr.ConnectSlow;
	total_connects += baud_ptr.Connect9600;
	total_connects += baud_ptr.Connect12000;
	total_connects += baud_ptr.Connect14400;
	total_connects += baud_ptr.Connect16800;
	total_connects += baud_ptr.Connect19200;
	total_connects += baud_ptr.Connect21600;
	total_connects += baud_ptr.Connect24000;
	total_connects += baud_ptr.Connect26400;
	total_connects += baud_ptr.Connect28800;
	total_connects += baud_ptr.Connect31200;
	total_connects += baud_ptr.Connect33600;
	total_connects += baud_ptr.ConnectFAST;

	// What is the most used baudrate?
	highest_noc = PopularBaudrate( temp , (struct BAUDRATE *) &baud_ptr );

	// Since when is KiLLER Baud running on this system?
	GetDate( temp2 , (struct BAUDRATE *) &baud_ptr );

	// Does user want Bulletin #1?
	if ( bull1[ 0 ] != 0x00 )	
	{
		if ( fptr = fopen( bull1 , "w" ) )
		{
			if ( on_screen || one_file )
				fprintf( fptr , "~~\n" );

			WriteHeader( fptr );
			fprintf( fptr , ".----------------.----------------------.-------.-------.---------------------.\n" );
			fprintf( fptr , "| [31mConnect String [34m| [31m0%[33m--------------[31m100% [34m| [31mTotal [34m| [31mPerc% [34m| [31mOverall             [34m|\n" );
			fprintf( fptr , ":----------------:----------------------:-------:-------:---------------------:\n" );

			WriteRecordLine( fptr , "Slower baud" , baud_ptr.ConnectSlow , total_connects , skip_baud[ 0 ] );
			WriteRecordLine( fptr , " 9.600 baud" , baud_ptr.Connect9600 , total_connects , skip_baud[ 1 ] );
			WriteRecordLine( fptr , "12.000 baud" , baud_ptr.Connect12000 , total_connects , skip_baud[ 2 ] );
			WriteRecordLine( fptr , "14.400 baud" , baud_ptr.Connect14400 , total_connects , skip_baud[ 3 ] );
			WriteRecordLine( fptr , "16.800 baud" , baud_ptr.Connect16800 , total_connects , skip_baud[ 4 ] );
			WriteRecordLine( fptr , "19.200 baud" , baud_ptr.Connect19200 , total_connects , skip_baud[ 5 ] );
			WriteRecordLine( fptr , "21.600 baud" , baud_ptr.Connect21600 , total_connects , skip_baud[ 6 ] );
			WriteRecordLine( fptr , "24.000 baud" , baud_ptr.Connect24000 , total_connects , skip_baud[ 7 ] );
			WriteRecordLine( fptr , "26.400 baud" , baud_ptr.Connect26400 , total_connects , skip_baud[ 8 ] );
			WriteRecordLine( fptr , "28.800 baud" , baud_ptr.Connect28800 , total_connects , skip_baud[ 9 ] );
			WriteRecordLine( fptr , "31.200 baud" , baud_ptr.Connect31200 , total_connects , skip_baud[ 10 ] );
			WriteRecordLine( fptr , "33.600 baud" , baud_ptr.Connect33600 , total_connects , skip_baud[ 11 ] );
			WriteRecordLine( fptr , "Faster baud" , baud_ptr.ConnectFAST , total_connects , skip_baud[ 12 ] );

			fprintf( fptr , ":----------------^----------------------^-------^-------^---------------------:\n" );
			WriteFooter( fptr , total_connects , temp , temp2 );

			if ( on_screen || one_file )
				fprintf( fptr , "~SP\n" );

			fclose( fptr );
		}
	}

	if ( bull2[ 0 ] == 0x00 )
	{
		if ( one_file || on_screen )
		{
			if ( ! ( fptr = fopen( bull1 , "a" ) ) )
			{
				sm("[33mKiLLER BAUD ERROR![0m Couldn't write second bulletin! Please warn sysop.\n\r" , 0 );
				enddoor();
			}
		}
	}
	else
	{
		if ( ! ( fptr = fopen( bull2 , "w" ) ) )
		{
			sm("[33mKiLLER BAUD ERROR![0m Couldn't write second bulletin! Please warn sysop.\n\r" , 0 );
			enddoor();
		}
	}

	if ( bull2[ 0 ] != 0 || one_file || on_screen )
	{
		WriteHeader( fptr );
		fprintf( fptr , ".----------------.--------------------------.---------------------------------.\n" );
		fprintf( fptr , "| [31mConnect String [34m| [31mDate/Time last Connect   [34m| [31mLast Connect made by            [34m|\n" );
		fprintf( fptr , ":----------------:--------------------------:---------------------------------:\n" );
		
		WriteDateLine( fptr , "Slower baud" , baud_ptr.DateSlow , baud_ptr.UserSlow , baud_ptr.ConnectSlow , skip_baud[ 0 ] );
		WriteDateLine( fptr , " 9.600 baud" , baud_ptr.Date9600 , baud_ptr.User9600 , baud_ptr.Connect9600 , skip_baud[ 1 ] );
		WriteDateLine( fptr , "12.000 baud" , baud_ptr.Date12000 , baud_ptr.User12000 , baud_ptr.Connect12000 , skip_baud[ 2 ] );
		WriteDateLine( fptr , "14.400 baud" , baud_ptr.Date14400 , baud_ptr.User14400 , baud_ptr.Connect14400 , skip_baud[ 3 ] );
		WriteDateLine( fptr , "16.800 baud" , baud_ptr.Date16800 , baud_ptr.User16800 , baud_ptr.Connect16800 , skip_baud[ 4 ] );
		WriteDateLine( fptr , "19.200 baud" , baud_ptr.Date19200 , baud_ptr.User19200 , baud_ptr.Connect19200 , skip_baud[ 5 ] );
		WriteDateLine( fptr , "21.600 baud" , baud_ptr.Date21600 , baud_ptr.User21600 , baud_ptr.Connect21600 , skip_baud[ 6 ] );
		WriteDateLine( fptr , "24.000 baud" , baud_ptr.Date24000 , baud_ptr.User24000 , baud_ptr.Connect24000 , skip_baud[ 7 ] );
		WriteDateLine( fptr , "26.400 baud" , baud_ptr.Date26400 , baud_ptr.User26400 , baud_ptr.Connect26400 , skip_baud[ 8 ] );
		WriteDateLine( fptr , "28.800 baud" , baud_ptr.Date28800 , baud_ptr.User28800 , baud_ptr.Connect28800 , skip_baud[ 9 ] );
		WriteDateLine( fptr , "31.200 baud" , baud_ptr.Date31200 , baud_ptr.User31200 , baud_ptr.Connect31200 , skip_baud[ 10 ] );
		WriteDateLine( fptr , "33.600 baud" , baud_ptr.Date33600 , baud_ptr.User33600 , baud_ptr.Connect33600 , skip_baud[ 11 ] );
		WriteDateLine( fptr , "Faster baud" , baud_ptr.DateFAST , baud_ptr.UserFAST , baud_ptr.ConnectFAST , skip_baud[ 12 ] );

		fprintf( fptr , ":----------------^--------------------------^---------------------------------:\n" );
		WriteFooter( fptr , total_connects , temp , temp2 );

		fclose( fptr );
	}
		
	if ( on_screen )
	{
		sf( "T:KiLLER_Baud_Output.Temp" );
		remove( "T:KiLLER_Baud_Output.Temp" );
	}
	enddoor();
}

void enddoor ( void )
{
	ShutDown();
	end();
}

void LastCommand ( void )
{}

void end ( void )
{
	exit ( 0 );
}

VOID WordScan ( char *result , char *text, int num )   /* © TyCoOn/MYSTiC */
{
   int number = 1, len, counter, lan, length;
   char temp[200];

   length = strlen(text);
   for (counter = 1 ; counter <= length ; counter++)
   {
      if (num == 0)
      {
         if (text[counter-1] == 0x2F)
         {
            result[counter-1] = 0x00;
            counter = length+1;
         }
         else
         {
            result[counter-1] = text[counter-1];
         }
      }
      if (number == num)
      {
         len = length-counter+1;
         if (len <= 1) len = 1;
         lan = counter;
         strmid(text,temp,lan,len);
         sscanf(temp,"%s",result);
         result[len]=0x00;
         counter = length+1;
      }
      else
      {
         if ((num != 0)&&(text[counter]==0x20)&&(text[counter-1]!=0x20))
         {
            number++;
         }
      }
   }
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

int percentage( char *output , ULONG perc , ULONG total )
{
	int i, j, k;

	strcpy( output , "####################" );
	if ( perc != 0 && highest_noc != 0 && total != 0 )
   {
		i = ( ( perc * 100 ) / highest_noc );
		k = ( ( perc * 100 ) / total );
		j = i / 5;
   }
	else
   {
		j = 0;
		k = 0;
   }
	output[ j ] = 0x00;
	return( k );
}

void Rate( char *output , int perc )
{
	if ( perc > 95 )
		strcpy( output , "The Ruler!" );
	else
		if ( perc > 90 )
			strcpy( output , "King's Speed" );
		else
			if ( perc > 80 )
				strcpy( output , "Wow! Hot!" );
			else
				if ( perc > 70 )
					strcpy( output , "In your face" );
				else
					if ( perc > 60 )
						strcpy( output, "Very popular!" );
					else
						if ( perc > 50 )
							strcpy( output , "Most likely" );
						else
							if ( perc > 40 )
								strcpy( output , "Much liked");
							else
								if ( perc > 30 )
									strcpy( output, "Popular rate" );
								else
									if ( perc > 20 )
										strcpy( output , "Not too bad" );
									else
										if ( perc > 10 )
											strcpy( output , "Used by few");
										else
											if ( perc > 0 )
												strcpy( output , "Private" );
											else
												if ( perc <= 0 )
													strcpy( output , "Hardly used" );
}

ULONG PopularBaudrate( char *output , struct BAUDRATE *baud_ptr )
{
	ULONG	top = 0;

	if ( baud_ptr->ConnectSlow >= top )
	{
		top = baud_ptr->ConnectSlow;
		strcpy( output , "Slower" );
	}

	if ( baud_ptr->Connect9600 >= top )
	{
		top = baud_ptr->Connect9600;
		strcpy( output , "9.600" );
	}
		
	if ( baud_ptr->Connect12000 >= top )
	{
		top = baud_ptr->Connect12000;
		strcpy( output, "12.000" );
	}
		
	if ( baud_ptr->Connect14400 >= top )
	{
		top = baud_ptr->Connect14400;
		strcpy( output, "14.400" );
	}
		
	if ( baud_ptr->Connect16800 >= top )
	{
		top = baud_ptr->Connect16800;
		strcpy( output, "16.800");
	}

	if ( baud_ptr->Connect19200 >= top )
	{
		top = baud_ptr->Connect19200;
		strcpy( output, "19.200" );
	}

	if ( baud_ptr->Connect21600 >= top )
	{
		top = baud_ptr->Connect21600;
		strcpy( output, "21.600");
	}

	if ( baud_ptr->Connect24000 >= top )
	{
		top = baud_ptr->Connect24000;
		strcpy( output, "24.000" );
	}

	if ( baud_ptr->Connect26400 >= top )
	{
		top = baud_ptr->Connect26400;
		strcpy( output, "26.400");
	}

	if ( baud_ptr->Connect28800 >= top )
	{
		top = baud_ptr->Connect28800;
		strcpy( output, "28.800" );
	}

	if ( baud_ptr->Connect31200 >= top )
	{
		top = baud_ptr->Connect31200;
		strcpy( output, "31.200" );
	}

	if ( baud_ptr->Connect33600 >= top )
	{
		top = baud_ptr->Connect33600;
		strcpy( output, "33.600" );
	}

	if ( baud_ptr->ConnectFAST >= top )
	{
		top = baud_ptr->ConnectFAST;
		strcpy( output, "Faster" );
	}

	if ( top == 0 )
		strcpy( output , "No");

	return( top );
}

void GetDate( char *output , struct BAUDRATE *baud_ptr )
{
	char	temp[ 30 ];
	strcpy( temp , ctime( (time_t *) &baud_ptr->RunningSince) );

	output[ 0 ] = temp[ 8 ];
	output[ 1 ] = temp[ 9 ];
	output[ 2 ] = '-';
	output[ 3 ] = temp[ 4 ];
	output[ 4 ] = temp[ 5 ];
	output[ 5 ] = temp[ 6 ];
	output[ 6 ] = '-';
	output[ 7 ] = temp[ 20 ];
	output[ 8 ] = temp[ 21 ];
	output[ 9 ] = temp[ 22 ];
	output[ 10 ] = temp[ 23 ];
	output[ 11 ] = 0x00;
}

void WriteHeader ( FILE *fptr )
{
	fprintf( fptr , "\014" ); // CLS
	fprintf( fptr , "[34m.-----------------------------------------------------------------------------.\n" );
	fprintf( fptr , "| [36mKiLLER BAUD v1.5  [34m^  [35m<> Baud Rate Statistical View <>  [34m^  [36mKiLLraVeN/MYSTiC! [34m|\n" );
	fprintf( fptr , "`-----------------------------------------------------------------------------'\n" );
}

void WriteFooter( FILE *fptr , ULONG total_connects , char *temp , char *temp2 )
{
	fprintf( fptr , "| [36mTotal Connects : %6ld [34m^ [36mFavourite speed: %6.6s baud [34m^ [36mSince: %11.11s [34m|\n" , total_connects , temp , temp2 );
	fprintf( fptr , "`-----------------------------------------------------------------------------'\n\n" );
}

void WriteDateLine ( FILE *fptr , char *baud_rate , ULONG date , char *user , ULONG noc , BOOL check )
{
	char	d_date[ 30 ],
			d_user[ 32 ];
	BOOL	write_it = TRUE;

	if ( check == OVERRIDE )
		write_it = FALSE;

	if ( check == TRUE )
		if ( noc < 1 )
			write_it = FALSE;
		
	if ( write_it )
	{
		if ( date != 0 )	
			strcpy( d_date , ctime( (time_t *) &date ) );
		else
			strcpy( d_date , "Never" );

		if ( user[ 0 ] == 0x00 )
			strcpy( d_user , "Nobody" );
		else
			strcpy( d_user , user );

		fprintf( fptr , "|  [36m%-13.13s [34m| [35m%-24.24s [34m| [36m%-31.31s [34m|\n" , baud_rate , d_date , d_user );
	}
}

void WriteRecordLine ( FILE *fptr , char *connect , ULONG Connects , ULONG total_connects , BOOL check )
{
	int	i;
	char	rate[ 31 ], perc[ 22 ];
	BOOL	write_it = TRUE;

	if ( check == OVERRIDE )
		write_it = FALSE;

	if ( check == TRUE )
		if ( Connects <= 0 )
			write_it = FALSE;

	if ( write_it )
	{
		i = percentage( perc , Connects , total_connects );
		if ( highest_noc != 0 )
			Rate( rate , ( ( 100 * Connects ) / highest_noc ) );
		else
			Rate( rate , 0 );
		fprintf( fptr , "|  [36m%-13.13s [34m| [35m%-20.20s [34m| [36m%5ld [34m|  [36m%3d% [34m|[36m %-19.19s[34m |\n" , connect , perc , Connects , i , rate );
	}
}

void UpdateDataFile( char *LocalNode )
{
	char	temp[ 200 ];
	char	*ptr;
	FILE	*fptr;
	struct BAUDRATE	baud_ptr;
	struct BAUDRATE_OLD	*old_data;
	ULONG	i,t;

	// Which node are we on? If it's the local node we can quit.
	getuserstring( temp , BB_NODEID );
	if ( atoi( LocalNode ) == atoi( temp ) )
		enddoor();

	// Pick up the baud rate and add it to the data file
	getuserstring( temp , NODE_BAUD );

	// Does our data file exist? If not, create an empty one.
	if ( access( DATAFILE , F_OK) )
	{
		/* Clear the structure (to be on the safe side) */
		memset( (char *) &baud_ptr , 0 , sizeof( struct BAUDRATE ) );

		/* And set starting data */
		time( (time_t *) &baud_ptr.RunningSince );
		if ( fptr = fopen( DATAFILE , "w" ) )
		{
			fwrite( &baud_ptr , sizeof( struct BAUDRATE ) , 1 , fptr );
			fclose( fptr );
		}
		else
		{
			sm("[33mKiLLER BAUD ERROR![0m Could not create data file! Warn sysop!\n\r" , 0 );
			enddoor();
		}
	}

	// Add baud rate to structure
	if ( fptr = fopen( DATAFILE , "r+" ) )
	{
		fseek( fptr , 0 , SEEK_END );
		i = ftell( fptr );
		fseek( fptr , 0 , SEEK_SET );
		if ( i == 524 )
			fread( &baud_ptr , sizeof( struct BAUDRATE ) , 1 , fptr );
		else
		{
			if ( old_data = AllocVec( sizeof( struct BAUDRATE_OLD ) , MEMF_PUBLIC|MEMF_CLEAR ) )
			{
				fread( old_data , sizeof( struct BAUDRATE_OLD ) , 1 , fptr );

				sm( "Hier" , 1 );
				sm( old_data->User19200 , 1 );
				sm( "tussen" , 1 );

				/* Tranfser all data to the new structure */
				baud_ptr.RunningSince = old_data->RunningSince;
				baud_ptr.ConnectSlow = old_data->ConnectSlow;
				baud_ptr.Connect9600 = old_data->Connect9600;
				baud_ptr.Connect12000 = old_data->Connect12000;
				baud_ptr.Connect14400 = old_data->Connect14400;
				baud_ptr.Connect16800 = old_data->Connect16800;
				baud_ptr.Connect19200 = old_data->Connect19200;
				baud_ptr.Connect21600 = old_data->Connect21600;
				baud_ptr.Connect24000 = old_data->Connect24000;
				baud_ptr.Connect26400 = old_data->Connect26400;
				baud_ptr.Connect28800 = old_data->Connect28800;
			   baud_ptr.Connect31200 = old_data->Connect31200;
				baud_ptr.Connect33600 = 0;
				baud_ptr.ConnectFAST = old_data->ConnectFAST;
				baud_ptr.DateSlow = old_data->DateSlow;
				baud_ptr.Date9600 = old_data->Date9600;
				baud_ptr.Date12000 = old_data->Date12000;
				baud_ptr.Date14400 = old_data->Date14400;
				baud_ptr.Date16800 = old_data->Date16800;
				baud_ptr.Date19200 = old_data->Date19200;
				baud_ptr.Date21600 = old_data->Date21600;
				baud_ptr.Date24000 = old_data->Date24000;
				baud_ptr.Date26400 = old_data->Date26400;
				baud_ptr.Date28800 = old_data->Date28800;
				baud_ptr.Date31200 = old_data->Date31200;
				baud_ptr.Date33600 = 0;
				baud_ptr.DateFAST = old_data->DateFAST;
				strcpy( baud_ptr.UserSlow , old_data->UserSlow );
				strcpy( baud_ptr.User9600 , old_data->User9600 );
				strcpy( baud_ptr.User12000 , old_data->User12000 );
				strcpy( baud_ptr.User14400 , old_data->User14400 );
				strcpy( baud_ptr.User16800 , old_data->User16800 );
				strcpy( baud_ptr.User19200 , old_data->User19200 );
				strcpy( baud_ptr.User21600 , old_data->User21600 );
				strcpy( baud_ptr.User24000 , old_data->User24000 );
				strcpy( baud_ptr.User26400 , old_data->User26400 );
				strcpy( baud_ptr.User28800 , old_data->User28800 );
				strcpy( baud_ptr.User31200 , old_data->User31200 );
				baud_ptr.User33600[ 0 ] = 0x00;
				strcpy( baud_ptr.UserFAST , old_data->UserFAST );

				/* Free memory again */
				FreeVec( old_data );
			}
			else
			{
				sm( "[33mKiLLER BAUD ERROR![0m Not enough memory.\n\r" , 0 );
				enddoor();
			}
		}
		
		// Determine baud rate, retrieve user name & get the date/time
		i = atol( temp );
		getuserstring( temp , DT_NAME );
		temp[ 31 ] = 0x00;
		time( ( time_t *) &t );

		switch ( i )
		{
			case	9600	:
				baud_ptr.Connect9600++;
				baud_ptr.Date9600 = t;
				ptr = (char *) &baud_ptr.User9600;
				break;

			case	12000	:
				baud_ptr.Connect12000++;
				baud_ptr.Date12000 = t;
				ptr = (char *) &baud_ptr.User12000;
				break;

			case	14400	:
				baud_ptr.Connect14400++;
				baud_ptr.Date14400 = t;
				ptr = (char *) &baud_ptr.User14400;
				break;

			case	16800	:
				baud_ptr.Connect16800++;
				baud_ptr.Date16800 = t;
				ptr = (char *) &baud_ptr.User16800;
				break;

			case	19200	:
				baud_ptr.Connect19200++;
				baud_ptr.Date19200 = t;
				ptr = (char *) &baud_ptr.User19200;
				break;

			case	21600	:
				baud_ptr.Connect21600++;
				baud_ptr.Date21600 = t;
				ptr = (char *) &baud_ptr.User21600;
				break;

			case	24000	:
				baud_ptr.Connect24000++;
				baud_ptr.Date24000 = t;
				ptr = (char *) &baud_ptr.User24000;
				break;

			case	26400	:
				baud_ptr.Connect26400++;
				baud_ptr.Date26400 = t;
				ptr = (char *) &baud_ptr.User26400;
				break;

			case	28800	:
				baud_ptr.Connect28800++;
				baud_ptr.Date28800 = t;
				ptr = (char *) &baud_ptr.User28800;
				break;

			case	31200 :
				baud_ptr.Connect31200++;
				baud_ptr.Date31200 = t;
				ptr = (char *) &baud_ptr.User31200;
				break;

			case	33600 :
				baud_ptr.Connect33600++;
				baud_ptr.Date33600 = t;
				ptr = (char *) &baud_ptr.User33600;
				break;

			default :
				if ( i < 9600 )
				{
					baud_ptr.ConnectSlow++;
					baud_ptr.DateSlow = t;
					ptr = (char *) &baud_ptr.UserSlow;
				}
				else
				{
					if ( i > 33600 )
					{
						baud_ptr.ConnectFAST++;
						baud_ptr.DateFAST = t;
						ptr = (char *) &baud_ptr.UserFAST;
					}
				}
				break;
		}
		
		strcpy( ptr , temp );
		fseek( fptr , 0 , SEEK_SET );
		fwrite( &baud_ptr , sizeof( struct BAUDRATE ) , 1 , fptr );
		fclose( fptr );
	}
	else
		sm("[33mKiLLER BAUD ERROR! Could not write data file! Please warn sysop.\n\r" , 0 );
}
