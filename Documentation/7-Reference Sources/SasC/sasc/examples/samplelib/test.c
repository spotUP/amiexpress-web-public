int b = 0;

__asm __saveds LIBtest1(void)
{
        return(b);
}

__asm __saveds LIBtest2(register __d1 int a)
{
        b = a;
        return(b);
}
