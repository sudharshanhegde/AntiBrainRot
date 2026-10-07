Source: The C programming language (Kernighan and Ritchie) and the C17
standard; Linux man-pages malloc(3).
https://man7.org/linux/man-pages/man3/malloc.3.html

Pointers

A pointer is a variable whose value is a memory address. For `int x = 5;`,
`&x` is the address of x and has type `int *`. Given `int *p = &x;`, `*p`
dereferences p and yields the value stored at that address, namely 5. Writing
`*p = 7;` stores 7 into x. A pointer that holds no valid address and is not
used is set to NULL; dereferencing NULL is undefined behavior.

Pointer arithmetic is scaled by the size of the pointed-to type. If `p`
points to `int` and `sizeof(int)` is 4, then `p + 1` advances the address by
4 bytes, not 1.

Arrays and decay

An array is a contiguous block of elements of one type. In most expressions
an array name decays to a pointer to its first element, so `arr` and `&arr[0]`
denote the same address, and `arr[i]` is defined as `*(arr + i)`. This is why
array access is constant time: the element address is computed as base plus i
times the element size. There is no bounds checking: reading or writing past
the end of an array is undefined behavior.

Structs and layout

A struct lays its members out in declaration order, but the compiler inserts
padding between members so each member sits at an address aligned to its
alignment requirement. As a result, `sizeof(struct)` can be larger than the
sum of its members' sizes. On a typical 64-bit system:

    struct example {
        char  a;   /* offset 0, size 1 */
        /* 3 bytes of padding */
        int   b;   /* offset 4, size 4 */
        char  c;   /* offset 8, size 1 */
        /* 7 bytes of tail padding */
    };             /* sizeof == 16 */

Reordering members from largest to smallest often shrinks the struct.

Dynamic memory

`void *malloc(size_t size);` allocates at least size bytes and returns a
pointer to the block, or NULL if the request cannot be satisfied. The memory
is uninitialized. `void *calloc(size_t nmemb, size_t size);` allocates a
zero-initialized block. `void *realloc(void *ptr, size_t size);` resizes an
existing block, possibly moving it and returning a new pointer. `void
free(void *ptr);` releases a block obtained from these calls.

Rules that matter:

- Every successful malloc/calloc/realloc must be matched by exactly one free.
- Freeing a pointer twice, or freeing a pointer not returned by these calls,
  is undefined behavior.
- Continuing to use a pointer after freeing it (use-after-free) is undefined
  behavior.
- malloc does not fail for size 0 in a portable way; check the return value
  before using it.

Stack and heap

Local variables and function call frames live on the stack, which grows and
shrinks automatically as functions are called and return. Memory from
malloc lives on the heap, whose lifetime the programmer controls explicitly.
Returning a pointer to a local variable leaves it pointing at reclaimed stack
memory, which is undefined behavior; returning a pointer to heap memory
transfers responsibility for freeing it to the caller.

Undefined behavior

The C standard specifies no result for certain operations; the compiler may
assume they never occur. Examples include signed integer overflow, reading an
uninitialized variable, out-of-bounds array access, dereferencing a null or
dangling pointer, and modifying a variable through an incompatible pointer
type. A program relying on a particular result for undefined behavior is a
bug even if it appears to work today.
