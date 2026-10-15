extern VOID Register(int node);
extern VOID ShutDown(VOID);
extern int Editfile(char Name[],int len);
extern void sendmessage(char mstring[],int nl);
extern void mciputstr(char mstring[],int nl);
extern void MciSendStr(char mstring[],int nl);
extern int Download(char *s);
extern int Upload(char *s);
extern void ConOnly(char mstring[],int nl);
extern void SerOnly(char mstring[],int nl);
extern void sendMessage(char mstring[],int nl);
extern int GetInfo(int cmd);
extern void PutInfo(int data,int cmd);
extern void sendchar(char mstring[], int nl);
extern void hotkey(char mstring[],char *ostring);
extern int FetchKey(void);
extern int sigkey(void);
extern char Fhotkey(void);
extern int getkey(void);
extern void Chain(char *str,int node,int opt);
extern void prompt(char mstring[],char *ostring,int len);
extern void lineinput(char mstring[],char *ostring,int len);
extern void showfile(char mstring[]);
extern void showgfile(char mstring[]);
extern void getuserstring(char *ostring,int nl);
extern void putuserstring(char *ostring,int nl);
extern int getsignal(void);
extern void FlagFile(char *string);
extern void CloseOut(void);
extern BOOL CheckToDisplay(char *s);
extern int TLock(char *str);
extern APTR GetSemaphore(void);
extern int AcsStat(int bits,int opt);
extern void end(void);
extern void LastCommand(void);
extern APTR GetSemaphore(void);
extern STRPTR GetTheDate(long number);
extern STRPTR GetTheTime(long number);
extern void getspecdata(char *ostring,char *dest,int nl);
extern struct User *Load_Account(int UserNum,APTR U,APTR UK);
void Save_Account(int UserNum,APTR U,APTR UK);
void Save_ConfDB(int UserNum,int conf,APTR dat);
void Load_ConfDB(int UserNum,int conf,APTR dat);
extern int Get_ConfName(APTR n,APTR l,int num);
extern int Search_Account(int UserNum,APTR uk);
extern void New_Account(APTR u,APTR uk);
extern int LastAccountNum(void);
extern void DateToString(ULONG number,char *s);
extern void TimeToString(ULONG number,char *s);
extern int BatchDownload(APTR s);
extern int IsAccess(int acs);
extern void AcpCommand(char mstring[],int command,int node);
extern void GetFiller1(APTR Filler,int Command);
extern void PutFiller1(APTR Filler,int Command);

#define ACP_CONTROLCOMMAND -1
#define ACP_CUSTOMCOMMAND  19

#define ACP_SysopLogin	 1
#define ACP_InstantLogin	 2
#define ACP_AEShell	      3
#define ACP_ToggleChat	 4
#define ACP_ExitNode	 5
#define ACP_LocalLogin	 6
#define ACP_ReserveNode	 7
#define ACP_Accounts	 8
#define ACP_InitModem	 9
#define ACP_NodeOffHook	 10
#define ACP_QuietNode     11
#define ACP_NodeConfig	 12
#define ACP_NodeChat	 13
#define ACP_SaveWin	 14
#define ACP_NRAMS	 15