/*
** $VER: Structure.h - Transfer Activities v2.0 (01-Jan-96)
**
** Defines, structures
**
** (c) Copyright 1994/95 Bobo/Mystic.
**     All Rights Reserved.
**
** Application: Transfer Activities v2.0
** Language:    SAS/C v6.50
*/

#define VER "2.0"                // VERSION NUMBER
#define TEXT "REL 2"             // RELEASE VERSION
#define DATE "01-Jan-95"         // RELEASE DATE

/* status codes */
#define ST_BEGDL    0
#define ST_DLING    1
#define ST_DLOK     2
#define ST_BEGUL    3
#define ST_ULING    4
#define ST_ULOK     5
#define ST_HYDRA    6
#define ST_HYDULOK  7
#define ST_HYDDLOK  8
#define ST_HYDULING 9
#define ST_HYDDLING 10

struct SinglePort
{
  struct SignalSemaphore semi;
  struct MinList sl_List;
  APTR s;
  UBYTE SemiName[20];
  int Status;
  char Handle[31];
  char Location[31];
  char Misc1[100];
  char Misc2[100];
};

struct NodeStat
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
  struct NodeStat Stats[32];
  APTR t;
  APTR s;
  unsigned long tasksignal;
};

struct MultiPort
{
  struct SignalSemaphore semi;
  struct MinList sl_List;
  struct NodeInfo MyNode[32];
  UBYTE SemiName[20];
};

struct File
{
  struct Node en_Node;
  char filename[50];             // FILENAME
  long filesize;                 // FILESIZE
  long date;                     // DATE/TIME
  int cps;                       // CPS RATE
};
