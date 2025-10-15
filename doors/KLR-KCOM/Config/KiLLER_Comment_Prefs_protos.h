/* Prototypes for functions defined in
KiLLER_Comment_Prefs.C
 */

extern struct EasyStruct NoClearList;

extern struct EasyStruct CouldNotOpen;

extern struct EasyStruct NoMessages;

extern struct general * gn_ptr;

extern struct receiver * rc_ptr;

extern struct receiver * rc_ptr2;

extern struct receiver_node * rc_node;

extern struct receiver_node * rc_node2;

extern struct user_node * unode;

extern struct Library * IconBase;

extern struct DiskObject * dobj;

extern char * tooltype;

extern char ** toolarray;

extern char acp_location[128];

extern char bbs_location[128];

extern char kc_location[128];

extern char sysop_name[31];

extern char kc_viewer[128];

extern struct MinList KC_Users0List;

extern struct MinList KC_SELECT_USER1List;

extern BYTE VER[22];

void main(int , char *** );

void HandleIDCMP(void);

void CleanExit(int );

void SetCurrentUser(WORD );

void ShowUserInfo(void);

void Commentistics(void);

