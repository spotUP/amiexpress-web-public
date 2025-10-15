/* Prototypes for functions defined in
Baud.C
 */

extern UBYTE VER[33];

extern ULONG highest_noc;

extern char DATAFILE[25];

void main(int , char ** );

void enddoor(void);

void LastCommand(void);

void end(void);

void WordScan(char * , char * , int );

void LocateCommandIcon(char * , char * );

int percentage(char * , ULONG , ULONG );

void Rate(char * , int );

ULONG PopularBaudrate(char * , struct BAUDRATE * );

void GetDate(char * , struct BAUDRATE * );

void WriteHeader(FILE * );

void WriteFooter(FILE * , ULONG , char * , char * );

void WriteDateLine(FILE * , char * , ULONG , char * , ULONG , BOOL );

void WriteRecordLine(FILE * , char * , ULONG , ULONG , BOOL );

void UpdateDataFile(char * );

