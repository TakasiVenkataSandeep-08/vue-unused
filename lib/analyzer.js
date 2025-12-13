/**
 * @fileoverview This is the core analyzer for `vue-unused`.
 * It scans the project filesystem, builds a dependency graph of all files,
 * and identifies any files that are not part of this graph (i.e., are unused).
 * It leverages AST parsing for deep analysis of imports and Vue template usage.
 */
const fg = require("fast-glob");
const fs = require("fs");
const path = require("path");
const babelParser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const ignore = require("ignore").default;
const {
  parseVueFile,
  getTemplateTags,
  getImportedComponents,
  getUsedImportSources,
} = require("./vue-parser");

// Initialize chalk for logging (will be loaded asynchronously)
let chalk = null;
const loadChalk = async () => {
  if (!chalk) {
    chalk = (await import("chalk")).default;
  }
  return chalk;
};

function getVueVersion(rootDir) {
  try {
    // Use require.resolve for robust lookup of vue package from the target project
    const vuePkgPath = require.resolve("vue/package.json", {
      paths: [rootDir],
    });
    const vuePkg = require(vuePkgPath);
    return vuePkg.version.startsWith("2") ? 2 : 3;
  } catch {
    // Fallback to Vue 2 for legacy projects if detection fails
    return 2;
  }
}

const getCompiler = (rootDir) => {
  const vueVersion = getVueVersion(rootDir);
  if (vueVersion === 2) {
    return { version: 2, compiler: require("vue-template-compiler") };
  } else {
    return { version: 3, compiler: require("@vue/compiler-sfc") };
  }
};

const memoize = (fn) => {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
};

const extractImports = (code, filePath) => {
  const imports = new Set();
  try {
    const ast = babelParser.parse(code, {
      sourceType: "module",
      plugins: ["typescript", "jsx", "importAssertions"],
    });
    traverse(ast, {
      ImportDeclaration({ node }) {
        imports.add(node.source.value);
      },
      CallExpression({ node }) {
        // import('...') or require('...')
        if (
          node.callee.type === "Import" &&
          node.arguments.length &&
          node.arguments[0].type === "StringLiteral"
        ) {
          imports.add(node.arguments[0].value);
        }
        // require('...')
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments.length &&
          node.arguments[0].type === "StringLiteral"
        ) {
          imports.add(node.arguments[0].value);
        }
      },
    });
  } catch (error) {
    if (process.env.VUE_UNUSED_VERBOSE) {
      console.error(`Failed to parse ${filePath}:`, error.message);
    }
  }
  return Array.from(imports);
};

const debugLogs = [];

const getIgnorer = (rootDir) => {
  const gitignorePath = path.join(rootDir, ".gitignore");
  const ig = ignore();

  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
    ig.add(gitignoreContent);
  }

  return ig;
};

const isPackageImport = (imp, aliases) => {
  // An import is a package if it's not relative/absolute and not a configured alias.
  const isAlias = aliases.some(
    ([alias]) => imp === alias || imp.startsWith(alias + "/")
  );
  return !imp.startsWith(".") && !path.isAbsolute(imp) && !isAlias;
};

