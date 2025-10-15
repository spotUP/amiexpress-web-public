#define KILLER_CG_STANDARD

#include <exec/types.h>
#include "KiLLER_Comment.H"

void OpenLibs ( void )
{
   // Open all required libraries with error check. Exit if an error occurs.
   if (!(IntuitionBase = (struct Library *) OpenLibrary ("intuition.library", 37)))
   {
      printf("Couldn't open intuition.library v37+\n");
      CleanExit(20);
   }
   
   if (!(GadToolsBase = OpenLibrary("gadtools.library", 37)))
   {
      printf("Couldn't open gadtools.library v37+\n");
      CleanExit(20);
   }

   if (!(IconBase = OpenLibrary("icon.library", 0L)))
   {
      printf("Couldn't open icon.library v37+\n");
      CleanExit(20);
   }
}

ULONG InitIcon(char *IconName)
{
	// This little thingy opens the icon IconName that you must specify
	// as an argument if you call this routine. If it succeeded in doing
	// so it will return a TRUE value, if it failed -> FALSE.
	dobj = GetDiskObject(IconName);
	if (!dobj)
		return(0L);
	toolarray = (char **)dobj->do_ToolTypes;
	return(1L);
}

char *FromIcon(char *text)
{
	// Return the tooltype you wish to extract from the currently open
	// icon.
	return(tooltype = FindToolType(toolarray, text));
}

void CloseIcon(void)
{
	// Close the currently open icon
	if (dobj)
	{
		FreeDiskObject(dobj);
		dobj=NULL;
	}
}

void ToolTypeNot (char *Type, char *Icon)
{
	printf("ERROR! Could not find tooltype `%s' in `%s'!\n" , Type , Icon );
	CleanExit(20);
}

