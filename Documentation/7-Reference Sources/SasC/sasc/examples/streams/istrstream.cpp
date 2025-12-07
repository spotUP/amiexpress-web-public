#include <strstream.h>

// Example using an istrstream (Input-only String-based stream)
int main(void)
{
   // Declare an istrstream object called "mystream" and initialize
   // it to read bytes from the string "123 456".
   istrstream mystream("123 456");

   // Declare a pointer to an istrstream object
   istrstream *stream_p;

   int i, j;
   double d;
   char c;

   // Read two integers from the string attached to "mystream"
   mystream >> i >> j;

   // Print the integers to the program's standard output
   cout << "The integers are " << i << " and " << j << endl;

   // Allocate a new static-mode istrstream using "new"
   stream_p = new istrstream("3.765 x");
   *stream_p >> d >> c;
   cout << "The number is " << d << " and the letter is " << c << endl;

   // Free the object just allocated.  This will call the destructor
   // for the stream and therefore close the file.
   delete stream_p;

   // Destructors for the other streams will automatically be called.
   return 0;
}
