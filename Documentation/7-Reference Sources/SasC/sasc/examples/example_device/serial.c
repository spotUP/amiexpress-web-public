/* Example device that implements the CMD_READ and CMD_WRITE */
/* commands. This device will only run under AmigaDOS 2.0 or */
/* greater because of the use of CreateNewProc().            */

#define  _USEOLDEXEC_ 1
#include <exec/types.h>
#include <exec/nodes.h>
#include <exec/memory.h>
#include <exec/resident.h>
#include <exec/libraries.h>
#include <exec/execbase.h>
#include <exec/io.h>
#include <exec/errors.h>
#include <libraries/dos.h>
#include <devices/serial.h>
#include <dos/dostags.h>
#include <utility/tagitem.h>
#include <proto/exec.h>
#include <proto/dos.h>

#include <string.h>
#include <dos.h>

#define CMD_TERM     0x7ff0
#define CMD_STARTUP  0x7ff1

struct MsgPort *myPort;
extern struct ExecBase *SysBase;

struct START_MSG {
        struct Message msg;
        long devbase;
};

void cmd_handler(void)
{
    struct IORequest *ior;
    struct IOExtSer *ioes;
    long input, output;
    struct Process *proc;   
    struct START_MSG *msg;

    proc = (struct Process *)FindTask((char *)NULL);

    /* get the startup message */
    while((msg = (struct START_MSG *)GetMsg(&proc->pr_MsgPort)) == NULL) 
        WaitPort(&proc->pr_MsgPort);
    
    /* builtin compiler functions to set A4 to the global */
    /* data area */
    putreg(REG_A6, msg->devbase); 
    geta4();
    myPort = CreatePort(0,0);
    ReplyMsg((struct Message *)msg);

    if (myPort == NULL) return;

    input = Open("con:0/0/400/100/Input", MODE_NEWFILE);
    if (input == NULL) return;
    output = Open("con:0/110/400/100/Output", MODE_NEWFILE);
    if (output == NULL)
    {
        Close(input);
        return;
    }
    
    while (1) 
    {
        WaitPort(myPort);
        while (ior = (struct IORequest *)GetMsg(myPort)) 
        {
	    switch(ior->io_Command) 
            {
                case CMD_TERM:
                    Close(input);
                    Close(output);
                    Forbid();
                    ReplyMsg(&ior->io_Message);
                    return;
                    
                case CMD_READ:
                    ioes = (struct IOExtSer *)ior;
                    ioes->IOSer.io_Actual = Read(input, 
                                           ioes->IOSer.io_Data, 
                                           ioes->IOSer.io_Length);
                    break;
                    
                case CMD_WRITE:
                     Write(output, ioes->IOSer.io_Data, 
                           ioes->IOSer.io_Length);
                     break;
            }
            ReplyMsg(&ior->io_Message);
        }
    }
}


int  __saveds __asm __UserDevInit(register __d0 long unit,
                                  register __a0 struct IORequest *ior,
                                  register __a6 struct MyLibrary *libbase)
{
      struct Process *myProc;
      struct START_MSG msg;
      
      if (SysBase->LibNode.lib_Version < 36)
          return 1; /* can only run under 2.0 or greater */ 
      
      myProc = CreateNewProcTags(NP_Entry, cmd_handler,
                                 NP_StackSize, 4096,
                                 NP_Name, "CMD_Handler",
                                 TAG_DONE);
      if (myProc == NULL) 
        return 1;

      /* Send the startup message with the library base pointer */
      msg.msg.mn_Length = sizeof(struct START_MSG) - 
                          sizeof (struct Message);
      msg.msg.mn_ReplyPort = CreatePort(0,0);
      msg.msg.mn_Node.ln_Type = NT_MESSAGE;
      msg.devbase = getreg(REG_A6);
      PutMsg(&myProc->pr_MsgPort, (struct Message *)&msg);
      WaitPort(msg.msg.mn_ReplyPort);

      if (myPort == NULL) /* CMD_Handler allocates this */
        return NULL;
      
      DeletePort(msg.msg.mn_ReplyPort);
      
      return 0;
}


void __saveds __asm __UserDevCleanup(register __a0 struct IORequest *ior,
                                     register __a6 struct MyLibrary *libbase)
{
    struct IORequest newior;    
        
    /* send a message to the child process to shut down. */
    newior.io_Message.mn_ReplyPort = CreateMsgPort();
    newior.io_Command = CMD_TERM;
    newior.io_Unit = ior->io_Unit;

    PutMsg(myPort, &newior.io_Message);
    WaitPort(newior.io_Message.mn_ReplyPort);
    DeleteMsgPort(newior.io_Message.mn_ReplyPort);
    DeletePort(myPort);
}


void __saveds __asm DevBeginIO(register __a1 struct IORequest *ior)
{
    ior->io_Error = 0;

    ior->io_Flags &= ~IOF_QUICK;
    switch(ior->io_Command) 
    {
        case CMD_READ:
        case CMD_WRITE:
          PutMsg(myPort, &ior->io_Message);
          break;
 
        case CMD_RESET:
        case CMD_UPDATE:
        case CMD_CLEAR:
        case CMD_STOP:
        case CMD_START:
        case CMD_FLUSH:
        case CMD_INVALID:
        default:
            ior->io_Error = IOERR_NOCMD;
 	    ReplyMsg(&ior->io_Message);
           break;
    }
}

void __saveds __asm DevAbortIO(register __a1 struct IORequest *ior)
{
}
