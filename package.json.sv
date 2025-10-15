{
  "name": "tty-editor",
  "version": "0.5.0",
  "type": "module",
  "bin": {
    "tty-editor": "src/editor.ts"
  },
  "scripts": {
    "start": "bun run src/editor.ts",
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage",
    "tsc": "tsc --noEmit"
  },
  "dependencies": {
    "@zkochan/js-yaml": "^0.0.10",
    "acorn": "^8.13.0",
    "acorn-typescript": "^1.4.13",
    "chalk": "^5.6.2",
    "svelte": "^5.1.1",
    "vitest": "^3.2.4",
    "yaml": "^2.8.1"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^24.5.2",
    "js-yaml": "^4.1.0",
    "tty-editor": "file:../tty-editor"
  }
}
