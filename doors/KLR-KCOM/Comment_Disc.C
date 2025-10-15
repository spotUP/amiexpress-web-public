#define KILLER_COMMENT_DISC

#include "Comment.H"

// Actions performing disc activity go here

void ReadDoorIcon ( void )
{
	// This routine will find the location of the command (in the right
	// order and will read some tooltypes from that icon.

   char Temp[200], temp1[200], IconLoc[200];
	char	*p;
   int   i;

	// SYSCMD directory
	if ( access( "BBS:Commands/SYSCmd/C.info" , F_OK ) )
	{
		// CONFxCMD directory
		getuserstring( Temp , BB_CONFNUM );
		i = atoi( Temp ) + 1;
		sprintf( temp1 , "BBS:Commands/Conf%dCmd/C.info", i );
		if ( access ( temp1 , F_OK ) )
		{
			// NODExCMD
			getuserstring( Temp , BB_NODEID );
			sprintf( temp1 , "BBS:Commands/Node%sCmd/C.info", Temp );
         if ( access( temp1 , F_OK ) )
			{
				// BBSCMD
				if (access( "BBS:Commands/BBSCmd/C.info" , F_OK) )
				{
					sm( "Could not find C.info in any of the command directories!\n\r" , 0 );
					enddoor ( EXIT_REGULAR_C );
            }
            else
               strcpy(IconLoc, "BBS:Commands/BBSCmd/C");
         }
         else
            sprintf(IconLoc, "BBS:Commands/Node%sCmd/C", Temp);
      }
      else
         sprintf(IconLoc, "BBS:Commands/Conf%dCmd/C", i);
   }
   else
      strcpy(IconLoc, "BBS:Commands/SYSCmd/C");

	// Open the icon and read info
	if ( InitIcon( IconLoc ) )
	{
		// Where is our door located?
		strcpy( gn_ptr->gn_doorlocation , FromIcon( "LOCATION" ) );
		gn_ptr->gn_view_access = atoi( FromIcon("ACS_STATS") );
		strcpy( bbs_location , FromIcon( "BBS_LOCATION" ) );
		if ( FromIcon( "SEPARATOR_LINE" ) )
			line_separator = TRUE;
		p = FromIcon( "HEADER" );
		if ( p )
			strcpy( gn_ptr->gn_header , p );
		else
			gn_ptr->gn_header[ 0 ] = 0x00;

		// We are done with the icon, close it
		CloseIcon();
	}
	else
	{
		sprintf(temp1, "Couldn't open the icon of: %s\n" , IconLoc );
		sm( temp1 , 0 );
		enddoor ( EXIT_REGULAR_C );
	}
}

