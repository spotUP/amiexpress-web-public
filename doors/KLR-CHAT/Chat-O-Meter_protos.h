/* Prototypes for functions defined in
Chat-O-Meter.C
 */

extern UBYTE VER[37];

extern struct COMDATA * com_ptr;

extern struct CHATTOP * chat_ptr;

extern struct TODAY_TOP * clock_ptr;

void main(int , char ** );

void enddoor(int );

void LastCommand(void);

void end(void);

void LocateCommandIcon(char * , char * );

int RecordTime(ULONG );

void Record(ULONG , int , char * , BOOL , BOOL , BOOL , BOOL );

void SecsToHours(ULONG , int * , int * , int * );

void CreateBulletin(FILE * , char * , BOOL , BOOL , BOOL );

void MultipleOrNot(char * , int , int , int );

void GetDate(ULONG , char * , char * , char * );

