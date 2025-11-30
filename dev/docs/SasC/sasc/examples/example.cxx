#include <iostream.h>
#include <iomanip.h>
#include <math.h>
#include <proto/dos.h>


int main(void)
{
        int i=43;
        double d;
        
        d=(double)i/2;
        cout << "i=" << i << ", d=" << setprecision(3) << 
             setiosflags(ios::showpoint) << d << "\n";
        Delay(60);
        return(0);
}
