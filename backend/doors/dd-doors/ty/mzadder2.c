/* muggi zip-adder v1.1 *FINAL* (c) flower/prjdd'98				

   feel free to mod source, but dont forget to mail me the new one.	*/

#include <time.h>
#include <ddlib.h>
#include <dd.h>
#include <sys/stat.h>
#include "newmacro.h"	/* this is actually the goodstuff in the update,
			   and not the this file itself :)		*/

/* == be sure to check these defines matches your system ============== */

#define zipparm		"/usr/bin/zip -qqj %s %s"

/* #define temppath "/home/bbs/temp/node" (obsolete in v1.1)		*/
/* #define unzipparm	"/usr/bin/unzip -qqLC %s %s" (also obsolete)	*/

/* == end of defines ================================================== */

struct nfo {
	char node[3];
	char un[30];
	char ul[30];
	char fn[35];
	char fs[10];
	char date[20];
	char time[20];
	char stim[20];
};

struct strlist {
	char line[254];
	struct strlist *next;
};

struct cfg {
	int addfile;
	int adddiz;
	char addname[100];
	struct strlist *sh;
	struct strlist *saf;
	struct strlist *sad;
	struct strlist *dl;
	struct strlist *af;
};

struct strlist *pushl(struct strlist *l,char *s) {
	struct strlist *t=(struct strlist *)malloc(sizeof(struct strlist));
	
	strcpy(t->line,s);
	t->next=l;
	return t;
}

int generalc=0;

struct strlist *closelist(struct strlist *l) {
	struct strlist *t;

	while (l!=NULL) {
		t=l;
		l=l->next;
		free(t);
	}
	return l;
}

int countlist(struct strlist *cl) {
	struct strlist *tc=cl;
	int i=0;

	while (tc!=NULL) {
		++i;
		tc=tc->next;
	}
	return i;
}

void initrand() {
        time_t t;
        struct tm *tid;

        t=time(0);
        tid=localtime(&t);
	srandom((tid->tm_min)*(tid->tm_sec));
}

int frandom(int modseed) {
	return ((random()>>3)%modseed);
}

char *getrl(struct strlist *l) {
	char *r;
	int l_len,i=0,rnum;
	struct strlist *tptr;

	tptr=l;
	l_len=countlist(l);
	rnum=frandom(l_len);
	while ((i<rnum)&&(tptr!=NULL)) {
		tptr=tptr->next;
		i++;
	}
	r=(char*)malloc(strlen(tptr->line)+1);
	strcpy(r,tptr->line);
	return r;
}

char *fgetsnolfs(char *buf, int n, FILE *fh) {
        char *in;
        char *tmp;

        in=fgets(buf,n,fh);
        if (!in) return 0;
        tmp=buf;
        while (*tmp) {
                if ((*tmp==10)||(*tmp==13)) {
                        *tmp=0;
                        break;
                }
                tmp++;
        }
        return in;
}

void forkcmd(char *cmd) {
	char *tmpstr=(char*)malloc(1000);
	char *args[12];
	int cp,i=1;

	strcpy(tmpstr,cmd);
        args[0]=tmpstr;

        while (*tmpstr)
        {
                if (*tmpstr==' ') {
                        *tmpstr=0;
                        tmpstr++;
                        args[i]=tmpstr;
                        i++;
                } else tmpstr++;
        }
        args[i]=0;

        cp=fork();
        if (cp==-1) {
                printf("*unf* her findes ingen gaffel :)\n");
                exit(1);
        } else if (cp==0) {
                execvp(args[0],&args[0]);
                kill(getpid(),SIGKILL); /* hvis nu execvp fejler */
        } else {
                waitpid(-1,0,0);
        }
}

char *parsefn(char *s) {
	char *r,*t=(char*)malloc(strlen(s)+1);

	strcpy(t,s);
	r=t;
	while (*t) {
		switch(*t) {
			case '#' :	*t=(char)(frandom(10)+48);
					break;
			case '@' :	*t=(char)(frandom(25)+97);
					break;
			/* added in v1.1 */
			case '$' :	if ((frandom(2)))
						*t=(char)(frandom(25)+97);
					else
						*t=(char)(frandom(10)+48);
		};
		t++;
	}
	return r;
}

