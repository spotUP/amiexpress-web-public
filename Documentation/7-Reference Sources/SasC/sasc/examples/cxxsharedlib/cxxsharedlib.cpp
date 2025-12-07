#include <iostream.h>
#include "cxxsharedlib.h"

__saveds __asm FOO::FOO(register __d1 int init)
{
   cout << "FOO::FOO(int) called with " << init << endl;
}

__saveds __asm FOO::~FOO()
{
   cout << "FOO::~FOO() called" << endl;
}

void __saveds __asm FOO::foofunc(register __d0 int intparm)
{
   cout << "FOO::foofunc(int) called with " << intparm << endl;
}

void __saveds __asm FOO::foofunc(register __a1 char *ptrparm)
{
   cout << "FOO::foofunc(char *) called with \"" << ptrparm << "\"" << endl;
}

#if DEBUGLIBINIT
// The following function is here to allow us to debug the library
// initialization code.  This is necessary if we want to debug constructors
// called for static or external variables, for example.  If you try to
// set a breakpoint on constructors or autoinitializers in a shared
// library, it will not take effect until AFTER the OpenLibrary() call
// returns to you!
//
// The process works like this:
//
//    1. Compile this file with the option DEFINE DEBUGLIBINIT=1.
//    2. Make sure SegTracker and Enforcer are running.  They are shipped
//       with SAS/C in the SC:EXTRAS drawer.
//    3. Invoke CPR on the program that opens this library.  The program
//       will stop before it gets to main() due to an enforcer hit.
//       The source window will show assembly language source.
//    4. Enter the following command in the dialog window:
//
//          symload pc pc "pathname"
//
//       (yes, you enter the letters "pc" twice in a row!)
//
//       "pathname" is the name of the .library file on disk,
//       surrounded by double quotes.
//
//       (Note: If the .library file is in the current directory,
//        you can abbreviate the above command to simply "symload".)
//    5. At this point, you can enter breakpoints for C++ constructors
//       and use the GO command as if the library were a normal program.
//
//    NOTE: When compiled with DEFINE DEBUGLIBINIT=1, your shared library
//          will generate one enforcer hit each time it is opened by a
//          program!  The enforcer hit is harmless, but it would probably
//          be a pretty good idea not to ship a product with it enabled...

static long __tmpvar;
int _STI_1_debug(void)
{
   volatile long *a = 0;   // Must be volatile so the optimizer leaves it
   __tmpvar = *a;  // Cause an enforcer hit
   return 0;
}
#endif
