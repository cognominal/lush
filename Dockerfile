# syntax=docker/dockerfile:1

# Build lush using a standard Node.js image
FROM node:22 AS base

# Install bun for TypeScript execution
ENV BUN_INSTALL=/usr/local/bun
ENV PATH="$BUN_INSTALL/bin:$PATH"

RUN curl -fsSL https://bun.sh/install | bash \
  && ln -s $BUN_INSTALL/bin/bun /usr/local/bin/bun

WORKDIR /app

COPY bun.lock package.json ./
COPY src ./src
COPY builtins.md ./builtins.md
COPY builtins.ts ./builtins.ts
COPY keybindings.md ./keybindings.md
COPY prompt.md ./prompt.md
COPY prompts ./prompts
COPY unparsing.md ./unparsing.md

RUN bun install --frozen-lockfile

# Provide a lush command inside the container
RUN printf '#!/usr/bin/env sh\nset -e\nexec bun run start "$@"\n' > /usr/local/bin/lush \
  && chmod +x /usr/local/bin/lush

CMD ["lush"]