void CreateListViewAndNodes ( void )
{
	// This routine will initialize all lists and fill them with info that
	// should be stored.
	int	i = 0;

	struct	receiver	*dummy_ptr;
	struct	receiver_node	*rc_node;
	struct	USER	usr;

	FILE	*fptr, *fptr2;

	char  Temp[200];

	// Open the ACP info file
	sprintf(Temp, "%s", acp_location);
	AddPart(Temp, "ACP", 200);
	if ( ! InitIcon( Temp ) )
	{
		printf("Could not open `%s' icon!\n" , Temp );
		CleanExit( 20 );
	}

	// Try to find the BBS's location
	strcpy( bbs_location, FromIcon( "BBS_LOCATION" ) );
	if ( bbs_location[ 0 ] == 0x00 )
		ToolTypeNot( "BBS_LOCATION" , acp_location);

	// And the sysop's name
	strcpy( sysop_name , FromIcon( "SYSOP_NAME" ) );
	if ( sysop_name[ 0 ] == 0x00 )
		ToolTypeNot( "SYSOP_NAME" , acp_location);
	CloseIcon();

	// Initialise KC_Users0List
	KC_Users0List.mlh_Head     = (struct Node *) &KC_Users0List.mlh_Tail;
	KC_Users0List.mlh_Tail     = 0;
	KC_Users0List.mlh_TailPred = (struct Node *) &KC_Users0List.mlh_Head;

	// Initialise KC_SELECT_USER1List
	KC_SELECT_USER1List.mlh_Head     = (struct Node *) &KC_SELECT_USER1List.mlh_Tail;
	KC_SELECT_USER1List.mlh_Tail     = 0;
	KC_SELECT_USER1List.mlh_TailPred = (struct Node *) &KC_SELECT_USER1List.mlh_Head;

	// Is there a prefs file? If so, read it. If not, fill it with default
	// values.
	sprintf( Temp , "%s" , kc_location );
	AddPart( Temp , "KiLLER_Comment.Prefs" , 200 );
	if ( ! access ( Temp , F_OK ) )
	{
		// Read the prefs
		if ( fptr = fopen ( Temp , "r" ) )
		{
			sprintf( Temp, "%s" , bbs_location );
			AddPart( Temp, "USER.DATA" , 200 );
			if ( fptr2 = fopen ( Temp , "r" ) )
			{
				// Check for correct version (and is it a config file)
				fread ( Temp , sizeof( CONFIG_VERSION ) , 1 , fptr );
				if ( strcmp ( Temp , CONFIG_VERSION ) != 0 )
				{
					printf( "Corrupt config file! Defaulting to sysop.\n\r\n\r" , 0 );
					fclose ( fptr );
				}
				else
				{
					// Read the receivers until end of file
					// In order to do so, we need to allocate memory for a dummy
					dummy_ptr = AllocVec ( sizeof ( struct receiver ) , MEMF_PUBLIC|MEMF_CLEAR );
					if ( dummy_ptr == NULL )
					{
						printf( "Couldn't allocate %d bytes!\n" , sizeof( struct receiver ) );
						CleanExit( 20 );
					}
	
					// Read the info about the receivers
					while ( ! feof ( fptr ) )
					{
						fread ( dummy_ptr , 1 , sizeof ( struct receiver ) , fptr );
						if ( ! feof ( fptr ) )
						{
							i++;
							rc_node = AllocVec ( sizeof ( struct receiver_node ) , MEMF_PUBLIC|MEMF_CLEAR );
							if ( rc_node == NULL )
							{
								printf( "Couldn't allocate %d bytes!\n" , sizeof( struct receiver ) );
								CleanExit( 20 );
							}
							rc_node->rc_slotnumber = dummy_ptr->rc_slotnumber;

							// Now that we got the user's slotnumber, we can search for his
							// real name in the USER.DATA.
							if ( fseek ( fptr2 , ( rc_node->rc_slotnumber - 1 ) * sizeof ( struct USER ) , SEEK_SET ) == -1 )
							{
								printf("Error reading USER.DATA file for user's name. Exiting!\n");
								fclose( fptr );
								fclose( fptr2 );
								CleanExit(20);
							}
							fread ( &usr , 1 , sizeof( struct USER ) , fptr2 );
							strcpy ( rc_node->rc_realname , usr.Name );

							// And fill the rest with the info from disk
							strcpy ( rc_node->rc_knownas , dummy_ptr->rc_knownas );
							strcpy ( rc_node->rc_info , dummy_ptr->rc_info );
							strcpy ( rc_node->rc_comments , dummy_ptr->rc_comments );
							rc_node->rc_msg_received = dummy_ptr->rc_msg_received;
							rc_node->rc_last_msg = dummy_ptr->rc_last_msg;
							rc_node->rc_last_user = dummy_ptr->rc_last_user;
							rc_node->rc_min_acs = dummy_ptr->rc_min_acs;
							rc_node->nn_Node.ln_Name = rc_node->rc_realname;
							rc_node->nn_Node.ln_Type = 0;
							rc_node->nn_Node.ln_Pri	= 0;
							AddTail( ( struct List * ) &KC_Users0List , (struct Node *) rc_node );
						}
					}
					// We are done reading the file, close it, return the memory of
					// the dummy pointer and report the number of receivers.
					fclose ( fptr );
					fclose ( fptr2 );
					FreeVec ( dummy_ptr );
				}
			}
			else
			{
				printf ( "Error opening `%s'\n" , Temp );
				fclose( fptr );
				CleanExit( 20 );
			}				
		}
		else
		{
			printf ( "Error opening `%s'\n" , Temp );
			CleanExit( 20 );
		}
	}

	// Did we have some receivers? If not, reserve memory for one receiver,
	// the sysop.
	if ( i == 0 )
	{
		rc_node = AllocVec ( sizeof ( struct receiver_node ) , MEMF_PUBLIC|MEMF_CLEAR );
		if ( rc_node == NULL )
		{
			printf( "Couldn't allocate %d bytes!\n" , sizeof( struct receiver ) );
			CleanExit( 20 );
		}
		sprintf( Temp, "%s" , bbs_location );
		AddPart( Temp, "USER.DATA" , 200 );
		if ( fptr2 = fopen ( Temp , "r" ) )
		{
			rc_node->rc_slotnumber = 1;
			fread ( &usr , sizeof( struct USER ) , 1 , fptr2 );		
			strcpy ( rc_node->rc_realname , usr.Name );
			sprintf ( rc_node->rc_knownas , "%s" , sysop_name );
			sprintf ( rc_node->rc_info , "The one you all admire so deeply :)" );
			rc_node->rc_min_acs = 0;
			rc_node->nn_Node.ln_Name = rc_node->rc_realname;
			rc_node->nn_Node.ln_Type = 0;
			rc_node->nn_Node.ln_Pri	= 0;
			AddTail( ( struct List * ) &KC_Users0List , (struct Node *) rc_node );
		}
		else
		{
			printf ( "Error opening `%s'\n" , Temp );
			CleanExit( 20 );
		}
		fclose( fptr2 );
	}
}

