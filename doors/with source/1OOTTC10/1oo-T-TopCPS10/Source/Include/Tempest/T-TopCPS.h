//----------------------------------------------------------------
//------------ Includes for 1oo% T-TopCPS  -----------------------
//----------------------------------------------------------------

#define user_cps 100 // actual user cps

#define nul_cps  101 // top upload cps (node)
#define nul_user 102 // top ul-cps username (node)
#define nul_date 103 // top ul-cps date/time (node)
#define nul_baud 104 // top ul-cps baud-rate (node)
#define nul_file 105 // top ul-cps filename (node)
#define nul_size 106 // top ul-cps filesize (node)

#define ndl_cps  107 // top download cps (node)
#define ndl_user 108 // top dl-cps username (node)
#define ndl_date 109 // top dl-cps date/time (node)
#define ndl_baud 110 // top dl-cps baud-rate (node)
#define ndl_file 111 // top dl-cps filename (node)
#define ndl_size 112 // top dl-cps filesize (node)

#define gul_cps  113 // top upload cps (global)
#define gul_user 114 // top ul-cps username (global)
#define gul_date 115 // top ul-cps date/time (global)
#define gul_baud 116 // top ul-cps baud-rate (global)
#define gul_file 117 // top ul-cps filename (global)
#define gul_size 118 // top ul-cps filesize (global)

#define gdl_cps  119 // top download cps (global)
#define gdl_user 120 // top dl-cps username (global)
#define gdl_date 121 // top dl-cps date/time (global)
#define gdl_baud 122 // top dl-cps baud-rate (global)
#define gdl_file 123 // top dl-cps filename (global)
#define gdl_size 124 // top dl-cps filesize (global)

struct Top_CPS
   {
   long top_ul;
   char ul_user[31];
   long ul_baud;
   char ul_filename[31];
   long ul_date;
   long ul_size;

   long top_dl;
   char dl_user[31];
   long dl_baud;
   char dl_filename[31];
   long dl_date;
   long dl_size;
   };

