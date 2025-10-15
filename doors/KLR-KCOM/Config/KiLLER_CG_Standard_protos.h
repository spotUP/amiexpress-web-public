/* Prototypes for functions defined in
KiLLER_CG_Standard.C
 */

extern struct EasyStruct FileAlreadyExists;

void OpenLibs(void);

ULONG InitIcon(char * );

char * FromIcon(char * );

void CloseIcon(void);

void ToolTypeNot(char * , char * );

void CreateListViewAndNodes(void);

void UpdateStrGad(struct Window * , struct Gadget * , UBYTE * );

ULONG GetFileSize(char * );

int SelectUser(void);

void FreeNodes(struct List * );

BOOL SaveAndQuit(void);

char * FileRequested(char * , char * );

