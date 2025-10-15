#define KILLER_COMMENT_PREFS

#include "exec/types.h"
#include "KiLLER_Comment.H"

// Version information about the config program
BYTE VER[]="$VER: KC-Config 1.0.3";

void main (int argc, char **argv[])
{
	struct WBStartup *argmsg;  // Those two are for parsing arguments
	struct WBArg     *wb_arg;  // from icons in the Workbench
	BOOL	error;
	char   temp[200];

	// First of all, we need to find out the name of our program the user
	// has given it (ie. with what name was it started?).
	if (argc == 0)    // Started from WorkBench
	{
		argmsg = (struct WBStartup *)argv;
		wb_arg = argmsg->sm_ArgList;
		strcpy(temp, wb_arg->wa_Name);
	}
	else
		sprintf(temp, "%s", argv[0]);

	// Open required libraries
	OpenLibs();

	// Open the icon and read required information. If an error occurs,
	// exit gently.
	if (InitIcon(temp))
	{
		strcpy(acp_location, FromIcon("ACP_LOCATION"));
		if ( acp_location[ 0 ] == 0x00 )
			ToolTypeNot("ACP_LOCATION", temp);

		strcpy(kc_location, FromIcon("KC_LOCATION"));
		if ( kc_location[ 0 ] == 0x00 )
			ToolTypeNot("KC_LOCATION", temp);

		strcpy( kc_viewer , FromIcon("KC_VIEWER"));

		PubScreenName = (UBYTE *) FromIcon("PUB_SCREEN");

		CloseIcon();
	}
	else
	{
		printf("ERROR! Could not open icon: %s\n", temp );
		CleanExit( 20 );
	}

	// Time to open the screen
	error = SetupScreen();
	if (error)
	{
		printf("Couldn't lock screen!\n");
		CleanExit(20);
	}

	// Time to fill the listview with info
	CreateListViewAndNodes();

	// Time to open the window
	error = OpenKiLLER_COMMENTWindow();
	if (error)
	{
		printf("Couldn't open window! Exiting.\n");
		CleanExit(20);
	}

	// Fill the opened window, set the correct gadgets etc. etc.
	SetCurrentUser( 0 );
	if ( kc_viewer[ 0 ] != 0x00 )
		GT_SetGadgetAttrs(	KiLLER_COMMENTGadgets[ GD_KC_STATISTICS ],
									KiLLER_COMMENTWnd, NULL,
									GA_Disabled, FALSE,
									TAG_END);
	ShowUserInfo();

	// The HandleIDCMP routine takes care of all IntuiMessages, it
	// returns the number of the window that needs to be opened next,
	// if it returns a '0', it means that the user wanted to quit.
	HandleIDCMP();
	CleanExit( 0 );
}

