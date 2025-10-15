#define KILLER_COMMENT_MAIN

#include "COMMENT.H"

void main (int argc, char *argv[])
{
   char temp[300], temp2[300];
   int   i;
	BOOL	success = FALSE , show_comment = FALSE;

	Register(atoi(argv[1]));

	// What did the user type to start this door? This NEEDS to be done
	// know or otherwise /X won't know the main line anymore. S.T.U.P.I.D.!
	temp[ 2 ] = 0x00;
	getuserstring( temp , BB_MAINLINE );

	// Initialise what we need (memory, read icons, etc. etc.)
   Initialise();

	// Time to load the preferences
	LoadPrefs();

	// Does this user want to know the statistics?
	if ( temp[ 2 ] == '?' )
	{
		getuserstring( temp2 , DT_SECSTATUS );
		i = atoi( temp2 );
		if ( i >= gn_ptr->gn_view_access )
			Commentistics();
	}

	// How many words did he enter?
	i = WordCount( temp );

	// If there was more than one argument on the main line, an argument has
	// been entered after it. If so, check if it can be related to one of
	// the users in the comment list.
	if ( i > 1 )
	{
		// First of all, copy ONLY the arguments to temp2, we do this by
		// searching for a space after the first word, we copy the remainder
		// of that string to temp2.
		for ( i = 0 ; i < strlen( temp ) ; i ++ )
		{
			if ( temp[ i ] == ' ' )
			{
				i += 2;
				break;
			}
		}
		strmid ( temp , temp2 , i , strlen( temp ) );

		// Make sure to remove any asterisk that may have been put after
		// the argument(s)
		if ( temp2[ strlen( temp2 ) - 1 ] == '*' )
			temp2[ strlen( temp2 ) - 1 ] = 0x00;

		// First of all we check if the given argument(s) is a number. If it
		// is, the ToNumber() function will select the appropriate user and
		// return a TRUE value.
		if ( ToNumber ( temp2 ) == TRUE )
			success = TRUE;
		else
			// It's not a number. Well, is the given argument longer than 2
			// characters? If not, it's to ambigious to start comparing.
			if ( strlen ( temp2 ) > 2 )
			{
				// The length is okay. Time to check if the argument given is
				// the FULL name of a user from the list. We do this to disable
				// any errors that might occur because user 2 has a part of user
				// 1 in it's name.
				if ( CompareNames( temp2 , STRICT_COMPARE ) == TRUE )
					success = TRUE;
				else
					// It's not a full name, now we go check if the arguments
					// fits a part of any user name. It takes the first name
					// that fits the description.
					if ( CompareNames( temp2 , FLEX_COMPARE ) == TRUE )
						success = TRUE;
					else
						// And if it's not even that, we go check if it's a piece
						// of any user-info. This also takes the first info that
						// fits the description.
						if ( CompareInfo ( temp2 ) == TRUE )
							success = TRUE;
			}
	}

	// Did we find a user or not? If so, put this brief message on screen.
	if ( success )
	{
		sprintf( temp , "[0m\n\r               [36mKiLLER COMMENT v1.4 [34m^ [35m(c) 1995 by KiLLraVeN/MYSTiC[0m\n\r\n\r               [36mWriting to[35m: [0m[44m%s[0m\n\r" , rc_node->rc_knownas );
		sm( temp , 0 );
	}

	// We either were not successful or there was just one argument given on
	// the main line. That means we will let the user select one from the
	// menu. This is done with the SelectReceiver() function.
	if ( ! success || i <= 1 )
		show_comment = success =  SelectReceiver();

	// Was there a user selected or not?
	if ( success )
	{
		// Save the new stats of the choosen user
		SaveNewStats();
		// Do we need to show a comment line? If there was no filename given
		// in the prefs OR the user selected a user with a specific argument
		// we will NOT show a comment.
		if ( rc_node->rc_comments[ 0 ] != 0x00 && show_comment )
			ShowComment();
		enddoor ( LEAVE_COMMENT );
	}
	else
		enddoor ( EXIT_SILENTLY );
}

void enddoor ( int RETURNCODE )
{
	char	Temp[100];

	// First of all, return the memory to the system
	FreeNodes ( (struct List * ) &KC_Users0List );
	if ( gn_ptr )
		FreeVec ( gn_ptr );

	// Close any open icon and the icon.library
	CloseIcon();
	CloseLibrary(IconBase);

	// Determine way of exit - silent or with error/message ?
	switch ( RETURNCODE )
	{
		case EXIT_SILENTLY:	sm( "\n\r" , 0);
									break;

		case MEMORY_ERROR :	sm( "\n\rCOULDN'T ALLOCATE MEMORY!! DEFAULTING TO SYSOP!\n\r" , 0 );
									break;

		case LEAVE_COMMENT:	sprintf( Temp , "e %s" , rc_node->rc_realname );
									putuserstring( Temp , RETURNPRVCMD );
									break;

		case EXIT_REGULAR_C:	putuserstring ("C" , RETURNCOMMAND );
		                     break;
	}

	// Close the door-port to Ami-X and exit
	ShutDown();
	end();
}
