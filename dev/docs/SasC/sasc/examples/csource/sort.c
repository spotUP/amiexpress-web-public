#include <stdio.h>

void swap(int *, int *);

void init(int *arrayPtr, int size)
{
   int i;
   int *ptr;
   
   ptr = arrayPtr;
   for (i=1; i < size - 1; i++)
      *ptr++ = i;
}

/* Reverse sort the elements of the array */

int sort(int *arrayPtr, int size)
{
   int i, swapped;
   int *ptr;
   
   ptr = arrayPtr;
   swapped = 0;
   
   for (i=0; i < size - 1; i++)
      if (ptr[i] < ptr[i+1] )
      {
         swap(&ptr[i], &ptr[i+1]);
         swapped = 1;   /* indicate a swap took place */
      }
      
   return swapped;
}

/* Print the array */

void printArr(int *arrayPtr, int size)
{
   int i;
   int *ptr;
   
   ptr = arrayPtr;
   for (i=1; i < size - 1; i++)
      printf("array[%d] is %d\n",i,*ptr++);
}
