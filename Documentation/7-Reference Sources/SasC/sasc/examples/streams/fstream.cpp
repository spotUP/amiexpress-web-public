#include "fstream.h"

// Example using an fstream (Input/Output File-based stream)
int main(void)
{
   // Declare an fstream object called "mystream" and initialize
   // it to perform I/O to the file "myiofile.dat"
   fstream mystream("myiofile.dat", ios::in|ios::out);

   // Declare an unopened fstream object called "mystream2"
   fstream mystream2;

   // Declare a pointer to an fstream object
   fstream *stream_p;

   int i;

   if(!mystream)
   {
      cout << "Error opening file \"myiofile.dat\"!" << endl;
      return 20;
   }

   // Read an integer from the file attached to "mystream"
   mystream >> i;

   if(!mystream) cout << "Read from \"myiofile.dat\" failed" << endl;
   else cout << "Read " << i << " from \"myiofile.dat\"" << endl;

   i = i + 1;                     // Add one to the integer
   mystream.seekp(0,ios::beg); // Seek back to beginning of file

   mystream << i;                 // Write the integer back

   if(!mystream) cout << "Write to \"myiofile.dat\" failed" << endl;
   else cout << "Wrote " << i << " to \"myiofile.dat\"" << endl;

   // Initialize the unopened "mystream2" stream to perform I/O to
   // the file "myiofile2.dat"
   mystream2.open("myiofile2.dat", ios::app|ios::in|ios::out);

   if(!mystream2)
   {
      cout << "Error opening file \"myiofile2.dat\"!" << endl;
      return 20;
   }

   // Read an integer from "myiofile2.dat"
   mystream2 >> i;

   if(!mystream2) cout << "Read from myiofile2.dat failed" << endl;
   else cout << "Read " << i << " from myiofile2.dat" << endl;

   // Write the new integer.  Note that this will APPEND the new
   // integer to the old file, not replace the old file, since
   // we did not seek to the beginning of the file before writing.
   // Put a blank in to seperate the old integer from the new one.
   i = i + 1;
   mystream2 << " " << i;

   if(!mystream2) cout << "Write to myiofile2.dat failed" << endl;
   else cout << "Appended " << i << " to myiofile2.dat" << endl;

   // Allocate a new fstream using "new" and use it to perform I/O to
   // the file "myiofile3.dat"
   stream_p = new fstream("myiofile3.dat", ios::in|ios::out);

   if(!stream_p || !*stream_p)
   {
      cout << "Error opening file \"myiofile3.dat\"!" << endl;
      return 20;
   }

   *stream_p >> i;

   if(!*stream_p) cout << "Read from myiofile3.dat failed" << endl;
   else cout << "Read " << i << " from myiofile3.dat" << endl;

   i = i + 1;
   stream_p->seekp(0, ios::beg);  // Rewrite this one, not append
   *stream_p << i;

   if(!*stream_p) cout << "Write to file myiofile3.dat failed" << endl;
   else cout << "Wrote " << i << " to myiofile3.dat" << endl;
   
   // Free the object just allocated.  This will call the destructor
   // for the stream and therefore close the file.
   delete stream_p;

   // Destructors for the other streams will automatically be called.
   return 0;
}

