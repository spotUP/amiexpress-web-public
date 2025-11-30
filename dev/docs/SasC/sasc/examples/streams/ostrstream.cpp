#include <strstream.h>

// Example using an ostrstream (Output-only String-based stream)
int main(void)
{
   // Declare an ostrstream object called "mystream"
   ostrstream mystream;

   // Write two integers to the string attached to "mystream"
   mystream << 123 << 456 << ends;

   // Obtain the contents of mystream and send them to stdout
   cout << "mystream contains: " << mystream.str() << endl;

   // The destructor for the stream will automatically be called.
   return 0;
}
