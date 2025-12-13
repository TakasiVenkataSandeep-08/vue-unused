#!/usr/bin/env node
/**
 * @fileoverview This is the main entry point for the `vue-unused` command-line interface.
 * It handles parsing command-line arguments, loading the configuration,
 * initiating the analysis, and outputting the results.
 */
const path = require("path");
const fs = require("fs");
const packageJson = require("../package.json");
const readline = require("readline");

// Collect arguments excluding the first two default argv entries (node & script path)
const args = process.argv.slice(2);

// Wrap entire CLI in async function for chalk support
(async () => {
  const chalk = (await import("chalk")).default;

  // Always show the directory the command is being run in
  console.log(chalk.gray(`📂 Working Directory: ${process.cwd()}\n`));

  /**
   * Print a concise help message describing the most common commands and options, then exit.
   */
  function showHelp(chalk) {
    console.log(
      chalk.bold.cyan(`\nvue-unused`) +
        chalk.gray(` — find and remove unused Vue components and files.\n\n`) +
        chalk.bold(`Usage\n`) +
        `  vue-unused [options]\n\n` +
        chalk.bold(`Options\n`) +
        `  --createConfig   ${chalk.gray(
          "Create a default vue-unused.config.cjs in the current directory."
        )}\n` +
        `  --delete         ${chalk.red(
          "Delete unused files automatically."
        )}\n` +
        `  --json           ${chalk.gray(
          "Output scan results to unused-files.json."
        )}\n` +
        `  --verbose        ${chalk.gray("Enable verbose output.")}\n` +
        `  --graph          ${chalk.gray(
          "Generate a dependency-graph.json file."
        )}\n` +
        `  --bundle         ${chalk.blue(
          "Analyze bundle outputs for tree-shaken unused files."
        )}\n` +
        `  --bundle-dir     ${chalk.gray(
          "Specify custom bundle directory (default: auto-detect)."
        )}\n` +
        `  --config         ${chalk.gray(
          "Use a specific config file instead of auto-detecting one."
        )}\n` +
        `  -h, --help       ${chalk.gray(
          "Show this help message and exit."
        )}\n` +
        `  --manual         ${chalk.gray(
          "Show the full manual (README) and exit."
        )}\n` +
        `  -v, --version    ${chalk.gray(
          "Show the current installed version."
        )}\n\n` +
        chalk.bold(`Examples\n`) +
        `  vue-unused                ${chalk.gray("# Standard scan")}\n` +
        `  vue-unused --json         ${chalk.gray(
          "# Write results to unused-files.json"
        )}\n` +
        `  vue-unused --delete       ${chalk.gray(
          "# Delete unused files (use with caution)"
        )}\n` +
        `  vue-unused --createConfig ${chalk.gray(
          "# Generate a default configuration file"
        )}\n` +
        `  vue-unused --graph        ${chalk.gray(
          "# Generate dependency-graph.json"
        )}\n` +
        `  vue-unused --bundle       ${chalk.gray(
          "# Analyze bundle outputs for accurate unused file detection"
        )}\n` +
        `  vue-unused --bundle --bundle-dir ./dist  ${chalk.gray(
          "# Use custom bundle directory"
        )}\n` +
        `  vue-unused --bundle --bundle-dir=./dist  ${chalk.gray(
          "# Alternative equals syntax"
        )}\n`
    );
  }

  /**
   * Print the full README as a manual for users who want in-depth documentation.
   */
  function showManual() {
    try {
      const manualPath = path.resolve(__dirname, "..", "README.md");
      const manualContent = fs.readFileSync(manualPath, "utf-8");
      console.log(manualContent);
    } catch (err) {
      console.error("Unable to load manual:", err.message);
    }
  }

  // Handle --version / -v early so we exit quickly
  if (args.includes("-v") || args.includes("--version")) {
    console.log(chalk.bold(`vue-unused v${packageJson.version}`));
    process.exit(0);
  }

  // Handle help commands
  if (args.includes("-h") || args.includes("--help") || args[0] === "help") {
    showHelp(chalk);
    process.exit(0);
  }

  // Handle manual command
  if (args.includes("--manual") || args[0] === "manual") {
    showManual();
    process.exit(0);
  }

  // Detect and handle unknown commands or options
  (() => {
    const knownOptions = new Set([
      "--createConfig",
      "--delete",
      "--json",
      "--verbose",
      "--config",
      "--manual",
      "--help",
      "--version",
      "-h",
      "-v",
      "--graph",
      "--bundle",
      "--bundle-dir",
    ]);
    const knownCommands = new Set(["help", "manual", "graph"]);

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith("-")) {
        // Check for known options with parameters (both space-separated and equals syntax)
        const isConfigFlag = arg === "--config" || arg.startsWith("--config=");
        const isBundleDirFlag =
          arg === "--bundle-dir" || arg.startsWith("--bundle-dir=");

        if (isConfigFlag || isBundleDirFlag) {
          // Skip the next argument only for space-separated syntax
          if (arg === "--config" || arg === "--bundle-dir") {
            i++; // Skip the path parameter
          }
          continue;
        }

        // Check for unknown options
        if (!knownOptions.has(arg)) {
          console.error(chalk.red(`Unknown option: ${arg}\n`));
          showHelp(chalk);
          process.exit(1);
        }
      } else if (!knownCommands.has(arg)) {
        // Positional command not recognized
        console.error(chalk.red(`Unknown command: ${arg}\n`));
        showHelp(chalk);
        process.exit(1);
      }
    }
  })();

  async function handleCreateConfig() {
    const configPath = path.resolve(process.cwd(), "vue-unused.config.cjs");

    // Prevent overwriting an existing config
    if (fs.existsSync(configPath)) {
      console.error(
        chalk.red("vue-unused.config.cjs already exists in this directory.")
      );
      process.exit(1);
    }

    // If not running in an interactive terminal, fall back to default config
    if (!process.stdin.isTTY) {
      writeDefaultConfig(configPath);
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const ask = (q) =>
      new Promise((resolve) => rl.question(q, (ans) => resolve(ans.trim())));

    const useDefault =
      (await ask("Create default configuration? (Y/n): ")) || "y";
    if (useDefault.toLowerCase().startsWith("y")) {
      rl.close();
      writeDefaultConfig(configPath);
      return;
    }

    // Start with defaults and allow overrides
    const customConfig = {
      alias: { "@": "src" },
      delete: false,
      output: "cli",
      entry: ["src/main.js", "src/index.js", "src/App.vue"],
      ignore: [
        "**/node_modules/**",
        "**/*.spec.*",
        "**/*.test.*",
        "**/__tests__/**",
        "**/dist/**",
        "**/build/**",
        "**/.nuxt/**",
        "**/.output/**",
        "**/.vite/**",
        "**/.git/**",
      ],
    };

    // Alias configuration
    const aliasAnswer = await ask(
      "Specify path aliases as alias=path (comma separated) or leave blank to skip: "
    );
    if (aliasAnswer) {
      customConfig.alias = {};
      aliasAnswer.split(",").forEach((pair) => {
        const [key, val] = pair.split("=").map((s) => s.trim());
        if (key && val) customConfig.alias[key] = val;
      });
    }

    // Delete flag
    const deleteAnswer = await ask(
      "Enable automatic deletion of unused files? (y/N): "
    );
    customConfig.delete = deleteAnswer.toLowerCase().startsWith("y");

    // Output
    const outputAnswer =
      (await ask("Preferred output format (cli/json)? (default cli): ")) ||
      "cli";
    if (["cli", "json"].includes(outputAnswer.toLowerCase())) {
      customConfig.output = outputAnswer.toLowerCase();
    }

    // Entry files
    const entryAnswer = await ask(
      "Specify entry files (comma separated) or leave blank for defaults.\n" +
        "  Examples: src/main.js, src/App.vue, src/router/index.js\n" +
        "  Entry point: "
    );
    if (entryAnswer) {
      customConfig.entry = entryAnswer
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // Ignore patterns
    const ignoreAnswer = await ask(
      "Specify additional ignore patterns (comma separated) or leave blank to use defaults.\n" +
        "  Examples: **/tests/**, **/*.spec.js, **/legacy/**, **/docs/**\n" +
        "  Additional ignore patterns: "
    );
    if (ignoreAnswer) {
      const additionalIgnores = ignoreAnswer
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      customConfig.ignore = [...customConfig.ignore, ...additionalIgnores];
    }

    rl.close();

    writeConfig(configPath, customConfig);
  }

  function writeDefaultConfig(configPath) {
    const defaultConfig = `module.exports = {
  alias: { "@": "src" },
  delete: false,
  output: "cli",
  // Explicit entrypoints to always mark as used (relative to project root)
  entry: [
    "src/main.js",
    "src/index.js",
    "src/App.vue",
  ],
  // Files and directories to ignore during scanning
  ignore: [
    "**/node_modules/**",
    "**/*.spec.*",
    "**/*.test.*",
    "**/__tests__/**",
    "**/dist/**",
    "**/build/**",
    "**/.nuxt/**",
    "**/.output/**",
    "**/.vite/**",
    "**/.git/**"
  ],
};\n`;
    fs.writeFileSync(configPath, defaultConfig, "utf-8");
    console.log(
      chalk.green(
        "✓ Created vue-unused.config.cjs in this directory using default settings."
      )
    );
    process.exit(0);
  }

  function writeConfig(configPath, configObj) {
    const content =
      "module.exports = " + JSON.stringify(configObj, null, 2) + ";\n";
    fs.writeFileSync(configPath, content, "utf-8");
    console.log(
      chalk.green("✓ Created vue-unused.config.cjs with custom settings.")
    );
    process.exit(0);
  }

  // Trigger interactive config creation if flag present
  if (process.argv.includes("--createConfig")) {
    handleCreateConfig();
  } else {
    const { analyzeProject } = require("../lib/analyzer");
    const { loadConfig } = require("../lib/config");
    const { outputResults } = require("../lib/output");

    const ora = (await import("ora")).default;
    const config = await loadConfig();

    const wantsGraph = args.includes("--graph") || args[0] === "graph";
    config.verbose = process.argv.includes("--verbose");
    config.output = process.argv.includes("--json") ? "json" : config.output;
    config.delete = process.argv.includes("--delete") || config.delete;
    config.graph = wantsGraph;
    config.bundle = process.argv.includes("--bundle");

    // Parse bundle directory if specified
    const bundleDirArg = process.argv.find(
      (arg) => arg === "--bundle-dir" || arg.startsWith("--bundle-dir=")
    );
    if (bundleDirArg) {
      let bundleDirValue;
      if (bundleDirArg.startsWith("--bundle-dir=")) {
        // Equals syntax: --bundle-dir=./dist
        bundleDirValue = bundleDirArg.split("=", 2)[1];
      } else {
        // Space syntax: --bundle-dir ./dist
        const bundleDirIndex = process.argv.indexOf("--bundle-dir");
        bundleDirValue = process.argv[bundleDirIndex + 1];
      }

      if (bundleDirValue) {
        config.bundleDir = path.resolve(process.cwd(), bundleDirValue);
      }
    }

    // Confirm deletion if --delete flag is present and running interactively
    if (config.delete && process.stdin.isTTY) {
      const rlDel = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const warnMsg =
        "\n⚠️  WARNING: This will permanently delete all files reported as unused. " +
        "This action cannot be undone.\nAre you absolutely sure you want to continue? (y/N): ";
      const answer = await new Promise((resolve) =>
        rlDel.question(warnMsg, (a) => resolve(a.trim()))
      );
      rlDel.close();
      if (!answer.toLowerCase().startsWith("y")) {
        console.log(
          chalk.yellow(
            "⚠ Aborted deletion. Running scan in dry mode (no files will be removed)."
          )
        );
        config.delete = false;
      }
    }

    const spinner = ora("Scanning for unused files...").start();
    try {
      const results = await analyzeProject(config, spinner);
      spinner.stop();
      await outputResults(results, config);
      if (wantsGraph) {
        const { outputGraph } = require("../lib/output");
        await outputGraph(results.dependencyGraph, config);
      }
    } catch (err) {
      spinner.fail("Scan failed.");
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  }
})();
