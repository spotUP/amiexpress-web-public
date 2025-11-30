/* example program that runs forever */

#include <stdio.h>
#include <proto/exec.h>

main()
{
        int i = 0;
        struct Task *Task;
 
        /* set the priority to -1 so we don't use up all the CPU */
        Task = FindTask(0);
        SetTaskPri(Task, -1);
        
               
        while (i == 0)
        {
                printf("looping ...\n");
        }
}
