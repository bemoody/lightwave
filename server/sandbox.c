/* file: sandbox.c	B. Moody	22 February 2019
			Last revised:	  26 July 2023     version 0.72

Simple sandbox for the LightWAVE server
Copyright (C) 2019 Benjamin Moody

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at
your option) any later version.

This program is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <sys/capability.h>
#include <sys/mman.h>
#include <sys/resource.h>
#include <sys/prctl.h>
#include <sched.h>
#include <signal.h>
#include <seccomp.h>

#ifndef SYS_SECCOMP
# define SYS_SECCOMP 1
#endif

#define FAIL(msg) do {                                          \
        fprintf(stderr, "sandboxed-lightwave: %s\n", msg);      \
        abort();                                                \
    } while (0)
#define FAILERR(msg) do {                                          \
        perror("sandboxed-lightwave: " msg);                         \
        abort();                                                     \
    } while (0)

static void set_hard_rlimit(int resource, rlim_t value)
{
    struct rlimit rlim;
    if (getrlimit(resource, &rlim) != 0)
        FAILERR("cannot get resource limits");
    if (rlim.rlim_max == RLIM_INFINITY || rlim.rlim_max > value)
        rlim.rlim_max = value;
    if (rlim.rlim_cur == RLIM_INFINITY || rlim.rlim_cur > value)
        rlim.rlim_cur = value;
    if (setrlimit(resource, &rlim) != 0)
        FAILERR("cannot set resource limits");
}

static void pr_str(const char *str)
{
    if (str)
        write(STDERR_FILENO, str, strlen(str));
}

static void pr_hex(unsigned long value)
{
    char c;
    if (value >= 16) pr_hex(value / 16);
    else pr_str("0x");
    c = (value % 16 < 10 ? '0' + value % 16 : 'a' + value % 16 - 10);
    write(STDERR_FILENO, &c, 1);
}

static void handle_sigsys(int signum, siginfo_t *info, void *context0)
{
    ucontext_t *context = context0;
    if (info->si_code == SYS_SECCOMP) {
        pr_str("*** blocked system call "); pr_hex(info->si_syscall);
        pr_str(" arch="); pr_hex(info->si_arch);
#ifdef __x86_64__
        pr_str(" rdi="); pr_hex(context->uc_mcontext.gregs[REG_RDI]);
        pr_str(" rsi="); pr_hex(context->uc_mcontext.gregs[REG_RSI]);
        pr_str(" rdx="); pr_hex(context->uc_mcontext.gregs[REG_RDX]);
        pr_str(" r10="); pr_hex(context->uc_mcontext.gregs[REG_R10]);
        pr_str(" r8="); pr_hex(context->uc_mcontext.gregs[REG_R8]);
        pr_str(" r9="); pr_hex(context->uc_mcontext.gregs[REG_R9]);
#elif defined(__i386__)
        pr_str(" ebx="); pr_hex(context->uc_mcontext.gregs[REG_EBX]);
        pr_str(" ecx="); pr_hex(context->uc_mcontext.gregs[REG_ECX]);
        pr_str(" edx="); pr_hex(context->uc_mcontext.gregs[REG_EDX]);
        pr_str(" esi="); pr_hex(context->uc_mcontext.gregs[REG_ESI]);
        pr_str(" edi="); pr_hex(context->uc_mcontext.gregs[REG_EDI]);
        pr_str(" ebp="); pr_hex(context->uc_mcontext.gregs[REG_EBP]);
#endif
        pr_str(" [");
        pr_str(seccomp_syscall_resolve_num_arch(info->si_arch,
                                                info->si_syscall));
        pr_str("]\n");
    }
    raise(signum);
}

void lightwave_sandbox()
{
    uid_t effectiveuid = geteuid();
    uid_t realuid = getuid();
    gid_t realgid = getgid();
    char *rootdir, *dbcalfile;
    struct sigaction sa;
    scmp_filter_ctx ctx;
    cap_t no_capabilities;

    /* chdir and chroot into $LIGHTWAVE_ROOT, so only files in that
       directory can be read */
    rootdir = getenv("LIGHTWAVE_ROOT");
    if (!rootdir) {
#ifdef LW_ROOT
        rootdir = LW_ROOT;
#else
        FAIL("LIGHTWAVE_ROOT not set");
#endif
    }

    if (seteuid(realuid) != 0)
        FAILERR("cannot set effective user ID");
    if (setregid(realgid, realgid) != 0)
        FAILERR("cannot set real/effective group ID");

    /* If $LIGHTWAVE_WFDBCAL is set, use it as the path to a
       calibration file stored outside the root directory. */
    dbcalfile = getenv("LIGHTWAVE_WFDBCAL");
    if (dbcalfile) {
        if (!freopen(dbcalfile, "r", stdin))
            FAILERR("cannot read $LIGHTWAVE_WFDBCAL");
        setenv("WFDBCAL", "-", 1);
    }

    if (chdir(rootdir) != 0)
        FAILERR("cannot chdir to $LIGHTWAVE_ROOT");

    if (effectiveuid == 0) {
        if (seteuid(0) != 0)
            FAILERR("cannot set effective user ID");
        if (chroot(".") != 0)
            FAILERR("cannot chroot to $LIGHTWAVE_ROOT");
        if (setreuid(realuid, realuid) != 0)
            FAILERR("cannot set real/effective user ID");
    }
    else {
        if (unshare(CLONE_NEWUSER) != 0)
            FAILERR("cannot create user namespace");
        if (chroot(".") != 0)
            FAILERR("cannot chroot to $LIGHTWAVE_ROOT");
        no_capabilities = cap_init();
        if (cap_set_proc(no_capabilities) != 0)
            FAILERR("cannot set process capabilities");
        cap_free(no_capabilities);
    }

    if (prctl(PR_SET_NO_NEW_PRIVS, 1UL, 0UL, 0UL, 0UL) != 0)
        FAILERR("cannot set no-new-privs");

    /* resource limits */
    set_hard_rlimit(RLIMIT_CORE, 0);
    set_hard_rlimit(RLIMIT_FSIZE, 0);
    set_hard_rlimit(RLIMIT_SIGPENDING, 256);
    set_hard_rlimit(RLIMIT_MEMLOCK, 1024 * 1024);
    set_hard_rlimit(RLIMIT_NOFILE, 256);
    set_hard_rlimit(RLIMIT_MSGQUEUE, 0);
    set_hard_rlimit(RLIMIT_CPU, 60);
    set_hard_rlimit(RLIMIT_NPROC, 1000);
    set_hard_rlimit(RLIMIT_AS, 512 * 1024 * 1024);

    /* handle SIGSYS by displaying an error message and exiting */
    sa.sa_sigaction = &handle_sigsys;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = SA_SIGINFO;
    sigaction(SIGSYS, &sa, NULL);

    /* all system calls not whitelisted below will raise SIGSYS */
    if ((ctx = seccomp_init(SCMP_ACT_TRAP)) == NULL)
        FAIL("seccomp_init failed");

    /* permit following system calls with any arguments */
    seccomp_rule_add_exact(ctx, SCMP_ACT_ALLOW, SCMP_SYS(read), 0);
    seccomp_rule_add_exact(ctx, SCMP_ACT_ALLOW, SCMP_SYS(write), 0);
    seccomp_rule_add_exact(ctx, SCMP_ACT_ALLOW, SCMP_SYS(lseek), 0);
    seccomp_rule_add_exact(ctx, SCMP_ACT_ALLOW, SCMP_SYS(fstat), 0);
    seccomp_rule_add_exact(ctx, SCMP_ACT_ALLOW, SCMP_SYS(close), 0);
    seccomp_rule_add_exact(ctx, SCMP_ACT_ALLOW, SCMP_SYS(brk), 0);
    seccomp_rule_add_exact(ctx, SCMP_ACT_ALLOW, SCMP_SYS(exit_group), 0);
    seccomp_rule_add_exact(ctx, SCMP_ACT_ALLOW, SCMP_SYS(getcwd), 0);
    seccomp_rule_add_exact(ctx, SCMP_ACT_ALLOW, SCMP_SYS(munmap), 0);

    /* permit open(..., O_RDONLY) and openat(AT_FDCWD, ..., O_RDONLY)
       (openat without AT_FDCWD would allow a local attacker to escape
       from an outer chroot environment; the same goes for fchdir or
       any of the other *at() functions.) */
    seccomp_rule_add_exact
        (ctx, SCMP_ACT_ALLOW, SCMP_SYS(open), 1,
         SCMP_A1(SCMP_CMP_EQ, O_RDONLY));
    seccomp_rule_add_exact
        (ctx, SCMP_ACT_ALLOW, SCMP_SYS(openat), 2,
         SCMP_A0(SCMP_CMP_EQ, (uint32_t) AT_FDCWD),
         SCMP_A2(SCMP_CMP_EQ, O_RDONLY));

    /* deny newfstatat(fd, ..., ..., AT_EMPTY_PATH)
       (could allow a local attacker to examine files outside an outer
       chroot environment; unfortunately seccomp can't distinguish
       empty from non-empty paths.  If a working fstat() function is
       actually needed, it must be implemented using the fstat system
       call rather than newfstatat.) */
    seccomp_rule_add_exact
        (ctx, SCMP_ACT_ERRNO(ENOSYS), SCMP_SYS(newfstatat), 2,
         SCMP_A0(SCMP_CMP_NE, (uint32_t) AT_FDCWD),
         SCMP_A3(SCMP_CMP_EQ, AT_EMPTY_PATH));

    /* permit mmap(..., PROT_READ|PROT_WRITE, MAP_ANONYMOUS|MAP_PRIVATE, ...)
       (typically lightwave doesn't allocate any huge blocks of memory
       that would make this necessary, but it's good future-proofing) */
    seccomp_rule_add_exact
        (ctx, SCMP_ACT_ALLOW, SCMP_SYS(mmap), 2,
         SCMP_A2(SCMP_CMP_MASKED_EQ, ~(PROT_READ | PROT_WRITE), 0),
         SCMP_A3(SCMP_CMP_EQ, (MAP_ANONYMOUS | MAP_PRIVATE)));

    /* activate the filter */
    if (seccomp_load(ctx) != 0)
        FAIL("seccomp_load failed");
}
