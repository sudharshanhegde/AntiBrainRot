# Sources: c-cpp-systems

Curated reference material for the `c-cpp-systems` topic. This directory is
read by the generation job (`backend/src/generate/sources.js` and
`pipeline/src/deckWorkflow.js`); every file except this `README.md` is loaded
as source text and grounded against. Keep files to primary, canonical
references, not blog posts.

Canonical references for this topic:

- Linux man pages (man7.org): `signal(7)`, `kill(2)`, `syscall(2)`,
  `fork(2)`, `execve(2)`, `wait(2)`, `open(2)`, `read(2)`, `write(2)`,
  `pipe(2)`, `sigaction(2)`, `malloc(3)`, `free(3)`.
- cppreference.com for the C++ language and standard library.
- The C standard (C11/C17) and the C++ standard for precision-sensitive
  rules: undefined behavior, integer promotions, object lifetime, alignment.
- POSIX (IEEE Std 1003.1) for file descriptors, process control, and IPC.

Notes on this material:

- Signal numbers and default actions are the Linux values from `signal(7)`.
  Other Unix systems assign different numbers to some signals; the standard
  signals `SIGHUP`, `SIGINT`, `SIGQUIT`, `SIGILL`, `SIGABRT`, `SIGFPE`,
  `SIGKILL`, `SIGSEGV`, `SIGPIPE`, `SIGALRM`, `SIGTERM`, `SIGUSR1`,
  `SIGUSR2`, `SIGCHLD`, `SIGCONT`, `SIGSTOP`, and `SIGTSTP` are the portable
  set with fixed meanings.
- Each reference file cites its source page at the top. When expanding this
  topic, prefer quoting the canonical page over paraphrasing from memory, and
  keep the signal/system-call facts exact: a wrong number or default action
  is a correctness bug, not a style issue.
