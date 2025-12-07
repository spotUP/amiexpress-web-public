#define ASIZE 10

void init(int *, int);
int sort(int *, int);
void printArr(int *, int);

int array[ASIZE];

int main(void)
{
   init(array,ASIZE);  /* initialize array */
   
      /* Keep swapping elements until sorted */
   while (sort(array,ASIZE) != 0)
      ;
      
   printArr(array,ASIZE);
   return 0;
}