void LoadPrefs ( void )
{
	char	Temp[ 300 ];
	int	acs_level;

	struct	receiver	*dummy_ptr;
	struct	USER	usr;

	FILE	*fptr, *fptr2;

	// Initialise KC_Users0List (standard procedure)
	KC_Users0List.mlh_Head     = (struct Node *) &KC_Users0List.mlh_Tail;
	KC_Users0List.mlh_Tail     = 0;
	KC_Users0List.mlh_TailPred = (struct Node *) &KC_Users0List.mlh_Head;

	// Is there a prefs file? If so, read it. If not, fill it with default
	// values.
	sprintf( Temp , "%s" , gn_ptr->gn_doorlocation );
	Temp[ strlen( gn_ptr->gn_doorlocation ) - strlen( FilePart ( Temp ) ) ] = 0x00;
	AddPart( Temp , "KiLLER_Comment.Prefs" , 300 );
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
					sm( "Corrupt config file! Defaulting to sysop.\n\r\n\r" , 0 );
					fclose ( fptr );
					fclose ( fptr2 );
					enddoor ( EXIT_REGULAR_C );
				}
				else
				{
					// What is the sec.level of the user who is using this door?
					getuserstring( Temp , DT_SECSTATUS );
					acs_level = atoi( Temp );

					// Read the receivers until end of file
					// In order to do so, we need to allocate memory for a dummy
					dummy_ptr = AllocVec ( sizeof ( struct receiver ) , MEMF_PUBLIC|MEMF_CLEAR );
					if ( dummy_ptr == NULL )
						enddoor( MEMORY_ERROR );
	
					// Read the info about the receivers
					while ( ! feof ( fptr ) )
					{
						fread ( dummy_ptr , 1 , sizeof ( struct receiver ) , fptr );
						if ( ! feof ( fptr ) )
						{
							// Does user have access to see this user in the list?
							if ( acs_level >= dummy_ptr->rc_min_acs )
							{
								rc_node = AllocVec ( sizeof ( struct receiver_node ) , MEMF_PUBLIC|MEMF_CLEAR );
								if ( rc_node == NULL )
								{
									FreeVec( dummy_ptr );
									fclose ( fptr2 );
									fclose ( fptr );
									enddoor ( MEMORY_ERROR );
								}
								rc_node->rc_slotnumber = dummy_ptr->rc_slotnumber;

								// Now that we got the user's slotnumber, we can search for his
								// real name in the USER.DATA.
								if ( fseek ( fptr2 , ( rc_node->rc_slotnumber - 1 ) * sizeof ( struct USER ) , SEEK_SET ) == -1 )
								{
									sm( "Error reading USER.DATA file for user's name. Defaulting to sysop.\n\r" , 0);
									fclose( fptr );
									fclose( fptr2 );
									FreeVec ( dummy_ptr );
									enddoor ( EXIT_REGULAR_C );
								}
								fread ( &usr , 1 , sizeof( struct USER ) , fptr2 );

								// Check of the user in the [C]omment list has got
								// access to this conference. If not, don't put
								// him in the list.
								if ( UserAccess( usr.Conference_Access ) )
								{
									strcpy ( rc_node->rc_realname , usr.Name );

									// And fill the rest with the info from disk
									gn_ptr->gn_total_users++;
									strcpy ( rc_node->rc_knownas , dummy_ptr->rc_knownas );
									strcpy ( rc_node->rc_info , dummy_ptr->rc_info );
									strcpy ( rc_node->rc_comments , dummy_ptr->rc_comments );
									rc_node->rc_msg_received = dummy_ptr->rc_msg_received;
									rc_node->rc_last_msg = dummy_ptr->rc_last_msg;
									rc_node->rc_last_user = dummy_ptr->rc_last_user;
									rc_node->rc_number = gn_ptr->gn_total_users;
									rc_node->rc_min_acs = dummy_ptr->rc_min_acs;
									rc_node->nn_Node.ln_Name = rc_node->rc_knownas;
									rc_node->nn_Node.ln_Type = 0;
									rc_node->nn_Node.ln_Pri	= 0;
									AddTail( ( struct List * ) &KC_Users0List , (struct Node *) rc_node );
								}
							}
						}
					}
				}
				// We are done reading the file, close it, return the memory of
				// the dummy pointer and report the number of receivers.
				fclose ( fptr );
				fclose ( fptr2 );
				FreeVec ( dummy_ptr );
			}
			else
			{
				sm("Couldn't open USER.DATA for reference.\n\r" , 0 );
				fclose( fptr );
				enddoor( EXIT_REGULAR_C );
			}				
		}
		else
		{
			sm("Couldn't open preferences.\n\r" , 0 );
			enddoor( EXIT_REGULAR_C );
		}
	}
	else
		sm("Could not find prefs!\n\r",0);

	// Did we have some receivers? If not, reserve memory for one receiver,
	// the sysop.
	if ( gn_ptr->gn_total_users == 0 )
		enddoor ( EXIT_REGULAR_C );

   // Did we have ONE receiver? If so, exit gentle and write to that
   // receiver.
   if ( gn_ptr->gn_total_users == 1 )
   {
   	// Set the rc_node pointer to the only user in the list
   	rc_node = (struct receiver_node *) KC_Users0List.mlh_Head;
   	enddoor( LEAVE_COMMENT );
   }
}

int WordCount (char *text)   /* © TyCoOn/MYSTiC */
{
   int l1 = 1, len, counter = 0;
   BYTE temp[2];

   len = strlen(text);
   temp[0] = 0x01;
   while (counter <= len)
   {
      if ( (text[counter] == 0x20) && (temp[0] != 0x20) )
         l1++;
      if ( (text[counter] == 0x00) && (temp[0] == 0x20) )
      {
         l1--;
         text[counter-1]=0x00;
      }
      temp[0] = text[counter];
      counter++;
   }
   return(l1);
}

ULONG InitIcon(char *IconName)
{
   if (dobj)
      CloseIcon();
   dobj = GetDiskObject(IconName);
   if (!dobj)
      return( FALSE );
   toolarray = (char **)dobj->do_ToolTypes;
   return ( TRUE );
}

char *FromIcon(char *text)
{
   return(tooltype = FindToolType(toolarray, text));
}

void CloseIcon(void)
{
   if (dobj)
   {
      FreeDiskObject(dobj);
      dobj=NULL;
   }
}

void end (void)
{
  exit(0);
}

void LastCommand (void)
{
}