void UpdateStrGad (struct Window *win, struct Gadget *gad, UBYTE *NewStr)
{
   RemoveGList (win, gad, 1);    // Remove Gadget from window
   strcpy (((struct StringInfo *) (gad->SpecialInfo))->Buffer, NewStr);
   ((struct StringInfo *) (gad->SpecialInfo))->BufferPos = 0;
   ((struct StringInfo *) (gad->SpecialInfo))->DispPos   = 0;
   AddGList (win, gad, ~0, 1, NULL);  // Add gadget
   RefreshGList (gad, win, NULL, 1);  // Refresh List
}

ULONG GetFileSize (char *file)
{
   struct FileInfoBlock *FBlock;
   BPTR   FLock;
   ULONG  FSize=0L;
   if ((FLock=Lock(file, ACCESS_READ))==NULL)
   {
      return(0L);
   }
   if ((FBlock=(struct FileInfoBlock *)AllocDosObject(DOS_FIB, NULL))==NULL)
   {
      UnLock(FLock);
      return(0L);
   }
   if (Examine(FLock, FBlock))
   {
      FSize=FBlock->fib_Size;
   }
   UnLock(FLock);
   FreeDosObject(DOS_FIB, FBlock);
   return(FSize);
}

int SelectUser ( void )
{
	struct	IntuiMessage	*imsg;
	struct	Gadget			*gad;
	ULONG		imsgClass;
	UWORD		imsgCode;
	APTR		imsgIAddress;
	struct	USER	user_ptr;
	struct	Node	*node;
	ULONG		filesize;
	UBYTE		*text_ptr;
	UBYTE		**UsersLabs;
	UBYTE		*UsersText;
	char		Temp[300];
	BOOL		error = FALSE;
	BOOL		terminated;
	int		i = 0, counter;

	FILE		*fptr;

	// Create a nice path to the location of the user.data
	sprintf( Temp, "%s" , bbs_location );
	AddPart( Temp, "USER.DATA" , 300 );
	
	// Get the size of the user.data file
	filesize = GetFileSize( Temp );
	if ( filesize == 0 )
	{
		printf( " User.DATA is 0 bytes in size ?! Couldn't build user list\n" );
		error = TRUE;
	}
	else
	{
		filesize /= sizeof( struct USER );
		if ( UsersLabs = AllocVec ( ( 1 + filesize ) * sizeof( UBYTE * ) , MEMF_CLEAR|MEMF_PUBLIC ) )
		{
			if ( UsersText = AllocVec ( ( 1 + filesize ) * 32 , MEMF_CLEAR|MEMF_PUBLIC ) )
			{
				if ( fptr = fopen ( Temp , "r" ) )
				{
					text_ptr = UsersText;
					fread ( &user_ptr , sizeof( struct USER ) , 1 , fptr );
					while ( ! feof ( fptr ) )
					{
						if ( 	user_ptr.Slot_Number != 0 )
						{
							user_ptr.Name[0] = toupper( user_ptr.Name[0] );
							*(UsersLabs + i ) = text_ptr;
							strcpy ( text_ptr , user_ptr.Name );
							text_ptr += 32;
							i++;
						}
						fread ( &user_ptr , sizeof ( struct USER ) , 1 , fptr );
					}
					*(UsersLabs + i ) = NULL;
					fclose ( fptr );
				}
				else
				{
					printf("Couldn't open `%s' for input!\n", Temp );
					error = TRUE;
				}
			}
			else
			{
				printf("Couldn't allocate %ld bytes.\n" , ( 1 + filesize ) * 32 );
				error = TRUE;
			}
		}
		else
		{
			printf("Couldn't allocate %ld bytes.\n", ( 1 + filesize ) * 8 );
			error = TRUE;
		}
	}

	if ( ! error )
	{
		// Sort the lot
		tqsort ( UsersLabs , i );

		// Put it in nodes & the list
		for ( counter = 0 ; counter < i ; counter++ )
		{
			if ( unode = AllocVec ( sizeof ( struct user_node ) , MEMF_CLEAR|MEMF_PUBLIC ) )
			{
				strcpy ( unode->Name , UsersLabs[ counter ] );
				unode->nn_Node.ln_Type	= 0;
				unode->nn_Node.ln_Pri	= 0;
				unode->nn_Node.ln_Name	= (char *) unode->Name;
				AddTail ( (struct List * ) &KC_SELECT_USER1List , (struct Node *) unode );
			}
			else
			{
				printf("Couldn't allocate %d bytes!\n" , sizeof( struct user_node ) );
				error = TRUE;
			}
		}
	}

	// Could we make the userlist? If not, return without adding a user
	// to the list.
	if ( error )
		return ( -1 );

	error = OpenUSER_SELECTIONWindow();

	if (error)
	{
		printf("Couldn't open window! Exiting.\n");
		CleanExit(20);
	}

	// Handle IDCMP calls
	terminated=FALSE;
	while (!terminated)
	{
		Wait (1 << USER_SELECTIONWnd->UserPort->mp_SigBit);
		while ((!terminated) && (imsg = GT_GetIMsg(USER_SELECTIONWnd->UserPort)))
		{
			imsgClass = imsg->Class;
			imsgCode  = imsg->Code;
			imsgIAddress = imsg->IAddress;
			GT_ReplyIMsg(imsg);
			switch (imsgClass)
			{
			   case IDCMP_CLOSEWINDOW:	error = -1;
												terminated = TRUE;
			                           break;

			   case IDCMP_GADGETUP:
			      gad = (struct Gadget *) imsgIAddress;
			      switch (gad->GadgetID)
			      {
						case GD_KC_SELECT_USER:
							for ( node = (struct Node * ) KC_SELECT_USER1List.mlh_Head, i = 0 ;
									node->ln_Succ;
									node = node->ln_Succ, i++ )
							{
								if ( i == imsgCode )
									break;
							}
							unode = (struct user_node *) node;
							if ( fptr = fopen ( Temp , "r" ) )
							{
								fread ( &user_ptr , sizeof ( struct USER ) , 1 , fptr );
								while ( ! feof ( fptr ) )
								{
									if ( stricmp( user_ptr.Name , unode->Name ) == 0 )
									{
										sprintf( unode->Name , "%s" , user_ptr.Name );
										unode->Slot_Number = user_ptr.Slot_Number;
										break;
									}
									fread( &user_ptr , sizeof( struct USER ) , 1 , fptr );
								}
								fclose( fptr );
							}
							else
							{
								printf ("Couldn't open USER.DATA for the slotnumber of the user!\n");
								error = -1;
							}
							terminated = TRUE;
							error = unode->Slot_Number;
							break;

						case GD_KC_CANCEL:
							error = -1;
							terminated = TRUE;
							break;
					}
			}
		}
	}

	if ( error > 0 )
	{
		if ( ! FindName( ( struct List * ) &KC_Users0List , unode->Name ) )
		{
			if ( rc_node2 = AllocVec( sizeof( struct receiver_node ) , MEMF_PUBLIC|MEMF_CLEAR ) );
			{
				rc_node2->rc_slotnumber = unode->Slot_Number;
				sprintf( rc_node2->rc_realname, "%s" , unode->Name );
				sprintf( rc_node2->rc_knownas, "%s" , unode->Name );
				rc_node2->nn_Node.ln_Name = rc_node2->rc_realname;
				rc_node2->nn_Node.ln_Type = 0;
				rc_node2->nn_Node.ln_Pri	= 0;

				GT_SetGadgetAttrs(	KiLLER_COMMENTGadgets[ GD_KC_Users ],
										 	KiLLER_COMMENTWnd,
											NULL,
											GTLV_Labels,	~0,
											TAG_END);

				AddTail( ( struct List * ) &KC_Users0List , (struct Node *) rc_node2 );

				GT_SetGadgetAttrs(	KiLLER_COMMENTGadgets[ GD_KC_Users ],
										 	KiLLER_COMMENTWnd,
											NULL,
											GTLV_Labels,	&KC_Users0List,
											TAG_END);
			}
		}
		else
			DisplayBeep(NULL);
	}

	// Free all allocated memory again
	if ( UsersLabs )
		FreeVec ( UsersLabs );
	if ( UsersText )
		FreeVec ( UsersText );
	FreeNodes ( (struct List *) &KC_SELECT_USER1List );

	CloseUSER_SELECTIONWindow();

	return ( error );
}