long int getfs(char *node,char *fname) {
  char tmp[255];
  struct stat st;

/*  sprintf(tmp,"%s%s/%s",temppath,node,fname); */
  stat(fname,(struct stat*)&st);
  return st.st_size;
};

char *makedate(int format) {
        char *tmp=(char*)malloc(20);
        time_t t;
        struct tm *tid;

        t=time(0);
        tid=localtime(&t);
	switch(format) {
		case 0: sprintf(tmp,"%2.2d-%2.2d-%4.4d",tid->tm_mday,tid->tm_mon,tid->tm_year+1900);
			break;
		case 1: sprintf(tmp,"%2.2d:%2.2d:%2.2d",tid->tm_hour,tid->tm_min,tid->tm_sec);
			break;
		case 2: sprintf(tmp,"%2.2d:%2.2d",tid->tm_hour,tid->tm_min);
			break;
	}
        return tmp;
}

char *pstr(char *instr,struct nfo *info) {
	char *tmp,buf[__hugefuckerstr];

	strcpy(buf,instr);
	/* v1.1 final change, call new macro functions instead */
	parse(buf,"@UN",info->un);
	parse(buf,"@UL",info->ul);
	parse(buf,"@FN",info->fn);
	parse(buf,"@FS",info->fs);
	parse(buf,"@NODE",info->node);
	parse(buf,"@DATE",info->date);
	parse(buf,"@TIME",info->time);
	parse(buf,"@STIM",info->stim);

	tmp=(char*)malloc(strlen(buf)+1);
	strcpy(tmp,buf);

	return tmp;
}

struct nfo *getmacros(struct dif *d,char *node) {
	char *tmp=(char*)malloc(100);
	struct nfo *n=(struct nfo*)malloc(sizeof(struct nfo));

	strcpy(n->date,makedate(0));
	strcpy(n->time,makedate(1));
	strcpy(n->stim,makedate(2));
	strcpy(n->node,node);
	dd_getstrval(d,n->un,USER_HANDLE);
	dd_getstrval(d,n->ul,USER_ORGANIZATION);
	dd_getstrval(d,tmp,DOOR_PARAMS);
	strcpy(n->fn,tmp);
	sprintf(n->fs,"%d",getfs(node,tmp));

	free(tmp);
	return n;
}

void showreverse(struct strlist *sl,struct dif *d) {

	if (sl!=NULL) {	
		if (sl->next!=NULL)
			showreverse(sl->next,d);
		dd_sendstring(d,sl->line);
	}
};

void readconfig(struct cfg *c,struct dif *d,char *cpath,struct nfo *n) {
	FILE *cfgfile;
	char buf[254];

	c->saf=c->sad=c->sh=c->af=c->dl=NULL;
	if ((cfgfile=fopen(cpath,"r"))) {
		fgets(buf,253,cfgfile);
		c->addfile=strncasecmp(buf,"no",2);
		fgets(buf,253,cfgfile);
		c->adddiz=strncasecmp(buf,"no",2);
		fgetsnolfs(c->addname,100,cfgfile);
		fgets(buf,253,cfgfile); /* read the dot */
		fgets(buf,253,cfgfile);
		while (strncmp(buf,"~",1)&&(!feof(cfgfile))) {
			c->sh=pushl(c->sh,pstr(buf,n));
			fgets(buf,253,cfgfile);
		}
		fgets(buf,253,cfgfile);
		while (strncmp(buf,"~",1)&&(!feof(cfgfile))) {
			c->saf=pushl(c->saf,pstr(buf,n));
			fgets(buf,253,cfgfile);
		}
		fgets(buf,253,cfgfile);
		while (strncmp(buf,"~",1)&&(!feof(cfgfile))) {
			c->sad=pushl(c->sad,pstr(buf,n));
			fgets(buf,253,cfgfile);
		}
		fgetsnolfs(buf,253,cfgfile);
		while (strncmp(buf,"~",1)&&(!feof(cfgfile))) {
			c->af=pushl(c->af,buf);			
			fgetsnolfs(buf,253,cfgfile);
		}
		fgets(buf,253,cfgfile);
		while (strncmp(buf,"~",1)&&(!feof(cfgfile))) {
			c->dl=pushl(c->dl,pstr(buf,n));			
			fgets(buf,253,cfgfile);
		}
		if (feof(cfgfile)) {
			printf("m00h, error in .cfg, please tell sysop!\n");
			exit(3);
		}
		fclose(cfgfile);
	} else {
		printf("gawd, ingen .cfg fundet\n");
		dd_close(d);
		exit(2);
	}
}

