/**
 * @fileoverview This file handles the configuration loading for the tool.
 * It finds and merges the user's configuration file (`vue-unused.config.js`)
 * with default settings. It also includes logic to automatically find the project root
 * when no configuration file is present.
 */
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const findProjectRoot = (startDir) => {
  let dir = startDir;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const gitDir = path.join(dir, ".git");
    const pkgJson = path.join(dir, "package.json");
    if (fs.existsSync(gitDir) || fs.existsSync(pkgJson)) {
      return dir;
    }
    const parentDir = path.dirname(dir);
    if (parentDir === dir) {
      // Reached the filesystem root
      return startDir;
    }
    dir = parentDir;
  }
};

const defaultConfig = {
  rootDir: process.cwd(),
  alias: { "@": "src" },
  extensions: [".vue", ".js", ".ts", ".json"],
  ignore: ["**/*.test.*", "**/*.spec.*", "**/__tests__/**"],
  delete: false,
  output: "cli",
};

exports.loadConfig = async () => {
  let configPath = getConfigPathFromArgs();

  // If a custom path isn't provided or doesn't exist, search for default config files
  if (!configPath || !fs.existsSync(configPath)) {
    const CWD = process.cwd();
    const configPathJs = path.resolve(CWD, "vue-unused.config.js");
    const configPathCjs = path.resolve(CWD, "vue-unused.config.cjs");

    if (fs.existsSync(configPathJs)) {
      configPath = configPathJs;
    } else if (fs.existsSync(configPathCjs)) {
      configPath = configPathCjs;
    } else {
      configPath = null; // No config file found
    }
  }

  // If a config file was found (either custom or default), load it
  if (configPath) {
    const rootDir = path.dirname(configPath);
    // Patch: Use pathToFileURL for ESM import compatibility on Windows
    const configUrl = pathToFileURL(configPath).href;
    const userConfigModule = await import(configUrl);
    const userConfig = userConfigModule.default || userConfigModule;
    // The user's config `rootDir` is resolved relative to the config file itself
    return {
      ...defaultConfig,
      ...userConfig,
      rootDir: userConfig.rootDir
        ? path.resolve(rootDir, userConfig.rootDir)
        : rootDir,
    };
  }

  // No config file found anywhere, so find the project root automatically
  const rootDir = findProjectRoot(process.cwd());
  return { ...defaultConfig, rootDir };
};

const getConfigPathFromArgs = () => {
  const configArg = process.argv.find(
    (arg) => arg === "--config" || arg.startsWith("--config=")
  );
  if (configArg) {
    let configPath;
    if (configArg.startsWith("--config=")) {
      // Equals syntax: --config=./config.js
      configPath = configArg.split("=", 2)[1];
    } else {
      // Space syntax: --config ./config.js
      const configArgIndex = process.argv.indexOf("--config");
      configPath = process.argv[configArgIndex + 1];
    }

    return configPath ? path.resolve(process.cwd(), configPath) : null;
  }
  return null;
};
