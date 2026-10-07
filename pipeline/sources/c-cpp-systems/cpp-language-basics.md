Source: cppreference.com, C++ language reference (RAII, references, const,
object lifetime, smart pointers).
https://en.cppreference.com/w/cpp/language/lifetime
https://en.cppreference.com/w/cpp/language/reference
https://en.cppreference.com/w/cpp/memory/unique_ptr

RAII

Resource Acquisition Is Initialization binds the lifetime of a resource to
the lifetime of an object. A class acquires the resource in its constructor
and releases it in its destructor. Local objects are destroyed automatically
when control leaves their scope, both on normal return and when an exception
propagates (stack unwinding), so the resource is always released. This is how
std::string, std::vector, std::unique_ptr, and std::lock_guard manage memory,
buffers, and locks without manual cleanup calls.

References

A reference is an alias for an existing object. It must be bound when
created, cannot be rebound to another object, and cannot be null. For `int x
= 5;`, `int &r = x;` makes r another name for x: assigning to r assigns to x.
A function taking `const std::string &s` accepts an argument without copying
it and promises not to modify it.

Const correctness

`const` on an object means it cannot be modified through that name. A member
function declared `const` promises not to modify the object's observable
state, so it can be called on a const object. References and pointers to
const are how large objects are passed without copying while keeping the
caller's data read-only.

Object lifetime

The lifetime of an object begins when its initialization (including the
constructor body) completes and ends when its destruction begins. Using an
object outside its lifetime is undefined behavior. The three common ways to
get this wrong are: using an object after it has been destroyed (usually a
dangling pointer or reference), using an object before its initialization has
completed, and overlapping or misaligned storage.

Smart pointers

`std::unique_ptr<T>` owns a single object and releases it when the
unique_ptr goes out of scope; it cannot be copied, only moved, so ownership
is unambiguous. `std::shared_ptr<T>` is a reference-counted owner released
when the last shared_ptr to the object is destroyed; cycles of shared_ptr
leak unless one edge is a std::weak_ptr. Prefer unique_ptr unless shared
ownership is genuinely required.

new and delete

`new` allocates and constructs an object; `delete` destroys and deallocates
one object, and `delete[]` destroys and deallocates an array created with
`new[]`. Mixing `delete` with `new[]` (or freeing stack memory with delete) is
undefined behavior. Modern C++ code should rarely use new and delete
directly, because a smart pointer or a standard container does the pairing
for it.