void FreeNodes (struct List *list)
{
   struct Node *worknode;
   struct Node *nextnode;
   
   worknode = (struct Node *) list->lh_Head; // First node in list
   while (nextnode = (struct Node *) worknode->ln_Succ)
   {
		Remove( worknode );		// Take the node out of the list
      FreeVec( worknode );		// Free the memory of the node
      worknode = nextnode;		// Go to next node
   }
}

BOOL SaveAndQuit ( void )
{
	// Save the preferences (now that's something else than 'save the whales' :) ).
	char	Temp[200];
	struct	Node		*node=NULL;
	struct	receiver	*rc_ptr=NULL;

	FILE	*fptr;

	// Set location of prefs-file
	sprintf( Temp , "%s" , kc_location );
	AddPart( Temp , "KiLLER_Comment.Prefs" , 200 );

	// Does it exist already? If so, ask for confirmation
	if ( ! access ( Temp , F_OK ) )
		if ( EasyRequest ( NULL , &FileAlreadyExists , NULL, Temp ) == FALSE )
			return ( FALSE );

	// Allocate memory for one `receiver' structure. We can't save the
	// receiver_node structure to disk because it contains system
	// info (for the Node structure) and that would be useless information
	// and make the prefs file unneccessarily big.
	rc_ptr = AllocVec( sizeof( struct receiver ) , MEMF_PUBLIC|MEMF_CLEAR );
	if ( ! rc_ptr )
	{
		printf( "Couldn't allocate %d bytes!\n" , sizeof( struct receiver ) );
		return( FALSE );
	}

	// Let's try to open the file to write to
	if ( fptr = fopen ( Temp , "w" ) )
	{
		// Set correct version in the open file
		fwrite ( CONFIG_VERSION , sizeof( CONFIG_VERSION ) , 1 , fptr );

		// For every user we got in the list, we need to copy it to the
		// receiver structure and save that structure to disk.
		for ( node = (struct Node *) KC_Users0List.mlh_Head ; node->ln_Succ; node = node->ln_Succ )
		{
			rc_node = (struct receiver_node *) node;
			rc_ptr->rc_slotnumber = rc_node->rc_slotnumber;
			strcpy ( rc_ptr->rc_knownas , rc_node->rc_knownas );
			strcpy ( rc_ptr->rc_info , rc_node->rc_info );
			strcpy ( rc_ptr->rc_comments , rc_node->rc_comments );
			rc_ptr->rc_min_acs = rc_node->rc_min_acs;
			rc_ptr->rc_msg_received = rc_node->rc_msg_received;
			rc_ptr->rc_last_msg = rc_node->rc_last_msg;
			rc_ptr->rc_last_user = rc_node->rc_last_user;
			fwrite( rc_ptr , sizeof( struct receiver ), 1 , fptr );
	   }
		fclose( fptr );
		FreeVec( rc_ptr );
	}
	return ( TRUE );
}

