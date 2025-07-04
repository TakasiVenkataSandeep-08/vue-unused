#!/usr/bin/env node
/**
 * @fileoverview This is the main entry point for the `vue-unused` command-line interface.
 * It handles parsing command-line arguments, loading the configuration,
 * initiating the analysis, and outputting the results.
 */
const path = require("path");
const fs = require("fs");

if (process.argv.includes("--createConfig")) {
  const configPath = path.resolve(process.cwd(), "vue-unused.config.cjs");
  if (fs.existsSync(configPath)) {
    console.error("vue-unused.config.cjs already exists in this directory.");
    process.exit(1);
  }
  const defaultConfig = `module.exports = {
  alias: { "@": "src" },
  delete: false,
  output: "cli",
  // Explicit entrypoints to always mark as used (relative to project root)
  entry: [
    "src/main.js",
    "src/index.js",
    "src/App.vue",
    // The tool now also checks assets like images, styles, html, etc.
    // Add more files as needed, e.g.:
    // "src/entry/customEntry.js"
  ],
};\n`;
  fs.writeFileSync(configPath, defaultConfig, "utf-8");
  console.log("Created vue-unused.config.cjs in this directory.");
  process.exit(0);
}

const { analyzeProject } = require("../lib/analyzer");
const { loadConfig } = require("../lib/config");
const { outputResults } = require("../lib/output");

(async () => {
  const ora = (await import("ora")).default;
  const spinner = ora("Scanning for unused files...").start();
  const config = await loadConfig();
  config.verbose = process.argv.includes("--verbose");
  config.output = process.argv.includes("--json") ? "json" : config.output;
  config.delete = process.argv.includes("--delete") || config.delete;
  try {
    const results = await analyzeProject(config, spinner);
    spinner.succeed("Scan complete!");
    await outputResults(results, config);
  } catch (err) {
    spinner.fail("Scan failed.");
    console.error(err);
    process.exit(1);
  }
})();
