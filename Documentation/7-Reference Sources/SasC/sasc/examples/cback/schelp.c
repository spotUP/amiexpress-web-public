/*
    SAS/C® Background Example
    SAS/C Help System Hot-Key Example
    version 6.50   1993
    
    Copyright (c) 1993 SAS Institute, Inc, Cary, NC USA
    All Rights Reserved

    This is a program which demonstrates how to write a background process which
    employs a hot-key.  This program will pop up the main interface to the
    SAS/C Help System when control-Help is pressed. 

    You should compile this program with the following options:

               NOSTACKCHECK
               STRUCTUREEQUIVALENCE
               LINK
               STARTUP=cback

    NOSTACKCHECK is suggested because the function handlerStuff can be called
    from a task other than this program.  It would be required if the function
    was not declared with the __interrupt keyword.  This is discussed in more
    detail at the function's definition.

    STRUCTUREEQUIVALENCE is not required, but it does circumvent several
    warnings that would otherwise be produced.

    STARTUP=cback tells slink to link with the background startup code.  This
    is required to produce a background process.  If you link in a separate step,
    you must link with cback.o instead of c.o.

    You may notice that this program does not open any AmigaDOS libraries.  Instead
    it takes advantage of the fact that the version 6.0 compiler now opens
    needed libraries for you.

    ****  IMPORTANT  ***
    When running CPR on this program or other programs using __main, you
    must perform the following 2 steps to avoid crashing the machine:
    
           1)  As soon as cpr is invoked, select Catch New Tasks from the
               Options menu.  Catch New Tasks must be set to on.
               
           2)  Type 
                    go __main
                    
               This places you at the beginning of your code.  If you say
               go __main without setting Catch New Tasks to on, you will
               probably crash the machine.  
               
     If you try to debug the input handler program HandlerInterface in this
     program, you will probably crash your machine. 

     The schelp command takes the following forms:
     
                 schelp
     
     This command will load schelp as a background process, display a copyright
     banner, and display the usage information.  If schelp is already loaded,
     it will simply display the usage information.
     
                 schelp quit
                 
     This command will display a terminating message and unload schelp from
     memory.            
     
                 schelp <command>
                 
     This command will replace the command currently tied to the control-Help
     key with the command designated.  In order for the command to work, it 
     must contain the full path to the command.            

*/

/**************************  INCLUDES  ************************/
#include <exec/types.h>
#include <exec/nodes.h>
#include <exec/lists.h>
#include <exec/memory.h>
#include <exec/interrupts.h>
#include <exec/ports.h>
#include <exec/libraries.h>
#include <exec/io.h>
#include <exec/tasks.h>
#include <exec/execbase.h>
#include <exec/devices.h>
#include <devices/timer.h>
#include <devices/input.h>
#include <devices/inputevent.h>
#include <intuition/intuition.h>
#include <libraries/dos.h>
#include <graphics/gfxmacros.h>
#include <hardware/custom.h>
#include <hardware/dmabits.h>
#include <proto/dos.h>
#include <proto/exec.h>
#include <proto/intuition.h>
#include <proto/graphics.h>
#include <string.h>
#include <stdlib.h>




/**************************  CONSTANTS  ***********************/
#define BANNER       "\x9B""0;33mSAS/C® Help\x9B""0m Copyright \xA9 1992-1993 SAS Institute, Inc.\n"
#define BANNER1  "Usage: \x9B""1mschelp\x9B""0m [quit] [<command>]\nwhere\n\x9B""1mschelp\x9B""0m           allows you to hit cntrl-Help to pop up the SAS/C Help screen\n\x9B""1mschelp quit\x9B""0m      deletes schelp as a background process\n"
#define BANNER2  "\x9B""1mschelp <command>\x9B""0m allows you to change the command executed when you hit cntrl-Help\n                   *** Include full path to the command\n"
#define DEFCMD       "sc:c/amigaguide sc:help/sc_help.guide\0"
#define DEFKEY       0x5F
#define KILLMSG      "\x9B""1mSAS/C Help\x9B""0m Terminating\n"
#define MAXCMD       200
#define PORTNAME     "SASC_HELP.port"

static const char __version[] = "$VER: SASC_schelp 6.50 (26.08.93)";

/*********************** GLOBAL VARIABLES *********************/
typedef struct
   {
   struct Task          *buddy;
   ULONG                 helpsig;
   short                 helpsignum;
   short                 key;
   } GLOBAL_DATA;

struct OURMSG {
 struct Message msg_header;
 short  quit;
 char   cmd[MAXCMD];
 };


typedef void (*vfunc)();


/**************************  PROTOTYPES  **********************/
void clean_exit(struct IOStdReq *, struct Interrupt, GLOBAL_DATA,
                struct MsgPort *, BPTR, BPTR, struct MsgPort *,int);

struct InputEvent * __asm HandlerInterface(register __a0 struct InputEvent *,
                                    register __a1 GLOBAL_DATA *);

struct IOStdReq *CreateIOReq(struct MsgPort *, int);

