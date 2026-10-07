Source: Linux man-pages, syscall(2), fork(2), execve(2), wait(2), exit(2),
getpid(2).
https://man7.org/linux/man-pages/man2/syscall.2.html
https://man7.org/linux/man-pages/man2/fork.2.html
https://man7.org/linux/man-pages/man2/execve.2.html
https://man7.org/linux/man-pages/man2/wait.2.html

What a system call is

A system call is the programmatic interface between userspace and the kernel.
Userspace code cannot touch hardware or another process's memory directly, so
it asks the kernel to act on its behalf. On x86-64 Linux a system call is
made by placing the call number and arguments in registers and executing a
trap instruction (syscall), which switches the CPU into kernel mode. The
kernel validates the arguments, performs the operation, and returns.

The libc wrapper functions (fork, read, open) look like ordinary C functions
but underneath perform this trap. On failure a wrapper returns -1 and sets
the global errno to an error code; on success it returns the natural result.

fork

`pid_t fork(void);` creates a new process. The unusual property is that it
returns twice: once in the parent and once in the child.

- In the parent, fork returns the child's process ID (a positive number).
- In the child, fork returns 0.
- On failure, fork returns -1 in the parent and no child is created.

The child is a copy of the parent: same memory image, same open file
descriptors, same program counter. Modern kernels use copy-on-write, so the
two share physical pages until one of them writes, at which point that page
is copied. Because the return value differs, the standard pattern is
`pid_t pid = fork(); if (pid == 0) { /* child */ } else if (pid > 0) {
/* parent */ } else { /* error */ }`.

execve

`int execve(const char *pathname, char *const argv[], char *const envp[]);`
replaces the calling process's image with a new program. On success it does
not return: the process keeps its PID and open file descriptors but runs the
new code from its entry point. On failure it returns -1 and the old image
continues. This is why fork and exec are used together: fork makes a copy,
and the child calls execve to turn into the new program. `execv`, `execl`,
and `execvp` are libc variants that differ in how arguments and the search
path are supplied; `execvp` searches PATH.

wait

`pid_t wait(int *wstatus);` and `pid_t waitpid(pid_t pid, int *wstatus, int
options);` let a parent collect the exit status of a child. A child that has
terminated but whose status has not been collected is a zombie: it holds a
slot in the process table until the parent waits. If the parent terminates
first, the child is reparented to init (PID 1), which reaps it. WIFEXITED,
WEXITSTATUS, WIFSIGNALED, and WTERMSIG are the macros that decode the status
word.

exit and _exit

`exit(3)` runs atexit handlers, flushes stdio buffers, and then calls
`_exit(2)`. `_exit(2)` terminates the process immediately without flushing
stdio buffers or running atexit handlers. In a forked child, calling exit
(3) can flush the parent's buffered output a second time; _exit(2) is the
safe choice when the child is not going to exec.

Process identity

`getpid(2)` returns the calling process's PID; `getppid(2)` returns the
parent's PID. PIDs are reused over time, so a cached PID is only valid while
the process it names is still alive.