exports.analyzeProject = async (config, spinner) => {
  debugLogs.length = 0;
  const pLimit = (await import("p-limit")).default;
  const limit = pLimit(20); // Limit concurrency to 20
  const { version: vueVersion, compiler } = getCompiler(config.rootDir);

  // Load chalk for consistent logging
  const chalk = await loadChalk();

  // Initialize bundle analysis if requested
  let bundleAnalysis = null;
  if (config.bundle) {
    const {
      BundleAnalyzer,
      detectBundleDirectory,
    } = require("./bundle-analyzer");
    const bundleAnalyzer = new BundleAnalyzer(config);
    await bundleAnalyzer.initializeSourceMapConsumer();

    const bundleDir = config.bundleDir || detectBundleDirectory(config);
    if (config.verbose) {
      console.log(
        chalk.blue(`[Bundle Analysis] Analyzing bundle directory: ${bundleDir}`)
      );
    }

    try {
      bundleAnalysis = await bundleAnalyzer.analyzeBundleDirectory(bundleDir);
      if (config.verbose) {
        console.log(
          chalk.blue(
            `[Bundle Analysis] Found ${bundleAnalysis.sourceFiles.length} source files in bundle`
          )
        );
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠ Bundle analysis failed: ${error.message}`));
      bundleAnalysis = null;
    }
  }

  // Merge ignore from config. .gitignore is handled by fast-glob directly.
  const ignorePatterns = [
    ...new Set([
      ...(config.ignore || []),
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.output/**",
      "**/.nuxt/**",
      "**/.vite/**",
      "**/.git/**",
    ]),
  ];

  const aliases = Object.entries(config.alias || {}).sort(
    (a, b) => b[0].length - a[0].length
  );
  const memoizedNormalize = memoize(normalizeImportPath);
  const ignorer = getIgnorer(config.rootDir);

  const globPattern =
    config.extensions === "ALL" ||
    (Array.isArray(config.extensions) && config.extensions.length === 0)
      ? "**/*"
      : `**/*.{${config.extensions
          .map((ext) => ext.replace(/^\./, ""))
          .join(",")}}`;

  const allFilesRaw = await fg([globPattern], {
    cwd: config.rootDir,
    ignore: ignorePatterns,
    absolute: true,
  });

  const allFiles = allFilesRaw.filter(
    (file) => !ignorer.ignores(path.relative(config.rootDir, file))
  );

  // Helper to get real, normalized, case-sensitive path
  function normalizeFilePath(file) {
    try {
      return fs.realpathSync(file);
    } catch {
      return path.resolve(file);
    }
  }

  // Use normalized paths for allFilesSet
  const allFilesSet = new Set(allFiles.map((f) => normalizeFilePath(f)));
  const usedFiles = new Set(
    (config.entry || [])
      .map((f) => path.resolve(config.rootDir, f))
      .map(normalizeFilePath)
  );

  // Dependency graph: file -> Set of dependencies (normalized absolute paths)
  const dependencyGraph = {};

  // Read all files in parallel, updating spinner with progress
  let processed = 0;
  const total = allFiles.length;
  if (config.verbose) {
    console.log(chalk.gray(`Total files to analyze: ${total}`));
  }
  const fileContents = await Promise.all(
    allFiles.map((file) =>
      limit(async () => {
        const code = await fs.promises.readFile(file, "utf-8");
        processed++;
        const relPath = path.relative(config.rootDir, file);
        if (config.verbose) {
          console.log(
            chalk.gray(`[Analyzing] ${relPath} (${processed}/${total})`)
          );
        } else if (spinner && processed % 5 === 0) {
          spinner.text = `Analyzing: ${relPath} (${processed}/${total})`;
        }
        return { file, code };
      })
    )
  );

  // Extract imports and template tags in parallel
  await Promise.all(
    fileContents.map(async ({ file, code }) => {
      const allImports = new Set();
      let contentToParse = code;

      if (file.endsWith(".vue")) {
        const { scriptContent, templateContent } = parseVueFile(code, {
          version: vueVersion,
          compiler,
        });
        contentToParse = scriptContent;

        const templateTags = getTemplateTags(templateContent);
        const importedComponents = getImportedComponents(scriptContent);
        const usedInTemplate = getUsedImportSources(
          templateTags,
          importedComponents
        );
        usedInTemplate.forEach((imp) => {
          if (!isPackageImport(imp, aliases)) {
            allImports.add(imp);
          }
        });
      }

      const imports = extractImports(contentToParse, file);
      imports.forEach((imp) => {
        if (!isPackageImport(imp, aliases)) {
          allImports.add(imp);
        }
      });

      if (config.verbose && allImports.size > 0) {
        console.log(
          chalk.gray(
            `[Verbose] Found imports in ${path.relative(config.rootDir, file)}:`
          ),
          allImports
        );
      }

      const fileNorm = normalizeFilePath(file);
      if (!dependencyGraph[fileNorm]) dependencyGraph[fileNorm] = new Set();

      for (const imp of allImports) {
        const normalized = await memoizedNormalize(
          imp,
          file,
          config.rootDir,
          aliases,
          config.extensions
        );
        if (normalized) {
          const normPath = normalizeFilePath(normalized);
          if (config.verbose) {
            console.log(
              chalk.gray(
                `[DEBUG] Import '${imp}' in '${file}' resolved to '${normPath}'`
              )
            );
          }
          dependencyGraph[fileNorm].add(normPath);
          usedFiles.add(normPath);
        }
      }
    })
  );

  if (config.verbose) {
    for (const unused of [...allFilesSet].filter((f) => !usedFiles.has(f))) {
      console.log(chalk.gray(`[DEBUG] Unused file candidate: '${unused}'`));
    }
  }

  let unusedFiles = [...allFilesSet].filter((f) => !usedFiles.has(f));

  // Convert Set values to arrays for JSON serialisation
  const graphOut = Object.fromEntries(
    Object.entries(dependencyGraph).map(([k, v]) => [k, [...v]])
  );

  // At the end, if debug is enabled, write debugLogs to a file
  if (process.env.VUE_UNUSED_DEBUG) {
    fs.writeFileSync(
      path.join(config.rootDir, "vue-unused-debug.log"),
      debugLogs.join("\n"),
      "utf-8"
    );
  }

  // Perform bundle-aware correlation if bundle analysis was done
  let bundleCorrelation = null;
  if (bundleAnalysis) {
    const { BundleAnalyzer } = require("./bundle-analyzer");
    const analyzer = new BundleAnalyzer(config);
    Object.assign(analyzer, {
      sourceFiles: new Set(bundleAnalysis.sourceFiles),
    });
    bundleCorrelation = analyzer.correlateWithStaticAnalysis({
      allFiles,
      usedFiles: [...usedFiles],
      unusedFiles,
    });

    // If bundle analysis is enabled, use bundle-aware unused files
    if (config.bundle) {
      unusedFiles = bundleCorrelation.bundleUnusedFiles;
    }
  }

  return {
    allFiles,
    usedFiles: [...usedFiles],
    unusedFiles,
    dependencyGraph: graphOut,
    bundleAnalysis,
    bundleCorrelation,
  };
};

const existsCache = new Map();
async function cachedExists(filePath) {
  if (existsCache.has(filePath)) return existsCache.get(filePath);
  const exists = await fs.promises
    .access(filePath)
    .then(() => true)
    .catch(() => false);
  existsCache.set(filePath, exists);
  return exists;
}

const normalizeImportPath = async (
  imp,
  basePath,
  rootDir,
  aliases,
  extensions
) => {
  let resolved = imp;
  let aliasMatched = false;

  // 1. Handle aliases.
  for (const [alias, target] of aliases) {
    if (imp === alias || imp.startsWith(alias + "/")) {
      resolved = path.resolve(
        rootDir,
        target,
        imp.slice(alias.length).replace(/^\//, "")
      );
      aliasMatched = true;
      break;
    }
  }

  // 2. Handle relative or absolute paths.
  if (!aliasMatched) {
    resolved = path.resolve(path.dirname(basePath), imp);
  }

  if (extensions === "ALL" || extensions.length === 0) {
    if (await cachedExists(resolved)) {
      return resolved;
    }
  }
  for (const ext of extensions) {
    if (resolved.endsWith(ext) && (await cachedExists(resolved))) {
      if (process.env.VUE_UNUSED_DEBUG) {
        debugLogs.push(
          `[DEBUG] normalizeImportPath: '${imp}' resolved directly to '${resolved}'`
        );
      }
      return resolved;
    }
  }
  // Try appending extensions
  for (const ext of extensions) {
    const candidate = `${resolved}${ext}`;
    if (await cachedExists(candidate)) {
      if (process.env.VUE_UNUSED_DEBUG) {
        debugLogs.push(
          `[DEBUG] normalizeImportPath: '${imp}' resolved to '${candidate}' by extension`
        );
      }
      return candidate;
    }
  }
  // Try index files (e.g., ./foo/index.js)
  for (const ext of extensions) {
    const idxPath = path.join(resolved, `index${ext}`);
    if (await cachedExists(idxPath)) {
      if (process.env.VUE_UNUSED_DEBUG) {
        debugLogs.push(
          `[DEBUG] normalizeImportPath: '${imp}' resolved to '${idxPath}' as index file`
        );
      }
      return idxPath;
    }
  }
  if (await cachedExists(resolved)) {
    if (process.env.VUE_UNUSED_DEBUG) {
      debugLogs.push(
        `[DEBUG] normalizeImportPath: '${imp}' resolved to '${resolved}' as fallback`
      );
    }
    return resolved;
  }
  return null;
};
