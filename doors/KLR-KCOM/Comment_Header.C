#define COMMENT_HEADER

#include "Comment.H"

int DisplayHeader( int default_return )
{
	// This routine will check if there is a header-file that needs
	// to be displayed before the receptors are shown. If there is,
	// it will show the file and return the number of lines that
	// were printed. If there was no file, it will exit with the
	// default_return value.
	//
	// INPUT	 : Default return value (int)
	// OUTPUT : Number of lines printed on screen (int)

	FILE	*header;

	char	temp[ 300 ];

	int	lines_on_screen = 0;

	// Check for file
	if ( gn_ptr->gn_header[ 0 ] != 0x00 )
	{
		header = fopen( gn_ptr->gn_header , "r" );
		if ( header )
		{
			do
			{
				fgets( temp , sizeof( temp ) , header );
				if ( ! feof( header ) )
				{
					strcat( temp , "\r" );
					sm( temp , 0 );
					lines_on_screen++;
				}
			} while ( ! feof( header ) );
			sm( "\n\r" , 0 );
			lines_on_screen++;
			fclose( header );
		}
	}
	else
		lines_on_screen = default_return;

	// Exit routine
	return( lines_on_screen );
}