void ShowComment ( void )
{
	long	file_size, file_pos;
	char	ch;
	unsigned int clock[2];
	unsigned short seed[3];
	FILE	*fptr;
	char	temp[200], temp2[200];

	if ( ! access( rc_node->rc_comments , F_OK ) )
	{		
		file_size = GetFileSize( rc_node->rc_comments );

		if ( file_size != 0 )
		{
			timer(clock);
			seed[0] = clock[0];
			seed[1] = clock[1];
			seed[2] = clock[0];
			file_pos = nrand48( seed ) % file_size;

			if ( fptr = fopen( rc_node->rc_comments , "r" ) )
			{
				// Jump to the position in the file
				fseek( fptr , file_pos , SEEK_SET );

				// Read till we find a return (\n)
				while( ( ( ch = fgetc( fptr ) ) != '\n' ) && ( ch != EOF));

				// If we read past the EOF, we simply jump back to the first
				// line and show it (it doesn't happen often).
				if ( ch == EOF || feof( fptr ) )
					fseek( fptr , 0 , SEEK_SET );

				// Read the line, cut the \n at the end (if there is any) and
				// show it
				temp[ 0 ] = 0x00;
				fgets ( temp , sizeof( temp ) , fptr );
				if ( strlen( temp ) < 2 )
				{
					fseek( fptr , 0 , SEEK_SET );
					fgets( temp , sizeof( temp ) , fptr );
				}
				CUTCR ( temp );
				sprintf ( temp2 , temp , rc_node->rc_knownas );
				sm ( "[36m " , 0 );
				sm ( temp2 , 0 );
				sm ( "[0m\n\r\n\r" , 0 );
			}
		}
	}
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

void SaveNewStats ( void )
{
	char	Temp[ 300 ];
	struct receiver *dummy_ptr;
	long	file_pos;
	BOOL	success = FALSE;

	FILE	*file_ptr;

	sprintf( Temp , "%s" , gn_ptr->gn_doorlocation );
	Temp[ strlen( gn_ptr->gn_doorlocation ) - strlen( FilePart ( Temp ) ) ] = 0x00;
	AddPart( Temp , "KiLLER_Comment.Prefs" , 300 );
	if ( ! access ( Temp , F_OK ) )
	{
		if ( file_ptr = fopen ( Temp , "r+" ) )
		{
			if ( dummy_ptr = AllocVec ( sizeof( struct receiver ) , MEMF_PUBLIC|MEMF_CLEAR ) )
			{
				// Check for correct version (and is it a config file)
				fread ( Temp , sizeof( CONFIG_VERSION ) , 1 , file_ptr );
				while ( ! feof ( file_ptr ) )
				{
					file_pos = ftell( file_ptr );
					fread ( dummy_ptr , 1 , sizeof( struct receiver ) , file_ptr );
					//sprintf( Temp , " FOUND: %s - %d - %s - %d\n\r" , dummy_ptr->rc_knownas , dummy_ptr->rc_msg_received , ctime( &dummy_ptr->rc_last_msg ) , dummy_ptr->rc_last_user );
					//sm( Temp , 0 );
					if ( dummy_ptr->rc_slotnumber == rc_node->rc_slotnumber )
					{
						fseek ( file_ptr , file_pos , SEEK_SET );
						dummy_ptr->rc_msg_received++;
						time(&dummy_ptr->rc_last_msg);
						getuserstring( Temp , DT_SLOTNUMBER );
						dummy_ptr->rc_last_user = atol( Temp );
						fwrite ( dummy_ptr , sizeof( struct receiver ) , 1 , file_ptr );
						success = TRUE;
						break;
					}
				}
				fclose( file_ptr );
			}
			FreeVec( dummy_ptr );
		}
	}
	if ( ! success )
		sm(" [31mERROR! Failed to write new statistics. Tell the sysop please.\n\r" , 0 );
}

BOOL UserAccess( char *conf_acc )
{
	// This function will search the given access icon and check if
	// the current conference is in it. Depending on the output it
	// will either return TRUE (yes, it's in it) or FALSE.
	
	struct	DiskObject	*d_obj;
	char		*tool_type, **tool_array;
	char		temp[ 200 ];
	int		i;
	BOOL		rc = FALSE;

	// Is the icon.library open? It should be, but it can't hurt to
	// check anyway.
	if ( IconBase )
	{
		strcpy( temp , bbs_location );
		AddPart( temp , "Access/Area." , 200 );
		strcat( temp , conf_acc );
		d_obj = GetDiskObject( temp );
		if ( d_obj )
		{
			// What tooltypes are there?
			tool_array = (char **) d_obj->do_ToolTypes;

			// Construct the tooltype we're looking for
			getuserstring( temp , BB_CONFNUM );
			i = atoi( temp ) + 1;
			sprintf( temp , "CONF.%d" , i );

			// Check if the tooltype is available
			if ( tool_type = FindToolType( tool_array , temp ) )
				rc = TRUE;
			
			// Free the object again
			FreeDiskObject( d_obj );
		}
		else
		{
			sm( "Couldn't allocate ACCESS icon! Warn sysop!\n\r" , 0 );
			sm( temp , 1 );
		}
	}
	else
		rc = TRUE;
	return( rc );
}
