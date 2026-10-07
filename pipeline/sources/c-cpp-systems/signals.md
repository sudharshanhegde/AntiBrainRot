Source: Linux man-pages, signal(7) and kill(2).
https://man7.org/linux/man-pages/man7/signal.7.html
https://man7.org/linux/man-pages/man2/kill.2.html

What a signal is

A signal is a limited form of inter-process communication used to notify a
process that an event has occurred. A process can receive a signal from the
kernel, from another process (via kill or a related call), or from itself.
Signals are asynchronous: unlike a system call, which the process initiates,
a signal arrives at an arbitrary point in the program's execution.

When a signal is delivered, one of four things happens, decided by the
signal's current disposition:

1. The signal is ignored (SIG_IGN).
2. The process is terminated (the default for many signals).
3. The process is terminated and a core dump is produced.
4. The process is stopped (not terminated), and later continued.
5. A handler function registered by the process runs.

Standard Linux signal numbers and default actions

- SIGHUP  (1)  Terminate. Hangup detected on a controlling terminal.
- SIGINT  (2)  Terminate. Interrupt from the keyboard (Ctrl+C).
- SIGQUIT (3)  Core dump. Quit from the keyboard (Ctrl+\\).
- SIGILL  (4)  Core dump. Illegal instruction.
- SIGABRT (6)  Core dump. Abort signal from abort(3).
- SIGFPE  (8)  Core dump. Erroneous arithmetic operation (divide by zero).
- SIGKILL (9)  Terminate. Kill signal. Cannot be caught or ignored.
- SIGSEGV (11) Core dump. Invalid memory reference (segmentation fault).
- SIGPIPE (13) Terminate. Broken pipe: write to a pipe with no reader.
- SIGALRM (14) Terminate. Timer signal from alarm(2).
- SIGTERM (15) Terminate. Termination signal. The default of kill(1).
- SIGCHLD (17) Ignore. Child stopped or terminated.
- SIGCONT (18) Continue. Continue if the process is stopped.
- SIGSTOP (19) Stop. Stop the process. Cannot be caught or ignored.
- SIGTSTP (20) Stop. Stop typed at the terminal (Ctrl+Z).

SIGKILL and SIGSTOP are special: they can never be caught, blocked, or
ignored. Every other signal can have a handler installed with signal(2) or
sigaction(2), and can be blocked with sigprocmask(2) while a critical section
runs.

SIGTERM vs SIGKILL

SIGTERM (15) is the polite shutdown request. A process can install a handler,
run cleanup code (flush buffers, close sockets, release locks, remove
temporary files), and then exit on its own terms. It can also ignore SIGTERM
entirely, which is why a stuck process sometimes seems not to respond to a
plain kill.

SIGKILL (9) is handled entirely by the kernel. The process never sees it and
never runs any code in response: the kernel removes it from the scheduler and
tears it down immediately. This is why `kill -9 <pid>` cannot be blocked by a
program that has hung or is ignoring SIGTERM. The consequence is that no
cleanup runs: locks may stay held, temporary files may remain, and partially
written files may be left behind. SIGKILL is a last resort.

Sending signals

kill(2) has the prototype `int kill(pid_t pid, int sig);`. It returns 0 on
success and -1 on error, setting errno (for example EPERM if the caller lacks
permission, EINVAL if the signal number is invalid, ESRCH if the target
process does not exist). Permission is granted if the sender and target share
a real or effective user ID, or the sender has privilege.

The shell command `kill <pid>` sends SIGTERM by default. `kill -9 <pid>`
sends SIGKILL. `kill -15 <pid>` sends SIGTERM explicitly. `kill -l` lists the
signal names.

Signal handlers and async-signal-safety

A handler runs in the middle of whatever the process was doing. It must
therefore only call async-signal-safe functions; calling an unsafe function
(printf, malloc, most of the C library) from a handler is undefined behavior.
The portable-safe set includes write(2), _exit(2), and a few others listed in
signal-safety(7). The intended pattern is for the handler to set a flag of
type `volatile sig_atomic_t` and let the main loop act on it.
