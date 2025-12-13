/**
 * @fileoverview Bundle Analysis Module for vue-unused
 *
 * Analyzes webpack/vite bundle outputs to detect truly unused files
 * after tree-shaking and build-time optimizations.
 *
 * Key capabilities:
 * - Source map parsing to map bundle code back to source files
 * - Bundle file analysis (JS, CSS chunks)
 * - Correlation with static analysis results
 * - Size impact calculations
 */

const fs = require("fs");
const path = require("path");

/**
 * Main bundle analyzer class
 */
class BundleAnalyzer {
  constructor(config) {
    this.config = config;
    this.sourceMapConsumer = null;
    this.bundleFiles = new Set();
    this.sourceFiles = new Set();
    this.fileSizes = new Map();
  }

  /**
   * Initialize source map consumer if available
   */
  async initializeSourceMapConsumer() {
    try {
      // Try to load source-map library dynamically
      const sourceMap = await import("source-map");
      this.sourceMapConsumer = sourceMap.SourceMapConsumer;
      return true;
    } catch (error) {
      console.warn(
        "source-map library not available, bundle analysis will be limited"
      );
      return false;
    }
  }

  /**
   * Analyze bundle directory for output files
   */
  async analyzeBundleDirectory(bundleDir) {
    if (!fs.existsSync(bundleDir)) {
      throw new Error(`Bundle directory not found: ${bundleDir}`);
    }

    const files = this.findBundleFiles(bundleDir);
    this.bundleFiles = new Set(files);

    // Analyze each bundle file
    for (const file of files) {
      await this.analyzeBundleFile(file);
    }

    return {
      bundleFiles: Array.from(this.bundleFiles),
      sourceFiles: Array.from(this.sourceFiles),
      fileSizes: Object.fromEntries(this.fileSizes),
    };
  }

