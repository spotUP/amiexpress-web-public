/* Copyright (c) 1992-1993 SAS Institute, Inc, Cary, NC, USA */
/* All Rights Reserved */

#define __USE_SYSBASE 1

#include <proto/exec.h>
#include <proto/dos.h>
#include <exec/execbase.h>
#include <stdio.h>
#include "mylib_pragmas.h"

char __stdiowin[] = "con:0/0/640/100/";

struct Library *MyLibBase;

main()
{
        int ret;
        
        MyLibBase = OpenLibrary("mylib.library",0);

        if (MyLibBase)
        {
            printf("Library Opened Sucessfully.\n");
            ret = test1();
            
            printf("test1 returned = %d\n", ret);
            
            test2(ret+1);

            printf("test1 returned = %d\n",test1());

            CloseLibrary(MyLibBase);

            printf("Library Closed.\n");

            /* If not running AmigaDOS 2.0 or above, we call Delay() */
            /* to give them a chance to see the contents of the      */
            /* window.  Under 2.0 and above, they have to click on   */
            /* the close gadget before the window goes away.         */
            if(SysBase->LibNode.lib_Version < 37) Delay(200);
        }
}

