/* Driver program to test example.device */
/* Copyright (c) 1993 SAS Institute, Inc, Cary, NC, USA */
/* All Rights Reserved */

#include <exec/devices.h>
#include <devices/serial.h>
#include <proto/exec.h>

void main(void)
{
    struct IOExtSer *ior;
    struct MsgPort *SerialMP;
    char buff[10];

    if (SerialMP = CreatePort(0,0))
    {
        if (ior = (struct IOExtSer *) 
                       CreateExtIO(SerialMP, sizeof(struct IOExtSer)))
        {
            if (OpenDevice("example.device",-1,(struct IORequest*)ior,0) == 0)
            {
                ior->IOSer.io_Data = buff;
                while(1)
                {
                    ior->IOSer.io_Command = CMD_READ;
                    ior->IOSer.io_Length = 1;
                    DoIO((struct IORequest *)ior);
                    if (ior->IOSer.io_Actual < 1)
                    {
                        CloseDevice((struct IORequest *)ior);
                        break;
                    }
                    ior->IOSer.io_Command = CMD_WRITE;
                    ior->IOSer.io_Length = 1;
                    DoIO((struct IORequest *)ior);
                }
            }
            DeleteExtIO((struct IORequest *)ior);
        }
        DeletePort(SerialMP);
    }
}