  /**
   * Find all relevant bundle files in directory
   */
  findBundleFiles(dir) {
    const files = [];

    function scanDirectory(currentDir) {
      const items = fs.readdirSync(currentDir);

      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          // Skip node_modules and common non-bundle dirs
          if (!["node_modules", ".git"].includes(item)) {
            scanDirectory(fullPath);
          }
        } else if (stat.isFile()) {
          // Include JS, CSS, and map files
          if (/\.(js|css|map)$/.test(item)) {
            files.push(fullPath);
          }
        }
      }
    }

    scanDirectory(dir);
    return files;
  }

  /**
   * Analyze individual bundle file
   */
  async analyzeBundleFile(filePath) {
    const ext = path.extname(filePath);
    const stat = fs.statSync(filePath);
    this.fileSizes.set(filePath, stat.size);

    if (ext === ".map") {
      await this.analyzeSourceMap(filePath);
    } else if (ext === ".js") {
      await this.analyzeJSBundle(filePath);
    } else if (ext === ".css") {
      await this.analyzeCSSBundle(filePath);
    }
  }

  /**
   * Analyze source map to extract source file mappings
   */
  async analyzeSourceMap(mapPath) {
    if (!this.sourceMapConsumer) {
      return;
    }

    try {
      const mapContent = fs.readFileSync(mapPath, "utf-8");
      const mapData = JSON.parse(mapContent);

      const consumer = await new this.sourceMapConsumer(mapData);

      // Extract all source files referenced in the source map
      consumer.sources.forEach((source) => {
        // Resolve relative to the source map's directory or project root
        const resolvedSource = this.resolveSourcePath(
          source,
          path.dirname(mapPath)
        );
        if (resolvedSource) {
          this.sourceFiles.add(resolvedSource);
        }
      });

      // consumer.destroy(); // Not needed in newer versions
    } catch (error) {
      console.warn(`Failed to analyze source map ${mapPath}:`, error.message);
    }
  }

  /**
   * Analyze JavaScript bundle file
   */
  async analyzeJSBundle(jsPath) {
    try {
      const content = fs.readFileSync(jsPath, "utf-8");

      // Look for source map references
      const sourceMapMatch = content.match(/\/\/# sourceMappingURL=(.+)$/m);
      if (sourceMapMatch) {
        const mapFile = sourceMapMatch[1];
        const mapPath = path.resolve(path.dirname(jsPath), mapFile);
        if (fs.existsSync(mapPath)) {
          await this.analyzeSourceMap(mapPath);
        }
      }

      // Extract module information and dependencies
      this.extractBundleModules(content, jsPath);
    } catch (error) {
      console.warn(`Failed to analyze JS bundle ${jsPath}:`, error.message);
    }
  }

  /**
   * Analyze CSS bundle file
   */
  async analyzeCSSBundle(cssPath) {
    try {
      const content = fs.readFileSync(cssPath, "utf-8");

      // Look for source map references in CSS
      const sourceMapMatch = content.match(/\/\*# sourceMappingURL=(.+) \*\//);
      if (sourceMapMatch) {
        const mapFile = sourceMapMatch[1];
        const mapPath = path.resolve(path.dirname(cssPath), mapFile);
        if (fs.existsSync(mapPath)) {
          await this.analyzeSourceMap(mapPath);
        }
      }

      // Could add CSS-specific analysis here
    } catch (error) {
      console.warn(`Failed to analyze CSS bundle ${cssPath}:`, error.message);
    }
  }

  /**
   * Extract module information from bundle content
   */
  extractBundleModules(content, filePath) {
    // This is a simplified extraction - real bundles are complex
    // In practice, we'd need to handle different bundler formats:
    // - Webpack: module wrapper functions
    // - Vite: ES modules with imports
    // - Rollup: various formats
    // For now, just mark this bundle file as analyzed
    // More sophisticated parsing would be needed for production
  }

  /**
   * Resolve source path from source map reference
   */
  resolveSourcePath(source, mapDir) {
    // Handle absolute paths, relative paths, and webpack-specific prefixes
    if (path.isAbsolute(source)) {
      return source;
    }

    // Try relative to map directory first
    const relativeToMap = path.resolve(mapDir, source);
    if (fs.existsSync(relativeToMap)) {
      return relativeToMap;
    }

    // Try relative to project root
    const relativeToRoot = path.resolve(this.config.rootDir, source);
    if (fs.existsSync(relativeToRoot)) {
      return relativeToRoot;
    }

    // Handle webpack-specific source paths
    if (source.startsWith("webpack:///")) {
      const cleanPath = source.replace("webpack:///", "");
      return path.resolve(this.config.rootDir, cleanPath);
    }

    return null;
  }

  /**
   * Correlate bundle analysis with static analysis results
   */
  correlateWithStaticAnalysis(staticResults) {
    const bundleUsedFiles = new Set();
    const staticallyUsedFiles = new Set(staticResults.usedFiles || []);
    const bundleUnusedFiles = new Set();

    // Files found in bundles are definitely used
    this.sourceFiles.forEach((file) => {
      if (staticResults.allFiles.includes(file)) {
        bundleUsedFiles.add(file);
      }
    });

    // Files are unused only if they're neither in the bundle nor identified as used by static analysis
    staticResults.allFiles.forEach((file) => {
      if (!bundleUsedFiles.has(file) && !staticallyUsedFiles.has(file)) {
        bundleUnusedFiles.add(file);
      }
    });

    return {
      bundleUsedFiles: Array.from(bundleUsedFiles),
      bundleUnusedFiles: Array.from(bundleUnusedFiles),
      potentiallyUnusedFiles: Array.from(bundleUnusedFiles),
      sizeImpact: this.calculateSizeImpact(bundleUnusedFiles),
    };
  }

  /**
   * Calculate potential size savings from unused files
   */
  calculateSizeImpact(unusedFiles) {
    let totalSize = 0;
    const fileSizes = {};

    unusedFiles.forEach((file) => {
      // Estimate size impact (this is approximate)
      // In reality, we'd need to track actual bundle contributions
      try {
        const stat = fs.statSync(file);
        const size = stat.size;
        totalSize += size;
        fileSizes[file] = size;
      } catch (error) {
        // File might not exist or be accessible
        fileSizes[file] = 0;
      }
    });

    return {
      totalBytes: totalSize,
      totalKB: Math.round(totalSize / 1024),
      totalMB: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
      fileSizes,
    };
  }
}

/**
 * Auto-detect bundle directory
 */
function detectBundleDirectory(config) {
  const commonDirs = [
    "dist",
    "build",
    "out",
    ".output",
    ".nuxt/dist",
    ".vitepress/dist",
  ];

  // Check for common build directories
  for (const dir of commonDirs) {
    const fullPath = path.resolve(config.rootDir, dir);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  // Check package.json for build output directory hints
  try {
    const pkgPath = path.join(config.rootDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

      // Check vite config
      if (pkg.build?.outDir) {
        return path.resolve(config.rootDir, pkg.build.outDir);
      }

      // Check for common config files that might indicate output dirs
      const configFiles = [
        "vite.config.js",
        "vite.config.ts",
        "webpack.config.js",
      ];
      for (const configFile of configFiles) {
        const configPath = path.join(config.rootDir, configFile);
        if (fs.existsSync(configPath)) {
          // Could parse config files here for output directories
          // For now, assume dist/
        }
      }
    }
  } catch (error) {
    // Ignore package.json parsing errors
  }

  // Default fallback
  return path.join(config.rootDir, "dist");
}

module.exports = {
  BundleAnalyzer,
  detectBundleDirectory,
};
