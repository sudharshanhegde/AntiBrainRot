// Placeholder deck for the Operating Systems topic.
//
// This mirrors the shape the content pipeline will emit: a deck with 10
// concept cards, each immediately followed by a quiz card that tests it,
// for 20 cards total. Every card is tagged with a template (concept) or
// type (quiz). Bodies sit in the 100-200 word band, and no em dashes or
// emojis appear anywhere.
// card_id is a stable mock id so quiz answers and the end-of-deck score
// work without a backend.

export const placeholderDeck = {
  deck_index: 0,
  topic_slug: "operating-systems",
  difficulty: "fundamentals",
  cards: [
    {
      card_id: 101,
      order_index: 0,
      type: "concept",
      template: "text_only",
      title: "A process is a running program",
      body: "A program on disk is inert, a file of instructions. A process is that program once the kernel has loaded it into memory, given it an address space, opened its file descriptors, and scheduled it for CPU time. One program can produce many processes, each with its own memory image, so a process writing to its own memory never corrupts another. The kernel is the manager here. It owns the hardware and hands out slices of it, CPU time, memory, and device access. Every process is identified by a numeric process ID and carries attributes such as its owner, its current state, and a slot in the kernel's process table. When a process exits, the kernel reclaims its resources and records a small exit status that the parent can read. This one idea, a process as a managed unit of execution, sits underneath everything else an operating system does.",
      code_snippet: null,
      diagram_ref: null,
    },
    {
      card_id: 102,
      order_index: 1,
      type: "quiz",
      tests_card_id: 0,
      question: "What turns a program on disk into a process?",
      options: [
        { id: "a", text: "The kernel loads and schedules it" },
        { id: "b", text: "It is written in C" },
        { id: "c", text: "It owns a CPU core forever" },
        { id: "d", text: "It opens a file descriptor" },
      ],
      correct_option_id: "a",
    },
    {
      card_id: 103,
      order_index: 2,
      type: "concept",
      template: "text_code",
      title: "Syscalls are the API of the kernel",
      body: "User programs do not touch hardware directly. They ask the kernel to act on their behalf through system calls, the stable interface between user space and kernel space. A syscall looks like a normal function call but takes a special path: the program loads arguments into registers, executes a trap instruction that switches the CPU into kernel mode, and the kernel dispatches to the correct handler. The read call below is a typical example. The file descriptor names an open file, the buffer says where to place the bytes, and the count says how many to read at most. The return value is the number actually read, or negative one with errno set on error. Because a trap is relatively expensive, libraries batch work where they can and buffer results, which is why buffered I/O beats calling read one byte at a time.",
      code_snippet: `#include <unistd.h>

ssize_t read(int fd, void *buf, size_t count);`,
      diagram_ref: null,
    },
    {
      card_id: 104,
      order_index: 3,
      type: "quiz",
      tests_card_id: 2,
      question: "How does a syscall reach the kernel?",
      options: [
        { id: "a", text: "A trap switches the CPU to kernel mode" },
        { id: "b", text: "It writes straight to hardware" },
        { id: "c", text: "The kernel polls user memory" },
        { id: "d", text: "It calls a library that bypasses the OS" },
      ],
      correct_option_id: "a",
    },
    {
      card_id: 105,
      order_index: 4,
      type: "concept",
      template: "text_diagram",
      title: "Virtual memory: one address space per process",
      body: "Each process believes it owns the whole memory range from address zero up to the machine's pointer size. This virtual address space is not the same as physical RAM. The hardware translates every virtual address to a physical one using page tables the kernel maintains, and the two can differ completely, two processes can both use address 0x400000 and map to different physical frames. The classic layout reads top to bottom: the executable's text and data sit low, the heap grows upward, and the stack grows downward from the top, with a large unmapped gap between them so runaway growth hits a fault instead of silently colliding. This indirection buys isolation, one process cannot reach another's memory, and it buys the illusion of memory far larger than physical RAM.",
      code_snippet: null,
      diagram_ref: "Diagram of a process virtual address space as stacked regions from lowest to highest address: text (code), data, heap, a large unmapped gap, then the stack growing down near the top.",
    },
    {
      card_id: 106,
      order_index: 5,
      type: "quiz",
      tests_card_id: 4,
      question: "Why can two processes both use the same virtual address?",
      options: [
        { id: "a", text: "Page tables map them to different frames" },
        { id: "b", text: "They share one physical frame" },
        { id: "c", text: "The OS copies the data between them" },
        { id: "d", text: "Virtual addresses are never reused" },
      ],
      correct_option_id: "a",
    },
    {
      card_id: 107,
      order_index: 6,
      type: "concept",
      template: "text_only",
      title: "The CPU multiplexes processes",
      body: "A single CPU core executes one instruction stream at a time, yet a machine appears to run many programs at once. The kernel creates that illusion by rapidly switching which process owns the core. On a timer interrupt the kernel stops the running process, saves its registers onto its kernel stack, picks another process, restores that process's saved registers, and resumes it. Each swap is a context switch, and it is pure overhead, no user work happens while the kernel shuffles state. The illusion of concurrency therefore carries a cost, which is why systems measure context switch rate. On a machine with multiple cores the story repeats per core. The key idea is that simultaneous execution is mostly a scheduling trick, and the operating system pulls it off, so applications do not need to know how many cores exist to run correctly.",
      code_snippet: null,
      diagram_ref: null,
    },
    {
      card_id: 108,
      order_index: 7,
      type: "quiz",
      tests_card_id: 6,
      question: "What does a context switch save and restore?",
      options: [
        { id: "a", text: "Registers of the two processes" },
        { id: "b", text: "The whole address space" },
        { id: "c", text: "The operating system itself" },
        { id: "d", text: "Every file on disk" },
      ],
      correct_option_id: "a",
    },
    {
      card_id: 109,
      order_index: 8,
      type: "concept",
      template: "text_code",
      title: "fork creates a child process",
      body: "fork is the classic way a Unix process creates another process. The call is unusual because it returns twice. In the parent it returns the child's process ID; in the child it returns zero. Both processes continue from the same line of code with identical memory contents at the instant of the call, which is why branching on the return value is the first thing most programs do. The child starts with a copy of the parent's address space, though modern kernels use copy-on-write so the copy stays cheap until one side writes. The child inherits the parent's open file descriptors, environment, and signal settings. What it does not inherit is shared memory writes, after fork, a change in one process does not appear in the other. This pair of identities is the primitive on which shells and servers build multi-process programs.",
      code_snippet: `pid_t pid = fork();

if (pid == 0) {
  /* child path */
} else {
  /* parent path, pid is the child id */
}`,
      diagram_ref: null,
    },
    {
      card_id: 110,
      order_index: 9,
      type: "quiz",
      tests_card_id: 8,
      question: "How does fork return differently to each side?",
      options: [
        { id: "a", text: "Parent gets child PID, child gets zero" },
        { id: "b", text: "Both sides get the same value" },
        { id: "c", text: "Parent gets zero, child gets the PID" },
        { id: "d", text: "It returns an open file descriptor" },
      ],
      correct_option_id: "a",
    },
    {
      card_id: 111,
      order_index: 10,
      type: "concept",
      template: "text_only",
      title: "A page fault is a kernel trap",
      body: "When a process touches a virtual address whose page is not currently mapped into physical memory, the hardware cannot translate it. Instead of crashing immediately, the CPU raises a page fault and transfers control to the kernel. The kernel then decides what the fault means. If the page is simply not loaded yet, the kernel reads it from disk, or from the file that backs it, updates the page table, and resumes the process exactly where it stopped. If the page was moved to the swap area to free RAM, the kernel brings it back the same way. If the access is truly invalid, a null dereference or a write to a read-only page, the kernel kills the process with a segmentation fault. This trap-and-resolve pattern is why a program can use far more virtual memory than the machine has physical RAM, and why careless pointer use ends in crashes rather than silent corruption.",
      code_snippet: null,
      diagram_ref: null,
    },
    {
      card_id: 112,
      order_index: 11,
      type: "quiz",
      tests_card_id: 10,
      question: "What happens when a valid page is not yet in memory?",
      options: [
        { id: "a", text: "The kernel loads it and resumes the process" },
        { id: "b", text: "The process is killed immediately" },
        { id: "c", text: "The hardware ignores the access" },
        { id: "d", text: "The process is restarted from scratch" },
      ],
      correct_option_id: "a",
    },
    {
      card_id: 113,
      order_index: 12,
      type: "concept",
      template: "text_diagram",
      title: "Process states: ready, running, blocked",
      body: "At any instant a process sits in one of a few states the scheduler understands. A new process enters the ready state once it has its resources but has not yet been given the CPU. A running process currently owns a core and is executing instructions. A blocked process is waiting on something it cannot finish on its own, usually I/O or another process's event, so it is taken off the CPU even though it wants to run later. The transitions are what the operating system spends its time on: dispatch moves a ready process onto a core, preemption pulls a running process back to ready when its time slice ends, and the completion of I/O moves a blocked process back to ready. Understanding these states explains why a process can look stuck, it is blocked, not running, waiting on the disk, the network, or another thread.",
      code_snippet: null,
      diagram_ref: "Three-node state diagram with labeled arrows: New to Ready, Ready to Running via dispatch, Running to Ready via preempt or time slice, Running to Blocked on I/O wait, Blocked to Ready when I/O completes.",
    },
    {
      card_id: 114,
      order_index: 13,
      type: "quiz",
      tests_card_id: 12,
      question: "Which state is a process in while waiting on I/O?",
      options: [
        { id: "a", text: "Blocked" },
        { id: "b", text: "Running" },
        { id: "c", text: "Ready" },
        { id: "d", text: "New" },
      ],
      correct_option_id: "a",
    },
    {
      card_id: 115,
      order_index: 14,
      type: "concept",
      template: "text_only",
      title: "The scheduler picks the next process",
      body: "Given several ready processes and one core, something must decide who runs next. That decision is scheduling, and its policy shapes how responsive and fair the machine feels. A round-robin scheduler hands each process a short time slice in a fixed order, simple and fair but blind to importance. A priority scheduler always runs the highest-priority ready process, which can starve lower ones unless priorities age over time. Modern general-purpose systems use a compromise: many threads run under a fair scheduler that tries to give each a proportional share of the CPU, while interactive tasks are boosted so they answer quickly. The scheduler must weigh throughput, making sure useful work completes, against latency, making sure no single process waits too long. There is no perfect scheduler, only policies tuned for the workload, which is why scheduling keeps showing up in systems courses.",
      code_snippet: null,
      diagram_ref: null,
    },
    {
      card_id: 116,
      order_index: 15,
      type: "quiz",
      tests_card_id: 14,
      question: "How does a round-robin scheduler divide the CPU?",
      options: [
        { id: "a", text: "A short time slice per process in order" },
        { id: "b", text: "Always the highest-priority process" },
        { id: "c", text: "One process runs until it exits" },
        { id: "d", text: "The kernel never preempts" },
      ],
      correct_option_id: "a",
    },
    {
      card_id: 117,
      order_index: 16,
      type: "concept",
      template: "text_code",
      title: "Signals are the kernel's async notifications",
      body: "A signal is a small, asynchronous notification the kernel delivers to a process. Unlike a syscall, where the process asks for something, a signal arrives on its own: Ctrl+C sends SIGINT, a broken pipe sends SIGPIPE, and the kill command sends whatever signal you name. When a signal arrives, the kernel interrupts the process and runs its handler, a function the process registered in advance. Because the handler runs at an arbitrary point in the program, the rules for what is safe inside it are strict, most library calls are forbidden, and the safe pattern is to set a flag and return. Unhandled signals fall back to defaults, most commonly terminating the process, sometimes with a core dump. Signals are why a hung program can still be killed, and they give the kernel one uniform way to nudge a process that is not asking for attention.",
      code_snippet: `#include <signal.h>

void on_int(int sig) {
  /* keep it async-signal-safe */
  g_flag = 1;
}

signal(SIGINT, on_int);`,
      diagram_ref: null,
    },
    {
      card_id: 118,
      order_index: 17,
      type: "quiz",
      tests_card_id: 16,
      question: "What is the safe pattern inside a signal handler?",
      options: [
        { id: "a", text: "Set a flag and return" },
        { id: "b", text: "Allocate memory" },
        { id: "c", text: "Print to standard output" },
        { id: "d", text: "Wait for the signal to clear" },
      ],
      correct_option_id: "a",
    },
    {
      card_id: 119,
      order_index: 18,
      type: "concept",
      template: "text_diagram",
      title: "File descriptors map numbers to files",
      body: "A process does not refer to files by name after opening them. The open system call returns a small integer, a file descriptor, and every later operation names the file by that number. Behind the scenes the kernel keeps a per-process descriptor table mapping each integer to an open file description, the file's position, its access mode, and a reference to the underlying inode. Descriptors zero, one, and two are inherited from the shell and mean standard input, output, and error respectively. When a program opens a new file it usually lands in the lowest free slot, which is why redirecting descriptor one can shift the numbering of later opens. This indirection is what makes redirection and pipes possible, the shell can point descriptor one at a file or another process without the child program knowing the difference.",
      code_snippet: null,
      diagram_ref: "Table with three columns: descriptor number, role, target. Rows for 0 standard input, 1 standard output, 2 standard error, and 3 an open file on disk, with the note that new descriptors take the lowest free slot.",
    },
    {
      card_id: 120,
      order_index: 19,
      type: "quiz",
      tests_card_id: 18,
      question: "Which descriptors mean standard input, output, and error?",
      options: [
        { id: "a", text: "Zero, one, and two" },
        { id: "b", text: "One, two, and three" },
        { id: "c", text: "Zero, one, and three" },
        { id: "d", text: "They are not fixed" },
      ],
      correct_option_id: "a",
    },
  ],
};