void DeleteIOReq(struct IOStdReq *);



/**********************  CBACK DECLARATIONS  ******************/
long __stack = 4000;              /* Amount of stack space our task needs */
char *__procname = "SAS/C® Help"; /* The name of the task to create       */
long __priority = 20;             /* The priority to run the task at    */
long __BackGroundIO = 1;          /* Flag indicating we want to send I/O to the
                                     original shell.  We will print a banner.
                                     NOTE:  This variable may also be called
                                     _BackGroundIO.  Notice the single
                                     underscore.                       */
extern BPTR _Backstdout;          /* File handle pointing to originating shell
                                     (standard output when run in background) */

/********************************************************************/

void __stdargs __main(char *command)
{
   struct OURMSG *msg, tmpmsg;
   struct MsgPort *port;
   int first_call = 0;

   char cmdstr[MAXCMD];
   BPTR  nullfh1, nullfh2;
   ULONG sig;
   struct MsgPort     *inputDevPort;
   struct IOStdReq    *inputRequestBlock;
   struct Interrupt   handlerStuff;
   GLOBAL_DATA global;

   global.helpsignum  = -1;
   inputDevPort        = NULL;
   inputRequestBlock   = NULL;
   nullfh1 = nullfh2 = NULL;

   /* Check if this program is already loaded, and if not, create a port  */
   if ((port = FindPort(PORTNAME)) == NULL)
      {
      /* Set flag indicating this is the first time the program's been called */
      first_call = 1;

      /* Since this is the first call, open the port */
      if ((port = CreatePort(PORTNAME,0)) == NULL)
          clean_exit(inputRequestBlock, handlerStuff, global, inputDevPort,
                nullfh1, nullfh2, port, first_call);
      }


   /* Allocate memory for and partially set up the message this program
      will send to itself.                                             */
   if ((msg = (struct OURMSG *)
              AllocMem(sizeof(struct OURMSG), MEMF_CLEAR | MEMF_PUBLIC)) == NULL)
      clean_exit(inputRequestBlock, handlerStuff, global, inputDevPort,
                 nullfh1, nullfh2, port, first_call);

   msg->msg_header.mn_Length = sizeof(struct OURMSG);
   msg->quit = 0;
   msg->cmd[0] = 0;

   /*  Set up the command to be executed to start SAS/C Help  */
   strcpy(cmdstr, DEFCMD);

   /* If this program was run from a CLI, then output the banner
      and process any parameters */
   if (command && *command)
      {
      /* Write the copyright banner if this is the first time the program
         was called.                                                     */
      if (first_call && _Backstdout)
         Write(_Backstdout, BANNER, sizeof(BANNER));

      /* Skip to a parameter if one exists */
      while(*command != ' ')
         command++;
      while(*command == ' ')
         command++;


      /* Evaluate the parameter */
      if (!stricmp(command, "QUIT\n"))
         {
         msg->quit = 1;
         if (_Backstdout)
            Write(_Backstdout, KILLMSG, sizeof(KILLMSG));
         }

      /*  If all that is left is a carriage return, print out the usage message */
      else if ((*command < ' ') && _Backstdout)
         {
         Write(_Backstdout, BANNER1, sizeof(BANNER1));
         Write(_Backstdout, BANNER2, sizeof(BANNER2));
         }
      /* Put the rest of the command into the command string to be executed  */
      else
         {
         strcpy(msg->cmd, command);
         msg->cmd[strlen(command)-1] = 0;  /* wipe out the EOL character */
         }
      }

   /*  Send the message with instructions on actions to SAS/C Help's port  */
   PutMsg (port,(struct Message *) msg);

   /*  If this is the first time this program is called, set up the input
       handler, etc.   */
   if (!first_call)
      clean_exit(inputRequestBlock, handlerStuff, global, inputDevPort,
                nullfh1, nullfh2, port, first_call);

   /* Close _Backstdout so that the original window can go away */
   if (_Backstdout)
      Close(_Backstdout);

   _Backstdout = 0;


   /* set the input and output streams to 0 so execute doen't complain */
   nullfh1 = Open("NIL:", MODE_NEWFILE);
   nullfh2 = Open("NIL:", MODE_NEWFILE);

   if (((inputDevPort = CreatePort(0,0)) == NULL)  ||

      ((inputRequestBlock =
          CreateIOReq(inputDevPort, sizeof(struct IOStdReq))) == NULL)  ||

      ((global.helpsignum = AllocSignal(-1)) == -1)  ||

      OpenDevice("input.device",0,(struct IORequest *)inputRequestBlock,0))

      clean_exit(inputRequestBlock, handlerStuff, global, inputDevPort,
                nullfh1, nullfh2, port, first_call);

   /*  Set up stuff for input handler  */
   handlerStuff.is_Data = (APTR) &global;
   handlerStuff.is_Code = (vfunc) HandlerInterface;
   handlerStuff.is_Node.ln_Pri = 51;

   /*  Set up global data to be used by input handler  */
   global.buddy = FindTask(0);
   global.helpsig  = 1 << global.helpsignum;
   global.key = DEFKEY;

   inputRequestBlock->io_Command = IND_ADDHANDLER;
   inputRequestBlock->io_Data    = (APTR)&handlerStuff;

   DoIO((struct IORequest *)inputRequestBlock);

   for(;;)         /* FOREVER */
      {
      sig = Wait( global.helpsig | (1 << port->mp_SigBit) );

      /* Check contents of message and quit or change the command to be
         executed                                                     */
      if (sig & (1 << port->mp_SigBit))
         {
         while ((msg = (struct OURMSG *)GetMsg(port)) != NULL)
            {
            tmpmsg = *msg;
            ReplyMsg ( (struct Message *) msg);
            if (tmpmsg.quit)
               clean_exit(inputRequestBlock, handlerStuff, global,
                          inputDevPort, nullfh1, nullfh2, port, first_call);
            if (tmpmsg.cmd[0])
               strcpy(cmdstr, msg->cmd);
            }
         }

      /*  Execute the command  */
      if (sig & global.helpsig)
         {
         (void)Execute(cmdstr,nullfh1,nullfh2);
         }
      }
}

