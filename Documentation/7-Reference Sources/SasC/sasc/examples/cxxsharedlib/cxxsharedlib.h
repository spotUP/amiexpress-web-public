class FOO
{
   public:
   __asm FOO(register __d1 int init);
   __asm ~FOO();
   void __asm foofunc(register __d0 int intparm);
   void __asm foofunc(register __a1 char *ptrparm);
};

#pragma libcall FOOBase foofunc__3FOOFi 1e 0802
#pragma libcall FOOBase foofunc__3FOOFPc 24 9802
#pragma libcall FOOBase __ctor__3FOOFi 2a 10803
#pragma libcall FOOBase __dtor__3FOOFv 30 0802
