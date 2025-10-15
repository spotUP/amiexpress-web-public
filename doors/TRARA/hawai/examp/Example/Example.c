/******************************************************************************
*																										*
*								Example of how to use Code.o									*
*								 Re/Y\o /Y\ystic /X-DeSiGn 									*
*																										*
******************************************************************************/

#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include	<misc/code.h>
#include <libraries/dos.h>
#include <fcntl.h>

// these defines are not nescessary .. it is maybe better to just remove or
// outcomment the Reset() or Time(date) funtion ... 

#define	RELEASE 1		//if we want a release version
#undef	RELEASE			//if we don't want a release version
#define	REGISTERED		//if we want a registered version
#undef	REGISTERED		//if we don't want a registered version

char	*date=__AMIGADATE__; // we NEED this to determine the date of
									// how long we want our tool to work ...
									// the month after the date of compilation
									// the program will reset every time it is called...

void main(int argc,char **argv)
{
#ifdef REGISTERED
	Reset();	// if somebody changed something in the registration string
#else			// reset his computer ...
	DeCode(REG,PAS);	// Decode the REG string if we did not do the Reset()
#endif					// if release there is no need to display this string
							// so no need to DeCode it anyway ... but would be nice
							// for safety reasons to Register the File Anyway
							// to for example /Y\ystic/X-DeSign so you can
	printf("SysopName = %s\n",SysopName(REG)); // Display Sysop name here ...
#ifdef RELEASE											// or if no registration display
	Time(date);											// /Y\ystic/X-DeSiGn :)
#endif				// if we have a release version check if month is over ...
						// when yes ... just reset ...
	exit(0);
}

// I strongly recommand to Register your program to something ... doesn't
// matter what since you might not use the REG string anyway ... but the
// $SYSOP line in your code will be gone ... So no looking into it :) ...
// The SysopName() function gives the String Of the Sysop who your tool is
// registered for ... Really easy to display his name everywhere you want to ...
