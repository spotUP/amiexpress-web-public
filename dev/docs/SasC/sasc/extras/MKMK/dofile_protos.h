/* Prototypes for functions defined in
dofile.c
 */

extern unsigned char buf[1024];

void AddDep(struct FileDesc * , struct FileDesc * );

unsigned char * scopy(unsigned char * );

void DoFile(struct FileList * , struct FileDesc * );

