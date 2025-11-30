/* Copyright (c) 1993 SAS Institute, Inc, Cary, NC USA */
/* All Rights Reserved */

/*  The following example has no practical use.  It is intended 
    only to use to explore the data manipulation functions of 
    CodeProbe.
*/    

#include <stdio.h>

void main (void)
{
   struct X {
      int a;
      int b[3];
      int c;
      } x;
   
   struct Y {
      int a;
      int b;
      } y;

   typedef struct X *XPTR;
         
   struct W {
      int x;
      struct Y y[2];
      int z;
      } w;
      
   struct Z {
      char c;
      struct Y d;
      int e;
      } z;
      
   struct X3D {
      int a;
      int b[2][3][2];
      int c;
      } x3d;
      
   int i,j;
   int array[10];              
   int *intptr;
   
   long lng;
   short shrt;
   
   float fl;
   double db;

   char *string = "Hello, World";

   /*  Initialize data structures.   */
   i = 33;
   j = 44;
   intptr = &i;
   
   lng = 6456;
   shrt = 89;
   
   fl = 3.14;
   db = 33.5;
   
   array[0] = 5;
   array[1] = 15;
   array[2] = 25;
   array[3] = 35;
   array[4] = 45;
   array[5] = 55;
   array[6] = 65;
   array[7] = 75;
   array[8] = 85;
   array[9] = 95;
   
   x.a= 5;
   x.b[0]=1;
   x.b[1]=2;
   x.b[2]=3;
   x.c=11;
   
   y.a=5;
   y.b=6;
      
   w.x=4;
   w.y[0] = y;
   w.y[1] = y;
   w.z = 9;
   
   z.c = 'r';
   z.d = y;
   z.e=3;

   intptr = &j;
      
   x3d.a=2;
   x3d.b[0][0][0] = 41 ;
   x3d.b[0][0][1] = 42 ;
   x3d.b[0][1][0] = 43 ;
   x3d.b[0][1][1] = 44 ;
   x3d.b[0][2][0] = 45 ;
   x3d.b[0][2][1] = 46 ;
   x3d.b[1][0][0] = 47 ;
   x3d.b[1][0][1] = 48 ;
   x3d.b[1][1][0] = 49 ;
   x3d.b[1][1][1] = 50;
   x3d.b[1][2][0] = 51;
   x3d.b[1][2][1] = 52;
   x3d.c=90;
   
   printf("%s!\n",string);
}
   
   
   
