#include <fstream.h>

// Example using an ifstream (Input-only File-based stream)
int main(void)
{
   // Declare an ifstream object called "mystream" and initialize
   // it to read bytes from the file "myfile.dat"
   ifstream mystream("sc:examples/streams/myfile.dat");

   // Declare an unopened ifstream object called "mystream2"
   ifstream mystream2;

   // Declare a pointer to an ifstream object
   ifstream *stream_p;

   int i;

   if(!mystream)
   {
      cout << "Error opening \"sc:examples/streams/myfile.dat\"!" << endl;
      return 20;
   }

   // Read an integer from the file attached to "mystream"
   mystream >> i;

   // Print the integer to the program's standard output
   cout << "The integer in the file \"myfile.dat\" is " << i << endl;

   // Initialize the unopened "mystream2" stream to read from
   // the file "myfile2.dat"
   mystream2.open("sc:examples/streams/myfile2.dat");

   if(!mystream2)
   {
      cout << "Error opening \"sc:examples/streams/myfile2.dat\"!" << endl;
      return 20;
   }

   // Read an integer from "myfile2.dat" and print the result
   mystream2 >> i;

   cout << "The integer in the file \"myfile2.dat\" is " << i << endl;

   // Allocate a new ifstream using "new" and use it to read from
   // the file "myfile3.dat"
   stream_p = new ifstream("sc:examples/streams/myfile3.dat");

   if(!stream_p || !*stream_p)
   {
      cout << "Error opening \"sc:examples/streams/myfile3.dat\"!" << endl;
      return 20;
   }

   *stream_p >> i;
   cout << "The integer in the file \"myfile3.dat\" is " << i << endl;

   // Free the object just allocated.  This will call the destructor
   // for the stream and therefore close the file.
   delete stream_p;

   // Destructors for the other streams will automatically be called.
   return 0;
}