char *FileRequested ( char *Hail, char *Directory )
{
   struct Library *AslBase =NULL;
   struct FileRequester *fr;
   char Filenaam[130], temp[130], Dir[200];

   sprintf(Dir, "%s", Directory);
   Dir[strlen(Directory)-strlen(FilePart(Directory))]=0x00;

   if (AslBase = OpenLibrary ("asl.library", 37L))
   {
      if (fr = (struct FileRequester *) AllocAslRequestTags(
                ASL_FileRequest,
                ASL_Hail,       (ULONG) Hail,
                ASL_OKText,     (ULONG) "Select",
                ASL_Dir,        (ULONG) Dir,
                ASL_CancelText, (ULONG) "Cancel",
                ASL_Window,     KiLLER_COMMENTWnd,
                TAG_DONE))
      {
         if (AslRequest(fr, NULL))
         {
            sprintf(Filenaam, "%s", fr->rf_Dir);
            AddPart(Filenaam, fr->rf_File, 200);
            sprintf(temp, "%s", Filenaam);
         }
         else
         {
            temp[0]=0x00;
         }
         FreeAslRequest(fr);
      }
      else
      {
         DisplayBeep(NULL);
         temp[0]=0x00;
      }
   }
   else
		printf("Couldn't open ASL.library!\n");

   CloseLibrary(AslBase);
   return(temp);
}
