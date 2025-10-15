#define COMMENT_SELECT

#include "Comment.H"

BOOL SelectReceiver ( void )
{
	char	Temp[ 300 ], Time[ 40 ];
	int	i, j , y = 8 , home = 10, lines_on_screen = 4, max_lines;
	int	header_lines=0;
	long	t;
	struct Node *node;
	BOOL	quit = FALSE, select_a_user, double_space = FALSE;

	FILE	*header;

	// Enable cursor control
	putuserstring ( "" , 501 );

	// Display header
	sm ( CLS , 0 );

	if ( gn_ptr->gn_header[ 0 ] != 0x00 )
	{
		header = fopen( gn_ptr->gn_header , "r" );
		if ( header )
		{
			do
			{
				fgets( Temp , sizeof( Temp ) , header );
				if ( ! feof( header ) )
				{
					strcat( Temp , "\r" );
					sm( Temp , 0 );
					lines_on_screen++;
					header_lines++;
				}
			} while ( ! feof( header ) );
			sm( "\n\r" , 0 );
			lines_on_screen++;
			header_lines++;
			fclose( header );
		}
	}
	else
		lines_on_screen += 3;

	// What conference are we in? What's the max. number of lines a user
	// can have on his screen?
	getuserstring( gn_ptr->gn_confname , BB_CONFNAME );
	getuserstring( Temp , DT_LINELENGTH );
	max_lines = atoi( Temp );

	// Make up for the lost line while displaying header (why? don't know)
	if ( gn_ptr->gn_header[ 0 ] != 0x00 )
		lines_on_screen += 1;

	// Do we use two lines per receiver or not?
	if ( lines_on_screen + ( gn_ptr->gn_total_users * 2 ) + 3 <= max_lines )
		double_space = TRUE;

	// What's the time?
	time( &t );
	sprintf( Time , ctime( &t ) );

	// Strip the trailing return
	Time[ strlen( Time ) -1 ] = 0x00;

	// Clear the screen and put the intro on screen
	if ( gn_ptr->gn_header[ 0 ] == 0x00 )
		sm("[0m               [36mKiLLER COMMENT v1.4 [34m^ [35m(c) 1995 by KiLLraVeN/MYSTiC[0m\n\r\n\r" , 0 );
	else
		header_lines -= 2;

	// Set cursor-bar location for first receiver on screen
	y += header_lines;

	sm("[34m.--------------------------.---------------------------------------.---------.\n\r" , 0 );
	sprintf( Temp , ": [35m%24.24s [34m: [35mConf: %-31.31s [34m: [31mM[32mY[33mS[34mT[35mi[36mC[37m! [34m:\n\r" , Time , gn_ptr->gn_confname );
	sm( Temp , 0 );
	sm("`--------------------------^---------------------------------------^---------'\n\r.--------------------------.-------------------------------------------------.\n\r" , 0 );
	
	// Now we need to put every user on screen, we take in account if there
	// is a possibility to display a clear line between every user, this is
	// done for cosmetic reasons only.
	for ( node = (struct Node *) KC_Users0List.mlh_Head ; node->ln_Succ; node = node->ln_Succ )
	{
		rc_node = (struct receiver_node *) node;
		sprintf( Temp , "  [35m%2d[36m. [0m%-20.20s   [36m%s\n\r[A" , rc_node->rc_number , rc_node->rc_knownas , rc_node->rc_info );
		sm( Temp , 0 );
		sm( "[0m[34m|[26C|[49C|\n\r" , 0 );
		if ( double_space && rc_node->rc_number < gn_ptr->gn_total_users )
		{
			if ( ! line_separator )
				sm("|                          |                                                 |\n\r" , 0 );
			else
				sm("|--------------------------|-------------------------------------------------|\n\r" , 0 );
			home++;
			lines_on_screen++;
		}
		home++;
		lines_on_screen++;
	}

	// The bottom part will take up another 4 lines
	lines_on_screen += 4;

	// Put them on screen
	sm("[34m`--------------------------^-------------------------------------------------'\n\r" , 0 );
	sm(".-------------------------------------------------------------.--------------.\n\r" , 0 );
	if ( lines_on_screen <= max_lines )
		sprintf( Temp , ": [35mCURSOR KEYS / 1 - %2d / [SPACE] FOR DEFAULT SYSOP / [Q] QUIT [34m: [36mSELECTED:    [34m:\n\r" , gn_ptr->gn_total_users );
	else
		sprintf( Temp , ": [35mUSE NUM KEY / 1 - %2d / [SPACE] FOR DEFAULT SYSOP / [Q] QUIT [34m: [36mSELECTED:    [34m:\n\r" , gn_ptr->gn_total_users );
	sm( Temp , 0 );
	sm("`-------------------------------------------------------------^--------------'\n\r" , 0 );

	// Set the rc_node pointer to the first user in the list
	rc_node = (struct receiver_node *) KC_Users0List.mlh_Head;

	// While the user doesn't select anything or doesn't want to quit, we
	// stay in this loop, taking care of cursor control (if any) and screen
	// building.
	while ( ! quit )
	{
		// If the number of lines on screen is bigger than the number of lines
		// a user can handle on screen, we need to disable the cursor control
		// because it will totally fail. If not, we put the current user in
		// a blue background with white characters.
		if ( lines_on_screen <= max_lines )
		{
			sprintf( Temp , "[%d;6H[0m>[44m%-20.20s[0m" , y , rc_node->rc_knownas );
			sm ( Temp , 0 );
		}

		/* TESTING ONLY !
		sprintf( Temp, "on_screen: %ld - max: %ld" , lines_on_screen , max_lines );
		sm( Temp , 0 );
		*/

		// We put our cursor at the bottom of the screen, displaying the number
		// of the currently active user.
		sprintf( Temp , "[%d;75H[0m%2d" , home + header_lines , rc_node->rc_number );
		sm ( Temp , 0 );
		
		// Now it's time to wait for input from the user
		hk ( "" , Temp );
		Temp[ 1 ] = 0x00;

		switch ( Temp[ 0 ] )
		{
			case	' ':	// This function will select the FIRST user as the default
							// sysop and will exit the door.
							sprintf( Temp , "[%d;6H[0m %-20.20s[0m" , y , rc_node->rc_knownas );
							sm ( Temp , 0 );
							rc_node = (struct receiver_node *) KC_Users0List.mlh_Head;
							select_a_user = TRUE;
							quit = TRUE;
							break;

			case 0x1B:	// ESC Key
			case   3 :	// CTRL-C
			case 	'q':
			case	'Q': 	// The user obviously wants to quit. That's possible.
							// In order to do so gently, we remove any blue background
							// on the current user.
							select_a_user = FALSE;
							quit = TRUE;
							sprintf( Temp , "[%d;6H[0m %-20.20s[0m" , y , rc_node->rc_knownas );
							sm ( Temp , 0 );
							break;

			case	 13:	// RETURN key
							// The user wants to write to the current user. We de-select
							// the user on screen (blue background) and exit the door.
							sprintf( Temp , "[%d;6H[0m %-20.20s[0m" , y , rc_node->rc_knownas );
							sm ( Temp , 0 );
							quit = TRUE;
							select_a_user = TRUE;
			            break;

			case   5	:	// Cursor Down
							// If cursor control is possible, we move one user down.
							// If we are already on the bottom user, we will move to
							// the first one again.
							if ( lines_on_screen <= max_lines )
							{
								sprintf( Temp , "[%d;6H[0m %-20.20s[0m" , y , rc_node->rc_knownas );
								sm ( Temp , 0 );
								if ( (struct Node *) rc_node->nn_Node.ln_Succ != (struct Node *) &KC_Users0List.mlh_Tail )
								{
									rc_node = (struct receiver_node *) rc_node->nn_Node.ln_Succ;
									if ( double_space )
										y += 2;
									else
										y++;
								}
								else
								{
									rc_node = (struct receiver_node *) KC_Users0List.mlh_Head;
									y = 8 + header_lines;
								}
							}
							break;

			case   4	:	// Cursor Up
							// If cursor control is possible, we move one user up. If we
							// are at the top user, we move to the last one in the list.
							if ( lines_on_screen <= max_lines )
							{
								sprintf( Temp , "[%d;6H[0m %-20.20s[0m" , y , rc_node->rc_knownas );
								sm ( Temp , 0 );
								if ( (struct Node *) rc_node->nn_Node.ln_Pred != (struct Node *) &KC_Users0List.mlh_Head )
								{
									rc_node = (struct receiver_node *) rc_node->nn_Node.ln_Pred;
									if ( double_space )
										y -= 2;
									else
										y--;
								}
								else
								{
									rc_node = (struct receiver_node *) KC_Users0List.mlh_TailPred;
									if ( double_space )
										y = header_lines + 8 + ( ( gn_ptr->gn_total_users - 1 ) * 2 );
									else
										y = 8 + gn_ptr->gn_total_users - 1 + header_lines;
								}
							}
							break;

			default	:	// It wasn't a cursor key, it wasn't the return key,
							// nor a space. Then it must be a number. If it is,
							// we will make the number entered the current user.
							// If there are more than 10 users, we will check
							// if it's possible that the previously entered
							// number is the first number of a 10+ number.
							i = atoi ( Temp );
							if ( gn_ptr->gn_total_users < 10 )
								i = atoi ( Temp );
							else
							{
								j = gn_ptr->gn_total_users / 10;
								if ( 	rc_node->rc_number <=  j &&
										( ( 10 * rc_node->rc_number ) + i <= gn_ptr->gn_total_users ) )
									i += ( 10 * rc_node->rc_number );
							}
							if ( i > 0 )
							{
								if ( i <= gn_ptr->gn_total_users )
								{
									if ( lines_on_screen < max_lines )
									{
										sprintf( Temp , "[%d;6H[0m %-20.20s[0m" , y , rc_node->rc_knownas );
										sm ( Temp , 0 );
									}
									j = 1;
									if ( double_space )
										y = 6 + header_lines;
									else
										y = 7 + header_lines;
									for ( node = (struct Node *) KC_Users0List.mlh_Head ; node->ln_Succ; node = node->ln_Succ , j ++ )
									{
										if ( double_space )
											y += 2;
										else
											y++;
										if ( j == i )
										{
											rc_node = (struct receiver_node *) node;
											break;
										}
									}
								}
							}
							break;
		}
	}

	// We are out of the loop, we put our cursor back at the bottom of the
	// screen and display the selection.
	sprintf( Temp , "[%d;75H[0m%2d" , home + header_lines , rc_node->rc_number );
	sm ( Temp , 0 );

	// One line down and exit this routine
	sm("[1B",1);
	return ( select_a_user );
}
