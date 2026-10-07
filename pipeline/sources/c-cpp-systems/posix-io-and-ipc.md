Source: POSIX (IEEE Std 1003.1) and Linux man-pages, open(2), read(2),
write(2), close(2), dup(2), pipe(2), sigaction(2), fcntl(2).
https://man7.org/linux/man-pages/man2/open.2.html
https://man7.org/linux/man-pages/man2/pipe.2.html
https://man7.org/linux/man-pages/man2/sigaction.2.html

File descriptors

A file descriptor (fd) is a small non-negative integer that names an open
file, socket, pipe, or device within a process. The kernel keeps, per
process, a table mapping each fd to an open file description that records the
file's offset, access mode, and a reference to the underlying inode. By
convention fd 0 is standard input, fd 1 is standard output, and fd 2 is
standard error; the shell sets these up before starting a program.

`int open(const char *pathname, int flags, ...);` returns a new fd (the
lowest free number) or -1 on error. `ssize_t read(int fd, void *buf, size_t
count);` and `ssize_t write(int fd, const void *buf, size_t count);` transfer
bytes and return the number of bytes actually transferred, which may be fewer
than requested; read returns 0 at end of file. `int close(int fd);` releases
the descriptor. `off_t lseek(int fd, off_t offset, int whence);` moves the
file offset.

Two descriptors can share one open file description: `dup(2)` and `dup2(2)`
create such aliases, and they then share the file offset. After fork, parent
and child share their open file descriptions, including the offset, so reads
by one advance the other's position.

Descriptor inheritance and close-on-exec

File descriptors survive across fork but, unless marked close-on-exec, also
survive execve. The O_CLOEXEC flag to open(2) (or the FD_CLOEXEC flag set via
fcntl(2)) makes a descriptor close automatically when the process execs,
which prevents leaking a sensitive descriptor into an unrelated program.

Pipes

`int pipe(int pipefd[2]);` creates a unidirectional byte channel. pipefd[0]
is the read end and pipefd[1] is the write end. Writing to a pipe whose read
end is closed raises SIGPIPE and fails with EPIPE; reading from a pipe whose
write end is closed returns 0 (end of file) once the buffered data is
drained. A pipe has a finite kernel buffer; a write larger than the free
space blocks until the reader consumes data. Pipes are the basis of shell
pipelines and of the classic fork/exec pattern to connect a child's stdio.

Signals with sigaction

`sigaction(2)` is the portable, well-defined way to install a handler:
`sigaction(int signum, const struct sigaction *act, struct sigaction
*oldact)`. The struct carries the handler function, a mask of signals to
block while the handler runs, and flags such as SA_RESTART (restart
interrupted system calls) and SA_SIGINFO (for extended handler arguments).
Most system calls interrupted by a signal return -1 with errno set to EINTR
unless SA_RESTART is set. `sigprocmask(2)` blocks or unblocks a set of
signals, so a critical section can run without being interrupted by a
handler. SIGKILL and SIGSTOP cannot be blocked.
