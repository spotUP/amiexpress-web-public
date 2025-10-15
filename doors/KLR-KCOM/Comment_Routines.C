#define COMMENT_ROUTINES

#include "Comment.H"

BOOL CompareNames ( char *Name , BOOL CompareType )
{
	char	CompareName[32];
	struct Node *node;
	BOOL	success = FALSE;

	for ( node = (struct Node *) KC_Users0List.mlh_Head ; node->ln_Succ; node = node->ln_Succ )
	{
		if ( CompareType == STRICT_COMPARE )
		{
			if ( stricmp ( Name , node->ln_Name ) == 0 )
			{
				success = TRUE;
				break;
			}
		}
		else
		{
			// The strstr() function is case sensitive, so we need to make them
			// both uppercase. As the strupr() functions changes the case forever,
			// we need to copy it first from the list or else the name in the
			// list will STAY uppercase and we don't want that.
			strcpy ( CompareName , node->ln_Name );
			strupr ( CompareName );
			strupr ( Name );
			if ( strstr ( CompareName , Name ) != NULL )
			{
				success = TRUE;
				break;
			}
		}
	}
				
	if ( success )
		rc_node = (struct receiver_node *) node;

	return ( success );
}

BOOL CompareInfo ( char *Name )
{
	char	CompareName[80];
	struct Node *node;
	struct receiver_node *rnode;
	BOOL	success = FALSE;

	for ( node = (struct Node *) KC_Users0List.mlh_Head ; node->ln_Succ; node = node->ln_Succ )
	{
		// The strstr() function is case sensitive, so we need to make them
		// both uppercase. As the strupr() functions changes the case forever,
		// we need to copy it first from the list or else the name in the
		// list will STAY uppercase and we don't want that.
		rnode = (struct receiver_node *) node;
		strcpy ( CompareName , rnode->rc_info );
		strupr ( CompareName );
		strupr ( Name );
		if ( strstr ( CompareName , Name ) != NULL )
		{
			success = TRUE;
			break;
		}
	}
				
	if ( success )
		rc_node = rnode;

	return ( success );
}

BOOL ToNumber ( char *temp2 )
{
	struct Node *node;
	struct receiver_node *rc_ptr;
	BOOL	success = FALSE;

	if ( atoi ( temp2 ) > 0 )
	{
		for ( node = (struct Node *) KC_Users0List.mlh_Head ; node->ln_Succ; node = node->ln_Succ )
		{
			rc_ptr = (struct receiver_node *) node;			
			if ( rc_ptr->rc_number == atoi ( temp2 ) )
			{
				success = TRUE;
				break;
			}
		}
	}

	if ( success )
		rc_node = rc_ptr;

	return ( success );
}
