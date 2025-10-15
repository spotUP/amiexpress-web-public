#define COMMENT_STATS

#include "Comment.H"

void Commentistics ( void )
{
	char	temp[ 300 ] , perc[ 21 ], overall[15], time[ 40 ];
	struct Node *node;
	int	i, j, lines_on_screen = 4, max_lines;
	long	total_messages = 0;
	FILE	*fptr;
	struct USER usr;
	BOOL	double_space = FALSE;

	for ( node = (struct Node *) KC_Users0List.mlh_Head ; node->ln_Succ; node = node->ln_Succ )
	{
		rc_node = (struct receiver_node *) node;			
		total_messages += rc_node->rc_msg_received;
	}

	if ( total_messages == 0 )
	{
		sm( " No messages have been written yet. Nothing to show.\n\r" , 0 );
		enddoor ( EXIT_SILENTLY );
	}

	// First, clear the screen and set cursor in upper left corner
	sm( CLS , 0 );

	// How may space does the header take up (in lines)?
	lines_on_screen += DisplayHeader( 3 );

	sm( "[34m.----------------------------------------------------------------------------.\n\r" , 0 );
	sm( "| [36mKiLLER COMMENT v1.4  [34m^  [35m<X>   COMMENTiSTiCS   <X>  [34m^  [36m(c) KiLLraVeN/MYSTiC [34m|\n\r" , 0 );
	sm( "`----------------------------------------------------------------------------'\n\r" , 0 );
	sm( ".----------------------.----------------------.-------.-------.--------------.\n\r" , 0 );
	sm( "| [0mUser Name            [34m| [0m0%[33m--------------[0m100% [34m| [0mTotal [34m| [0mPerc% [34m| [0mOverall      [34m|\n\r" , 0 );
	sm( ":----------------------:----------------------:-------:-------:--------------:\n\r" , 0 );

	// How many lines can there be at the most?
	getuserstring( temp , DT_LINELENGTH );
	max_lines = atoi( temp );

	// Make up for the lost line while displaying header (why? don't know)
	if ( gn_ptr->gn_header[ 0 ] != 0x00 )
		lines_on_screen += 1;

	// Do we use two lines per receiver or not?
	if ( lines_on_screen + ( gn_ptr->gn_total_users * 2 ) + 3 <= max_lines )
		double_space = TRUE;

	for ( node = (struct Node *) KC_Users0List.mlh_Head ; node->ln_Succ; node = node->ln_Succ )
	{
		rc_node = (struct receiver_node *) node;			
		strcpy( perc , "####################" );
		if ( rc_node->rc_msg_received != 0 )
		{
			i = ( ( rc_node->rc_msg_received * 100 ) / total_messages );
  			j = i / 5 ;

			// The sysop's bar displays his part of the total number of
			// messages written. So if there are 200 messages written in
			// total and 100 of them are to the sysop, his bar will be
			// filled for 50%. The rest of 100 messages is relatively
			// divided between the cosysops.
			//
			// This means it *IS* possible for a cosysop to have a bigger
			// bar than the sysop.
			if ( (struct Node *) rc_node->nn_Node.ln_Pred == (struct Node *) &KC_Users0List.mlh_Head )
				total_messages -= rc_node->rc_msg_received;
		}
		else
		{
			i = 0;
			j = 0;
		}

		perc[ j ] = 0x00;

		if ( rc_node->rc_msg_received <= 5 )
			strcpy( overall, "Loser" );
		else
			if ( rc_node->rc_msg_received < 50 )
				strcpy( overall , "That's it?" );
			else
				if ( rc_node->rc_msg_received < 100 )
					strcpy( overall , "Just begun" );
				else
					if ( rc_node->rc_msg_received < 250 )
						strcpy( overall , "Some day..." );
					else
						if ( rc_node->rc_msg_received < 500 )
							strcpy( overall , "OK dude" );
						else
							if ( rc_node->rc_msg_received < 1000 )
								strcpy( overall , "Macho man" );
							else
								if ( rc_node->rc_msg_received < 2000 )
									strcpy( overall , "Tough guy!" );
								else
									if ( rc_node->rc_msg_received >= 2000 )
										strcpy( overall , "Ruler!" );

		if ( rc_node->rc_number == 1 )
			sprintf( temp , "| [32m%-20.20s [34m| [32m%-20.20s [34m| [32m%5d [34m|  [32m%3d% [34m| [32m%-12s [34m|\n\r" , rc_node->rc_knownas , perc , rc_node->rc_msg_received , i , overall );
		else
			sprintf( temp , "| [36m%-20.20s [34m| [35m%-20.20s [34m| [36m%5d [34m|  [36m%3d% [34m| [36m%-12s [34m|\n\r" , rc_node->rc_knownas , perc , rc_node->rc_msg_received , i , overall );
		sm( temp , 0 );

		if ( 	double_space &&
				rc_node->rc_number < gn_ptr->gn_total_users )
			sm(":----------------------:----------------------:-------:-------:--------------:\n\r" , 0 );
	}

	// Don't forget to add the sysop's amount of messages to the total
	// again.
	rc_node = (struct receiver_node *) KC_Users0List.mlh_Head;
	total_messages += rc_node->rc_msg_received;

	sm( ":----------------------^----------------------^-------^-------^--------------:\n\r" , 0 );
	sprintf( temp , "| [36mTotal messages: %6ld [34m^ [36mAverage: %6ld msgs per user [34m^ [35m[Q]uit / Any key  [34m|\n\r" , total_messages , total_messages/gn_ptr->gn_total_users );
	sm( temp , 0 );
	sm( "`----------------------------------------------------------------------------'[1A[3D" , 0 );

	hk ( "" , temp );
	switch ( temp[ 0 ] )
	{
		case 'q'	:
		case 'Q'	:
		case 0x1B:
		case  3 	:	sm( "[1B" , 0 );
						enddoor( EXIT_SILENTLY );
	}

	// Clear the screen in a fancy way
	sm( "\n\r" , 0 );
	if ( double_space )
		j = 4 + ( 2 * gn_ptr->gn_total_users );
	else
		j = 5 + gn_ptr->gn_total_users;
	for ( i = 1 ; i <= j ; i ++ )
		sm( "                                                                              \n\r[2A" , 0 );

	// Built the header of the second screen
	sm( ".------------------------.--------------------------.------------------------.\n\r" , 0 );
	sm( "| [0mUser Name              [34m| [0mDate/Time of last msg    [34m| [0mLast msg came from     [34m|\n\r" , 0 );
	sm( ":------------------------:--------------------------:------------------------:\n\r" , 0 );

	// Open the USER.DATA for retrieval of user names
	sprintf( temp, "%s" , bbs_location );
	AddPart( temp, "USER.DATA" , 200 );
	if ( fptr = fopen ( temp , "r" ) )
	{
		for ( node = (struct Node *) KC_Users0List.mlh_Head ; node->ln_Succ; node = node->ln_Succ )
		{
			rc_node = (struct receiver_node *) node;			

			// What's the time?
			// It's got no use to time 0, so filter that one out
			if ( rc_node->rc_last_msg != 0 )
			{
				sprintf( time , ctime( &rc_node->rc_last_msg ) );
				time[ strlen(time) - 1 ] = 0x00;
			}
			else
				sprintf( time , "None" );

			// Retrieving the name of the last message sender
			// Make sure we don't try seeking user 0 (no messages received)
			// or we will get an error (boom crash failure! :) ).
			if ( rc_node->rc_last_user != 0 )
			{
				if ( fseek ( fptr , ( rc_node->rc_last_user - 1 ) * sizeof ( struct USER ) , SEEK_SET ) == -1 )
				{
					sm( "Error reading USER.DATA file for user's name. Stopping output.\n\r" , 0);
					fclose( fptr );
					break;
				}
				fread ( &usr , 1 , sizeof( struct USER ) , fptr );
			}
			else
				sprintf( usr.Name , "None" );

			// Put the lot on screen
			sprintf( temp , "| [36m%-22.22s [34m| [35m%-24.24s [34m| [36m%-22.22s [34m|\n\r" , rc_node->rc_knownas , time , usr.Name );
			sm( temp , 0 );
			if ( 	double_space &&
					rc_node->rc_number < gn_ptr->gn_total_users )
				sm(":------------------------:--------------------------:------------------------:\n\r" , 0 );
		}
		sm( "`------------------------^--------------------------^------------------------'\n\r" , 0 );
		fclose( fptr );
	}
	enddoor( EXIT_SILENTLY );
}
