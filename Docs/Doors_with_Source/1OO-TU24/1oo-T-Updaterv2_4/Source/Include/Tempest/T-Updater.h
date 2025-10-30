//----------------------------------------------------------------
//------------ Includes for 1oo% T-Updater -----------------------
//----------------------------------------------------------------

#define MaxPathlength 255

struct Updater_Prefs
   {
   int  TOPAZSIZE;
   int  IBMSIZE;
   BOOL TOPAZAUTO;
   BOOL IBMAUTO;
   char UPDATEDIR[255]; // scan-dir
   char TEMPDIR[255];   // tempdir to create archives
   int  SYSOP;          // min level dor Sysop-Commands
   BOOL P_LHA;          // enable lha
   BOOL P_LZX;          // enable lzx
   BOOL P_ZIP;          // enable zip
   int  COMMENT;        // commenttype: 0=filecomment, 1=fileid.library
   char FILENAME[35];   // filename to create
   };