void HandleIDCMP ( void )
{
	struct IntuiMessage *imsg;
	struct Gadget       *gad;
	ULONG  imsgClass;
	UWORD  imsgCode;
	APTR   imsgIAddress;
	int	return_value, rc;
	BOOL   terminated;
	char	temp[40];
	struct	Node	*node;
	struct	Node	*node2;

	terminated=FALSE;
	while (!terminated)
	{
		Wait (1 << KiLLER_COMMENTWnd->UserPort->mp_SigBit);
		while ((!terminated) && (imsg = GT_GetIMsg(KiLLER_COMMENTWnd->UserPort)))
		{
			imsgClass = imsg->Class;
			imsgCode  = imsg->Code;
			imsgIAddress = imsg->IAddress;
			GT_ReplyIMsg(imsg);
			switch (imsgClass)
			{
			   case IDCMP_CLOSEWINDOW:	terminated = TRUE;
												break;

			   case IDCMP_GADGETUP:
			      gad = (struct Gadget *) imsgIAddress;
			      switch (gad->GadgetID)
			      {
						case GD_KC_SAVE_QUIT:
							SaveAndQuit();
							break;

						case GD_KC_SAVEQUIT:
							SaveAndQuit();
							terminated = TRUE;
							break;

						case GD_KC_Users:
							SetCurrentUser ( imsgCode );
							ShowUserInfo();
							break;

						case GD_KC_QUIT:
							return_value = 0;
							terminated = TRUE;
							break;

						case GD_KC_RC_ADD:
							if ( SelectUser() )
							{
								SetCurrentUser ( -1 );
								ShowUserInfo();
							}
							break;

						case GD_KC_RC_DEL:
							// How many entries are in the list? You cannot clear the
							// list, there should at least be ONE person to comment to
							rc = 0;
							for ( node = (struct Node *) KC_Users0List.mlh_Head ; node->ln_Succ; node = node->ln_Succ )
								rc++;
							if ( rc == 1 )
								EasyRequest( NULL , &NoClearList , NULL );
							else
							{
								if ( KC_Users0List.mlh_TailPred != (struct Node *) &KC_Users0List )
								{
									// Detach the list before you change it!
									GT_SetGadgetAttrs(	KiLLER_COMMENTGadgets[ GD_KC_Users ],
															 	KiLLER_COMMENTWnd,
																NULL,
																GTLV_Labels,	~0,
																TAG_END);
									// Remove the node from the list
									Remove( (struct Node *) rc_node );
									// Attach the list again
									GT_SetGadgetAttrs(	KiLLER_COMMENTGadgets[ GD_KC_Users ],
															 	KiLLER_COMMENTWnd,
																NULL,
																GTLV_Labels,	&KC_Users0List,
																TAG_END);
									// Free the memory the node used
									FreeVec( (struct Node *) rc_node );
									// We will make the last user the new current
									// user, that way you won't delete the sysop so
									// easily :)
									SetCurrentUser ( -1 );
									ShowUserInfo();
								}
							}
							break;

						case GD_KC_UP:
							// How many entries are in the list? It's useless to
							// move it upwards with 1 entry (ofcoz) :)
							rc = 0;
							for ( node = (struct Node *) KC_Users0List.mlh_Head ; node->ln_Succ; node = node->ln_Succ )
								rc++;
							if ( rc > 1 )
							{
								if ( rc_node->nn_Node.ln_Pred != (struct receiver_node *) &KC_Users0List.mlh_Head )
								{
									// Fill the dummy node with the current node's information
									node = ( struct Node *) rc_node;

									// Detach the list before you change it!
									GT_SetGadgetAttrs(	KiLLER_COMMENTGadgets[ GD_KC_Users ],
															 	KiLLER_COMMENTWnd,
																NULL,
																GTLV_Labels, ~0,
																TAG_END);

									// Swap the nodes - Complex job to understand. First we
									// remove the node we want to move upwards from the list,
									// next we Insert() it again before the node we want to
									// swap it with.
									rc_node = (struct receiver_node *) rc_node->nn_Node.ln_Pred;
									node2 = (struct Node *) rc_node;
									Remove ( node2 );
									Insert( ( struct List *) &KC_Users0List, (struct Node *) node2, (struct Node *) node );

									// Attach the list again
									GT_SetGadgetAttrs(	KiLLER_COMMENTGadgets[ GD_KC_Users ],
															 	KiLLER_COMMENTWnd,
																NULL,
																GTLV_Labels,	&KC_Users0List,
																TAG_END);

									// We will make the last user the new current
									// user, that way you won't delete the sysop so
									// easily :)
									rc_node = (struct receiver_node *) node;
									ShowUserInfo();
								}
							}
							break;

						case GD_KC_DOWN:
							// How many entries are in the list? It's useless to
							// move it downwards with 1 entry (ofcoz) :)
							rc = 0;
							for ( node = (struct Node *) KC_Users0List.mlh_Head ; node->ln_Succ; node = node->ln_Succ )
								rc++;
							if ( rc > 1 )
							{
								if ( rc_node->nn_Node.ln_Succ != (struct Node *) KC_Users0List.mlh_Tail )
								{
									// Fill the dummy node with the current node's information
									node = ( struct Node *) rc_node;

									// Detach the list before you change it!
									GT_SetGadgetAttrs(	KiLLER_COMMENTGadgets[ GD_KC_Users ],
															 	KiLLER_COMMENTWnd,
																NULL,
																GTLV_Labels, ~0,
																TAG_END);

									// Swap the nodes - Complex job to understand. First we
									// remove the node we want to move downwards from the list,
									// next we Insert() it again after the node we want to
									// swap it with.
									rc_node = (struct receiver_node *) rc_node->nn_Node.ln_Succ;
									node2 = (struct Node *) rc_node;
									Remove ( node );
									Insert( ( struct List *) &KC_Users0List, (struct Node *) node, (struct Node *) node2 );

									// Attach the list again
									GT_SetGadgetAttrs(	KiLLER_COMMENTGadgets[ GD_KC_Users ],
															 	KiLLER_COMMENTWnd,
																NULL,
																GTLV_Labels,	&KC_Users0List,
																TAG_END);
									// We will make the last user the new current
									// user, that way you won't delete the sysop so
									// easily :)
									rc_node = (struct receiver_node *) node;
									ShowUserInfo();
								}
							}
							break;

						case GD_KC_RC_COMMENTFILE:
							strcpy( rc_node->rc_comments, ((struct StringInfo *)gad->SpecialInfo)->Buffer);
							ShowUserInfo();
							break;

						case GD_KC_RC_INFO:
							strcpy( rc_node->rc_info, ((struct StringInfo *)gad->SpecialInfo)->Buffer);
							ShowUserInfo();
							break;

						case GD_KC_RC_ALIAS:
							strcpy( rc_node->rc_knownas, ((struct StringInfo *)gad->SpecialInfo)->Buffer);
							ShowUserInfo();
							break;

						case GD_KC_SELECT_COMMENTS:
							sprintf( rc_node->rc_comments , "%s" , FileRequested ( "Select a comment file..." , rc_node->rc_comments ) );
							ShowUserInfo();
							break;

						case GD_KC_MIN_ACS:
							rc_node->rc_min_acs = atoi(((struct StringInfo *)gad->SpecialInfo)->Buffer);
							ShowUserInfo();
							break;

						case GD_KC_STATISTICS:
							Commentistics();
							ShowUserInfo();
							break;

						case GD_KC_CLEAR_ACCOUNT:
							if ( EasyRequest( NULL, &ClearStats , NULL ) )
							{
								rc_node->rc_msg_received = 0;
								rc_node->rc_last_msg = 0;
								rc_node->rc_last_user = 0;
							}
							ShowUserInfo();
							break;
					}
			}
		}
	}
}

