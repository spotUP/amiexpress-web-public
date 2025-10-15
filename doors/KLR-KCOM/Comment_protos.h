/* Prototypes for functions defined in
Comment.c
 */

extern struct general * gn_ptr;

extern struct receiver_node * rc_node;

extern struct Library * IconBase;

extern struct DiskObject * dobj;

extern char * tooltype;

extern char ** toolarray;

extern char acp_location[128];

extern char bbs_location[128];

extern char kc_location[128];

extern char sysop_name[31];

extern int MAX_ON_SCREEN;

extern struct MinList KC_Users0List;

void main(int , char ** );

void enddoor(int );

void Initialise(void);

void FreeNodes(struct List * );

BOOL SelectReceiver(void);

BOOL CompareNames(char * , BOOL );

BOOL CompareInfo(char * );

BOOL ToNumber(char * );

void Commentistics(void);

