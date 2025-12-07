/* Prototypes for functions defined in
mkmk.c
 */

extern BPTR out;

extern unsigned char * makefile;

extern unsigned char * target;

extern int force;

void panic(unsigned char * );

void AddPattern(FileList * , unsigned char * );

struct FileDesc * FindFile(FileList * , unsigned char * );

struct FileDesc * AddFile(FileList * , unsigned char * );

struct FileDesc * NextFile(FileList * );

int main(void);

int __stdargs myfprintf(BPTR , unsigned char * , ...);

int __stdargs mysprintf(unsigned char * , unsigned char * , ...);

