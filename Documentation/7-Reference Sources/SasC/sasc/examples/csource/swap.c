void swap(int *x, int *y)
{
   int tmp;
   
   *x = *y;
   tmp = *x;
   *y = tmp;
}