void putreverse(struct strlist *l,FILE *f) {
	if (l!=NULL) {
		if (l->next!=NULL)
			putreverse(l->next,f);
		fputs(l->line,f);
	}
}

void parseconfig(struct cfg *c,struct dif *d,struct nfo *n) {
	FILE *in,*out;
	char buf[1000];
	int r;
	struct strlist *diz=NULL;
	char outfn[100];

	if ((c->addfile)) {
		dd_changestatus(d,"MuggiZipAdder: Arc Add");
		showreverse(c->saf,d);

		strcpy(outfn,parsefn(c->addname));
		generalc=100;
		if ((in=fopen(getrl(c->af),"r"))) {
			if ((out=fopen(outfn,"w+"))) {
				while (fgets(buf,1000,in)!=0)
					fputs(pstr(buf,n),out);
				fclose(out);
			}
			fclose(in);
			sprintf(buf,zipparm,n->fn,outfn);
			forkcmd(buf);
			remove(outfn);
		}
	}
	if ((c->adddiz)) {
		generalc=200;
		dd_changestatus(d,"MuggiZipAdder: Diz Add");
		showreverse(c->sad,d);
/*		sprintf(buf,unzipparm,n->fn,"file_id.diz");
		forkcmd(buf); */
		if ((in=fopen("./.packtmp/file_id.diz","r"))) {
			while (fgets(buf,253,in)!=0)
				diz=pushl(diz,buf);
			diz=pushl(diz,getrl(c->dl));
			fclose(in);
		}
		if ((out=fopen("file_id.diz","w+"))) {
			putreverse(diz,out);
			fclose(out);
		}
		closelist(diz);
		sprintf(buf,zipparm,n->fn,"file_id.diz");
		forkcmd(buf);
		remove("file_id.diz");
	}
}

int wildcmp (char *nam, char *pat) {
        register char *p;

        for (;;) {
                if (tolower(*nam) == tolower(*pat)) {
                        if(*nam++ == '\0')  return(1);
                        pat++;
                } else if (*pat == '?' && *nam != 0) {
                        nam++;
                        pat++;
                } else  break;
        }
        if (*pat != '*') return(0);
        while (*pat == '*') {
                if (*++pat == '\0')  return(1);
        }
        for (p=nam+strlen(nam)-1;p>=nam;p--) {
                        if (tolower(*p) == tolower(*pat))
                                if (wildcmp(p,pat) == 1) return(1);
        }
        return(0);
}


void main(int argc,char *argv[]) {
	struct dif *d;
	struct cfg c;
	struct nfo *n;

	if (argc!=3) {
		printf("what? you need .help\n");
		printf("bmzadder <node> <cfgfile> <- would be a good idea!\n");
		exit(100);
	}
	d=dd_initdoor(argv[1]);
	initrand();
	dd_changestatus(d,"MuggiZipAdder: Loading");
	n=getmacros(d,argv[1]);

	if (wildcmp(n->fn,"*.zip")||wildcmp(n->fn,"*.ZIP")) {
		readconfig(&c,d,argv[2],n);
		showreverse(c.sh,d);
		parseconfig(&c,d,n);
		closelist(c.sh); closelist(c.saf); closelist(c.sad);
		closelist(c.dl); closelist(c.af);
	}
	free(n);
	dd_close(d);
}
