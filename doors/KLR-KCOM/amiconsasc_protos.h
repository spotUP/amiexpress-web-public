/* Prototypes for functions defined in
amiconsasc.c
 */

extern ULONG UnixTimeOffset;

extern struct MsgPort * port;

extern struct MsgPort * replymp;

extern struct JHMessage * Jhmsg;

extern struct JHMessage * msg;

extern char PortName[20];

void Register(int );

void ShutDown(void);

void ClosePort(void);

int Editfile(char * , int );

void sendmessage(char * , int );

void mciputstr(char * , int );

int Download(char * );

int BatchDownload(APTR );

int NetUpload(APTR );

int Upload(char * );

int NetDownload(char * );

void ConOnly(char * , int );

void SerOnly(char * , int );

void sendMessage(char * , int );

void sendmsgpointer(char * , int );

void MciSendStr(char * , int );

int GetInfo(int );

int IsInfo(int , int );

void PutInfo(int , int );

void sendchar(char * , int );

void hotkey(char * , char * );

int QuicKey(void);

int FetchKey(void);

int sigkey(void);

char Fhotkey(void);

int getkey(void);

void Chain(char * , int , int );

void prompt(char * , char * , int );

void AcpCommand(char * , int , int );

void lineinput(char * , char * , int );

void showfile(char * );

void showgfile(char * );

void showfilensf(char * );

void showgfilensf(char * );

void getuserstring(char * , int );

void putuserstring(char * , int );

void getspecdata(char * , char * , int );

int getsignal(void);

void FlagFile(char * );

void CloseOut(void);

BOOL CheckToDisplay(char * );

int TLock(char * );

APTR GetSemaphore(void);

int AcsStat(int , int );

extern struct DateTime dx;

STRPTR GetTheDate(long );

STRPTR GetTheDay(long );

STRPTR GetTheTime(long );

void DateToString(ULONG , char * );

void TimeToString(ULONG , char * );

void getsystime(ULONG , char * , char * );

int Load_Account(int , APTR , APTR );

LONG Choose_A_Name(APTR , APTR , WORD );

int Search_Account(int , APTR );

void Save_Account(int , APTR , APTR );

void Save_ConfDB(int , int , APTR );

void New_Account(APTR , APTR );

void Load_ConfDB(int , int , APTR );

int Get_ConfName(APTR , APTR , int );

int IsAccess(int );

void GetFiller1(APTR , int );

void PutFiller1(APTR , int );

ULONG GetAmiTime(ULONG );