void CleanExit ( int error_code )
{
	FreeNodes( (struct List *) &KC_Users0List );
	CloseKiLLER_COMMENTWindow();
	CloseUSER_SELECTIONWindow();
	CloseDownScreen();
	CloseLibrary( IconBase );
	CloseLibrary( GadToolsBase );
	CloseLibrary( (struct Library *) IntuitionBase );
	exit( error_code );
}

void SetCurrentUser ( WORD OrdenalNumber )
{
	// This routine sets the rc_node pointer to the current user (the
	// active user so to speak).
	int i = 0;
	struct Node *node;

	if ( OrdenalNumber == -1 )
		rc_node = (struct receiver_node *) KC_Users0List.mlh_TailPred;
	else
	{
		for ( node = (struct Node *) KC_Users0List.mlh_Head;
				node->ln_Succ;
				node = node->ln_Succ , i++ )
		{
			if ( i == OrdenalNumber )
				break;
		}
		rc_node = (struct receiver_node *) node;
	}
}

void ShowUserInfo ( void )
{
	BOOL	disabled;
	char	temp[10];

	// Update the text in the box below the listview
	// This must be done with GT_SetGadgetAttrs
   GT_SetGadgetAttrs(	KiLLER_COMMENTGadgets[ GD_KC_RC_NAME ],
								KiLLER_COMMENTWnd,
								NULL,
								GTTX_Text,	(ULONG) rc_node->nn_Node.ln_Name,
								TAG_END);


	// The UpdateStrGad() routine comes from the official C= RKRM's and
	// allows you to refresh/update/change the text in any text-gadget.
	UpdateStrGad ( KiLLER_COMMENTWnd,
						KiLLER_COMMENTGadgets[ GD_KC_RC_ALIAS ],
						rc_node->rc_knownas );

	UpdateStrGad ( KiLLER_COMMENTWnd,
						KiLLER_COMMENTGadgets[ GD_KC_RC_INFO ],
						rc_node->rc_info );

	UpdateStrGad ( KiLLER_COMMENTWnd,
						KiLLER_COMMENTGadgets[ GD_KC_RC_COMMENTFILE ],
						rc_node->rc_comments );

	// We must treat INTEGER gadgets as TEXT gadgets if we want to
	// put a value in it. So we need to put the value into a buffer
	// first :-(
	sprintf( temp , "%d" , rc_node->rc_min_acs );
	UpdateStrGad ( KiLLER_COMMENTWnd,
						KiLLER_COMMENTGadgets[ GD_KC_MIN_ACS ],
						temp );
}

