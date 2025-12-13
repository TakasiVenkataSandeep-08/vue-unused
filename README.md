# 🧹 vue-unused

A highly accurate, fast, and configurable CLI tool to detect and delete unused files in any Vue.js project.

It performs a deep, static analysis of your codebase to find unused `.vue` components and `.js`/`.ts`/`.json` modules, so you can keep your project clean and maintainable.

![CI](https://github.com/TakasiVenkataSandeep-08/vue-unused/actions/workflows/publish.yml/badge.svg)
[![NPM Version](https://img.shields.io/npm/v/vue-unused.svg)](https://www.npmjs.com/package/vue-unused)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/vue-unused.svg)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

---

## Why vue-unused?

Many tools that try to find unused files only check if a file has been `import`-ed, which often leads to false positives—especially in Vue. They might flag a component as "unused" even if it's clearly used in a `<template>`, simply because the import check was not smart enough.

`vue-unused` solves this problem by being smarter. It parses your Vue templates to understand which components are actually being used, and then traces them back to their imports. This deep analysis means you can trust its output and delete dead code with confidence.

## Key Features

- **🎯 High Accuracy:** Intelligently maps `<template>` usage to `<script>` imports to prevent false positives.
- **⚛️ Vue 2 & 3 Support:** Seamlessly works with both major versions of Vue, including the `<script setup>` syntax.
- **⚙️ Zero-Config By Default:** Automatically finds your project root and respects your `.gitignore` file out of the box. No configuration is needed for most projects.
- **🛣️ Robust Path Resolution:** Correctly handles aliased paths (`@/components`), relative paths (`../utils`), and extensionless imports.
- **🚀 Dynamic Import Aware:** Understands dynamic `import()` calls to trace dependencies loaded at runtime.
- **📦 Bundle Analysis:** Optional tree-shaking aware analysis using build outputs for maximum accuracy.
- **🛠️ Fully Configurable:** Provides a simple `vue-unused.config.js` for advanced customization when you need it.

---

## Installation

Install the package globally using npm to use the `vue-unused` command in any project.

```bash
npm install -g vue-unused
```

---

## Usage & Examples

### Standard Scan

To run a scan, navigate to your project directory and run the command. It will output a list of unused files found.

```bash
vue-unused
```

### Dry Run: Reviewing Unused Files

It's best practice to first review the files before deleting them. Use the `--json` flag to output the results to a file named `unused-files.json`.

```bash
vue-unused --json
```

### Deleting Unused Files

After reviewing the list, you can run the tool with the `--delete` flag to permanently remove the identified files. **Use with caution, as this cannot be undone.**

```bash
vue-unused --delete
```

### Using a Custom Configuration

If your configuration file is not at the project root, you can specify its path using the `--config` flag.

```bash
vue-unused --config ./config/vue-unused.config.cjs
```

### Debugging the Scan

If you suspect a file is being incorrectly flagged, run with the `--verbose` flag to get detailed debug output that shows how files are being resolved.

```bash
vue-unused --verbose
```

### Create / Customise Configuration

`vue-unused` can now guide you through creating a configuration file interactively. Simply run:

```bash
vue-unused --createConfig
```

You will be prompted to either accept the defaults or customise options such as aliases, output format, deletion behaviour, and entry files. In CI (non-TTY) environments the command automatically falls back to generating the default config without prompts.

---

### Generate a Dependency Graph

Need a full picture of how your files depend on each other? Use the new `--graph` flag or `graph` command:

```bash
vue-unused --graph          # or simply: vue-unused graph
```

This produces a `dependency-graph.json` at the project root mapping every file to the files it imports.

---

### Bundle Analysis for Maximum Accuracy

For the most accurate unused file detection, analyze your build outputs to account for tree-shaking:

```bash
vue-unused --bundle
```

This analyzes your bundle directory and shows files that are truly unused after your bundler (webpack, Vite, etc.) processes the code.

---

### Help & Manual

For quick reference:

```bash
vue-unused --help   # short usage and options
```

For the full manual (renders the project README in the terminal):

```bash
vue-unused --manual   # or: vue-unused manual
```

---

### Safety Confirmation for Deletion

When you pass the `--delete` flag in an interactive terminal, the CLI now **asks for confirmation** before removing files, preventing accidental data loss. In non-interactive environments (like CI) it behaves exactly as before.

---

## Command-Line Options

| Option / Command       | Description                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `--json`               | Output unused-file list to `unused-files.json` instead of the console.                                 |
| `--delete`             | Delete unused files after confirmation (interactive) or immediately (CI).                              |
| `--graph` / `graph`    | Generate `dependency-graph.json` containing the full import graph.                                     |
| `--bundle`             | Analyze bundle outputs for tree-shaken unused files (most accurate).                                   |
| `--bundle-dir <path>`  | Specify custom bundle directory (default: auto-detect).                                                |
| `--config <path>`      | Use a specific config file instead of auto-detecting one.                                              |
| `--createConfig`       | Launch an interactive wizard to create `vue-unused.config.cjs` (non-interactive fallback to defaults). |
| `--verbose`            | Print detailed processing information.                                                                 |
| `--help`, `-h`, `help` | Show quick usage help.                                                                                 |
| `--manual`, `manual`   | Show the full manual (this README) in the terminal.                                                    |
| `--version`, `-v`      | Print the current version and exit.                                                                    |

---

## Configuration (Optional)

For most projects, no configuration is needed. For advanced use cases, create a `vue-unused.config.js` (or `.cjs`) file in your project root.

**Example `vue-unused.config.js`:**

```js
module.exports = {
  // The root directory of your project. All paths are resolved relative to this.
  // Default: Automatically detected based on the location of your package.json or .git folder.
  rootDir: "./",

  // Path aliases used in your project (e.g., from vite.config.js).
  // This should map the alias to the full path relative to `rootDir`.
  alias: {
    "@": "src",
    "~": "src/nested/modules",
  },

  // File extensions to include in the scan.
  // Experimental: To include all types extensions you can use extensions:"ALL (Might not work well with few extensions)"
  extensions: [".vue", ".js", ".ts", ".json"],

  // An array of glob patterns for files/directories to explicitly ignore.
  // Note: All paths in your .gitignore file are always ignored automatically.
  ignore: ["**/*.spec.ts", "**/__mocks__/**", "src/legacy/**"],

  // Files that should always be considered "used", even if no imports are found.
  // Ideal for entry points (like `main.js`) or files with side effects.
  // Paths are relative to `rootDir`.
  entry: ["src/main.js", "src/registerServiceWorker.js"],
};
```

---

## CI Integration

`vue-unused` is perfect for keeping your codebase clean. You can integrate it into your CI pipeline to fail a build if any unused files are detected, preventing dead code from ever being merged.

**Example GitHub Actions Workflow:**

```yaml
name: Check for Unused Files

on:
  push:
    branches:
      - main
  pull_request:

jobs:
  vue-unused:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install and Run vue-unused
        run: |
          npm install -g vue-unused
          # Run with --json and check if the output file is non-empty
          vue-unused --json
          if [ -s unused-files.json ]; then
            echo "Error: Found unused files. See the list below."
            cat unused-files.json
            exit 1
          fi
```

---

## How It Works

1.  **Find Project Root:** It starts by locating your project's root directory (by looking for a `.git` folder or `package.json`).
2.  **Scan Files:** It finds all `.vue`, `.js`, `.ts`, and `.json` files, automatically respecting all rules in your `.gitignore` file.
3.  **Build Dependency Graph:** It parses every file to build a map of all dependencies, understanding `import`, `require()`, and dynamic `import()` statements.
4.  **Analyze Vue Components:** It performs a deep analysis of `.vue` files, creating a precise map between component tags in the `<template>` and their import source in the `<script>`.
5.  **Identify Orphans:** By comparing the list of all files against the graph of used files, it finds any file that is not part of the dependency chain.
6.  **Report Results:** It presents the final list of these "orphaned" (unused) files to you.

---

## Contributing

Contributions are welcome! If you find a bug or have a feature request, please open an issue on GitHub.

## License

MIT

---

## Debugging

For more extensive debugging information beyond the `--verbose` flag, you can set the `VUE_UNUSED_DEBUG` environment variable before running the command.

```bash
VUE_UNUSED_DEBUG=true vue-unused --verbose
```

Setting `VUE_UNUSED_DEBUG` will output highly detailed logs that can be helpful for diagnosing issues with file parsing, dependency tracking, and other internal processes.

---
