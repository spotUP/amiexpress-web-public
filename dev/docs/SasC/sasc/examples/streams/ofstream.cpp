#include <fstream.h>

// Example using an ofstream (Output-only File-based stream)
int main(void)
{
   // Declare an ofstream object called "mystream" and initialize
   // it to write bytes to the file "myofile.dat"
   ofstream mystream("myofile.dat");

   // Declare an unopened ofstream object called "mystream2"
   ofstream mystream2;

   // Declare a pointer to an ofstream object
   ofstream *stream_p;

   if(!mystream)
   {
      cout << "Error opening file \"myofile.dat\"!" << endl;
      return 20;
   }

   // Write an integer to the file attached to "mystream"
   cout << "writing \"123\" to file \"myofile.dat\"" << endl;
   mystream << 123;

   // Initialize the unopened "mystream2" stream to write to
   // the file "myofile2.dat"
   mystream2.open("myofile2.dat");

   if(!mystream2)
   {
      cout << "Error opening file \"myofile2.dat\"!" << endl;
      return 20;
   }

   // Write an integer to "myofile2.dat"
   cout << "writing \"456\" to file \"myofile2.dat\"" << endl;
   mystream2 << 456;

   // Allocate a new ofstream using "new" and use it to write to
   // the file "myofile3.dat"
   stream_p = new ofstream("myofile3.dat");

   if(!stream_p || !*stream_p)
   {
      cout << "Error opening file \"myofile3.dat\"!" << endl;
      return 20;
   }
   cout << "Writing \"789\" to file \"myofile3.dat\"" << endl;
   *stream_p << 789;

   // Free the object just allocated.  This will call the destructor
   // for the stream and therefore close the file.
   delete stream_p;

   // Destructors for the other streams will automatically be called.
   return 0;
}