void Commentistics ( void )
{
	char	temp[ 300 ] , perc[ 21 ], overall[15], time[ 40 ];
	struct Node *node;
	int	i, j;
	long	total_messages = 0 , total_users = 0;
	FILE	*fptr, *output;
	struct USER usr;

	if ( output = fopen ( "T:KC_Commentistics.ASCII" , "w" ) )
	{
		fprintf( output , ".----------------------------------------------------------------------------.\n" );
		fprintf( output , "| KiLLER COMMENT v1.0  ^  <X> COMMENTiSTiC ViEW <X>  ^  (c) KiLLraVeN/MYSTiC |\n" );
		fprintf( output , "`----------------------------------------------------------------------------'\n" );
		fprintf( output , ".----------------------.----------------------.-------.-------.--------------.\n" );
		fprintf( output , "| User Name            | 0%--------------100% | Total | Perc% | Overall      |\n" );
		fprintf( output , ":----------------------:----------------------:-------:-------:--------------:\n" );

		for ( node = (struct Node *) KC_Users0List.mlh_Head ; node->ln_Succ; node = node->ln_Succ )
		{
			rc_node = (struct receiver_node *) node;			
			total_messages += rc_node->rc_msg_received;
			total_users++;
		}

		if ( total_messages == 0 )
		{
			EasyRequest( NULL , &NoMessages , NULL );
			fclose( output );
			remove ( "T:KC_Commentistics.ASCII" );
			return;
		}

		for ( node = (struct Node *) KC_Users0List.mlh_Head ; node->ln_Succ; node = node->ln_Succ )
		{
			rc_node = (struct receiver_node *) node;			
			strcpy( perc , "####################" );
			i = ( ( rc_node->rc_msg_received * 100 ) / total_messages );
			if ( i != 0 )
				j = 1 + ( 20 / ( 100 / i ) );
			else
				j = 1;
			perc[ j - 1 ] = 0x00;
			if ( rc_node->rc_msg_received < 50 )
				strcpy( overall , "Starting out" );
			else
				if ( rc_node->rc_msg_received < 100 )
					strcpy( overall , "Not bad" );
				else
					if ( rc_node->rc_msg_received < 250 )
						strcpy( overall , "Buzzing..." );
					else
						if ( rc_node->rc_msg_received < 500 )
							strcpy( overall , "Well-Known" );
						else
							if ( rc_node->rc_msg_received < 1000 )
								strcpy( overall , "Macho Man" );
							else
								if ( rc_node->rc_msg_received < 2000 )
									strcpy( overall , "Tough guy!" );
								else
									if ( i >= 2000 )
										strcpy( overall , "Ruler!" );
		fprintf( output , "| %-20.20s | %-20.20s | %5d |  %3d% | %-12s |\n" , rc_node->rc_knownas , perc , rc_node->rc_msg_received , i , overall );
		}
		fprintf( output , ":----------------------^----------------------^-------^-------^--------------:\n" );
		fprintf( output , "| Total messages: %6ld ^ Average: %6ld msgs per user ^ MYSTiC Production |\n" , total_messages , total_messages/total_users );
		fprintf( output , "`----------------------------------------------------------------------------'\n" , 0 );

		// Built the header of the second screen
		fprintf( output , ".------------------------.--------------------------.------------------------.\n" );
		fprintf( output , "| User Name              | Date/Time of last msg    | Last msg came from     |\n" );
		fprintf( output , ":------------------------:--------------------------:------------------------:\n" );

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
						fprintf( output , "Error reading USER.DATA file for user's name. Stopping output.\n" );
						fclose( fptr );
						break;
					}
					fread ( &usr , 1 , sizeof( struct USER ) , fptr );
				}
				else
					sprintf( usr.Name , "None" );

				// Put the lot on screen
				fprintf( output , "| %-22.22s | %-24.24s | %-22.22s |\n" , rc_node->rc_knownas , time , usr.Name );
			}
			fprintf( output , "`------------------------^--------------------------^------------------------'\n" );
			fclose( fptr );
		}
		fclose( output );
		sprintf( temp , "%s T:KC_Commentistics.ASCII" , kc_viewer );
		Execute( temp , NULL , NULL );
		remove ( "T:KC_Commentistics.ASCII" );
	}
	else
		EasyRequest( NULL , &CouldNotOpen , NULL );
}
