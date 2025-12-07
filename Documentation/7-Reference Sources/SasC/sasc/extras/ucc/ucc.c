/*-------------------------------------------------------------------*/
/*                                                                   */
/* Copyright (c) 1992 by Doug Walker.  All Rights Reserved.          */
/*                                                                   */
/*-------------------------------------------------------------------*/
#include <stdlib.h>
#include <string.h>
#include <proto/exec.h>
#include <proto/dos.h>

char version[] = "$VER: UCC 1.0";

#define ALLOC(x) AllocMem(x, 0)
#define FREE(x,s) FreeMem(x, s)
#define MSG(x) if(Output()) {Write(Output(), x, strlen(x));}

struct CMD
{
   char *cmd;
   int used;
   int max;
};
#define CMDINCR 512

static void cmdadd(struct CMD *cmd, char *add, int dquote)
{
   int addlen;
   char *new;
   addlen = strlen(add);
   if(cmd->used + addlen + 4 > cmd->max)
   {
      if(!(new = ALLOC(addlen+CMDINCR)))
      {
         MSG("ERROR: Not enough memory!\n");
         exit(20);
      }
      memcpy(new, cmd->cmd, cmd->used);
      FREE(cmd->cmd, cmd->max);
      cmd->cmd = new;
      cmd->max += addlen+CMDINCR;
   }
   if(dquote) cmd->cmd[cmd->used++] = '"';
   memcpy(cmd->cmd+cmd->used, add, addlen);
   cmd->used += addlen;
   if(dquote) cmd->cmd[cmd->used++] = '"';
   cmd->cmd[cmd->used++] = ' ';
}

static int cmdargadd(struct CMD *cmd, char *add, char *opt, char *next)
{
   int rc = 0;
   if(opt[2]) next = opt+2;
   else if(!next || next[0] == '-') return(0);
   else rc = 1;
   cmdadd(cmd, add, 0);
   cmdadd(cmd, next, 1);
   return(rc);
}

int main(int argc, char *argv[])
{
   struct CMD cmd;
   int verbose = 0;
#if DODEBUG
   int docmd = 1;
#endif

   memset(&cmd, 0, sizeof(cmd));
   cmdadd(&cmd, "SC NOVER LINK", 0);
   argc--, argv++;
   while(argc>0)
   {
      if(argv[0][0] == '-')
      {
         switch(argv[0][1])
         {
            case 'c': cmdadd(&cmd, "NoLink", 0);                 break;
            case 'O': cmdadd(&cmd, "Opt", 0);                    break;
            case 'g': cmdadd(&cmd, "Debug=SF", 0);               break;

            case 'I':
               if(cmdargadd(&cmd, "idir", argv[0], argv[1]))
                  argv++, argc--;
               break;

            case 'D':
               if(cmdargadd(&cmd, "def", argv[0], argv[1]))
                  argv++, argc--;
               break;

            case 'P':
            case 'E': cmdadd(&cmd, "PPonly", 0);                 break;

            case 'l':
               switch(argv[0][2])
               {
                  case 'm':
                     cmdadd(&cmd, "Math=S", 0);
                     break;
               }
               break;

            case 'o':
               if(cmdargadd(&cmd, "To", argv[0], argv[1]))
                  argc--, argv++;
               break;

            case 'v': 
               cmdadd(&cmd, "Verbose Version", 0);         
               verbose = 1;
               break;

            case 'w': cmdadd(&cmd, "Nowarn", 0);                  break;
#if DODEBUG
            case 'n': docmd = 0; break;
#endif
            default:
               MSG("ERROR: Unknown option \"");
               MSG(argv[0])
               MSG("\"\n");
               return(20);
         }
      }
      else
         cmdadd(&cmd, argv[0], 1);
      argc--, argv++;
   }
   if(cmd.cmd)
   {
      cmd.cmd[cmd.used++] = 0;
      if(verbose)
      {
         MSG(cmd.cmd);
         MSG("\n");
      }
#if DODEBUG
      if(docmd)
#endif
      system(cmd.cmd);
   }
   return(0);
}
