long  DoSumCRC(char *Str,long Size);
void	DeCode (char *str,char *code);
void	Code (char *str,char *code);
void	Reset(void);
char	*SysopName(char *REG);
void	Time(char *TimeString);

extern long CODED,DECODED;
extern char REG[];
extern char PAS[];
