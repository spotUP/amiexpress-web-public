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

void sendmessage(char * , int );

void sendMessage(char * , int );

void sendchar(char * , int );

void hotkey(char * , char * );

void showfile(char * );

void getuserstring(char * , int );

void putuserstring(char * , int );

void CloseOut(void);

