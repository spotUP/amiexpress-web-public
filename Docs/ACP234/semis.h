#include <exec/types.h>

struct SemiNodestat
{
  char Status;
  char info;
};
struct NodeInfo
{
  char Handle[31];
  ULONG StartTime;
  int ChatColor;
  int Channel;
  int Private;
  struct SemiNodestat Stats[10];
  APTR t;
  APTR s;
  unsigned long tasksignal;
};

struct MultiPort
{
  struct SignalSemaphore semi;
  struct MinList sl_List;
  struct NodeInfo MyNode[10];
  UBYTE SemiName[20];
};

struct SinglePort
{
  struct SignalSemaphore semi;
  struct MinList sl_List;
  APTR  *MultiCom;
  UBYTE SemiName[20];
  int Status;
  char Handle[31];
  char Location[31];
  char Misc1[100];
  char Misc2[100];
};