#define COMMENT_INIT

#include "Comment.H"

void Initialise ( void )
{
	char	temp[ 100 ];

	// Allocate the memory we need to have to run
	gn_ptr = AllocVec ( sizeof( struct general ) , MEMF_PUBLIC|MEMF_CLEAR );
	if ( gn_ptr == NULL )
		enddoor( MEMORY_ERROR );

   // Open icon.library to read icons
   IconBase = OpenLibrary( "icon.library" , 0L );
   if ( IconBase == NULL )
	{
		sm( "Couldn't open icon.library! Exiting...\n\r" , 0 );
		enddoor( EXIT_SILENTLY );
	}

	// Check out our icon and find out where we are located on the
	// harddrive.
	ReadDoorIcon();

	// Make clear to other doors (and /X) what we are doing via an
	// environment variable (ENV: STATS@x)
   putuserstring( "4" , ENVSTAT );

	// Put in the ACP window what is going on
   putuserstring ( "K-Comment" , 177 );
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
