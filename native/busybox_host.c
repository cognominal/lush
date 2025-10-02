// Minimal BusyBox host shim for Lush builtins.
//
// Compile (macOS):
//   clang -fPIC -shared -o libbusybox_host.dylib native/busybox_host.c -ldl
//
// Compile (Linux):
//   cc -fPIC -shared -o libbusybox_host.so native/busybox_host.c -ldl
//
// Provide the resulting library alongside libbusybox.so and set
// LUSH_BUSYBOX_HOST/LUSH_BUSYBOX_SO or place both under
// vendor/busybox/<platform>-<arch>/.

#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <limits.h>
#include <signal.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#if defined(_WIN32)
#define HOST_EXPORT __declspec(dllexport)
#else
#define HOST_EXPORT __attribute__((visibility("default")))
#endif

typedef int (*busybox_main_fn)(int, char **);

typedef struct busybox_host {
  void *dl;
  busybox_main_fn main_fn;
  char **applets;
  size_t applet_count;
} busybox_host;

static void busybox_host_free_applets(busybox_host *host) {
  if (!host || !host->applets) return;
  for (size_t i = 0; i < host->applet_count; i++) {
    free(host->applets[i]);
  }
  free(host->applets);
  host->applets = NULL;
  host->applet_count = 0;
}

static int busybox_host_wait(pid_t pid, int *exit_code) {
  int status = 0;
  while (waitpid(pid, &status, 0) == -1) {
    if (errno != EINTR) {
      return -errno;
    }
  }
  if (WIFEXITED(status)) {
    if (exit_code) *exit_code = WEXITSTATUS(status);
  } else if (WIFSIGNALED(status)) {
    if (exit_code) *exit_code = 128 + WTERMSIG(status);
  }
  return 0;
}

static int busybox_host_invoke(const busybox_host *host,
                               int argc,
                               char **argv,
                               int stdout_fd,
                               int stderr_fd,
                               int *exit_code) {
  if (!host || !host->main_fn) return -EINVAL;
  pid_t pid = fork();
  if (pid < 0) return -errno;
  if (pid == 0) {
    if (stdout_fd >= 0) {
      dup2(stdout_fd, STDOUT_FILENO);
      close(stdout_fd);
    }
    if (stderr_fd >= 0) {
      dup2(stderr_fd, STDERR_FILENO);
      close(stderr_fd);
    }
    // Child runs BusyBox and never returns to the runtime.
    int rc = host->main_fn(argc, argv);
    _exit(rc);
  }
  return busybox_host_wait(pid, exit_code);
}

static int busybox_host_collect_applets(busybox_host *host) {
  int pipefd[2];
  if (pipe(pipefd) != 0) return -errno;

  const char *argv_vals[] = { "busybox", "--list" };
  char *argv[3];
  argv[0] = (char *)argv_vals[0];
  argv[1] = (char *)argv_vals[1];
  argv[2] = NULL;
  int exit_code = 0;
  int rc = busybox_host_invoke(host, 2, argv, pipefd[1], -1, &exit_code);
  close(pipefd[1]);
  if (rc != 0) {
    close(pipefd[0]);
    return rc;
  }
  if (exit_code != 0) {
    close(pipefd[0]);
    return -exit_code;
  }

  size_t capacity = 4096;
  size_t length = 0;
  char *buffer = malloc(capacity + 1);
  if (!buffer) {
    close(pipefd[0]);
    return -ENOMEM;
  }

  while (true) {
    ssize_t n = read(pipefd[0], buffer + length, capacity - length);
    if (n < 0) {
      if (errno == EINTR) continue;
      free(buffer);
      close(pipefd[0]);
      return -errno;
    }
    if (n == 0) break;
    length += (size_t)n;
    if (length == capacity) {
      capacity *= 2;
      char *next = realloc(buffer, capacity + 1);
      if (!next) {
        free(buffer);
        close(pipefd[0]);
        return -ENOMEM;
      }
      buffer = next;
    }
  }
  close(pipefd[0]);

  buffer[length] = '\0';

  size_t count = 0;
  for (char *cursor = buffer; *cursor;) {
    char *line_end = strpbrk(cursor, "\r\n");
    if (line_end) *line_end = '\0';
    if (*cursor) count += 1;
    if (!line_end) break;
    cursor = line_end + 1;
    while (*cursor == '\r' || *cursor == '\n') cursor++;
  }

  if (count == 0) {
    free(buffer);
    return 0;
  }

  char **applets = calloc(count, sizeof(char *));
  if (!applets) {
    free(buffer);
    return -ENOMEM;
  }

  size_t index = 0;
  for (char *cursor = buffer; *cursor && index < count;) {
    char *line_end = strpbrk(cursor, "\r\n");
    if (line_end) *line_end = '\0';
    if (*cursor) {
      applets[index] = strdup(cursor);
      if (!applets[index]) {
        free(buffer);
        for (size_t i = 0; i < index; i++) free(applets[i]);
        free(applets);
        return -ENOMEM;
      }
      index += 1;
    }
    if (!line_end) break;
    cursor = line_end + 1;
    while (*cursor == '\r' || *cursor == '\n') cursor++;
  }

  free(buffer);
  host->applets = applets;
  host->applet_count = index;
  return 0;
}

HOST_EXPORT busybox_host *busybox_host_new(const char *path) {
  if (!path) return NULL;
  void *dl = dlopen(path, RTLD_LAZY | RTLD_LOCAL);
  if (!dl) return NULL;
  busybox_main_fn fn = (busybox_main_fn)dlsym(dl, "busybox_main");
  if (!fn) {
    dlclose(dl);
    return NULL;
  }

  busybox_host *host = calloc(1, sizeof(busybox_host));
  if (!host) {
    dlclose(dl);
    return NULL;
  }
  host->dl = dl;
  host->main_fn = fn;

  if (busybox_host_collect_applets(host) != 0) {
    busybox_host_free_applets(host);
    dlclose(dl);
    free(host);
    return NULL;
  }

  return host;
}

HOST_EXPORT void busybox_host_free(busybox_host *host) {
  if (!host) return;
  busybox_host_free_applets(host);
  if (host->dl) dlclose(host->dl);
  free(host);
}

HOST_EXPORT int busybox_host_applet_count(const busybox_host *host) {
  if (!host) return 0;
  if (host->applet_count > INT32_MAX) return INT32_MAX;
  return (int)host->applet_count;
}

HOST_EXPORT const char *busybox_host_applet_name(const busybox_host *host, int index) {
  if (!host || index < 0) return NULL;
  if ((size_t)index >= host->applet_count) return NULL;
  return host->applets[index];
}

HOST_EXPORT int busybox_host_run(const busybox_host *host,
                                 int argc,
                                 const char *const *argv,
                                 int stdout_fd,
                                 int stderr_fd,
                                 int *exit_code) {
  if (!host || argc <= 0 || !argv) return -EINVAL;
  char **args = calloc((size_t)argc + 1, sizeof(char *));
  if (!args) return -ENOMEM;
  for (int i = 0; i < argc; i++) {
    if (argv[i]) {
      args[i] = strdup(argv[i]);
      if (!args[i]) {
        for (int j = 0; j < i; j++) free(args[j]);
        free(args);
        return -ENOMEM;
      }
    }
  }
  int rc = busybox_host_invoke(host, argc, args, stdout_fd, stderr_fd, exit_code);
  for (int i = 0; i < argc; i++) free(args[i]);
  free(args);
  return rc;
}