/********************************************************************/

/*  Clean up and exit */
void clean_exit(struct IOStdReq *inputRequestBlock, struct Interrupt
     handlerStuff, GLOBAL_DATA global, struct MsgPort *inputDevPort,
     BPTR nullfh1, BPTR nullfh2, struct MsgPort * port, int first_call)
{
   if(_Backstdout)
      Close(_Backstdout);

   if (inputRequestBlock != NULL)
      {
      if (inputRequestBlock->io_Device != NULL)
         {
         inputRequestBlock->io_Command = IND_REMHANDLER;
         inputRequestBlock->io_Data = (APTR)&handlerStuff;
         DoIO((struct IORequest *)inputRequestBlock);

         CloseDevice((struct IORequest *)inputRequestBlock);
         }
      DeleteIOReq(inputRequestBlock);
      }
   if (global.helpsignum != -1)   
       FreeSignal(global.helpsignum);
   if (inputDevPort != NULL)       
       DeletePort(inputDevPort);
   if (first_call && (port != NULL)) 
       DeletePort(port);
   if (nullfh1)  
       Close(nullfh1);
   if (nullfh2)  
       Close(nullfh2);

   exit(0);
}



/************************************************************************/

/* This routine is the input handler function.  It is put into the input
   handler list at a priority above Intuition's so that it can check
   all input for the SAS/C Help key sequence.                           */

/* Note the use of the __interrupt keyword below.  This is used to   */
/* prohibit the generation of stack-checking or stack-extension code */
/* if the module is compiled with the STACKCHECK or STACKEXT options.*/
/* (STACKCHECK is the default).  Because this function is called     */
/* directly from input.device, it will be using input.device's stack */
/* and not the program's stack; hence code that relies on using the  */
/* program's stack must be disabled.                                 */

struct InputEvent * __saveds __interrupt __asm HandlerInterface(
                     register __a0 struct InputEvent *event,
                     register __a1 GLOBAL_DATA *gptr)
{
   register struct InputEvent *cur_event, *last_event;

   /* Step through the event list, checking for SAS/C Help key sequence  */
   for (cur_event = event, last_event = NULL; cur_event != NULL;
                   cur_event = cur_event->ie_NextEvent)
      {
      if ((cur_event->ie_Class == IECLASS_RAWKEY)    &&
          (cur_event->ie_Code  == gptr->key)         &&
          (cur_event->ie_Qualifier & IEQUALIFIER_CONTROL))
         {
         /*  This event was our key sequence, so take it off of the event chain */
         if (last_event == NULL)
            event = cur_event->ie_NextEvent;
         else
            event = last_event->ie_NextEvent = cur_event->ie_NextEvent;

         /* Notify the SAS/C Help task to pop up the help window */
         Signal(gptr->buddy, gptr->helpsig);
         }
      else
         last_event = cur_event;

      }
   /* Return the pointer to the event */
   return(event);
}


/************************************************************************/


struct IOStdReq *CreateIOReq(struct MsgPort *port, int size)
{
   struct IOStdReq *ioReq;

   if ((ioReq = (struct IOStdReq *)
                AllocMem(size, MEMF_CLEAR | MEMF_PUBLIC)) != NULL)
      {
      ioReq->io_Message.mn_Node.ln_Type = NT_MESSAGE;
      ioReq->io_Message.mn_Node.ln_Pri  = 0;
      ioReq->io_Message.mn_Length       = size;
      ioReq->io_Message.mn_ReplyPort    = port;
      }
   return(ioReq);
}


/************************************************************************/



void DeleteIOReq (struct IOStdReq *ioReq)
{
   ioReq->io_Message.mn_Node.ln_Type = 0xff;
   ioReq->io_Device = (struct Device *) -1;
   ioReq->io_Unit = (struct Unit *) -1;

   FreeMem( (char *)ioReq, ioReq->io_Message.mn_Length);
}
